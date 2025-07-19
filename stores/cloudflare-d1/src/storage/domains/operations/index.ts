import type { D1Database } from '@cloudflare/workers-types';
import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { StoreOperations, TABLE_WORKFLOW_SNAPSHOT } from '@mastra/core/storage';
import type { StorageColumn, TABLE_NAMES } from '@mastra/core/storage';
import { parseSqlIdentifier } from '@mastra/core/utils';
import type { D1Client } from '../../index';
import { createSqlBuilder } from '../../sql-builder';
import type { SqlParam } from '../../sql-builder';

export class StoreOperationsD1 extends StoreOperations {
  private client?: D1Client;
  private binding?: D1Database;
  private tablePrefix: string;

  constructor({
    client,
    binding,
    tablePrefix = '',
  }: {
    client?: D1Client;
    binding?: D1Database;
    tablePrefix?: string;
  }) {
    super();
    this.client = client;
    this.binding = binding;
    this.tablePrefix = tablePrefix;
  }

  private getTableName(tableName: TABLE_NAMES): string {
    return `${this.tablePrefix}${tableName}`;
  }

  private formatSqlParams(params: SqlParam[]): string[] {
    return params.map(p => (p === undefined || p === null ? null : p) as string);
  }

  async executeQuery({
    sql,
    params = [],
    first = false,
  }: {
    sql: string;
    params?: SqlParam[];
    first?: boolean;
  }): Promise<Record<string, any>[] | Record<string, any> | null> {
    try {
      if (this.binding) {
        const statement = this.binding.prepare(sql);
        const formattedParams = this.formatSqlParams(params);

        let result;
        if (formattedParams.length > 0) {
          if (first) {
            result = await statement.bind(...formattedParams).first();
            return result || null;
          } else {
            result = await statement.bind(...formattedParams).all();
            return result.results || [];
          }
        } else {
          if (first) {
            result = await statement.first();
            return result || null;
          } else {
            result = await statement.all();
            return result.results || [];
          }
        }
      } else if (this.client) {
        const response = await this.client.query({
          sql,
          params: this.formatSqlParams(params),
        });

        const result = response.result || [];
        const results = result.flatMap(r => r.results || []);

        if (first) {
          return results.length > 0 ? results[0] : null;
        }
        return results;
      } else {
        throw new Error('No valid D1 configuration provided');
      }
    } catch (error: any) {
      this.logger.error('Error executing SQL query', {
        message: error instanceof Error ? error.message : String(error),
        sql,
        params,
        first,
      });
      throw new Error(`D1 query error: ${error.message}`);
    }
  }

  private serializeValue(value: any): any {
    if (value === null || value === undefined) return null;

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return value;
  }

  private deserializeValue(value: any, type?: string): any {
    if (value === null || value === undefined) return null;

    if (type === 'date' && typeof value === 'string') {
      return new Date(value);
    }

    if (type === 'jsonb' && typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, any>;
      } catch {
        return value;
      }
    }

    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        return JSON.parse(value) as Record<string, any>;
      } catch {
        return value;
      }
    }

    return value;
  }

  protected getSqlType(type: StorageColumn['type']): string {
    switch (type) {
      case 'bigint':
        return 'INTEGER';
      case 'jsonb':
        return 'TEXT';
      default:
        return super.getSqlType(type);
    }
  }

  async hasColumn(table: string, column: string): Promise<boolean> {
    try {
      const sql = `PRAGMA table_info(${table})`;
      const result = await this.executeQuery({ sql, params: [] });

      if (!result || !Array.isArray(result)) {
        return false;
      }

      return result.some((row: any) => row.name === column);
    } catch (error) {
      this.logger.error(`Error checking column ${column} in table ${table}:`, {
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async createTable({
    tableName,
    schema,
  }: {
    tableName: TABLE_NAMES;
    schema: Record<string, StorageColumn>;
  }): Promise<void> {
    const fullTableName = this.getTableName(tableName);

    const columnDefinitions = Object.entries(schema).map(([colName, colDef]) => {
      const type = this.getSqlType(colDef.type);
      const nullable = colDef.nullable === false ? 'NOT NULL' : '';
      const primaryKey = colDef.primaryKey ? 'PRIMARY KEY' : '';
      return `${colName} ${type} ${nullable} ${primaryKey}`.trim();
    });

    const tableConstraints: string[] = [];
    if (tableName === TABLE_WORKFLOW_SNAPSHOT) {
      tableConstraints.push('UNIQUE (workflow_name, run_id)');
    }

    try {
      const query = createSqlBuilder().createTable(fullTableName, columnDefinitions, tableConstraints);
      const { sql, params } = query.build();

      await this.executeQuery({ sql, params });
      this.logger.debug(`Created table ${fullTableName}`);
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_CREATE_TABLE_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to create table ${fullTableName}: ${error instanceof Error ? error.message : String(error)}`,
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
    const fullTableName = this.getTableName(tableName);

    try {
      const existingColumns = await this.getTableColumns(fullTableName);
      const existingColumnNames = new Set(existingColumns.map(col => col.name.toLowerCase()));

      for (const columnName of ifNotExists) {
        if (!existingColumnNames.has(columnName.toLowerCase()) && schema[columnName]) {
          const columnDef = schema[columnName];
          const sqlType = this.getSqlType(columnDef.type);
          const nullable = columnDef.nullable === false ? 'NOT NULL' : '';
          const defaultValue = columnDef.nullable === false ? this.getDefaultValue(columnDef.type) : '';

          const alterSql =
            `ALTER TABLE ${fullTableName} ADD COLUMN ${columnName} ${sqlType} ${nullable} ${defaultValue}`.trim();

          await this.executeQuery({ sql: alterSql, params: [] });
          this.logger.debug(`Added column ${columnName} to table ${fullTableName}`);
        }
      }
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_ALTER_TABLE_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to alter table ${fullTableName}: ${error instanceof Error ? error.message : String(error)}`,
          details: { tableName },
        },
        error,
      );
    }
  }

  private async getTableColumns(tableName: string): Promise<{ name: string; type: string }[]> {
    try {
      const sql = `PRAGMA table_info(${tableName})`;
      const result = await this.executeQuery({ sql, params: [] });

      if (!result || !Array.isArray(result)) {
        return [];
      }

      return result.map((row: any) => ({
        name: row.name,
        type: row.type,
      }));
    } catch (error) {
      this.logger.error(`Error getting table columns for ${tableName}:`, {
        message: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  async clearTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    const fullTableName = this.getTableName(tableName);

    try {
      const query = createSqlBuilder().delete(fullTableName);
      const { sql, params } = query.build();
      await this.executeQuery({ sql, params });
      this.logger.debug(`Cleared table ${fullTableName}`);
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_CLEAR_TABLE_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to clear table ${fullTableName}: ${error instanceof Error ? error.message : String(error)}`,
          details: { tableName },
        },
        error,
      );
    }
  }

  async dropTable({ tableName }: { tableName: TABLE_NAMES }): Promise<void> {
    const fullTableName = this.getTableName(tableName);

    try {
      const sql = `DROP TABLE IF EXISTS ${fullTableName}`;
      await this.executeQuery({ sql, params: [] });
      this.logger.debug(`Dropped table ${fullTableName}`);
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_DROP_TABLE_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to drop table ${fullTableName}: ${error instanceof Error ? error.message : String(error)}`,
          details: { tableName },
        },
        error,
      );
    }
  }

  async insert({ tableName, record }: { tableName: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
    const fullTableName = this.getTableName(tableName);

    const processedRecord: Record<string, any> = {};
    for (const [key, value] of Object.entries(record)) {
      processedRecord[key] = this.serializeValue(value);
    }

    const columns = Object.keys(processedRecord);
    const values = Object.values(processedRecord);

    const query = createSqlBuilder().insert(fullTableName, columns, values);
    const { sql, params } = query.build();

    try {
      await this.executeQuery({ sql, params });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_INSERT_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to insert into ${fullTableName}: ${error instanceof Error ? error.message : String(error)}`,
          details: { tableName },
        },
        error,
      );
    }
  }

  async batchInsert({ tableName, records }: { tableName: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
    if (records.length === 0) return;

    const fullTableName = this.getTableName(tableName);

    try {
      const batchSize = 50;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);

        for (const record of batch) {
          const processedRecord: Record<string, any> = {};
          for (const [key, value] of Object.entries(record)) {
            processedRecord[key] = this.serializeValue(value);
          }

          const columns = Object.keys(processedRecord);
          const values = Object.values(processedRecord);

          const query = createSqlBuilder().insert(fullTableName, columns, values);
          const { sql, params } = query.build();
          await this.executeQuery({ sql, params });
        }

        this.logger.debug(
          `Processed batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(records.length / batchSize)}`,
        );
      }

      this.logger.debug(`Successfully batch inserted ${records.length} records into ${tableName}`);
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_BATCH_INSERT_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to batch insert into ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
          details: { tableName },
        },
        error,
      );
    }
  }

  async load<R>({ tableName, keys }: { tableName: TABLE_NAMES; keys: Record<string, string> }): Promise<R | null> {
    const fullTableName = this.getTableName(tableName);

    const query = createSqlBuilder().select('*').from(fullTableName);

    let firstKey = true;
    for (const [key, value] of Object.entries(keys)) {
      if (firstKey) {
        query.where(`${key} = ?`, value);
        firstKey = false;
      } else {
        query.andWhere(`${key} = ?`, value);
      }
    }

    query.limit(1);
    const { sql, params } = query.build();

    try {
      const result = await this.executeQuery({ sql, params, first: true });

      if (!result) return null;

      const processedResult: Record<string, any> = {};
      for (const [key, value] of Object.entries(result)) {
        processedResult[key] = this.deserializeValue(value);
      }

      return processedResult as R;
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_LOAD_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to load from ${fullTableName}: ${error instanceof Error ? error.message : String(error)}`,
          details: { tableName },
        },
        error,
      );
    }
  }
}