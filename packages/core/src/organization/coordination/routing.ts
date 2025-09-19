import type { IMastraLogger } from '../../logger';
import type { Organization } from '../organization';
import type { Person } from '../person';
import type { Project } from '../project';
import type {
  CoordinationContext,
  CoordinationResult,
  DelegationRequest,
  CollaborationRequest,
} from '../types';

/**
 * Represents a route in the organizational network
 */
export interface Route {
  fromEntity: string;
  toEntity: string;
  entityType: 'organization' | 'project' | 'person';
  distance: number;
  capabilities: string[];
  trustLevel: number;
  metadata?: Record<string, any>;
}

/**
 * Configuration for the routing system
 */
export interface RoutingConfig {
  /** Maximum number of hops allowed in a route */
  maxHops: number;
  /** Whether to cache routes for performance */
  enableCaching: boolean;
  /** How long to cache routes in milliseconds */
  cacheTimeout: number;
  /** Algorithm to use for finding optimal routes */
  routingAlgorithm: 'shortest-path' | 'capability-weighted' | 'trust-weighted' | 'hybrid';
  /** Weight factors for hybrid algorithm */
  weights?: {
    distance: number;
    capability: number;
    trust: number;
    load: number;
  };
}

/**
 * Cached route information
 */
interface CachedRoute {
  route: Route[];
  timestamp: number;
  usageCount: number;
}

/**
 * Entity information for routing
 */
export interface RoutingEntity {
  id: string;
  type: 'organization' | 'project' | 'person';
  capabilities: string[];
  trustLevel: number;
  currentLoad: number;
  connections: string[];
  metadata?: Record<string, any>;
}

/**
 * Manages routing of requests through the organizational network
 */
export class RoutingSystem {
  #entities: Map<string, RoutingEntity>;
  #routes: Map<string, Route[]>;
  #routeCache: Map<string, CachedRoute>;
  #config: RoutingConfig;
  #logger?: IMastraLogger;

  constructor(config?: Partial<RoutingConfig>, logger?: IMastraLogger) {
    this.#entities = new Map();
    this.#routes = new Map();
    this.#routeCache = new Map();
    this.#logger = logger;

    this.#config = {
      maxHops: 5,
      enableCaching: true,
      cacheTimeout: 300000, // 5 minutes
      routingAlgorithm: 'hybrid',
      weights: {
        distance: 0.3,
        capability: 0.4,
        trust: 0.2,
        load: 0.1,
      },
      ...config,
    };

    // Set up periodic cache cleanup
    if (this.#config.enableCaching) {
      setInterval(() => {
        this.#cleanupCache();
      }, 60000); // Check every minute
    }
  }

  /**
   * Register an entity in the routing system
   */
  public registerEntity(entity: RoutingEntity): void {
    this.#entities.set(entity.id, entity);
    this.#invalidateRoutesForEntity(entity.id);
    
    this.#logger?.debug('Entity registered in routing system', {
      entityId: entity.id,
      entityType: entity.type,
      capabilities: entity.capabilities,
    });
  }

  /**
   * Update an entity's information
   */
  public updateEntity(entityId: string, updates: Partial<RoutingEntity>): boolean {
    const entity = this.#entities.get(entityId);
    if (!entity) {
      return false;
    }

    const updatedEntity = { ...entity, ...updates };
    this.#entities.set(entityId, updatedEntity);
    this.#invalidateRoutesForEntity(entityId);

    this.#logger?.debug('Entity updated in routing system', {
      entityId,
      updates,
    });

    return true;
  }

  /**
   * Remove an entity from the routing system
   */
  public unregisterEntity(entityId: string): boolean {
    const removed = this.#entities.delete(entityId);
    if (removed) {
      this.#invalidateRoutesForEntity(entityId);
      this.#logger?.debug('Entity unregistered from routing system', { entityId });
    }
    return removed;
  }

  /**
   * Add a connection between two entities
   */
  public addConnection(fromEntityId: string, toEntityId: string, metadata?: Record<string, any>): boolean {
    const fromEntity = this.#entities.get(fromEntityId);
    const toEntity = this.#entities.get(toEntityId);

    if (!fromEntity || !toEntity) {
      return false;
    }

    // Add bidirectional connection
    if (!fromEntity.connections.includes(toEntityId)) {
      fromEntity.connections.push(toEntityId);
    }
    if (!toEntity.connections.includes(fromEntityId)) {
      toEntity.connections.push(fromEntityId);
    }

    // Create route entries
    const route: Route = {
      fromEntity: fromEntityId,
      toEntity: toEntityId,
      entityType: toEntity.type,
      distance: 1,
      capabilities: toEntity.capabilities,
      trustLevel: toEntity.trustLevel,
      metadata,
    };

    const reverseRoute: Route = {
      fromEntity: toEntityId,
      toEntity: fromEntityId,
      entityType: fromEntity.type,
      distance: 1,
      capabilities: fromEntity.capabilities,
      trustLevel: fromEntity.trustLevel,
      metadata,
    };

    const fromRoutes = this.#routes.get(fromEntityId) || [];
    const toRoutes = this.#routes.get(toEntityId) || [];

    fromRoutes.push(route);
    toRoutes.push(reverseRoute);

    this.#routes.set(fromEntityId, fromRoutes);
    this.#routes.set(toEntityId, toRoutes);

    // Invalidate caches
    this.#invalidateRoutesForEntity(fromEntityId);
    this.#invalidateRoutesForEntity(toEntityId);

    this.#logger?.debug('Connection added between entities', {
      fromEntityId,
      toEntityId,
    });

    return true;
  }

  /**
   * Find the optimal route for a coordination request
   */
  public findOptimalRoute(
    fromEntityId: string,
    request: CoordinationContext
  ): Route[] | undefined {
    const cacheKey = this.#generateCacheKey(fromEntityId, request);

    // Check cache first
    if (this.#config.enableCaching) {
      const cached = this.#routeCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.#config.cacheTimeout) {
        cached.usageCount++;
        return cached.route;
      }
    }

    // Find suitable target entities
    const targetEntities = this.#findSuitableTargets(request);
    if (targetEntities.length === 0) {
      return undefined;
    }

    let bestRoute: Route[] | undefined;
    let bestScore = -1;

    // Find the best route to any suitable target
    for (const targetEntity of targetEntities) {
      const route = this.#findRoute(fromEntityId, targetEntity.id);
      if (route) {
        const score = this.#scoreRoute(route, request);
        if (score > bestScore) {
          bestScore = score;
          bestRoute = route;
        }
      }
    }

    // Cache the result
    if (bestRoute && this.#config.enableCaching) {
      this.#routeCache.set(cacheKey, {
        route: bestRoute,
        timestamp: Date.now(),
        usageCount: 1,
      });
    }

    return bestRoute;
  }

  /**
   * Route a coordination request through the network
   */
  public async routeRequest(
    fromEntityId: string,
    request: CoordinationContext,
    entityResolver: (entityId: string) => Organization | Project | Person | undefined
  ): Promise<CoordinationResult> {
    const route = this.findOptimalRoute(fromEntityId, request);

    if (!route || route.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_ROUTE_FOUND',
          message: 'No suitable route found for the request',
        },
      };
    }

    // Route through the network
    let currentRequest = request;
    const routingPath: string[] = [fromEntityId];

    for (const hop of route) {
      const targetEntity = entityResolver(hop.toEntity);
      if (!targetEntity) {
        return {
          success: false,
          error: {
            code: 'TARGET_ENTITY_NOT_FOUND',
            message: `Entity ${hop.toEntity} not found during routing`,
          },
        };
      }

      try {
        const result = await targetEntity.handleCoordinationRequest(currentRequest);
        
        // Update load information
        this.#updateEntityLoad(hop.toEntity, 1);

        // If this is the final hop or the request was handled successfully
        if (result.success || hop === route[route.length - 1]) {
          routingPath.push(hop.toEntity);
          
          return {
            ...result,
            metadata: {
              executionTime: result.metadata?.executionTime || Date.now(),
              resourcesUsed: [...(result.metadata?.resourcesUsed || []), 'routing-system'],
              delegationChain: result.metadata?.delegationChain,
            },
          };
        }

        routingPath.push(hop.toEntity);
      } catch (error) {
        this.#logger?.error('Error during request routing', {
          fromEntity: fromEntityId,
          targetEntity: hop.toEntity,
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          success: false,
          error: {
            code: 'ROUTING_ERROR',
            message: `Error occurred while routing to ${hop.toEntity}`,
            details: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    return {
      success: false,
      error: {
        code: 'ROUTING_INCOMPLETE',
        message: 'Request routing completed but no result was obtained',
      },
    };
  }

  /**
   * Get routing statistics
   */
  public getStatistics(): {
    entityCount: number;
    routeCount: number;
    cacheStats: {
      size: number;
      hitRate: number;
      totalUsage: number;
    };
    topRoutes: Array<{
      route: string[];
      usageCount: number;
    }>;
  } {
    let totalRoutes = 0;
    for (const routes of this.#routes.values()) {
      totalRoutes += routes.length;
    }

    const cacheEntries = Array.from(this.#routeCache.values());
    const totalUsage = cacheEntries.reduce((sum, entry) => sum + entry.usageCount, 0);
    
    const topRoutes = cacheEntries
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map(entry => ({
        route: entry.route.map(r => `${r.fromEntity} -> ${r.toEntity}`),
        usageCount: entry.usageCount,
      }));

    return {
      entityCount: this.#entities.size,
      routeCount: totalRoutes,
      cacheStats: {
        size: this.#routeCache.size,
        hitRate: totalUsage > 0 ? (totalUsage / (totalUsage + 1)) : 0, // Simplified hit rate
        totalUsage,
      },
      topRoutes,
    };
  }

  /**
   * Find suitable target entities for a request
   */
  #findSuitableTargets(request: CoordinationContext): RoutingEntity[] {
    const suitableEntities: RoutingEntity[] = [];

    for (const entity of this.#entities.values()) {
      if (this.#isEntitySuitable(entity, request)) {
        suitableEntities.push(entity);
      }
    }

    return suitableEntities;
  }

  /**
   * Check if an entity is suitable for handling a request
   */
  #isEntitySuitable(entity: RoutingEntity, request: CoordinationContext): boolean {
    // For delegation requests, check capabilities
    if (request.requestType === 'delegation') {
      const delegationRequest = request as DelegationRequest;
      const requiredCapabilities = delegationRequest.payload.requiredCapabilities || [];
      
      if (requiredCapabilities.length > 0) {
        return requiredCapabilities.every(capability => 
          entity.capabilities.includes(capability)
        );
      }
    }

    // For collaboration requests, any entity can potentially participate
    if (request.requestType === 'collaboration') {
      return true;
    }

    // For information and escalation requests, any entity can handle them
    return true;
  }

  /**
   * Find a route between two entities using the configured algorithm
   */
  #findRoute(fromEntityId: string, toEntityId: string): Route[] | undefined {
    if (fromEntityId === toEntityId) {
      return [];
    }

    // Use Dijkstra's algorithm for shortest path with weights
    const distances = new Map<string, number>();
    const previous = new Map<string, string>();
    const visited = new Set<string>();
    const queue = new Set<string>();

    // Initialize distances
    for (const entityId of this.#entities.keys()) {
      distances.set(entityId, Infinity);
      queue.add(entityId);
    }
    distances.set(fromEntityId, 0);

    while (queue.size > 0) {
      // Find unvisited entity with minimum distance
      let current: string | undefined;
      let minDistance = Infinity;
      
      for (const entityId of queue) {
        const distance = distances.get(entityId)!;
        if (distance < minDistance) {
          minDistance = distance;
          current = entityId;
        }
      }

      if (!current || minDistance === Infinity) {
        break;
      }

      queue.delete(current);
      visited.add(current);

      // If we reached the target, we can stop
      if (current === toEntityId) {
        break;
      }

      // Check all neighbors
      const currentEntity = this.#entities.get(current);
      if (!currentEntity) continue;

      for (const neighborId of currentEntity.connections) {
        if (visited.has(neighborId)) continue;

        const neighbor = this.#entities.get(neighborId);
        if (!neighbor) continue;

        const edgeWeight = this.#calculateEdgeWeight(currentEntity, neighbor);
        const altDistance = distances.get(current)! + edgeWeight;

        if (altDistance < distances.get(neighborId)!) {
          distances.set(neighborId, altDistance);
          previous.set(neighborId, current);
        }
      }
    }

    // Reconstruct path
    if (!previous.has(toEntityId)) {
      return undefined; // No path found
    }

    const path: string[] = [];
    let current = toEntityId;
    while (current !== fromEntityId) {
      path.unshift(current);
      current = previous.get(current)!;
    }

    // Convert path to Route objects
    const route: Route[] = [];
    let prev = fromEntityId;

    for (const entityId of path) {
      const entity = this.#entities.get(entityId)!;
      route.push({
        fromEntity: prev,
        toEntity: entityId,
        entityType: entity.type,
        distance: 1,
        capabilities: entity.capabilities,
        trustLevel: entity.trustLevel,
      });
      prev = entityId;
    }

    return route.length <= this.#config.maxHops ? route : undefined;
  }

  /**
   * Calculate the weight of an edge between two entities
   */
  #calculateEdgeWeight(fromEntity: RoutingEntity, toEntity: RoutingEntity): number {
    const weights = this.#config.weights!;
    
    // Base distance
    let weight = weights.distance * 1;
    
    // Capability factor (lower weight for more capabilities)
    const capabilityFactor = toEntity.capabilities.length > 0 ? 1 / toEntity.capabilities.length : 1;
    weight += weights.capability * capabilityFactor;
    
    // Trust factor (lower weight for higher trust)
    const trustFactor = toEntity.trustLevel > 0 ? 1 / toEntity.trustLevel : 1;
    weight += weights.trust * trustFactor;
    
    // Load factor (higher weight for higher load)
    weight += weights.load * toEntity.currentLoad;
    
    return weight;
  }

  /**
   * Score a route for a specific request
   */
  #scoreRoute(route: Route[], request: CoordinationContext): number {
    if (route.length === 0) return 0;

    let score = 0;
    const weights = this.#config.weights!;

    // Distance score (shorter is better)
    score += weights.distance * (1 / route.length);

    // Capability score for delegation requests
    if (request.requestType === 'delegation') {
      const delegationRequest = request as DelegationRequest;
      const requiredCapabilities = delegationRequest.payload.requiredCapabilities || [];
      
      if (requiredCapabilities.length > 0) {
        const lastHop = route[route.length - 1];
        if (lastHop) {
          const matchingCapabilities = requiredCapabilities.filter(cap => 
            lastHop.capabilities.includes(cap)
          );
          score += weights.capability * (matchingCapabilities.length / requiredCapabilities.length);
        }
      }
    }

    // Trust score (average trust along the route)
    const avgTrust = route.reduce((sum, hop) => sum + hop.trustLevel, 0) / route.length;
    score += weights.trust * avgTrust;

    return score;
  }

  /**
   * Update an entity's current load
   */
  #updateEntityLoad(entityId: string, loadChange: number): void {
    const entity = this.#entities.get(entityId);
    if (entity) {
      entity.currentLoad = Math.max(0, entity.currentLoad + loadChange);
    }
  }

  /**
   * Generate a cache key for a request
   */
  #generateCacheKey(fromEntityId: string, request: CoordinationContext): string {
    const requestKey = `${request.requestType}:${request.priority}`;
    
    if (request.requestType === 'delegation') {
      const delegationRequest = request as DelegationRequest;
      const capabilities = (delegationRequest.payload.requiredCapabilities || []).sort().join(',');
      return `${fromEntityId}:${requestKey}:${capabilities}`;
    }
    
    return `${fromEntityId}:${requestKey}`;
  }

  /**
   * Invalidate cached routes for a specific entity
   */
  #invalidateRoutesForEntity(entityId: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key] of this.#routeCache) {
      if (key.includes(entityId)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.#routeCache.delete(key);
    }
  }

  /**
   * Clean up expired cache entries
   */
  #cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, cached] of this.#routeCache) {
      if (now - cached.timestamp > this.#config.cacheTimeout) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.#routeCache.delete(key);
    }
    
    if (keysToDelete.length > 0) {
      this.#logger?.debug('Cleaned up expired routing cache entries', {
        cleanedUp: keysToDelete.length,
        remaining: this.#routeCache.size,
      });
    }
  }
}