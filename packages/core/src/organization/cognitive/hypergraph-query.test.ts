import { describe, it, expect, beforeEach } from 'vitest';
import { AtomSpace } from './atomspace';
import type { Atom } from './types';

describe('HypergraphQL Query Engine', () => {
  let atomSpace: AtomSpace;
  let conceptLearning: Atom;
  let conceptIntelligence: Atom;
  let conceptReasoning: Atom;
  let conceptMemory: Atom;

  beforeEach(async () => {
    atomSpace = new AtomSpace({ name: 'test-hypergraph' });

    // Create test knowledge graph
    conceptLearning = await atomSpace.addAtom('concept', 'learning', [], { strength: 0.8, confidence: 0.7 });
    conceptIntelligence = await atomSpace.addAtom('concept', 'intelligence', [], { strength: 0.9, confidence: 0.8 });
    conceptReasoning = await atomSpace.addAtom('concept', 'reasoning', [], { strength: 0.85, confidence: 0.75 });
    conceptMemory = await atomSpace.addAtom('concept', 'memory', [], { strength: 0.7, confidence: 0.65 });

    // Create relationships
    await atomSpace.addAtom('similarity', undefined, [conceptLearning.id, conceptIntelligence.id], {
      strength: 0.7,
      confidence: 0.6,
    });
    await atomSpace.addAtom('implication', undefined, [conceptReasoning.id, conceptIntelligence.id], {
      strength: 0.8,
      confidence: 0.7,
    });
    await atomSpace.addAtom('inheritance', undefined, [conceptMemory.id, conceptLearning.id], {
      strength: 0.75,
      confidence: 0.65,
    });
  });

  describe('Pattern Queries', () => {
    it('should find atoms by type', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: 'concept',
      });

      expect(result.matches.length).toBe(4);
      expect(result.totalCount).toBe(4);
    });

    it('should find atoms by name', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: 'concept',
        name: 'learning',
      });

      expect(result.matches.length).toBe(1);
      expect(result.matches[0].atom.name).toBe('learning');
    });

    it('should filter by truth value', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: 'concept',
        truthValue: {
          strength: { operator: 'gte', value: 0.8 },
        },
      });

      expect(result.matches.length).toBeGreaterThanOrEqual(2);
      expect(result.matches.every(m => m.atom.truthValue.strength >= 0.8)).toBe(true);
    });

    it('should support multiple truth value filters', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: 'concept',
        truthValue: {
          strength: { operator: 'gte', value: 0.7 },
          confidence: { operator: 'gte', value: 0.7 },
        },
      });

      expect(result.matches.every(m => m.atom.truthValue.strength >= 0.7 && m.atom.truthValue.confidence >= 0.7)).toBe(
        true,
      );
    });

    it('should support pagination', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: 'concept',
        limit: 2,
        offset: 0,
      });

      expect(result.matches.length).toBe(2);
      expect(result.totalCount).toBe(4);
    });

    it('should bind variables in pattern matching', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: 'concept',
        variable: '?concept',
        name: 'learning',
      });

      expect(result.matches.length).toBe(1);
      expect(result.matches[0].bindings['?concept']).toBeDefined();
      expect(result.matches[0].bindings['?concept'].name).toBe('learning');
    });
  });

  describe('Graph Traversal', () => {
    it('should traverse outgoing links', () => {
      const result = atomSpace.traverseHypergraph({
        startAtomIds: [conceptReasoning.id],
        direction: 'outgoing',
        maxDepth: 2,
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should traverse incoming links', () => {
      const result = atomSpace.traverseHypergraph({
        startAtomIds: [conceptIntelligence.id],
        direction: 'incoming',
        maxDepth: 2,
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should traverse bidirectionally', () => {
      const result = atomSpace.traverseHypergraph({
        startAtomIds: [conceptLearning.id],
        direction: 'both',
        maxDepth: 2,
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should respect max depth', () => {
      const depth1 = atomSpace.traverseHypergraph({
        startAtomIds: [conceptLearning.id],
        direction: 'both',
        maxDepth: 1,
      });

      const depth2 = atomSpace.traverseHypergraph({
        startAtomIds: [conceptLearning.id],
        direction: 'both',
        maxDepth: 2,
      });

      expect(depth2.length).toBeGreaterThanOrEqual(depth1.length);
    });
  });

  describe('Path Finding', () => {
    it('should find paths between atoms', () => {
      const paths = atomSpace.findHypergraphPaths({
        startAtomId: conceptReasoning.id,
        endAtomId: conceptIntelligence.id,
        maxDepth: 5,
      });

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0][0].id).toBe(conceptReasoning.id);
      expect(paths[0][paths[0].length - 1].id).toBe(conceptIntelligence.id);
    });

    it('should return empty array when no path exists', () => {
      const isolatedConcept = atomSpace.addAtom('concept', 'isolated', [], { strength: 0.5, confidence: 0.5 });

      const paths = atomSpace.findHypergraphPaths({
        startAtomId: conceptLearning.id,
        endAtomId: (isolatedConcept as any).id,
        maxDepth: 5,
      });

      expect(paths.length).toBe(0);
    });
  });

  describe('Subgraph Extraction', () => {
    it('should extract subgraph around center atoms', () => {
      const subgraph = atomSpace.getHypergraphSubgraph({
        centerAtomIds: [conceptLearning.id],
        radius: 1,
        direction: 'both',
      });

      expect(subgraph.length).toBeGreaterThan(0);
      expect(subgraph.some(atom => atom.id === conceptLearning.id)).toBe(true);
    });

    it('should extract larger subgraph with bigger radius', () => {
      const subgraph1 = atomSpace.getHypergraphSubgraph({
        centerAtomIds: [conceptLearning.id],
        radius: 1,
      });

      const subgraph2 = atomSpace.getHypergraphSubgraph({
        centerAtomIds: [conceptLearning.id],
        radius: 2,
      });

      expect(subgraph2.length).toBeGreaterThanOrEqual(subgraph1.length);
    });
  });

  describe('Neighbors', () => {
    it('should get outgoing neighbors', () => {
      // First create a relationship where conceptLearning has outgoing links
      const similarityAtom = atomSpace.getAtomsByType('similarity')[0];
      if (similarityAtom && similarityAtom.outgoing?.includes(conceptLearning.id)) {
        const neighbors = atomSpace.getHypergraphNeighbors(similarityAtom.id, 'outgoing');
        expect(neighbors.length).toBeGreaterThan(0);
      }
    });

    it('should get all neighbors (bidirectional)', () => {
      const neighbors = atomSpace.getHypergraphNeighbors(conceptIntelligence.id, 'both');
      expect(neighbors.length).toBeGreaterThan(0);
    });
  });

  describe('Graph Statistics', () => {
    it('should compute graph statistics', () => {
      const stats = atomSpace.getHypergraphStatistics();

      expect(stats.nodeCount).toBeGreaterThan(0);
      expect(stats.edgeCount).toBeGreaterThanOrEqual(0);
      expect(stats.avgDegree).toBeGreaterThanOrEqual(0);
      expect(stats.typeDistribution).toBeDefined();
      expect(stats.typeDistribution['concept']).toBe(4);
    });

    it('should track type distribution', () => {
      const stats = atomSpace.getHypergraphStatistics();

      expect(stats.typeDistribution['concept']).toBeDefined();
      expect(stats.typeDistribution['similarity']).toBeDefined();
      expect(stats.typeDistribution['implication']).toBeDefined();
    });
  });

  describe('Complex Queries', () => {
    it('should query relationships with specific outgoing patterns', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: ['similarity', 'implication', 'inheritance'],
        truthValue: {
          strength: { operator: 'gte', value: 0.7 },
        },
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches.every(m => ['similarity', 'implication', 'inheritance'].includes(m.atom.type))).toBe(true);
    });

    it('should rank results by relevance', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: 'concept',
      });

      // Results should be sorted by relevance score
      if (result.matches.length > 1) {
        expect(result.matches[0].score).toBeGreaterThanOrEqual(result.matches[1].score!);
      }
    });

    it('should handle name pattern matching with operators', async () => {
      const result = await atomSpace.hypergraphQuery({
        type: 'concept',
        name: { operator: 'contains', value: 'learn' },
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches.every(m => m.atom.name?.includes('learn'))).toBe(true);
    });
  });
});
