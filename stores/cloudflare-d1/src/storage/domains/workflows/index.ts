import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { TABLE_WORKFLOW_SNAPSHOT, WorkflowsStorage } from '@mastra/core/storage';
import type { WorkflowRun, WorkflowRuns } from '@mastra/core/storage';
import type { WorkflowRunState } from '@mastra/core/workflows';
import { createSqlBuilder } from '../../sql-builder';
import type { StoreOperationsD1 } from '../operations';

export class WorkflowsD1 extends WorkflowsStorage {
  private operations: StoreOperationsD1;

  constructor({ operations }: { operations: StoreOperationsD1 }) {
    super();
    this.operations = operations;
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

  async persistWorkflowSnapshot({
    workflowName,
    runId,
    snapshot,
  }: {
    workflowName: string;
    runId: string;
    snapshot: WorkflowRunState;
  }): Promise<void> {
    const now = new Date().toISOString();

    const currentSnapshot = await this.operations.load({
      tableName: TABLE_WORKFLOW_SNAPSHOT,
      keys: { workflow_name: workflowName, run_id: runId },
    });

    const persisting = currentSnapshot
      ? {
          ...currentSnapshot,
          snapshot: JSON.stringify(snapshot),
          updatedAt: now,
        }
      : {
          workflow_name: workflowName,
          run_id: runId,
          snapshot: snapshot as Record<string, any>,
          createdAt: now,
          updatedAt: now,
        };

    const processedRecord: Record<string, any> = {};
    for (const [key, value] of Object.entries(persisting)) {
      processedRecord[key] = this.serializeValue(value);
    }

    const columns = Object.keys(processedRecord);
    const values = Object.values(processedRecord);

    const updateMap: Record<string, string> = {
      snapshot: 'excluded.snapshot',
      updatedAt: 'excluded.updatedAt',
    };

    this.logger.debug('Persisting workflow snapshot', { workflowName, runId });

    const query = createSqlBuilder().insert(TABLE_WORKFLOW_SNAPSHOT, columns, values, ['workflow_name', 'run_id'], updateMap);
    const { sql, params } = query.build();

    try {
      await this.operations.executeQuery({ sql, params });
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_PERSIST_WORKFLOW_SNAPSHOT_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to persist workflow snapshot: ${error instanceof Error ? error.message : String(error)}`,
          details: { workflowName, runId },
        },
        error,
      );
    }
  }

  async loadWorkflowSnapshot(params: { workflowName: string; runId: string }): Promise<WorkflowRunState | null> {
    const { workflowName, runId } = params;

    this.logger.debug('Loading workflow snapshot', { workflowName, runId });

    try {
      const d = await this.operations.load<{ snapshot: unknown }>({
        tableName: TABLE_WORKFLOW_SNAPSHOT,
        keys: {
          workflow_name: workflowName,
          run_id: runId,
        },
      });

      return d ? (d.snapshot as WorkflowRunState) : null;
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_LOAD_WORKFLOW_SNAPSHOT_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to load workflow snapshot: ${error instanceof Error ? error.message : String(error)}`,
          details: { workflowName, runId },
        },
        error,
      );
    }
  }

  async getWorkflowRuns({
    workflowName,
    fromDate,
    toDate,
    limit,
    offset,
    resourceId,
  }: {
    workflowName?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
    resourceId?: string;
  } = {}): Promise<WorkflowRuns> {
    try {
      const query = createSqlBuilder().select('*').from(TABLE_WORKFLOW_SNAPSHOT);

      const conditions: string[] = [];
      const params: any[] = [];

      if (workflowName) {
        conditions.push('workflow_name = ?');
        params.push(workflowName);
      }

      if (resourceId) {
        conditions.push('JSON_EXTRACT(snapshot, "$.resourceId") = ?');
        params.push(resourceId);
      }

      if (fromDate) {
        conditions.push('createdAt >= ?');
        params.push(fromDate.toISOString());
      }

      if (toDate) {
        conditions.push('createdAt <= ?');
        params.push(toDate.toISOString());
      }

      if (conditions.length > 0) {
        query.where(conditions.join(' AND '), ...params);
      } else {
        query.where('1=1');
      }

      query.orderBy('createdAt', 'DESC');

      if (limit) {
        query.limit(limit);
      }

      if (offset) {
        query.offset(offset);
      }

      const { sql, params: finalParams } = query.build();
      const results = await this.operations.executeQuery({ sql, params: finalParams });

      const runs = Array.isArray(results)
        ? results.map((row: any) => ({
            workflowName: row.workflow_name,
            runId: row.run_id,
            snapshot: typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt),
          }))
        : [];

      return {
        runs,
        total: runs.length,
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_WORKFLOW_RUNS_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to get workflow runs: ${error instanceof Error ? error.message : String(error)}`,
          details: { workflowName, resourceId },
        },
        error,
      );
    }
  }

  async getWorkflowRunById({
    runId,
    workflowName,
  }: {
    runId: string;
    workflowName?: string;
  }): Promise<WorkflowRun | null> {
    try {
      const query = createSqlBuilder().select('*').from(TABLE_WORKFLOW_SNAPSHOT).where('run_id = ?', runId);

      if (workflowName) {
        query.andWhere('workflow_name = ?', workflowName);
      }

      const { sql, params } = query.build();
      const result = await this.operations.executeQuery({ sql, params, first: true });

      if (!result) return null;

      return {
        workflowName: result.workflow_name,
        runId: result.run_id,
        snapshot: typeof result.snapshot === 'string' ? JSON.parse(result.snapshot) : result.snapshot,
        createdAt: new Date(result.createdAt),
        updatedAt: new Date(result.updatedAt),
      };
    } catch (error) {
      throw new MastraError(
        {
          id: 'CLOUDFLARE_D1_STORAGE_GET_WORKFLOW_RUN_BY_ID_ERROR',
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
          text: `Failed to get workflow run by id: ${error instanceof Error ? error.message : String(error)}`,
          details: { runId, workflowName },
        },
        error,
      );
    }
  }
}