#!/usr/bin/env tsx

/**
 * HypergraphQL Example
 * Demonstrates the hypergraph query capabilities of the AtomSpace
 */

import { AtomSpace } from '../../../packages/core/src/organization/cognitive';

async function main() {
  console.log('🔍 HypergraphQL Query Example\n');
  console.log('=' .repeat(60));

  // Create AtomSpace
  const atomSpace = new AtomSpace({ name: 'knowledge-graph' });

  console.log('\n📊 Building Knowledge Graph...\n');

  // Create concepts
  const ai = await atomSpace.addAtom('concept', 'artificial-intelligence', [], { strength: 0.95, confidence: 0.9 });
  const ml = await atomSpace.addAtom('concept', 'machine-learning', [], { strength: 0.9, confidence: 0.85 });
  const dl = await atomSpace.addAtom('concept', 'deep-learning', [], { strength: 0.88, confidence: 0.82 });
  const nn = await atomSpace.addAtom('concept', 'neural-networks', [], { strength: 0.85, confidence: 0.8 });
  const nlp = await atomSpace.addAtom('concept', 'natural-language-processing', [], { strength: 0.87, confidence: 0.83 });
  const cv = await atomSpace.addAtom('concept', 'computer-vision', [], { strength: 0.86, confidence: 0.81 });
  const rl = await atomSpace.addAtom('concept', 'reinforcement-learning', [], { strength: 0.84, confidence: 0.79 });
  const supervised = await atomSpace.addAtom('concept', 'supervised-learning', [], { strength: 0.82, confidence: 0.78 });

  console.log(`✓ Created ${atomSpace.getAtomsByType('concept').length} concepts`);

  // Create relationships
  await atomSpace.addAtom('inheritance', undefined, [ml.id, ai.id], { strength: 0.9, confidence: 0.85 });
  await atomSpace.addAtom('inheritance', undefined, [dl.id, ml.id], { strength: 0.88, confidence: 0.83 });
  await atomSpace.addAtom('inheritance', undefined, [nn.id, dl.id], { strength: 0.85, confidence: 0.8 });
  await atomSpace.addAtom('inheritance', undefined, [nlp.id, ai.id], { strength: 0.87, confidence: 0.82 });
  await atomSpace.addAtom('inheritance', undefined, [cv.id, ai.id], { strength: 0.86, confidence: 0.81 });
  await atomSpace.addAtom('inheritance', undefined, [rl.id, ml.id], { strength: 0.84, confidence: 0.79 });
  await atomSpace.addAtom('inheritance', undefined, [supervised.id, ml.id], { strength: 0.83, confidence: 0.78 });

  await atomSpace.addAtom('similarity', undefined, [dl.id, nn.id], { strength: 0.9, confidence: 0.85 });
  await atomSpace.addAtom('similarity', undefined, [nlp.id, cv.id], { strength: 0.7, confidence: 0.65 });

  await atomSpace.addAtom('implication', undefined, [nn.id, dl.id], { strength: 0.88, confidence: 0.83 });
  await atomSpace.addAtom('implication', undefined, [ml.id, ai.id], { strength: 0.9, confidence: 0.85 });

  console.log(`✓ Created ${atomSpace.getAtomsByType('inheritance').length} inheritance relationships`);
  console.log(`✓ Created ${atomSpace.getAtomsByType('similarity').length} similarity relationships`);
  console.log(`✓ Created ${atomSpace.getAtomsByType('implication').length} implication relationships`);

  // Graph statistics
  console.log('\n📈 Graph Statistics:\n');
  const stats = atomSpace.getHypergraphStatistics();
  console.log(`Nodes: ${stats.nodeCount}`);
  console.log(`Edges: ${stats.edgeCount}`);
  console.log(`Average Degree: ${stats.avgDegree.toFixed(2)}`);
  console.log(`Max Degree: ${stats.maxDegree}`);
  console.log('Type Distribution:', stats.typeDistribution);

  // Pattern queries
  console.log('\n' + '='.repeat(60));
  console.log('\n🔍 Pattern Queries\n');

  console.log('1️⃣  Finding all high-confidence concepts (>= 0.85):');
  const highConfidence = await atomSpace.hypergraphQuery({
    type: 'concept',
    truthValue: {
      confidence: { operator: 'gte', value: 0.85 },
    },
  });
  console.log(`   Found ${highConfidence.totalCount} concepts:`);
  highConfidence.matches.forEach(m => {
    console.log(`   - ${m.atom.name} (confidence: ${m.atom.truthValue.confidence.toFixed(2)})`);
  });

  console.log('\n2️⃣  Finding concepts with "learning" in the name:');
  const learningConcepts = await atomSpace.hypergraphQuery({
    type: 'concept',
    name: { operator: 'contains', value: 'learning' },
  });
  console.log(`   Found ${learningConcepts.totalCount} concepts:`);
  learningConcepts.matches.forEach(m => {
    console.log(`   - ${m.atom.name}`);
  });

  console.log('\n3️⃣  Finding inheritance relationships with high strength:');
  const strongInheritance = await atomSpace.hypergraphQuery({
    type: 'inheritance',
    truthValue: {
      strength: { operator: 'gte', value: 0.85 },
    },
  });
  console.log(`   Found ${strongInheritance.totalCount} inheritance relationships`);

  console.log('\n4️⃣  Top 3 most relevant concepts (ranked by score):');
  const topConcepts = await atomSpace.hypergraphQuery({
    type: 'concept',
    limit: 3,
  });
  topConcepts.matches.forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.atom.name} (score: ${m.score?.toFixed(3)})`);
  });

  // Graph traversal
  console.log('\n' + '='.repeat(60));
  console.log('\n🚶 Graph Traversal\n');

  console.log('1️⃣  Exploring neighborhood of "machine-learning" (radius 2):');
  const mlNeighborhood = atomSpace.getHypergraphSubgraph({
    centerAtomIds: [ml.id],
    radius: 2,
    direction: 'both',
  });
  console.log(`   Found ${mlNeighborhood.length} atoms in neighborhood:`);
  mlNeighborhood.forEach(atom => {
    if (atom.name) {
      console.log(`   - ${atom.type}: ${atom.name}`);
    }
  });

  console.log('\n2️⃣  Traversing from "neural-networks" following outgoing links:');
  const nnTraversal = atomSpace.traverseHypergraph({
    startAtomIds: [nn.id],
    direction: 'outgoing',
    maxDepth: 3,
    includeStartNodes: true,
  });
  console.log(`   Reached ${nnTraversal.length} atoms`);

  console.log('\n3️⃣  Finding immediate neighbors of "deep-learning":');
  const dlNeighbors = atomSpace.getHypergraphNeighbors(dl.id, 'both');
  console.log(`   Found ${dlNeighbors.length} neighbors:`);
  dlNeighbors.forEach(neighbor => {
    if (neighbor.name) {
      console.log(`   - ${neighbor.type}: ${neighbor.name}`);
    }
  });

  // Path finding
  console.log('\n' + '='.repeat(60));
  console.log('\n🛤️  Path Finding\n');

  console.log('1️⃣  Finding paths from "neural-networks" to "artificial-intelligence":');
  const paths = atomSpace.findHypergraphPaths({
    startAtomId: nn.id,
    endAtomId: ai.id,
    maxDepth: 5,
    direction: 'outgoing',
  });
  console.log(`   Found ${paths.length} path(s):`);
  paths.forEach((path, i) => {
    console.log(`\n   Path ${i + 1} (${path.length} hops):`);
    path.forEach((atom, j) => {
      const arrow = j < path.length - 1 ? ' → ' : '';
      console.log(`   ${atom.name || atom.type}${arrow}`);
    });
  });

  console.log('\n2️⃣  Finding paths from "supervised-learning" to "artificial-intelligence":');
  const paths2 = atomSpace.findHypergraphPaths({
    startAtomId: supervised.id,
    endAtomId: ai.id,
    maxDepth: 5,
  });
  console.log(`   Found ${paths2.length} path(s) with up to ${paths2.reduce((max, p) => Math.max(max, p.length), 0)} hops`);

  // Complex queries
  console.log('\n' + '='.repeat(60));
  console.log('\n🎯 Complex Queries\n');

  console.log('1️⃣  Finding all relationship types connecting to AI:');
  const aiRelations = atomSpace.traverseHypergraph({
    startAtomIds: [ai.id],
    direction: 'incoming',
    maxDepth: 1,
    filter: {
      type: ['inheritance', 'similarity', 'implication'],
    },
  });
  console.log(`   Found ${aiRelations.length} relationships:`);
  const relationTypes = new Set(aiRelations.map(a => a.type));
  relationTypes.forEach(type => {
    const count = aiRelations.filter(a => a.type === type).length;
    console.log(`   - ${type}: ${count}`);
  });

  console.log('\n2️⃣  Variable binding query - finding implication patterns:');
  const implications = await atomSpace.hypergraphQuery({
    type: 'implication',
    variable: '?impl',
    truthValue: {
      strength: { operator: 'gte', value: 0.85 },
    },
  });
  console.log(`   Found ${implications.totalCount} high-strength implications:`);
  implications.matches.forEach(m => {
    console.log(`   - Implication (strength: ${m.atom.truthValue.strength.toFixed(2)})`);
    console.log(`     Variable binding: ?impl -> ${m.bindings['?impl']?.id.substring(0, 8)}...`);
  });

  // Performance metrics
  console.log('\n' + '='.repeat(60));
  console.log('\n⚡ Performance Metrics\n');
  
  const perfQuery = await atomSpace.hypergraphQuery({
    type: 'concept',
    truthValue: {
      strength: { operator: 'gte', value: 0.8 },
    },
  });
  console.log(`Query execution time: ${perfQuery.executionTime}ms`);
  console.log(`Results returned: ${perfQuery.matches.length}`);
  console.log(`Total matches: ${perfQuery.totalCount}`);

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ HypergraphQL example completed!\n');
}

main().catch(console.error);
