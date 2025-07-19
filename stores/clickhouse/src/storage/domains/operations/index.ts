import type { ClickHouseClient } from '@clickhouse/client';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { StoreOperations } from '@mastra/core/storage';
import type { StorageColumn, TABLE_NAMES } from '@mastra/core/storage';
import { parseSqlIdentifier } from '@mastra/core/utils';

const COLUMN_TYPES: Record<StorageColumn['type'], string> = {
  text: 'String',
  timestamp: 'DateTime64(3)',
  uuid: 'String',
  jsonb: 'String',
  integer: 'Int64',
  float: 'Float64',
  bigint: 'Int64',
};

export class StoreOperationsClickHouse extends StoreOperations {
  private client: ClickHouseClient;

  constructor({ client }: { client: ClickHouseClient }) {
    super();
    this.client = client;
  }

  async hasColumn(table: string, column: string): Promise<boolean> {
    try {
      const result = await this.client.query({
        query: `DESCRIBE TABLE ${table}`,
        format: 'JSONEachRow',
      });
      const columns = (await result.json()) as { name: string }[];
      return columns.some(c => c.name === column);
    } catch (error) {
      // If table doesn't exist, column doesn't exist either
      return false;
    }
  }

  async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    try {
      const processedRecord = { ...record };
      
      // Handle date fields
      if (processedRecord.createdAt && processedRecord.createdAt instanceof Date) {
        processedRecord.createdAt = processedRecord.createdAt.toISOString();
      }
      if (processedRecord.updatedAt && processedRecord.updatedAt instanceof Date) {
        processedRecord.updatedAt = processedRecord.updatedAt.toISOString();
      }

      await this.client.insert({
        table: tableName,
        values: [processedRecord],
        format: 'JSONEachRow',
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_INSERT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      await this.client.query({
        query: `TRUNCATE TABLE ${tableName}`,
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_CLEAR_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  protected getDefaultValue(type: StorageColumn['type']): string {
    switch (type) {
      case 'timestamp':
        return 'DEFAULT now()';
      case 'jsonb':
        return "DEFAULT '{}'";
      case 'text':
        return "DEFAULT ''";
      case 'integer':
      case 'bigint':
        return 'DEFAULT 0';
      case 'float':
        return 'DEFAULT 0.0';
      default:
        return '';
    }
  }

  async createTable({
    tableName,
    schema,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    try {
      const columns = Object.entries(schema)
        .map(([name, def]) => {
          const constraints = [];
          if (!def.nullable) constraints.push('NOT NULL');
          return `"${parseSqlIdentifier(name, 'column name')}" ${COLUMN_TYPES[def.type]} ${constraints.join(' ')}`;
        })
        .join(',\n');

      const sql = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          ${columns}
        )
        ENGINE = MergeTree()
        PRIMARY KEY (createdAt, id)
        ORDER BY (createdAt, id)
        SETTINGS index_granularity = 8192
      `;

      await this.client.query({
        query: sql,
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_CREATE_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async alterTable({
    tableName,
    schema,
    ifNotExists,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
    ifNotExists: string[];
  }): Promise<void> {
    try {
      // Get existing columns
      const describeSql = `DESCRIBE TABLE ${tableName}`;
      const result = await this.client.query({
        query: describeSql,
      });
      const rows = await result.json();
      const existingColumnNames = new Set(rows.data.map((row: any) => row.name.toLowerCase()));

      // Add missing columns
      for (const columnName of ifNotExists) {
        if (!existingColumnNames.has(columnName.toLowerCase()) && schema[columnName]) {
          const columnDef = schema[columnName];
          let sqlType = COLUMN_TYPES[columnDef.type];
          if (columnDef.nullable !== false) {
            sqlType = `Nullable(${sqlType})`;
          }
          const defaultValue = columnDef.nullable === false ? this.getDefaultValue(columnDef.type) : '';
          const alterSql =
            `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS "${parseSqlIdentifier(columnName, 'column name')}" ${sqlType} ${defaultValue}`.trim();

          await this.client.query({
            query: alterSql,
          });
          this.logger?.debug?.(`Added column ${columnName} to table ${tableName}`);
        }
      }
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_ALTER_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async load<R>({
    tableName,
    keys,
  }: {
    tableName: TABLE_NAMES;
    keys: Record<string, string>;
  }): Promise<R | null> {
    try {
      const keyEntries = Object.entries(keys);
      const conditions = keyEntries
        .map(([key]) => `"${parseSqlIdentifier(key, 'column name')}" = {var_${key}:String}`)
        .join(' AND ');
      const values = keyEntries.reduce((acc, [key, value]) => {
        return { ...acc, [`var_${key}`]: value };
      }, {});

      const result = await this.client.query({
        query: `SELECT *, toDateTime64(createdAt, 3) as createdAt, toDateTime64(updatedAt, 3) as updatedAt FROM ${tableName} WHERE ${conditions}`,
        query_params: values,
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          date_time_output_format: 'iso',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });

      if (!result) {
        return null;
      }

      const rows = await result.json();
      const data: R = rows.data[0];

      if (!data) {
        return null;
      }

      // Handle date transformation
      if (data && typeof data === 'object') {
        const record = data as any;
        if (record.createdAt) {
          record.createdAt = new Date(record.createdAt);
        }
        if (record.updatedAt) {
          record.updatedAt = new Date(record.updatedAt);
        }
      }

      return data;
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_LOAD_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async batchInsert({ tableName, records }: { tableName: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
    try {
      const processedRecords = records.map(record => {
        const processedRecord = { ...record };
        
        // Handle date fields
        if (processedRecord.createdAt && processedRecord.createdAt instanceof Date) {
          processedRecord.createdAt = processedRecord.createdAt.toISOString();
        }
        if (processedRecord.updatedAt && processedRecord.updatedAt instanceof Date) {
          processedRecord.updatedAt = processedRecord.updatedAt.toISOString();
        }

        return processedRecord;
      });

      await this.client.insert({
        table: tableName,
        values: processedRecords,
        format: 'JSONEachRow',
        clickhouse_settings: {
          date_time_input_format: 'best_effort',
          use_client_time_zone: 1,
          output_format_json_quote_64bit_integers: 0,
        },
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_BATCH_INSERT_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    try {
      await this.client.query({
        query: `DROP TABLE IF EXISTS ${tableName}`,
        clickhouse_settings: {
          output_format_json_quote_64bit_integers: 0,
        },
      });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLICKHOUSE_STORAGE_DROP_TABLE_FAILED',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          details: { tableName },
        },
        error,
      );
    }
  }
}