import { randomUUID } from 'crypto';
import type { ToolsetsInput } from '../agent/types';
import { MastraBase } from '../base';
import type { Mastra } from '../mastra';
import type { MastraMemory } from '../memory/memory';
import type { MastraStorage } from '../storage';
import { InstrumentClass } from '../telemetry';
import type { MastraVector } from '../vector';
import type { Workflow } from '../workflows';
import { Project } from './project';
import type {
  OrganizationConfig,
  ProjectConfig,
  Role,
  FederationConfig,
  CoordinationContext,
  CoordinationResult,
  DelegationRequest,
  CollaborationRequest,
  OrganizationalPrimitives,
} from './types';

/**
 * Represents an organization that contains projects/teams and manages coordination.
 * An Organization provides the top-level structure for federated agency.
 */
@InstrumentClass({
  prefix: 'organization',
  excludeMethods: ['__registerMastra', '__registerPrimitives', '__setLogger', '__setTelemetry'],
})
export class Organization extends MastraBase {
  #projects: Map<string, Project>;
  #roles: Map<string, Role>;
  #policies: {
    collaboration?: Record<string, any>;
    delegation?: Record<string, any>;
    security?: Record<string, any>;
  };
  #sharedResources: {
    tools?: ToolsetsInput;
    workflows?: Record<string, Workflow>;
    memory?: MastraMemory;
    storage?: MastraStorage;
    vectors?: Record<string, MastraVector>;
  };
  #federationConfig: FederationConfig;
  #metadata: Record<string, any>;
  #mastra?: Mastra;

  public readonly id: string;
  public readonly name: string;
  public readonly description?: string;

  constructor(config: OrganizationConfig) {
    super({ name: config.name });
    
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.#projects = new Map();
    this.#roles = new Map();
    this.#policies = config.policies || {};
    this.#sharedResources = {
      tools: typeof config.sharedResources?.tools === 'function' ? undefined : config.sharedResources?.tools,
      workflows: typeof config.sharedResources?.workflows === 'function' ? undefined : config.sharedResources?.workflows,
      memory: typeof config.sharedResources?.memory === 'function' ? undefined : config.sharedResources?.memory,
      storage: config.sharedResources?.storage,
      vectors: config.sharedResources?.vectors,
    };
    this.#metadata = config.metadata || {};

    // Set up federation configuration with defaults
    this.#federationConfig = {
      canDelegate: true,
      canReceiveDelegation: true,
      maxDelegationDepth: 10,
      trustedDelegates: [],
      supportedProtocols: ['direct', 'broadcast', 'hierarchical'],
      ...config.federationConfig,
    };

    // Initialize roles if provided
    if (config.roles) {
      Object.entries(config.roles).forEach(([roleId, role]) => {
        this.#roles.set(roleId, role);
      });
    }

    // Initialize projects if provided
    if (config.projects) {
      Object.entries(config.projects).forEach(([projectId, projectConfig]) => {
        this.addProject(projectId, projectConfig);
      });
    }
  }

  /**
   * Register the Mastra instance with this organization
   */
  __registerMastra(mastra: Mastra): void {
    this.#mastra = mastra;
    
    // Register Mastra with all projects
    for (const project of this.#projects.values()) {
      project.__registerMastra(mastra);
    }
  }

  /**
   * Register primitives with this organization
   */
  __registerPrimitives(primitives: OrganizationalPrimitives): void {
    // Merge shared resources with primitives
    const enhancedPrimitives = {
      ...primitives,
      storage: this.#sharedResources.storage || primitives.storage,
      memory: this.#sharedResources.memory || primitives.memory,
      vectors: { ...primitives.vectors, ...this.#sharedResources.vectors },
    };

    // Register primitives with all projects
    for (const project of this.#projects.values()) {
      project.__registerPrimitives(enhancedPrimitives);
    }
  }

  /**
   * Add a role to the organization
   */
  public addRole(roleId: string, role: Role): void {
    this.#roles.set(roleId, role);
  }

  /**
   * Get a role by ID
   */
  public getRole(roleId: string): Role | undefined {
    return this.#roles.get(roleId);
  }

  /**
   * Get all roles
   */
  public getRoles(): Map<string, Role> {
    return new Map(this.#roles);
  }

  /**
   * Remove a role
   */
  public removeRole(roleId: string): boolean {
    return this.#roles.delete(roleId);
  }

  /**
   * Add a project to the organization
   */
  public addProject(projectId: string, projectConfig: ProjectConfig): void {
    // Ensure the project is associated with this organization
    const updatedConfig = {
      ...projectConfig,
      organizationId: this.id,
    };

    const project = new Project(updatedConfig);
    
    // Register primitives if available
    if (this.#mastra) {
      project.__registerMastra(this.#mastra);
      
      // Create enhanced primitives with shared resources
      const enhancedPrimitives: OrganizationalPrimitives = {
        logger: this.logger,
        telemetry: this.telemetry,
        storage: this.#sharedResources.storage,
        memory: this.#sharedResources.memory,
        vectors: this.#sharedResources.vectors,
        mastra: this.#mastra,
      };
      
      project.__registerPrimitives(enhancedPrimitives);
    }

    this.#projects.set(projectId, project);

    // Emit project created event
    if (this.#mastra?.pubsub) {
      void this.#mastra.pubsub.publish('organization:project-created', {
        type: 'organization:project-created',
        data: {
          organizationId: this.id,
          projectId,
        },
        runId: randomUUID(),
      });
    }
  }

  /**
   * Remove a project from the organization
   */
  public removeProject(projectId: string): boolean {
    const removed = this.#projects.delete(projectId);
    
    if (removed && this.#mastra?.pubsub) {
      void this.#mastra.pubsub.publish('organization:project-deleted', {
        type: 'organization:project-deleted',
        data: {
          organizationId: this.id,
          projectId,
        },
        runId: randomUUID(),
      });
    }

    return removed;
  }

  /**
   * Get a project by ID
   */
  public getProject(projectId: string): Project | undefined {
    return this.#projects.get(projectId);
  }

  /**
   * Get all projects
   */
  public getProjects(): Map<string, Project> {
    return new Map(this.#projects);
  }

  /**
   * Get projects with specific status
   */
  public getProjectsByStatus(status: 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled'): Project[] {
    return Array.from(this.#projects.values()).filter(project => 
      project.getStatus() === status
    );
  }

  /**
   * Get organization policies
   */
  public getPolicies(): {
    collaboration?: Record<string, any>;
    delegation?: Record<string, any>;
    security?: Record<string, any>;
  } {
    return { ...this.#policies };
  }

  /**
   * Update organization policies
   */
  public updatePolicies(policies: Partial<{
    collaboration?: Record<string, any>;
    delegation?: Record<string, any>;
    security?: Record<string, any>;
  }>): void {
    this.#policies = { ...this.#policies, ...policies };
  }

  /**
   * Get shared resources
   */
  public getSharedResources(): {
    tools?: ToolsetsInput;
    workflows?: Record<string, Workflow>;
    memory?: MastraMemory;
    storage?: MastraStorage;
    vectors?: Record<string, MastraVector>;
  } {
    return { ...this.#sharedResources };
  }

  /**
   * Update shared resources
   */
  public updateSharedResources(resources: Partial<{
    tools?: ToolsetsInput;
    workflows?: Record<string, Workflow>;
    memory?: MastraMemory;
    storage?: MastraStorage;
    vectors?: Record<string, MastraVector>;
  }>): void {
    this.#sharedResources = { ...this.#sharedResources, ...resources };
    
    // Re-register primitives with all projects to include new shared resources
    if (this.#mastra) {
      const enhancedPrimitives: OrganizationalPrimitives = {
        logger: this.logger,
        telemetry: this.telemetry,
        storage: this.#sharedResources.storage,
        memory: this.#sharedResources.memory,
        vectors: this.#sharedResources.vectors,
        mastra: this.#mastra,
      };
      
      for (const project of this.#projects.values()) {
        project.__registerPrimitives(enhancedPrimitives);
      }
    }
  }

  /**
   * Get the federation configuration
   */
  public getFederationConfig(): FederationConfig {
    return { ...this.#federationConfig };
  }

  /**
   * Update the federation configuration
   */
  public updateFederationConfig(config: Partial<FederationConfig>): void {
    this.#federationConfig = { ...this.#federationConfig, ...config };
  }

  /**
   * Coordinate organization-wide task delegation
   */
  public async coordinateTask(
    task: string,
    options?: {
      preferredProject?: string;
      requiredCapabilities?: string[];
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      deadline?: Date;
      context?: Record<string, any>;
    }
  ): Promise<CoordinationResult> {
    if (!this.#federationConfig.canDelegate) {
      return {
        success: false,
        error: {
          code: 'DELEGATION_NOT_ALLOWED',
          message: 'This organization is not allowed to delegate tasks',
        },
      };
    }

    let targetProject: Project | undefined;

    // Try preferred project first
    if (options?.preferredProject) {
      targetProject = this.getProject(options.preferredProject);
      if (!targetProject) {
        return {
          success: false,
          error: {
            code: 'PREFERRED_PROJECT_NOT_FOUND',
            message: `Preferred project ${options.preferredProject} not found`,
          },
        };
      }
    } else {
      // Find a suitable project based on capabilities and status
      const activeProjects = this.getProjectsByStatus('active');
      
      if (options?.requiredCapabilities) {
        // Find projects with members who have the required capabilities
        for (const project of activeProjects) {
          const suitableMembers = project.getMembersWithSkills(options.requiredCapabilities);
          if (suitableMembers.length > 0) {
            targetProject = project;
            break;
          }
        }
      } else if (activeProjects.length > 0) {
        // No specific requirements, pick the first active project
        targetProject = activeProjects[0];
      }
    }

    if (!targetProject) {
      return {
        success: false,
        error: {
          code: 'NO_SUITABLE_PROJECT_FOUND',
          message: 'No suitable project found for task delegation',
        },
      };
    }

    // Delegate to the selected project
    return targetProject.delegateTask(task, {
      requiredCapabilities: options?.requiredCapabilities,
      deadline: options?.deadline,
      context: options?.context,
    });
  }

  /**
   * Coordinate cross-project collaboration
   */
  public async coordinateCrossProjectCollaboration(
    topic: string,
    type: 'brainstorm' | 'review' | 'decision' | 'execution',
    projectIds: string[],
    sessionConfig?: Record<string, any>
  ): Promise<CoordinationResult> {
    const validProjects = projectIds
      .map(id => this.getProject(id))
      .filter((project): project is Project => project !== undefined);

    if (validProjects.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_VALID_PROJECTS',
          message: 'No valid projects found for collaboration',
        },
      };
    }

    const collaborationRequest: CollaborationRequest = {
      initiatorId: this.id,
      requestType: 'collaboration',
      priority: 'medium',
      payload: {
        type,
        topic,
        participants: validProjects.map(p => p.id),
        sessionConfig,
      },
    };

    // Emit collaboration request event
    if (this.#mastra?.pubsub) {
      await this.#mastra.pubsub.publish('federation:collaboration-request', {
        type: 'federation:collaboration-request',
        data: collaborationRequest,
        runId: randomUUID(),
      });
    }

    // Notify all participating projects
    const notificationPromises = validProjects.map(async (project) => {
      return project.handleCoordinationRequest(collaborationRequest);
    });

    const results = await Promise.allSettled(notificationPromises);
    const successfulNotifications = results.filter(result => 
      result.status === 'fulfilled' && result.value?.success
    ).length;

    return {
      success: true,
      data: {
        sessionId: randomUUID(),
        topic,
        type,
        participatingProjects: validProjects.map(p => p.id),
        notifiedProjects: successfulNotifications,
      },
      metadata: {
        executionTime: Date.now(),
        resourcesUsed: ['collaboration-system'],
      },
    };
  }

  /**
   * Handle incoming coordination requests
   */
  public async handleCoordinationRequest(context: CoordinationContext): Promise<CoordinationResult> {
    switch (context.requestType) {
      case 'delegation':
        return this.#handleDelegationRequest(context as DelegationRequest);
      case 'collaboration':
        return this.#handleCollaborationRequest(context as CollaborationRequest);
      case 'information':
        return this.#handleInformationRequest(context);
      case 'escalation':
        return this.#handleEscalationRequest(context);
      default:
        return {
          success: false,
          error: {
            code: 'UNSUPPORTED_REQUEST_TYPE',
            message: `Request type ${context.requestType} is not supported`,
          },
        };
    }
  }

  /**
   * Get comprehensive organization status
   */
  public getOrganizationStatus(): {
    id: string;
    name: string;
    projectCount: number;
    projects: Array<{
      id: string;
      name: string;
      status: string;
      memberCount: number;
    }>;
    roles: Role[];
    federationConfig: FederationConfig;
    policies: {
      collaboration?: Record<string, any>;
      delegation?: Record<string, any>;
      security?: Record<string, any>;
    };
  } {
    return {
      id: this.id,
      name: this.name,
      projectCount: this.#projects.size,
      projects: Array.from(this.#projects.values()).map(project => {
        const status = project.getProjectStatus();
        return {
          id: status.id,
          name: status.name,
          status: status.status,
          memberCount: status.memberCount,
        };
      }),
      roles: Array.from(this.#roles.values()),
      federationConfig: this.#federationConfig,
      policies: this.#policies,
    };
  }

  /**
   * Find entities (projects or members) with specific capabilities
   */
  public findEntitiesWithCapabilities(requiredCapabilities: string[]): {
    projects: Project[];
    members: Array<{ projectId: string; memberId: string; memberName: string }>;
  } {
    const projects: Project[] = [];
    const members: Array<{ projectId: string; memberId: string; memberName: string }> = [];

    for (const project of this.#projects.values()) {
      const suitableMembers = project.getMembersWithSkills(requiredCapabilities);
      
      if (suitableMembers.length > 0) {
        projects.push(project);
        
        for (const member of suitableMembers) {
          const memberEntries = Array.from(project.getMembers().entries());
          const memberEntry = memberEntries.find(([_, m]) => m === member);
          if (memberEntry) {
            members.push({
              projectId: project.id,
              memberId: memberEntry[0],
              memberName: member.name,
            });
          }
        }
      }
    }

    return { projects, members };
  }

  /**
   * Handle delegation requests to the organization
   */
  async #handleDelegationRequest(request: DelegationRequest): Promise<CoordinationResult> {
    if (!this.#federationConfig.canReceiveDelegation) {
      return {
        success: false,
        error: {
          code: 'DELEGATION_NOT_ACCEPTED',
          message: 'This organization cannot receive delegated tasks',
        },
      };
    }

    // Coordinate the task within the organization
    return this.coordinateTask(request.payload.task, {
      requiredCapabilities: request.payload.requiredCapabilities,
      deadline: request.payload.deadline,
      priority: request.priority,
      context: request.payload.context,
    });
  }

  /**
   * Handle collaboration requests to the organization
   */
  async #handleCollaborationRequest(request: CollaborationRequest): Promise<CoordinationResult> {
    // Involve all active projects in the collaboration
    const activeProjects = this.getProjectsByStatus('active');
    
    if (activeProjects.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_ACTIVE_PROJECTS',
          message: 'No active projects available for collaboration',
        },
      };
    }

    return this.coordinateCrossProjectCollaboration(
      request.payload.topic,
      request.payload.type,
      activeProjects.map(p => p.id),
      request.payload.sessionConfig
    );
  }

  /**
   * Handle information requests
   */
  async #handleInformationRequest(_context: CoordinationContext): Promise<CoordinationResult> {
    return {
      success: true,
      data: this.getOrganizationStatus(),
      metadata: {
        executionTime: Date.now(),
        resourcesUsed: [],
      },
    };
  }

  /**
   * Handle escalation requests
   */
  async #handleEscalationRequest(context: CoordinationContext): Promise<CoordinationResult> {
    // Log the escalation at organization level
    this.logger?.warn('Organization-level escalation received', {
      from: context.initiatorId,
      priority: context.priority,
      payload: context.payload,
    });

    return {
      success: true,
      data: {
        message: 'Escalation acknowledged at organization level',
        escalationId: randomUUID(),
        organizationId: this.id,
      },
      metadata: {
        executionTime: Date.now(),
        resourcesUsed: ['escalation-system'],
      },
    };
  }
}