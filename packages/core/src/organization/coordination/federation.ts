import { randomUUID } from 'crypto';
import type { PubSub } from '../../events/pubsub';
import type { Event } from '../../events/types';
import type { IMastraLogger } from '../../logger';
import type { Organization } from '../organization';
import type { Person } from '../person';
import type { Project } from '../project';
import type {
  CoordinationContext,
  CoordinationResult,
  DelegationRequest,
  CollaborationRequest,
  OrganizationalEvents,
} from '../types';

/**
 * Convert coordination events to Mastra Event format
 */
function toMastraEvent(type: string, data: any, runId?: string): Event {
  return {
    id: randomUUID(),
    type,
    data,
    runId: runId || randomUUID(),
    createdAt: new Date(),
  };
}

/**
 * Registry for organizational entities that can participate in federation
 */
export interface EntityRegistry {
  organizations: Map<string, Organization>;
  projects: Map<string, Project>;
  persons: Map<string, Person>;
}

/**
 * Configuration for the federation coordinator
 */
export interface FederationCoordinatorConfig {
  /** Maximum depth allowed for delegation chains */
  maxDelegationDepth: number;
  /** Timeout for coordination requests in milliseconds */
  requestTimeout: number;
  /** Whether to enable automatic retry on failures */
  enableRetry: boolean;
  /** Maximum number of retries */
  maxRetries: number;
  /** Delay between retries in milliseconds */
  retryDelay: number;
}

/**
 * Manages federated coordination between organizational entities
 */
export class FederationCoordinator {
  #registry: EntityRegistry;
  #pubsub: PubSub;
  #logger?: IMastraLogger;
  #config: FederationCoordinatorConfig;
  #activeRequests: Map<string, {
    request: CoordinationContext;
    timestamp: number;
    retryCount: number;
  }>;

  constructor(
    pubsub: PubSub,
    config?: Partial<FederationCoordinatorConfig>,
    logger?: IMastraLogger
  ) {
    this.#pubsub = pubsub;
    this.#logger = logger;
    this.#registry = {
      organizations: new Map(),
      projects: new Map(),
      persons: new Map(),
    };
    this.#activeRequests = new Map();

    this.#config = {
      maxDelegationDepth: 10,
      requestTimeout: 30000, // 30 seconds
      enableRetry: true,
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      ...config,
    };

    this.#setupEventListeners();
  }

  /**
   * Register an organization with the federation
   */
  public registerOrganization(organization: Organization): void {
    this.#registry.organizations.set(organization.id, organization);
    this.#logger?.info('Organization registered with federation', {
      organizationId: organization.id,
      organizationName: organization.name,
    });
  }

  /**
   * Register a project with the federation
   */
  public registerProject(project: Project): void {
    this.#registry.projects.set(project.id, project);
    this.#logger?.info('Project registered with federation', {
      projectId: project.id,
      projectName: project.name,
    });
  }

  /**
   * Register a person with the federation
   */
  public registerPerson(person: Person): void {
    this.#registry.persons.set(person.id, person);
    this.#logger?.info('Person registered with federation', {
      personId: person.id,
      personName: person.name,
    });
  }

  /**
   * Unregister an entity from the federation
   */
  public unregisterEntity(entityId: string): boolean {
    const removed = 
      this.#registry.organizations.delete(entityId) ||
      this.#registry.projects.delete(entityId) ||
      this.#registry.persons.delete(entityId);

    if (removed) {
      this.#logger?.info('Entity unregistered from federation', { entityId });
    }

    return removed;
  }

  /**
   * Route a coordination request to the appropriate entity
   */
  public async routeRequest(
    targetEntityId: string,
    request: CoordinationContext
  ): Promise<CoordinationResult> {
    const requestId = randomUUID();
    
    // Track the request
    this.#activeRequests.set(requestId, {
      request,
      timestamp: Date.now(),
      retryCount: 0,
    });

    try {
      // Find the target entity
      const targetEntity = this.#findEntity(targetEntityId);
      
      if (!targetEntity) {
        return {
          success: false,
          error: {
            code: 'TARGET_ENTITY_NOT_FOUND',
            message: `Target entity ${targetEntityId} not found in federation`,
          },
        };
      }

      // Validate delegation depth if it's a delegation request
      if (request.requestType === 'delegation') {
        const delegationRequest = request as DelegationRequest;
        const currentDepth = this.#calculateDelegationDepth(delegationRequest);
        
        if (currentDepth > this.#config.maxDelegationDepth) {
          return {
            success: false,
            error: {
              code: 'MAX_DELEGATION_DEPTH_EXCEEDED',
              message: `Delegation depth ${currentDepth} exceeds maximum allowed depth ${this.#config.maxDelegationDepth}`,
            },
          };
        }
      }

      // Route to the appropriate entity
      const result = await this.#executeWithTimeout(
        () => targetEntity.handleCoordinationRequest(request),
        this.#config.requestTimeout
      );

      // Clean up tracking
      this.#activeRequests.delete(requestId);

      return result;
    } catch (error) {
      this.#logger?.error('Error routing coordination request', {
        requestId,
        targetEntityId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Handle retry if enabled
      if (this.#config.enableRetry) {
        const tracking = this.#activeRequests.get(requestId);
        if (tracking && tracking.retryCount < this.#config.maxRetries) {
          tracking.retryCount++;
          this.#activeRequests.set(requestId, tracking);
          
          // Schedule retry
          setTimeout(() => {
            this.routeRequest(targetEntityId, request);
          }, this.#config.retryDelay);
          
          return {
            success: false,
            error: {
              code: 'REQUEST_RETRYING',
              message: `Request failed, retrying (attempt ${tracking.retryCount}/${this.#config.maxRetries})`,
            },
          };
        }
      }

      this.#activeRequests.delete(requestId);

      return {
        success: false,
        error: {
          code: 'REQUEST_EXECUTION_FAILED',
          message: 'Failed to execute coordination request',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Find entities that match specific criteria
   */
  public findEntitiesByCriteria(criteria: {
    type?: 'organization' | 'project' | 'person';
    capabilities?: string[];
    organizationId?: string;
    projectId?: string;
  }): Array<{ id: string; type: string; entity: Organization | Project | Person }> {
    const results: Array<{ id: string; type: string; entity: Organization | Project | Person }> = [];

    // Search organizations
    if (!criteria.type || criteria.type === 'organization') {
      for (const [id, org] of this.#registry.organizations) {
        if (criteria.organizationId && criteria.organizationId !== id) continue;
        
        if (criteria.capabilities) {
          const entitiesWithCapabilities = org.findEntitiesWithCapabilities(criteria.capabilities);
          if (entitiesWithCapabilities.members.length > 0 || entitiesWithCapabilities.projects.length > 0) {
            results.push({ id, type: 'organization', entity: org });
          }
        } else {
          results.push({ id, type: 'organization', entity: org });
        }
      }
    }

    // Search projects
    if (!criteria.type || criteria.type === 'project') {
      for (const [id, project] of this.#registry.projects) {
        if (criteria.organizationId && criteria.organizationId !== project.getOrganizationId()) continue;
        if (criteria.projectId && criteria.projectId !== id) continue;
        
        if (criteria.capabilities) {
          const suitableMembers = project.getMembersWithSkills(criteria.capabilities);
          if (suitableMembers.length > 0) {
            results.push({ id, type: 'project', entity: project });
          }
        } else {
          results.push({ id, type: 'project', entity: project });
        }
      }
    }

    // Search persons
    if (!criteria.type || criteria.type === 'person') {
      for (const [id, person] of this.#registry.persons) {
        const position = person.getPosition();
        
        if (criteria.organizationId && criteria.organizationId !== position.organizationId) continue;
        if (criteria.projectId && criteria.projectId !== position.projectId) continue;
        
        if (criteria.capabilities) {
          if (person.hasCapabilities(criteria.capabilities)) {
            results.push({ id, type: 'person', entity: person });
          }
        } else {
          results.push({ id, type: 'person', entity: person });
        }
      }
    }

    return results;
  }

  /**
   * Get federation statistics
   */
  public getStatistics(): {
    registeredEntities: {
      organizations: number;
      projects: number;
      persons: number;
    };
    activeRequests: number;
    configuration: FederationCoordinatorConfig;
  } {
    return {
      registeredEntities: {
        organizations: this.#registry.organizations.size,
        projects: this.#registry.projects.size,
        persons: this.#registry.persons.size,
      },
      activeRequests: this.#activeRequests.size,
      configuration: { ...this.#config },
    };
  }

  /**
   * Clean up expired requests
   */
  public cleanupExpiredRequests(): void {
    const now = Date.now();
    const expiredRequests: string[] = [];

    for (const [requestId, tracking] of this.#activeRequests) {
      if (now - tracking.timestamp > this.#config.requestTimeout) {
        expiredRequests.push(requestId);
      }
    }

    for (const requestId of expiredRequests) {
      this.#activeRequests.delete(requestId);
      this.#logger?.warn('Cleaned up expired coordination request', { requestId });
    }
  }

  /**
   * Set up event listeners for federation events
   */
  #setupEventListeners(): void {
    // Listen for delegation requests
    this.#pubsub.subscribe('federation:delegation-request', async (event: Event) => {
      if (event.type === 'federation:delegation-request') {
        await this.#handleDelegationRequest(event.data as DelegationRequest);
      }
    });

    // Listen for collaboration requests
    this.#pubsub.subscribe('federation:collaboration-request', async (event: Event) => {
      if (event.type === 'federation:collaboration-request') {
        await this.#handleCollaborationRequest(event.data as CollaborationRequest);
      }
    });
  }

  /**
   * Find an entity by ID across all registries
   */
  #findEntity(entityId: string): Organization | Project | Person | undefined {
    return (
      this.#registry.organizations.get(entityId) ||
      this.#registry.projects.get(entityId) ||
      this.#registry.persons.get(entityId)
    );
  }

  /**
   * Calculate the delegation depth of a request
   */
  #calculateDelegationDepth(request: DelegationRequest): number {
    // For now, assume depth is 1 per delegation
    // In a full implementation, this would track the actual delegation chain
    return 1;
  }

  /**
   * Execute a function with timeout
   */
  async #executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Handle delegation requests by finding suitable entities
   */
  async #handleDelegationRequest(request: DelegationRequest): Promise<void> {
    try {
      // Find entities that can handle the delegation
      const suitableEntities = this.findEntitiesByCriteria({
        capabilities: request.payload.requiredCapabilities,
      });

      if (suitableEntities.length === 0) {
        this.#logger?.warn('No suitable entities found for delegation', {
          requestId: request.traceId,
          requiredCapabilities: request.payload.requiredCapabilities,
        });
        return;
      }

      // For now, delegate to the first suitable entity
      // In a full implementation, this could use more sophisticated routing logic
      const targetEntity = suitableEntities[0];
      
      if (!targetEntity) {
        this.#logger?.warn('No target entity found for delegation', {
          requestId: request.traceId,
        });
        return;
      }
      
      const result = await this.routeRequest(targetEntity.id, request);
      
      // Publish the result
      await this.#pubsub.publish('federation:delegation-response', toMastraEvent(
        'federation:delegation-response',
        result,
        request.traceId
      ));
      
      this.#logger?.info('Delegation request routed successfully', {
        requestId: request.traceId,
        targetEntityId: targetEntity.id,
        success: result.success,
      });
    } catch (error) {
      this.#logger?.error('Error handling delegation request', {
        requestId: request.traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle collaboration requests by coordinating participants
   */
  async #handleCollaborationRequest(request: CollaborationRequest): Promise<void> {
    try {
      const participants = request.payload.participants;
      const results: CoordinationResult[] = [];

      // Route the collaboration request to all participants
      for (const participantId of participants) {
        try {
          const result = await this.routeRequest(participantId, request);
          results.push(result);
        } catch (error) {
          this.#logger?.warn('Failed to notify collaboration participant', {
            participantId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Publish aggregated result
      const aggregatedResult: CoordinationResult = {
        success: results.some(r => r.success),
        data: {
          sessionId: randomUUID(),
          participantResults: results,
          successfulParticipants: results.filter(r => r.success).length,
          totalParticipants: participants.length,
        },
        metadata: {
          executionTime: Date.now(),
          resourcesUsed: ['collaboration-system', 'federation-coordinator'],
        },
      };

      await this.#pubsub.publish('federation:collaboration-response', toMastraEvent(
        'federation:collaboration-response',
        aggregatedResult,
        request.traceId
      ));
      
      this.#logger?.info('Collaboration request coordinated successfully', {
        requestId: request.traceId,
        participantCount: participants.length,
        successfulParticipants: aggregatedResult.data?.successfulParticipants,
      });
    } catch (error) {
      this.#logger?.error('Error handling collaboration request', {
        requestId: request.traceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}