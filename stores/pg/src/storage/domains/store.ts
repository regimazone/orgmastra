import { MastraError, ErrorDomain, ErrorCategory } from '@mastra/core/error';
import type { StorageColumn, TABLE_NAMES } from '@mastra/core/storage';
import { TABLE_WORKFLOW_SNAPSHOT } from '@mastra/core/storage';
import { parseSqlIdentifier } from '@mastra/core/utils';
import type { PostgresStore } from '../index';

export class PostgresInternalStore {
    private store: PostgresStore;
    constructor(store: PostgresStore) {
        this.store = store;
    }

    /** Insert a single record into a table */
    async insert({ name, record }: { name: TABLE_NAMES; record: Record<string, any> }): Promise<void> {
        try {
            const columns = Object.keys(record).map(col => parseSqlIdentifier(col, 'column name'));
            const values = Object.values(record);
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

            await this.store.db.none(
                `INSERT INTO ${(this.store as any).getTableName(name)} (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
                values,
            );
        } catch (error) {
            throw new MastraError(
                {
                    id: 'PG_INTERNAL_STORE_INSERT_FAILED',
                    domain: ErrorDomain.STORAGE,
                    category: ErrorCategory.THIRD_PARTY,
                    details: { name },
                },
                error,
            );
        }
    }

    /** Batch insert multiple records into a table */
    async batchInsert({ name, records }: { name: TABLE_NAMES; records: Record<string, any>[] }): Promise<void> {
        try {
            await this.store.db.query('BEGIN');
            for (const record of records) {
                await this.insert({ name, record });
            }
            await this.store.db.query('COMMIT');
        } catch (error) {
            await this.store.db.query('ROLLBACK');
            throw new MastraError(
                {
                    id: 'PG_INTERNAL_STORE_BATCH_INSERT_FAILED',
                    domain: ErrorDomain.STORAGE,
                    category: ErrorCategory.THIRD_PARTY,
                    details: { name, numberOfRecords: records.length },
                },
                error,
            );
        }
    }

    /** Load a single record by keys */
    async load<R>({ name, keys }: { name: TABLE_NAMES; keys: Record<string, string> }): Promise<R | null> {
        try {
            const keyEntries = Object.entries(keys).map(([key, value]) => [parseSqlIdentifier(key, 'column name'), value]);
            const conditions = keyEntries.map(([key], index) => `"${key}" = $${index + 1}`).join(' AND ');
            const values = keyEntries.map(([_, value]) => value);

            const result = await this.store.db.oneOrNone<R>(
                `SELECT * FROM ${(this.store as any).getTableName(name)} WHERE ${conditions}`,
                values,
            );

            if (!result) {
                return null;
            }

            // If this is a workflow snapshot, parse the snapshot field
            if (name === TABLE_WORKFLOW_SNAPSHOT) {
                const snapshot = result as any;
                if (typeof snapshot.snapshot === 'string') {
                    snapshot.snapshot = JSON.parse(snapshot.snapshot);
                }
                return snapshot;
            }

            return result;
        } catch (error) {
            throw new MastraError(
                {
                    id: 'PG_INTERNAL_STORE_LOAD_FAILED',
                    domain: ErrorDomain.STORAGE,
                    category: ErrorCategory.THIRD_PARTY,
                    details: { name },
                },
                error,
            );
        }
    }

    /** Create a table with the given schema */
    async initialize({ name, schema }: { name: TABLE_NAMES; schema: Record<string, StorageColumn> }): Promise<void> {
        try {
            const columns = Object.entries(schema)
                .map(([colName, def]) => {
                    const parsedName = parseSqlIdentifier(colName, 'column name');
                    const constraints = [];
                    if (def.primaryKey) constraints.push('PRIMARY KEY');
                    if (!def.nullable) constraints.push('NOT NULL');
                    return `"${parsedName}" ${def.type.toUpperCase()} ${constraints.join(' ')}`;
                })
                .join(',\n');

            // Create schema if it doesn't exist
            if ((this.store as any).schema) {
                await (this.store as any).setupSchema();
            }

            const sql = `
                CREATE TABLE IF NOT EXISTS ${(this.store as any).getTableName(name)} (
                    ${columns}
                );
                ${name === TABLE_WORKFLOW_SNAPSHOT
                    ? `
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'mastra_workflow_snapshot_workflow_name_run_id_key'
                    ) THEN
                        ALTER TABLE ${(this.store as any).getTableName(name)}
                        ADD CONSTRAINT mastra_workflow_snapshot_workflow_name_run_id_key
                        UNIQUE (workflow_name, run_id);
                    END IF;
                END $$;
                `
                    : ''
                }
            `;

            await this.store.db.none(sql);
        } catch (error) {
            throw new MastraError(
                {
                    id: 'PG_INTERNAL_STORE_INITIALIZE_FAILED',
                    domain: ErrorDomain.STORAGE,
                    category: ErrorCategory.THIRD_PARTY,
                    details: { name },
                },
                error,
            );
        }
    }

    /** Alter a table to add columns if they don't exist */
    async migrate({ name, schema, ifNotExists }: { name: TABLE_NAMES; schema: Record<string, StorageColumn>; ifNotExists: string[] }): Promise<void> {
        const fullTableName = (this.store as any).getTableName(name);

        try {
            for (const columnName of ifNotExists) {
                if (schema[columnName]) {
                    const columnDef = schema[columnName];
                    const sqlType = (this.store as any).getSqlType(columnDef.type);
                    const nullable = columnDef.nullable === false ? 'NOT NULL' : '';
                    const defaultValue = columnDef.nullable === false ? (this.store as any).getDefaultValue(columnDef.type) : '';
                    const parsedColumnName = parseSqlIdentifier(columnName, 'column name');
                    const alterSql =
                        `ALTER TABLE ${fullTableName} ADD COLUMN IF NOT EXISTS "${parsedColumnName}" ${sqlType} ${nullable} ${defaultValue}`.trim();

                    await this.store.db.none(alterSql);
                    (this.store as any).logger?.debug?.(`Ensured column ${parsedColumnName} exists in table ${fullTableName}`);
                }
            }
        } catch (error) {
            throw new MastraError(
                {
                    id: 'PG_INTERNAL_STORE_MIGRATE_FAILED',
                    domain: ErrorDomain.STORAGE,
                    category: ErrorCategory.THIRD_PARTY,
                    details: { name },
                },
                error,
            );
        }
    }

    /** Clear all records from a table */
    async teardown({ name }: { name: TABLE_NAMES }): Promise<void> {
        try {
            await this.store.db.none(`TRUNCATE TABLE ${(this.store as any).getTableName(name)} CASCADE`);
        } catch (error) {
            throw new MastraError(
                {
                    id: 'PG_INTERNAL_STORE_TEARDOWN_FAILED',
                    domain: ErrorDomain.STORAGE,
                    category: ErrorCategory.THIRD_PARTY,
                    details: { name },
                },
                error,
            );
        }
    }

    /** Check if a column exists in a table */
    async hasAttribute(name: string, key: string): Promise<boolean> {
        // Use this.schema to scope the check
        const schema = (this.store as any).schema || 'public';
        const result = await this.store.db.oneOrNone(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND (column_name = $3 OR column_name = $4)`,
            [schema, name, key, key.toLowerCase()],
        );
        return !!result;
    }
} 