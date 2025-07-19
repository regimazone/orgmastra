# ClickHouse Domain Interface Implementation

This document summarizes the implementation of the domain interface pattern for ClickHouse storage, following the patterns established in the libsql and pg stores.

## Overview

The ClickHouse store now implements the domain interface pattern with the following structure:

```
stores/clickhouse/src/storage/
├── domains/
│   ├── index.ts                 # Exports all domain implementations
│   ├── utils.ts                 # Common utilities for ClickHouse domains
│   ├── operations/
│   │   └── index.ts            # StoreOperationsClickHouse - basic CRUD operations
│   ├── memory/
│   │   └── index.ts            # MemoryClickHouse - threads, messages, resources
│   ├── workflows/
│   │   └── index.ts            # WorkflowsClickHouse - workflow snapshots and runs
│   ├── traces/
│   │   └── index.ts            # TracesClickHouse - telemetry traces
│   ├── scores/
│   │   └── index.ts            # ScoresClickHouse - evaluation scores
│   └── legacy-evals/
│       └── index.ts            # LegacyEvalsClickHouse - legacy evaluation results
└── index.ts                    # Main ClickhouseStore class
```

## Domain Implementations

### 1. StoreOperationsClickHouse (`domains/operations/index.ts`)
Basic storage operations:
- `insert()` - Insert single record
- `batchInsert()` - Insert multiple records  
- `load()` - Load record by keys
- `clearTable()` - Truncate table
- `dropTable()` - Drop table
- `createTable()` - Create table with schema
- `alterTable()` - Add columns to existing table
- `hasColumn()` - Check if column exists

### 2. MemoryClickHouse (`domains/memory/index.ts`)
Memory/conversation management:
- **Threads**: `getThreadById()`, `saveThread()`, `updateThread()`, `deleteThread()`, `getThreadsByResourceId()`, `getThreadsByResourceIdPaginated()`
- **Messages**: `getMessages()`, `getMessagesPaginated()`, `saveMessages()`, `updateMessages()`
- **Resources**: `getResourceById()`, `saveResource()`, `updateResource()`

### 3. WorkflowsClickHouse (`domains/workflows/index.ts`)
Workflow execution management:
- `persistWorkflowSnapshot()` - Save workflow state
- `loadWorkflowSnapshot()` - Load workflow state
- `getWorkflowRuns()` - Get workflow execution history
- `getWorkflowRunById()` - Get specific workflow run

### 4. TracesClickHouse (`domains/traces/index.ts`)
Telemetry and tracing:
- `getTraces()` - Get traces (deprecated)
- `getTracesPaginated()` - Get traces with pagination
- `batchTraceInsert()` - Insert multiple traces

### 5. ScoresClickHouse (`domains/scores/index.ts`)
Evaluation scoring:
- `getScoreById()` - Get score by ID
- `saveScore()` - Save new score
- `getScoresByRunId()` - Get scores for a run
- `getScoresByEntityId()` - Get scores for an entity
- `getScoresByScorerId()` - Get scores by scorer

### 6. LegacyEvalsClickHouse (`domains/legacy-evals/index.ts`)
Legacy evaluation results:
- `getEvalsByAgentName()` - Get evaluations by agent (deprecated)
- `getEvals()` - Get evaluations with pagination

## Key Features

### ClickHouse-Specific Optimizations
The main `ClickhouseStore` class retains ClickHouse-specific methods:
- `optimizeTable()` - Optimize table performance
- `materializeTtl()` - Materialize TTL policies
- TTL configuration support for automatic data cleanup

### Consistent Patterns
All domain implementations follow consistent patterns:
- Error handling with `MastraError`
- Date transformation utilities
- ClickHouse-specific query patterns with parameterized queries
- Proper JSON handling for metadata fields

### Test Integration
The implementation is compatible with the existing test suite pattern:
```typescript
import { createTestSuite } from '@internal/storage-test-utils';
import { Mastra } from '@mastra/core/mastra';
import { ClickhouseStore } from './index';

const store = new ClickhouseStore(config);
const mastra = new Mastra({ storage: store });
createTestSuite(mastra.getStorage()!);
```

## Migration Notes

The implementation maintains full backward compatibility. All existing ClickHouse store methods now delegate to the appropriate domain stores, so no changes are required in existing code that uses the ClickHouse store.

The `stores` property is now available on the ClickhouseStore instance, providing direct access to domain implementations when needed:

```typescript
const store = new ClickhouseStore(config);
await store.stores.memory.getThreadById({ threadId: 'abc' });
await store.stores.traces.getTracesPaginated({ page: 0, perPage: 50 });
```