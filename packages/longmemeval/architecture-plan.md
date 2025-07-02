# LongMemEval Refactor Architecture Plan

## Overview

This document outlines the architecture for refactoring the LongMemEval benchmark implementation to be simpler, more direct, and easier to understand while properly utilizing Mastra's memory system.

## Goals

1. **Simplicity**: Remove unnecessary abstractions and indirection
2. **Clarity**: Make it obvious what's happening at each step
3. **Performance**: Use MockStore and MockVectorStore for faster testing
4. **Maintainability**: Follow Mastra patterns and best practices

## Architecture

### Two-Step Process

#### Step 1: Data Preparation (`prepare-data.ts`)
- Load LongMemEval datasets
- Create a mock agent with memory
- Process each question's haystack sessions through the agent
- Use haystack session IDs as thread IDs
- Save prepared MockStore state for reuse

**Key Operations:**
```typescript
// Pseudocode
import { MockLanguageModelV1 } from 'ai/test';

// Create mock model that doesn't make API calls
const mockModel = new MockLanguageModelV1({
  doGenerate: async () => ({
    rawCall: { rawPrompt: null, rawSettings: {} },
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 20 },
    text: 'ok',
  }),
});

// Create memory with real embeddings for semantic recall
const memory = new Memory({ 
  storage: mockStore,
  vector: mockVectorStore,
  embedder: openai.embedding('text-embedding-3-small'), // Real embeddings
  options: memoryOptions
});

// Mock agent for processing conversations
const mockAgent = new Agent({
  name: 'mock-prep-agent',
  model: mockModel, // No API calls
  memory: memory
});

for each question in dataset:
  const resourceId = `resource_${question.question_id}`;
  
  // Process all messages for this question
  await mockAgent.generate(allMessagesForQuestion, {
    threadId: question.haystack_session_ids[0], // Use first session ID
    resourceId,
    memoryOptions: memoryConfig.options
  });
```

#### Step 2: Benchmark Execution (`run-benchmark.ts`)
- Load prepared MockStore with all conversation data
- Create agents with different memory configurations
- Execute queries using the same thread/resource IDs from preparation
- Evaluate results using Mastra evals

**Key Operations:**
```typescript
// Pseudocode - direct and simple
const agent = new Agent({
  name: 'longmemeval-agent',
  model: openai('gpt-4o'),
  memory: new Memory({ 
    storage: preparedMockStore, // Pre-populated from Step 1
    options: memoryConfig 
  })
});

// Use a new thread ID for the question, but same resourceId
const questionThreadId = `question_thread_${question.question_id}`;
const resourceId = `resource_${question.question_id}`;

const response = await agent.generate(question.question, {
  threadId: questionThreadId,
  resourceId // This allows memory to access all haystack sessions
});

const result = await evaluator.measure(
  JSON.stringify(question),
  response.text
);
```

## Thread ID Strategy

**Important**: The key to making LongMemEval work with Mastra's memory system is the thread ID mapping:

1. **During Preparation**: 
   - Use haystack session IDs directly as thread IDs
   - All sessions for a question share the same resourceId
   - This preserves the original conversation structure

2. **During Evaluation**:
   - Create a new thread ID for asking the question
   - Use the same resourceId to access all haystack sessions
   - Memory configurations (semantic recall, working memory) will pull from all threads under that resource

Example mapping:
```typescript
// Question: { question_id: "abc123", haystack_session_ids: ["s1", "s2", "s3"] }

// Preparation:
threadId: "s1", resourceId: "resource_abc123"  // Session 1
threadId: "s2", resourceId: "resource_abc123"  // Session 2
threadId: "s3", resourceId: "resource_abc123"  // Session 3

// Evaluation:
threadId: "question_thread_abc123", resourceId: "resource_abc123"  // Ask question
```

## Storage Design

### MockStore (Extended)
- Extends Mastra's existing `MockStore` class
- In-memory storage for fast access
- Add persistence methods for saving/loading state

```typescript
import { MockStore } from '@mastra/core/storage';
import { writeFile, readFile } from 'fs/promises';

class PersistableMockStore extends MockStore {
  async persist(filePath: string): Promise<void> {
    // Serialize internal data map to JSON
    const data = this.getData(); // Access internal storage
    await writeFile(filePath, JSON.stringify(data, null, 2));
  }
  
  async hydrate(filePath: string): Promise<void> {
    // Load and deserialize data from JSON
    const data = JSON.parse(await readFile(filePath, 'utf-8'));
    this.setData(data); // Restore internal storage
  }
  
  // Helper to access private data property
  private getData() {
    return (this as any).data;
  }
  
  private setData(data: any) {
    (this as any).data = data;
  }
}

### MockVectorStore (New)
- Implement using `imvectordb` for semantic search
- Extends `MastraVector` abstract class
- Implements all required vector operations
- Add persistence methods for saving/loading state

```typescript
import { MastraVector } from '@mastra/core/vector';
import type { QueryVectorParams, QueryResult, UpsertVectorParams, CreateIndexParams } from '@mastra/core/vector';
import { IMVectorDB } from 'imvectordb';
import { writeFile, readFile } from 'fs/promises';

class PersistableMockVectorStore extends MastraVector {
  private indexes: Map<string, IMVectorDB> = new Map();
  
  async createIndex({ indexName, dimension }: CreateIndexParams): Promise<void> {
    this.indexes.set(indexName, new IMVectorDB());
  }
  
  async query({ indexName, queryVector, topK = 10 }: QueryVectorParams): Promise<QueryResult[]> {
    const db = this.indexes.get(indexName);
    if (!db) throw new Error(`Index ${indexName} not found`);
    
    const results = await db.search(queryVector, topK);
    return results.map(r => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata
    }));
  }
  
  async upsert({ indexName, vectors, metadata, ids }: UpsertVectorParams): Promise<string[]> {
    const db = this.indexes.get(indexName);
    if (!db) throw new Error(`Index ${indexName} not found`);
    
    const vectorIds = ids || vectors.map(() => crypto.randomUUID());
    for (let i = 0; i < vectors.length; i++) {
      await db.add(vectorIds[i], vectors[i], metadata?.[i]);
    }
    return vectorIds;
  }
  
  // Persistence methods
  async persist(filePath: string): Promise<void> {
    const data: Record<string, any> = {};
    for (const [indexName, db] of this.indexes) {
      data[indexName] = await db.export(); // Assuming IMVectorDB has export method
    }
    await writeFile(filePath, JSON.stringify(data, null, 2));
  }
  
  async hydrate(filePath: string): Promise<void> {
    const data = JSON.parse(await readFile(filePath, 'utf-8'));
    this.indexes.clear();
    for (const [indexName, indexData] of Object.entries(data)) {
      const db = new IMVectorDB();
      await db.import(indexData); // Assuming IMVectorDB has import method
      this.indexes.set(indexName, db);
    }
  }
  
  // Additional required methods: listIndexes, describeIndex, deleteIndex, updateVector, deleteVector
}
```

## Memory Configurations

### 1. Full History (using large lastMessages)
```typescript
new Memory({
  storage: mockStore,
  options: {
    lastMessages: 1000  // Large number to include full history
  }
})
```

### 2. Last-K
```typescript
new Memory({
  storage: mockStore,
  options: {
    lastMessages: 50
  }
})
```

### 3. Semantic Recall
```typescript
new Memory({
  storage: mockStore,
  vector: mockVectorStore,
  options: {
    lastMessages: 10,
    semanticRecall: {
      topK: 10,
      messageRange: 2,
      scope: 'thread'
    }
  }
})
```

### 4. Working Memory
```typescript
new Memory({
  storage: mockStore,
  options: {
    lastMessages: 10,
    workingMemory: {
      enabled: true,
      template: `# User Context\n- Name:\n- Preferences:\n- Current Task:`
    }
  }
})
```

### 5. Combined
```typescript
new Memory({
  storage: mockStore,
  vector: mockVectorStore,
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 5,
      messageRange: 1
    },
    workingMemory: {
      enabled: true
    }
  }
})
```

## Evaluation Integration

### Custom Evaluator Using Mastra Evals
```typescript
import { Metric } from '@mastra/evals';
import type { MetricResult } from '@mastra/evals';
import type { LanguageModel } from '@mastra/core/llm';

class LongMemEvalMetric extends Metric {
  constructor(private model: LanguageModel) {
    super();
  }
  
  async measure(input: string, output: string): Promise<MetricResult> {
    // Input will be JSON stringified question data
    const question: LongMemEvalQuestion = JSON.parse(input);
    
    // Use GPT-4o to evaluate based on question type
    const prompt = this.getEvalPrompt(question, output);
    const evaluation = await this.model.generate(prompt);
    
    // Parse evaluation result (yes/no)
    const isCorrect = evaluation.text.toLowerCase().includes('yes');
    
    return {
      score: isCorrect ? 1 : 0,
      info: {
        questionType: question.question_type,
        questionId: question.question_id,
        reasoning: evaluation.text,
        isAbstention: question.question_id.endsWith('_abs')
      }
    };
  }
  
  private getEvalPrompt(question: LongMemEvalQuestion, response: string): string {
    // Implement prompts based on question type as in qa-evaluator.ts
    // ...
  }
}
```

## CLI Structure

### Commands

1. **Prepare Command**
   ```bash
   pnpm longmemeval prepare --dataset longmemeval_s --memory-config full-history
   ```
   - Downloads datasets if needed
   - Creates mock agent with MockLanguageModelV1 (no API calls)
   - Uses real OpenAI embeddings for vector operations
   - Persists data per question to subdirectories

   ```typescript
   // For each question during preparation:
   const questionDir = `./prepared-data/${dataset}/${memoryConfig}/${question.question_id}`;
   await mkdir(questionDir, { recursive: true });
   
   // Process question through mock agent
   await mockAgent.generate(messages, { threadId, resourceId });
   
   // Persist this question's data
   await mockStore.persist(`${questionDir}/db.json`);
   await mockVectorStore.persist(`${questionDir}/vector.json`);
   await writeFile(`${questionDir}/meta.json`, JSON.stringify({
     questionId: question.question_id,
     questionType: question.question_type,
     resourceId: `resource_${question.question_id}`,
     threadIds: question.haystack_session_ids,
     preparedAt: new Date().toISOString()
   }));
   ```

2. **Run Command**
   ```bash
   pnpm longmemeval run --dataset longmemeval_s --memory full-history
   ```
   - For each question, hydrates its specific prepared data
   - Creates evaluation agent with hydrated storage
   - Runs benchmark with specified configuration
   - Outputs results in standard format

   ```typescript
   // For each question during evaluation:
   const questionDir = `./prepared-data/${dataset}/${memoryConfig}/${question.question_id}`;
   
   // Create fresh instances for this question
   const mockStore = new PersistableMockStore();
   const mockVectorStore = new PersistableMockVectorStore();
   
   // Hydrate from question-specific files
   await mockStore.hydrate(`${questionDir}/db.json`);
   await mockVectorStore.hydrate(`${questionDir}/vector.json`);
   
   // Create agent with hydrated storage
   const agent = new Agent({
     name: 'eval-agent',
     model: openai('gpt-4o'),
     memory: new Memory({ 
       storage: mockStore, 
       vector: mockVectorStore,
       embedder: openai.embedding('text-embedding-3-small'),
       options: memoryOptions 
     })
   });
   
   // Evaluate this question
   const response = await agent.generate(question.question, {
     threadId: `question_thread_${question.question_id}`,
     resourceId: `resource_${question.question_id}`
   });
   ```

3. **Evaluate Command** (existing)
   ```bash
   pnpm longmemeval evaluate --results results.jsonl
   ```

## File Structure

```
packages/longmemeval/
├── src/
│   ├── cli.ts                 # CLI entry point
│   ├── commands/
│   │   ├── prepare.ts         # Data preparation command
│   │   ├── run.ts            # Benchmark execution command
│   │   └── evaluate.ts       # Evaluation command
│   ├── storage/
│   │   ├── mock-store.ts     # PersistableMockStore implementation
│   │   └── mock-vector.ts    # PersistableMockVectorStore implementation
│   ├── evaluation/
│   │   └── longmem-metric.ts # Mastra eval metric
│   ├── data/
│   │   ├── loader.ts         # Dataset loading (existing)
│   │   └── preparer.ts       # Data preparation logic
│   └── utils/
│       └── download.ts       # Dataset download (existing)
├── prepared-data/            # Prepared datasets
│   └── longmemeval_s/        # Dataset name
│       └── full-history/     # Memory config
│           └── abc123/       # Question ID
│               ├── db.json   # MockStore data
│               ├── vector.json # MockVectorStore data
│               └── meta.json # Question metadata
├── results/                  # Benchmark results
└── data/                     # Raw datasets
```

## Implementation Steps

1. **Phase 1: Storage Setup**
   - Implement MockVectorStore with imvectordb
   - Test basic storage operations

2. **Phase 2: Data Preparation**
   - Create prepare command
   - Implement data transformation logic
   - Test with sample data

3. **Phase 3: Benchmark Runner**
   - Refactor run command to use prepared data
   - Implement clean agent → generate → evaluate flow
   - Add parallelization support

4. **Phase 4: Evaluation Integration**
   - Create LongMemEvalMetric using Mastra evals
   - Integrate with benchmark runner
   - Add result aggregation

5. **Phase 5: Testing & Documentation**
   - Add unit tests for key components
   - Update README with new architecture
   - Create usage examples

## Benefits of This Approach

1. **Separation of Concerns**: Data preparation is separate from execution
2. **Reusability**: Prepared data can be reused across runs
3. **Performance**: MockStore provides fast in-memory access
4. **Simplicity**: Direct code flow without complex abstractions
5. **Compatibility**: Uses Mastra's native patterns and APIs
6. **Cost Efficiency**: Prepare once with cheap model, run many times
7. **Debugging**: Can inspect persisted JSON files to verify data
8. **Reproducibility**: Same prepared data ensures consistent benchmarks

## Persistence Benefits

The persistence approach provides several key advantages:

- **Cost Savings**: Use gpt-4o-mini for preparation, only pay for gpt-4o during actual evaluation
- **Time Savings**: Preparation (which involves processing thousands of messages) only happens once
- **Iterative Development**: Can tweak evaluation logic without re-preparing data
- **Debugging**: JSON files can be inspected to verify correct data preparation
- **Sharing**: Prepared datasets can be shared between team members
- **Version Control**: Can track changes to prepared data over time

## Migration Path

1. Keep existing implementation as reference
2. Build new implementation alongside
3. Validate results match expected behavior
4. Replace old implementation once validated