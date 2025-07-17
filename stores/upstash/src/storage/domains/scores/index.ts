import type { ScoreRowData } from '@mastra/core/eval';
import type { StoragePagination, PaginationInfo } from '@mastra/core/storage';
import { ScoresStorage } from '@mastra/core/storage';
import type { Redis } from '@upstash/redis';
import type { StoreOperationsUpstash } from '../operations';

export class ScoresUpstash extends ScoresStorage {
    private redis: Redis;
    private operations: StoreOperationsUpstash;

    constructor({ redis, operations }: { redis: Redis; operations: StoreOperationsUpstash }) {
        super();
        this.redis = redis;
        this.operations = operations;
    }

    // TODO: Implement scores methods for Upstash
    async getScoreById({ id: _id }: { id: string }): Promise<ScoreRowData | null> {
        throw new Error('Not implemented yet');
    }

    async getScoresByScorerId({
        scorerId: _scorerId,
        pagination: _pagination,
    }: {
        scorerId: string;
        pagination: StoragePagination;
    }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
        throw new Error('Not implemented yet');
    }

    async saveScore(_score: Omit<ScoreRowData, 'createdAt' | 'updatedAt'>): Promise<{ score: ScoreRowData }> {
        throw new Error('Not implemented yet');
    }

    async getScoresByRunId({
        runId: _runId,
        pagination: _pagination,
    }: {
        runId: string;
        pagination: StoragePagination;
    }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
        throw new Error('Not implemented yet');
    }

    async getScoresByEntityId({
        entityId: _entityId,
        entityType: _entityType,
        pagination: _pagination,
    }: {
        pagination: StoragePagination;
        entityId: string;
        entityType: string;
    }): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
        throw new Error('Not implemented yet');
    }
} 