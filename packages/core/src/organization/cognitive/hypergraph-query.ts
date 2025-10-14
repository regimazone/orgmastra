import { MastraBase } from '../../base';
import { RegisteredLogger } from '../../logger/constants';
import { InstrumentClass } from '../../telemetry';
import type { Atom, AtomType, TruthValue } from './types';

/**
 * Query operators for pattern matching
 */
export type QueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'matches';

/**
 * Pattern for hypergraph queries with variables
 */
export interface HypergraphPattern {
  type?: AtomType | AtomType[];
  name?: string | { operator: QueryOperator; value: any };
  outgoing?: Array<string | HypergraphPattern>;
  incoming?: Array<string | HypergraphPattern>;
  truthValue?: {
    strength?: { operator: QueryOperator; value: number };
    confidence?: { operator: QueryOperator; value: number };
    count?: { operator: QueryOperator; value: number };
  };
  metadata?: Record<string, any>;
  variable?: string; // Variable name for binding (e.g., "?x", "?concept")
  limit?: number;
  offset?: number;
}

/**
 * Traversal direction for graph queries
 */
export type TraversalDirection = 'outgoing' | 'incoming' | 'both';

/**
 * Query result with bindings for pattern variables
 */
export interface QueryResult {
  matches: Array<{
    atom: Atom;
    bindings: Record<string, Atom>; // Variable name -> bound atom
    score?: number; // Relevance score for ranking
  }>;
  totalCount: number;
  executionTime: number;
}

/**
 * Hypergraph traversal query
 */
export interface TraversalQuery {
  startAtomIds: string[];
  direction: TraversalDirection;
  maxDepth?: number;
  filter?: HypergraphPattern;
  includeStartNodes?: boolean;
}

/**
 * Path query between atoms
 */
export interface PathQuery {
  startAtomId: string;
  endAtomId: string;
  maxDepth?: number;
  direction?: TraversalDirection;
}

/**
 * Subgraph query
 */
export interface SubgraphQuery {
  centerAtomIds: string[];
  radius: number;
  direction?: TraversalDirection;
  filter?: HypergraphPattern;
}

/**
 * HypergraphQL engine for declarative querying of the AtomSpace hypergraph
 * Provides GraphQL-like query capabilities for pattern matching and traversal
 */
@InstrumentClass({
  prefix: 'hypergraph-query',
  excludeMethods: ['__setLogger', '__setTelemetry'],
})
export class HypergraphQueryEngine extends MastraBase {
  #atoms: Map<string, Atom>;

  constructor(name: string, atoms: Map<string, Atom>) {
    super({ component: RegisteredLogger.ATOMSPACE, name });
    this.#atoms = atoms;
  }

  /**
   * Execute a pattern query with variable bindings
   */
  public async query(pattern: HypergraphPattern): Promise<QueryResult> {
    const startTime = Date.now();
    const matches: Array<{ atom: Atom; bindings: Record<string, Atom>; score?: number }> = [];
    const atoms = Array.from(this.#atoms.values());

    // Apply filters and collect matches
    for (const atom of atoms) {
      const bindings: Record<string, Atom> = {};
      if (this.#matchesPattern(atom, pattern, bindings)) {
        const score = this.#calculateRelevanceScore(atom, pattern);
        matches.push({ atom, bindings, score });
      }
    }

    // Sort by score if relevance scoring was applied
    const sortedMatches = matches.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Apply pagination
    const offset = pattern.offset || 0;
    const limit = pattern.limit || sortedMatches.length;
    const paginatedMatches = sortedMatches.slice(offset, offset + limit);

    return {
      matches: paginatedMatches,
      totalCount: sortedMatches.length,
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Traverse the hypergraph from starting atoms
   */
  public traverseGraph(query: TraversalQuery): Atom[] {
    const visited = new Set<string>();
    const result: Atom[] = [];
    const queue: Array<{ atomId: string; depth: number }> = query.startAtomIds.map(id => ({ atomId: id, depth: 0 }));

    if (query.includeStartNodes !== false) {
      query.startAtomIds.forEach(id => {
        const atom = this.#atoms.get(id);
        if (atom) visited.add(id);
      });
    }

    while (queue.length > 0) {
      const { atomId, depth } = queue.shift()!;
      const atom = this.#atoms.get(atomId);

      if (!atom || (query.maxDepth !== undefined && depth >= query.maxDepth)) {
        continue;
      }

      // Check if atom matches filter
      if (query.filter && !this.#matchesPattern(atom, query.filter, {})) {
        continue;
      }

      if (!visited.has(atomId)) {
        visited.add(atomId);
        result.push(atom);
      }

      // Add neighbors to queue based on direction
      const neighbors: string[] = [];
      if (query.direction === 'outgoing' || query.direction === 'both') {
        neighbors.push(...(atom.outgoing || []));
      }
      if (query.direction === 'incoming' || query.direction === 'both') {
        neighbors.push(...(atom.incoming || []));
      }

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          queue.push({ atomId: neighborId, depth: depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Find paths between two atoms
   */
  public findPaths(query: PathQuery): Array<Atom[]> {
    const paths: Array<Atom[]> = [];
    const maxDepth = query.maxDepth || 10;
    const direction = query.direction || 'outgoing';

    const dfs = (currentId: string, targetId: string, path: string[], depth: number) => {
      if (depth > maxDepth || path.includes(currentId)) {
        return;
      }

      const newPath = [...path, currentId];

      if (currentId === targetId) {
        const atomPath = newPath.map(id => this.#atoms.get(id)!).filter(Boolean);
        if (atomPath.length === newPath.length) {
          paths.push(atomPath);
        }
        return;
      }

      const atom = this.#atoms.get(currentId);
      if (!atom) return;

      const neighbors: string[] = [];
      if (direction === 'outgoing' || direction === 'both') {
        neighbors.push(...(atom.outgoing || []));
      }
      if (direction === 'incoming' || direction === 'both') {
        neighbors.push(...(atom.incoming || []));
      }

      for (const neighborId of neighbors) {
        dfs(neighborId, targetId, newPath, depth + 1);
      }
    };

    dfs(query.startAtomId, query.endAtomId, [], 0);
    return paths;
  }

  /**
   * Extract a subgraph around center atoms
   */
  public getSubgraph(query: SubgraphQuery): Atom[] {
    return this.traverseGraph({
      startAtomIds: query.centerAtomIds,
      direction: query.direction || 'both',
      maxDepth: query.radius,
      filter: query.filter,
      includeStartNodes: true,
    });
  }

  /**
   * Get neighbors of an atom
   */
  public getNeighbors(atomId: string, direction: TraversalDirection = 'both'): Atom[] {
    const atom = this.#atoms.get(atomId);
    if (!atom) return [];

    const neighborIds = new Set<string>();
    if (direction === 'outgoing' || direction === 'both') {
      atom.outgoing?.forEach(id => neighborIds.add(id));
    }
    if (direction === 'incoming' || direction === 'both') {
      atom.incoming?.forEach(id => neighborIds.add(id));
    }

    return Array.from(neighborIds)
      .map(id => this.#atoms.get(id)!)
      .filter(Boolean);
  }

  /**
   * Calculate graph statistics
   */
  public getGraphStatistics(): {
    nodeCount: number;
    edgeCount: number;
    avgDegree: number;
    maxDegree: number;
    typeDistribution: Record<AtomType, number>;
  } {
    const atoms = Array.from(this.#atoms.values());
    let totalEdges = 0;
    let maxDegree = 0;
    const typeDistribution: Record<string, number> = {};

    for (const atom of atoms) {
      const degree = (atom.outgoing?.length || 0) + (atom.incoming?.length || 0);
      totalEdges += atom.outgoing?.length || 0;
      maxDegree = Math.max(maxDegree, degree);

      typeDistribution[atom.type] = (typeDistribution[atom.type] || 0) + 1;
    }

    return {
      nodeCount: atoms.length,
      edgeCount: totalEdges,
      avgDegree: atoms.length > 0 ? totalEdges / atoms.length : 0,
      maxDegree,
      typeDistribution: typeDistribution as Record<AtomType, number>,
    };
  }

  /**
   * Check if an atom matches a pattern
   */
  #matchesPattern(atom: Atom, pattern: HypergraphPattern, bindings: Record<string, Atom>): boolean {
    // Type matching
    if (pattern.type) {
      const types = Array.isArray(pattern.type) ? pattern.type : [pattern.type];
      if (!types.includes(atom.type)) return false;
    }

    // Name matching with operators
    if (pattern.name !== undefined) {
      if (typeof pattern.name === 'string') {
        if (atom.name !== pattern.name) return false;
      } else if (typeof pattern.name === 'object' && 'operator' in pattern.name) {
        if (!this.#compareValue(atom.name, pattern.name.operator, pattern.name.value)) {
          return false;
        }
      }
    }

    // Truth value matching
    if (pattern.truthValue) {
      if (
        pattern.truthValue.strength &&
        !this.#compareValue(atom.truthValue.strength, pattern.truthValue.strength.operator, pattern.truthValue.strength.value)
      ) {
        return false;
      }
      if (
        pattern.truthValue.confidence &&
        !this.#compareValue(
          atom.truthValue.confidence,
          pattern.truthValue.confidence.operator,
          pattern.truthValue.confidence.value,
        )
      ) {
        return false;
      }
      if (
        pattern.truthValue.count &&
        !this.#compareValue(atom.truthValue.count, pattern.truthValue.count.operator, pattern.truthValue.count.value)
      ) {
        return false;
      }
    }

    // Metadata matching
    if (pattern.metadata) {
      for (const [key, value] of Object.entries(pattern.metadata)) {
        if (atom.metadata[key] !== value) return false;
      }
    }

    // Outgoing link matching
    if (pattern.outgoing) {
      if (!atom.outgoing || atom.outgoing.length !== pattern.outgoing.length) {
        return false;
      }
      for (let i = 0; i < pattern.outgoing.length; i++) {
        const outgoingPattern = pattern.outgoing[i];
        if (typeof outgoingPattern === 'string') {
          if (atom.outgoing[i] !== outgoingPattern) return false;
        } else {
          const outgoingAtom = this.#atoms.get(atom.outgoing[i]);
          if (!outgoingAtom || !this.#matchesPattern(outgoingAtom, outgoingPattern, bindings)) {
            return false;
          }
        }
      }
    }

    // Bind variable if specified
    if (pattern.variable) {
      bindings[pattern.variable] = atom;
    }

    return true;
  }

  /**
   * Compare value using operator
   */
  #compareValue(actual: any, operator: QueryOperator, expected: any): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'contains':
        return typeof actual === 'string' && actual.includes(expected);
      case 'matches':
        return typeof actual === 'string' && new RegExp(expected).test(actual);
      default:
        return false;
    }
  }

  /**
   * Calculate relevance score for ranking
   */
  #calculateRelevanceScore(atom: Atom, pattern: HypergraphPattern): number {
    let score = 0;

    // Truth value contributes to score
    score += atom.truthValue.strength * atom.truthValue.confidence;

    // Evidence count contributes
    score += Math.log(atom.truthValue.count + 1) * 0.1;

    // Exact name match boosts score
    if (pattern.name && atom.name === pattern.name) {
      score += 0.5;
    }

    // Type match
    if (pattern.type) {
      const types = Array.isArray(pattern.type) ? pattern.type : [pattern.type];
      if (types.includes(atom.type)) {
        score += 0.3;
      }
    }

    return score;
  }
}
