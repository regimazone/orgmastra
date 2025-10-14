import { randomUUID } from 'crypto';
import { MastraBase } from '../../base';
import { RegisteredLogger } from '../../logger/constants';
import type { MastraStorage } from '../../storage';
import { InstrumentClass } from '../../telemetry';
import type { MastraVector } from '../../vector';
import type { Atom, AtomType, TruthValue, AttentionValue } from './types';
import {
  HypergraphQueryEngine,
  type HypergraphPattern,
  type QueryResult,
  type TraversalQuery,
  type PathQuery,
  type SubgraphQuery,
  type TraversalDirection,
} from './hypergraph-query';

/**
 * Configuration for AtomSpace
 */
export interface AtomSpaceConfig {
  name: string;
  storage?: MastraStorage;
  vector?: MastraVector;
  maxAtoms?: number;
  enableAttention?: boolean;
}

/**
 * Distributed knowledge representation system inspired by OpenCog's AtomSpace
 */
@InstrumentClass({
  prefix: 'atomspace',
  excludeMethods: ['__registerMastra', '__setLogger', '__setTelemetry'],
})
export class AtomSpace extends MastraBase {
  #atoms: Map<string, Atom>;
  #typeIndex: Map<AtomType, Set<string>>;
  #nameIndex: Map<string, Set<string>>;
  #outgoingIndex: Map<string, Set<string>>;
  #incomingIndex: Map<string, Set<string>>;
  #storage?: MastraStorage;
  #vector?: MastraVector;
  #attentionValues: Map<string, AttentionValue>;
  #config: Required<Omit<AtomSpaceConfig, 'storage' | 'vector'>> & Pick<AtomSpaceConfig, 'storage' | 'vector'>;
  #queryEngine: HypergraphQueryEngine;

  constructor(config: AtomSpaceConfig) {
    super({ component: RegisteredLogger.ATOMSPACE, name: config.name });

    this.#atoms = new Map();
    this.#typeIndex = new Map();
    this.#nameIndex = new Map();
    this.#outgoingIndex = new Map();
    this.#incomingIndex = new Map();
    this.#attentionValues = new Map();
    this.#storage = config.storage;
    this.#vector = config.vector;

    this.#config = {
      name: config.name,
      maxAtoms: config.maxAtoms || 100000,
      enableAttention: config.enableAttention ?? true,
      storage: config.storage,
      vector: config.vector,
    };

    // Initialize hypergraph query engine
    this.#queryEngine = new HypergraphQueryEngine(config.name, this.#atoms);
  }

  /**
   * Create or update an atom in the AtomSpace
   */
  public async addAtom(
    type: AtomType,
    name?: string,
    outgoing?: string[],
    truthValue?: Partial<TruthValue>,
    metadata?: Record<string, any>,
  ): Promise<Atom> {
    const id = randomUUID();
    const now = new Date();

    const atom: Atom = {
      id,
      type,
      name,
      truthValue: {
        strength: truthValue?.strength ?? 0.5,
        confidence: truthValue?.confidence ?? 0.5,
        count: truthValue?.count ?? 1,
      },
      outgoing: outgoing || [],
      incoming: [],
      metadata: metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    // Check for existing similar atom
    const existing = await this.findSimilarAtom(atom);
    if (existing) {
      return this.mergeAtoms(existing, atom);
    }

    this.#atoms.set(id, atom);
    this.#updateIndexes(atom);

    // Initialize attention if enabled
    if (this.#config.enableAttention) {
      this.#attentionValues.set(id, {
        sti: 0,
        lti: 0,
        vlti: 0,
      });
    }

    // Store in persistent storage if available
    if (this.#storage) {
      await this.#persistAtom(atom);
    }

    // Add to vector store if available
    if (this.#vector && atom.name) {
      await this.#vectorizeAtom(atom);
    }

    this.logger?.info('Atom added to AtomSpace', { atomId: id, type, name });
    return atom;
  }

  /**
   * Get an atom by ID
   */
  public getAtom(id: string): Atom | undefined {
    return this.#atoms.get(id);
  }

  /**
   * Find atoms by type
   */
  public getAtomsByType(type: AtomType): Atom[] {
    const atomIds = this.#typeIndex.get(type) || new Set();
    return Array.from(atomIds)
      .map(id => this.#atoms.get(id)!)
      .filter(Boolean);
  }

  /**
   * Find atoms by name
   */
  public getAtomsByName(name: string): Atom[] {
    const atomIds = this.#nameIndex.get(name) || new Set();
    return Array.from(atomIds)
      .map(id => this.#atoms.get(id)!)
      .filter(Boolean);
  }

  /**
   * Query atoms with pattern matching
   */
  public async queryAtoms(pattern: {
    type?: AtomType;
    name?: string;
    outgoing?: string[];
    truthValueMin?: Partial<TruthValue>;
    metadata?: Record<string, any>;
  }): Promise<Atom[]> {
    let candidates = Array.from(this.#atoms.values());

    if (pattern.type) {
      candidates = candidates.filter(atom => atom.type === pattern.type);
    }

    if (pattern.name) {
      candidates = candidates.filter(atom => atom.name === pattern.name);
    }

    if (pattern.outgoing) {
      candidates = candidates.filter(atom => pattern.outgoing!.every(id => atom.outgoing?.includes(id)));
    }

    if (pattern.truthValueMin) {
      candidates = candidates.filter(atom => {
        const tv = atom.truthValue;
        const min = pattern.truthValueMin!;
        return (
          (!min.strength || tv.strength >= min.strength) &&
          (!min.confidence || tv.confidence >= min.confidence) &&
          (!min.count || tv.count >= min.count)
        );
      });
    }

    if (pattern.metadata) {
      candidates = candidates.filter(atom => {
        for (const [key, value] of Object.entries(pattern.metadata!)) {
          if (atom.metadata[key] !== value) return false;
        }
        return true;
      });
    }

    return candidates;
  }

  /**
   * Get attention value for an atom
   */
  public getAttentionValue(atomId: string): AttentionValue | undefined {
    return this.#attentionValues.get(atomId);
  }

  /**
   * Update attention value for an atom
   */
  public updateAttentionValue(atomId: string, attention: Partial<AttentionValue>): void {
    const current = this.#attentionValues.get(atomId) || { sti: 0, lti: 0, vlti: 0 };
    this.#attentionValues.set(atomId, {
      sti: attention.sti ?? current.sti,
      lti: attention.lti ?? current.lti,
      vlti: attention.vlti ?? current.vlti,
    });
  }

  /**
   * Get atoms ordered by attention
   */
  public getAtomsByAttention(limit: number = 100): Array<{ atom: Atom; attention: AttentionValue }> {
    return Array.from(this.#atoms.values())
      .map(atom => ({
        atom,
        attention: this.#attentionValues.get(atom.id) || { sti: 0, lti: 0, vlti: 0 },
      }))
      .sort((a, b) => b.attention.sti - a.attention.sti)
      .slice(0, limit);
  }

  /**
   * Update indexes when adding/updating atoms
   */
  #updateIndexes(atom: Atom): void {
    // Type index
    if (!this.#typeIndex.has(atom.type)) {
      this.#typeIndex.set(atom.type, new Set());
    }
    this.#typeIndex.get(atom.type)!.add(atom.id);

    // Name index
    if (atom.name) {
      if (!this.#nameIndex.has(atom.name)) {
        this.#nameIndex.set(atom.name, new Set());
      }
      this.#nameIndex.get(atom.name)!.add(atom.id);
    }

    // Outgoing index
    if (atom.outgoing) {
      for (const outgoingId of atom.outgoing) {
        if (!this.#outgoingIndex.has(outgoingId)) {
          this.#outgoingIndex.set(outgoingId, new Set());
        }
        this.#outgoingIndex.get(outgoingId)!.add(atom.id);

        // Update incoming index for target atoms
        const targetAtom = this.#atoms.get(outgoingId);
        if (targetAtom) {
          if (!targetAtom.incoming) targetAtom.incoming = [];
          if (!targetAtom.incoming.includes(atom.id)) {
            targetAtom.incoming.push(atom.id);
          }
        }
      }
    }
  }

  /**
   * Find similar existing atom
   */
  private async findSimilarAtom(atom: Atom): Promise<Atom | undefined> {
    // Basic similarity check based on type, name, and outgoing links
    const candidates = await this.queryAtoms({
      type: atom.type,
      name: atom.name,
      outgoing: atom.outgoing,
    });

    return candidates.length > 0 ? candidates[0] : undefined;
  }

  /**
   * Merge two atoms with truth value revision
   */
  private mergeAtoms(existing: Atom, newAtom: Atom): Atom {
    // Merge truth values using revision formula
    const tv1 = existing.truthValue;
    const tv2 = newAtom.truthValue;

    const totalCount = tv1.count + tv2.count;
    const mergedStrength = (tv1.strength * tv1.count + tv2.strength * tv2.count) / totalCount;
    const mergedConfidence = Math.min(1.0, (tv1.confidence * tv1.count + tv2.confidence * tv2.count) / totalCount);

    existing.truthValue = {
      strength: mergedStrength,
      confidence: mergedConfidence,
      count: totalCount,
    };
    existing.updatedAt = new Date();
    existing.metadata = { ...existing.metadata, ...newAtom.metadata };

    return existing;
  }

  /**
   * Persist atom to storage
   */
  async #persistAtom(atom: Atom): Promise<void> {
    if (!this.#storage) return;

    try {
      // Store using insert method instead of set
      await this.#storage.insert({
        tableName: 'atomspace' as any,
        record: {
          id: atom.id,
          data: JSON.stringify(atom),
          created_at: atom.createdAt,
        },
      });
    } catch (error) {
      this.logger?.error('Failed to persist atom', { atomId: atom.id, error });
    }
  }

  /**
   * Add atom to vector store for semantic search
   */
  async #vectorizeAtom(atom: Atom): Promise<void> {
    if (!this.#vector || !atom.name) return;

    try {
      const content = `${atom.type}:${atom.name}${atom.metadata.description ? ' - ' + atom.metadata.description : ''}`;

      await this.#vector.upsert({
        indexName: `atomspace_${this.#config.name}`,
        vectors: [[0.1, 0.2, 0.3]], // Placeholder values - would be generated by embedder
        ids: [atom.id],
        metadata: [
          {
            type: atom.type,
            name: atom.name,
            strength: atom.truthValue.strength,
            confidence: atom.truthValue.confidence,
            content,
          },
        ],
      });
    } catch (error) {
      this.logger?.error('Failed to vectorize atom', { atomId: atom.id, error });
    }
  }

  // ============================================================================
  // HypergraphQL Query Methods
  // ============================================================================

  /**
   * Execute a pattern query with variable bindings (HypergraphQL)
   * 
   * @example
   * ```typescript
   * // Find all concepts with high truth value
   * const result = await atomSpace.hypergraphQuery({
   *   type: 'concept',
   *   truthValue: {
   *     strength: { operator: 'gte', value: 0.8 }
   *   },
   *   limit: 10
   * });
   * 
   * // Pattern matching with variables
   * const result = await atomSpace.hypergraphQuery({
   *   type: 'implication',
   *   variable: '?impl',
   *   outgoing: [
   *     { type: 'concept', name: 'learning', variable: '?premise' },
   *     { type: 'concept', variable: '?conclusion' }
   *   ]
   * });
   * ```
   */
  public async hypergraphQuery(pattern: HypergraphPattern): Promise<QueryResult> {
    this.logger?.debug('Executing hypergraph query', { pattern });
    return this.#queryEngine.query(pattern);
  }

  /**
   * Traverse the hypergraph from starting atoms
   * 
   * @example
   * ```typescript
   * // Get all atoms reachable from a concept within 3 hops
   * const reachable = atomSpace.traverseHypergraph({
   *   startAtomIds: [conceptId],
   *   direction: 'outgoing',
   *   maxDepth: 3
   * });
   * ```
   */
  public traverseHypergraph(query: TraversalQuery): Atom[] {
    this.logger?.debug('Traversing hypergraph', { query });
    return this.#queryEngine.traverseGraph(query);
  }

  /**
   * Find paths between two atoms in the hypergraph
   * 
   * @example
   * ```typescript
   * const paths = atomSpace.findHypergraphPaths({
   *   startAtomId: conceptA,
   *   endAtomId: conceptB,
   *   maxDepth: 5
   * });
   * ```
   */
  public findHypergraphPaths(query: PathQuery): Array<Atom[]> {
    this.logger?.debug('Finding paths in hypergraph', { query });
    return this.#queryEngine.findPaths(query);
  }

  /**
   * Extract a subgraph around center atoms
   * 
   * @example
   * ```typescript
   * // Get local neighborhood around key concepts
   * const subgraph = atomSpace.getHypergraphSubgraph({
   *   centerAtomIds: [concept1, concept2],
   *   radius: 2,
   *   direction: 'both'
   * });
   * ```
   */
  public getHypergraphSubgraph(query: SubgraphQuery): Atom[] {
    this.logger?.debug('Extracting subgraph', { query });
    return this.#queryEngine.getSubgraph(query);
  }

  /**
   * Get neighboring atoms in the hypergraph
   * 
   * @example
   * ```typescript
   * const neighbors = atomSpace.getHypergraphNeighbors(atomId, 'both');
   * ```
   */
  public getHypergraphNeighbors(atomId: string, direction: TraversalDirection = 'both'): Atom[] {
    return this.#queryEngine.getNeighbors(atomId, direction);
  }

  /**
   * Get hypergraph statistics
   * 
   * @example
   * ```typescript
   * const stats = atomSpace.getHypergraphStatistics();
   * console.log(`Graph has ${stats.nodeCount} nodes and ${stats.edgeCount} edges`);
   * ```
   */
  public getHypergraphStatistics(): {
    nodeCount: number;
    edgeCount: number;
    avgDegree: number;
    maxDegree: number;
    typeDistribution: Record<AtomType, number>;
  } {
    return this.#queryEngine.getGraphStatistics();
  }
}
