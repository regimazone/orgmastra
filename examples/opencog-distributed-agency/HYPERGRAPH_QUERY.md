# HypergraphQL: Declarative Query Interface for AtomSpace

## Overview

HypergraphQL provides a GraphQL-like declarative query interface for the OpenCog AtomSpace hypergraph. It enables powerful pattern matching, graph traversal, and knowledge discovery operations.

## Core Concepts

### Hypergraph Structure

The AtomSpace is a **directed hypergraph** where:
- **Nodes** are atoms (concepts, predicates, etc.)
- **Hyperedges** are atoms that link to other atoms via `outgoing` links
- Each atom has `incoming` links (atoms pointing to it) and `outgoing` links (atoms it points to)

### Query Types

1. **Pattern Queries**: Find atoms matching specific patterns with variable bindings
2. **Traversal Queries**: Navigate the graph in different directions with depth control
3. **Path Queries**: Find paths between two atoms
4. **Subgraph Queries**: Extract local neighborhoods around atoms
5. **Statistical Queries**: Compute graph statistics

## Query Operators

HypergraphQL supports various operators for filtering:

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal to | `{ operator: 'eq', value: 0.8 }` |
| `ne` | Not equal to | `{ operator: 'ne', value: 0.5 }` |
| `gt` | Greater than | `{ operator: 'gt', value: 0.7 }` |
| `gte` | Greater than or equal | `{ operator: 'gte', value: 0.8 }` |
| `lt` | Less than | `{ operator: 'lt', value: 0.5 }` |
| `lte` | Less than or equal | `{ operator: 'lte', value: 0.6 }` |
| `in` | Value in array | `{ operator: 'in', value: ['a', 'b'] }` |
| `contains` | String contains | `{ operator: 'contains', value: 'learn' }` |
| `matches` | Regex match | `{ operator: 'matches', value: '^neural' }` |

## Usage Examples

### 1. Basic Pattern Queries

#### Find concepts by type
```typescript
const result = await atomSpace.hypergraphQuery({
  type: 'concept'
});
```

#### Filter by truth value
```typescript
const highConfidence = await atomSpace.hypergraphQuery({
  type: 'concept',
  truthValue: {
    strength: { operator: 'gte', value: 0.8 },
    confidence: { operator: 'gte', value: 0.7 }
  }
});
```

#### Pattern matching with name operators
```typescript
// Find concepts with "learning" in name
const learningConcepts = await atomSpace.hypergraphQuery({
  type: 'concept',
  name: { operator: 'contains', value: 'learning' }
});

// Find concepts starting with "neural"
const neuralConcepts = await atomSpace.hypergraphQuery({
  type: 'concept',
  name: { operator: 'matches', value: '^neural' }
});
```

#### Multiple types
```typescript
const relations = await atomSpace.hypergraphQuery({
  type: ['similarity', 'implication', 'inheritance'],
  truthValue: {
    strength: { operator: 'gte', value: 0.7 }
  }
});
```

### 2. Variable Bindings

Bind pattern variables for later reference:

```typescript
const implications = await atomSpace.hypergraphQuery({
  type: 'implication',
  variable: '?rule',
  outgoing: [
    { type: 'concept', name: 'learning', variable: '?premise' },
    { type: 'concept', variable: '?conclusion' }
  ]
});

// Access bindings
implications.matches.forEach(match => {
  console.log('Rule:', match.bindings['?rule']);
  console.log('Premise:', match.bindings['?premise']);
  console.log('Conclusion:', match.bindings['?conclusion']);
});
```

### 3. Pagination

Control result set size:

```typescript
const page1 = await atomSpace.hypergraphQuery({
  type: 'concept',
  limit: 10,
  offset: 0
});

const page2 = await atomSpace.hypergraphQuery({
  type: 'concept',
  limit: 10,
  offset: 10
});

console.log(`Total: ${page1.totalCount}, Showing: ${page1.matches.length}`);
```

### 4. Graph Traversal

#### Explore neighborhood
```typescript
const neighborhood = atomSpace.traverseHypergraph({
  startAtomIds: [conceptId],
  direction: 'both',        // 'outgoing' | 'incoming' | 'both'
  maxDepth: 3,
  includeStartNodes: true
});
```

#### Filter during traversal
```typescript
const filtered = atomSpace.traverseHypergraph({
  startAtomIds: [conceptId],
  direction: 'outgoing',
  maxDepth: 2,
  filter: {
    type: 'concept',
    truthValue: {
      confidence: { operator: 'gte', value: 0.7 }
    }
  }
});
```

### 5. Path Finding

Find all paths between two atoms:

```typescript
const paths = atomSpace.findHypergraphPaths({
  startAtomId: conceptA,
  endAtomId: conceptB,
  maxDepth: 5,
  direction: 'outgoing'
});

// Display paths
paths.forEach((path, i) => {
  console.log(`Path ${i + 1}:`);
  path.forEach(atom => console.log(`  - ${atom.name || atom.type}`));
});
```

### 6. Subgraph Extraction

Extract local neighborhood around atoms:

```typescript
const subgraph = atomSpace.getHypergraphSubgraph({
  centerAtomIds: [concept1, concept2],
  radius: 2,
  direction: 'both',
  filter: {
    type: ['concept', 'similarity']
  }
});
```

### 7. Neighbor Queries

Get immediate neighbors:

```typescript
// Outgoing neighbors
const outgoing = atomSpace.getHypergraphNeighbors(atomId, 'outgoing');

// Incoming neighbors  
const incoming = atomSpace.getHypergraphNeighbors(atomId, 'incoming');

// All neighbors
const all = atomSpace.getHypergraphNeighbors(atomId, 'both');
```

### 8. Graph Statistics

Compute graph metrics:

```typescript
const stats = atomSpace.getHypergraphStatistics();

console.log(`Nodes: ${stats.nodeCount}`);
console.log(`Edges: ${stats.edgeCount}`);
console.log(`Avg Degree: ${stats.avgDegree.toFixed(2)}`);
console.log(`Max Degree: ${stats.maxDegree}`);
console.log('Type Distribution:', stats.typeDistribution);
```

## Integration with CognitiveAgent

CognitiveAgents can use hypergraph queries on their knowledge base:

```typescript
// Query agent's knowledge
const result = await agent.queryHypergraph({
  type: 'concept',
  truthValue: {
    strength: { operator: 'gte', value: 0.8 }
  }
});

// Traverse agent's knowledge graph
const neighborhood = agent.traverseKnowledgeGraph({
  startAtomIds: [conceptId],
  direction: 'both',
  maxDepth: 2
});

// Find reasoning paths
const paths = agent.findConceptPaths({
  startAtomId: premise,
  endAtomId: conclusion,
  maxDepth: 5
});

// Extract knowledge subgraph
const subgraph = agent.getKnowledgeSubgraph({
  centerAtomIds: [importantConcept],
  radius: 2
});

// Get graph statistics
const stats = agent.getHypergraphStatistics();
```

## Advanced Use Cases

### 1. Knowledge Discovery

Find related concepts by exploring the graph:

```typescript
// Start from a concept
const concept = await atomSpace.hypergraphQuery({
  type: 'concept',
  name: 'machine-learning'
});

// Explore its neighborhood
const related = atomSpace.traverseHypergraph({
  startAtomIds: [concept.matches[0].atom.id],
  direction: 'both',
  maxDepth: 2
});

// Filter to high-confidence concepts
const highConfidence = related.filter(atom => 
  atom.type === 'concept' && 
  atom.truthValue.confidence >= 0.8
);
```

### 2. Reasoning Chain Analysis

Trace inference chains:

```typescript
// Find implication chains
const implications = await atomSpace.hypergraphQuery({
  type: 'implication',
  truthValue: {
    strength: { operator: 'gte', value: 0.7 }
  }
});

// For each implication, explore what it connects
implications.matches.forEach(({ atom }) => {
  const chain = atomSpace.traverseHypergraph({
    startAtomIds: [atom.id],
    direction: 'outgoing',
    maxDepth: 3
  });
  console.log(`Chain length: ${chain.length}`);
});
```

### 3. Pattern Recognition

Identify recurring structures:

```typescript
// Find all similarity relationships
const similarities = await atomSpace.hypergraphQuery({
  type: 'similarity',
  truthValue: {
    strength: { operator: 'gte', value: 0.8 }
  }
});

// Group by connected concepts
const patterns = new Map();
similarities.matches.forEach(({ atom }) => {
  const concepts = atom.outgoing?.map(id => 
    atomSpace.getAtom(id)?.name
  ).filter(Boolean);
  
  if (concepts?.length === 2) {
    const key = concepts.sort().join('-');
    patterns.set(key, (patterns.get(key) || 0) + 1);
  }
});
```

### 4. Attention-Based Querying

Query focused knowledge:

```typescript
// Get high-attention atoms
const focused = atomSpace.getAtomsByAttention(20);

// Query around focused atoms
const relevantKnowledge = atomSpace.getHypergraphSubgraph({
  centerAtomIds: focused.map(f => f.atom.id),
  radius: 1,
  filter: {
    truthValue: {
      confidence: { operator: 'gte', value: 0.7 }
    }
  }
});
```

## Performance Considerations

1. **Query Complexity**: Deep traversals (maxDepth > 5) can be expensive
2. **Result Set Size**: Use `limit` and `offset` for large result sets
3. **Filtering**: Apply filters early to reduce candidate atoms
4. **Indexing**: Type and name indices speed up basic queries
5. **Pagination**: Process large result sets in batches

## Best Practices

1. **Start Specific**: Begin with specific patterns and broaden as needed
2. **Use Filters**: Apply truth value and type filters to reduce results
3. **Limit Depth**: Keep traversal depth reasonable (2-3 for most cases)
4. **Cache Results**: Store frequently used query results
5. **Combine Methods**: Use pattern queries to find starting points, then traverse
6. **Monitor Performance**: Track query execution times

## Query Result Structure

```typescript
interface QueryResult {
  matches: Array<{
    atom: Atom;              // Matched atom
    bindings: Record<string, Atom>;  // Variable bindings
    score?: number;          // Relevance score
  }>;
  totalCount: number;        // Total matches before pagination
  executionTime: number;     // Query execution time in ms
}
```

## Future Enhancements

1. **Query Optimization**: Caching and indexing for faster queries
2. **Distributed Queries**: Execute across federated AtomSpaces
3. **Aggregation Functions**: COUNT, AVG, SUM, MIN, MAX
4. **Temporal Queries**: Time-based filtering and versioning
5. **Fuzzy Matching**: Approximate pattern matching
6. **Query Plans**: Optimization and explanation of query execution
7. **Streaming Results**: Large result sets via iterators
8. **Parallel Execution**: Multi-threaded query processing

## References

- [OpenCog AtomSpace](https://wiki.opencog.org/w/AtomSpace)
- [GraphQL](https://graphql.org/)
- [Hypergraph Theory](https://en.wikipedia.org/wiki/Hypergraph)
- [Graph Query Languages](https://en.wikipedia.org/wiki/Graph_query_language)
