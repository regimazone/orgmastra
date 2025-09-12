import { randomUUID } from 'crypto';
import { MastraBase } from '../base';
import { MastraError, ErrorDomain, ErrorCategory } from '../error';
import { InstrumentClass } from '../telemetry';
import type { Workflow } from '../workflows';
import type { ToolsetsInput } from '../agent/types';
import type { MastraMemory } from '../memory/memory';
import type {
  ProjectConfig,
  PersonConfig,
  FederationConfig,
  CoordinationContext,
  CoordinationResult,
  DelegationRequest,
  CollaborationRequest,
  OrganizationalPrimitives,
  Role,
} from './types';
import { Person } from './person';
import type { Mastra } from '../mastra';

/**
 * Represents a project or team within an organizational structure.
 * A Project coordinates multiple persons/agents working toward common goals.
 */
@InstrumentClass({
  prefix: 'project',
  excludeMethods: ['__registerMastra', '__registerPrimitives', '__setLogger', '__setTelemetry'],
})
export class Project extends MastraBase {
  #organizationId: string;
  #goals: string[];
  #members: Map<string, Person>;
  #tools?: ToolsetsInput;
  #workflows?: Record<string, Workflow>;
  #memory?: MastraMemory;
  #status: 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled';
  #federationConfig: FederationConfig;
  #metadata: Record<string, any>;
  #mastra?: Mastra;

  public readonly id: string;
  public readonly name: string;
  public readonly description?: string;

  constructor(config: ProjectConfig) {
    super({ name: config.name });
    
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.#organizationId = config.organizationId;
    this.#goals = config.goals || [];
    this.#members = new Map();
    this.#status = config.status || 'planning';
    this.#metadata = config.metadata || {};

    // Set up federation configuration with defaults
    this.#federationConfig = {
      canDelegate: true,
      canReceiveDelegation: true,
      maxDelegationDepth: 5,
      trustedDelegates: [],
      supportedProtocols: ['direct', 'broadcast', 'hierarchical'],
      ...config.federationConfig,
    };

    // Initialize members if provided
    if (config.members) {
      Object.entries(config.members).forEach(([memberId, memberConfig]) => {
        this.addMember(memberId, memberConfig);
      });
    }

    // Store resources (they will be resolved during registration)
    if (typeof config.tools === 'function') {
      // Handle dynamic tools later during execution
    } else {
      this.#tools = config.tools;
    }

    if (typeof config.workflows === 'function') {
      // Handle dynamic workflows later during execution
    } else {
      this.#workflows = config.workflows;
    }

    if (typeof config.memory === 'function') {
      // Handle dynamic memory later during execution
    } else {
      this.#memory = config.memory;
    }
  }

  /**
   * Register the Mastra instance with this project
   */
  __registerMastra(mastra: Mastra): void {
    this.#mastra = mastra;
    
    // Register Mastra with all members
    for (const member of this.#members.values()) {
      member.__registerMastra(mastra);
    }
  }

  /**
   * Register primitives with this project
   */
  __registerPrimitives(primitives: OrganizationalPrimitives): void {
    // Register primitives with all members
    for (const member of this.#members.values()) {
      member.__registerPrimitives(primitives);
    }
  }

  /**
   * Get the organization ID this project belongs to
   */
  public getOrganizationId(): string {
    return this.#organizationId;
  }

  /**
   * Get project goals
   */
  public getGoals(): string[] {
    return [...this.#goals];
  }

  /**
   * Add a goal to the project
   */
  public addGoal(goal: string): void {
    if (!this.#goals.includes(goal)) {
      this.#goals.push(goal);
    }
  }

  /**
   * Remove a goal from the project
   */
  public removeGoal(goal: string): void {
    this.#goals = this.#goals.filter(g => g !== goal);
  }

  /**
   * Get project status
   */
  public getStatus(): 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled' {
    return this.#status;
  }

  /**
   * Update project status
   */
  public setStatus(status: 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled'): void {
    const oldStatus = this.#status;
    this.#status = status;

    // Emit status change event
    if (this.#mastra?.pubsub) {
      this.#mastra.pubsub.publish('project:status-changed', {
        
        type: 'project:status-changed',
        data: {
          projectId: this.id,
          oldStatus,
          newStatus: status,
        },
        runId: randomUUID(),
      });
    }
  }

  /**
   * Add a member to the project
   */
  public addMember(memberId: string, memberConfig: PersonConfig): void {
    // Update the member's position to include this project
    const updatedConfig = {
      ...memberConfig,
      position: {
        ...memberConfig.position,
        projectId: this.id,
      },
    };

    const member = new Person(updatedConfig);
    
    // Register primitives if available
    if (this.#mastra) {
      member.__registerMastra(this.#mastra);
    }

    this.#members.set(memberId, member);

    // Emit member added event
    if (this.#mastra?.pubsub) {
      this.#mastra.pubsub.publish('project:member-added', {
        
        type: 'project:member-added',
        data: {
          projectId: this.id,
          personId: memberId,
        },
        runId: randomUUID(),
      });
    }
  }

  /**
   * Remove a member from the project
   */
  public removeMember(memberId: string): boolean {
    const removed = this.#members.delete(memberId);
    
    if (removed && this.#mastra?.pubsub) {
      this.#mastra.pubsub.publish('project:member-removed', {
        
        type: 'project:member-removed',
        data: {
          projectId: this.id,
          personId: memberId,
        },
        runId: randomUUID(),
      });
    }

    return removed;
  }

  /**
   * Get a member by ID
   */
  public getMember(memberId: string): Person | undefined {
    return this.#members.get(memberId);
  }

  /**
   * Get all members
   */
  public getMembers(): Map<string, Person> {
    return new Map(this.#members);
  }

  /**
   * Get members with specific skills
   */
  public getMembersWithSkills(requiredSkills: string[]): Person[] {
    return Array.from(this.#members.values()).filter(member =>
      member.hasCapabilities(requiredSkills)
    );
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
   * Delegate a task within the project or to external entities
   */
  public async delegateTask(
    task: string,
    options?: {
      requiredCapabilities?: string[];
      preferredMember?: string;
      external?: boolean;
      deadline?: Date;
      context?: Record<string, any>;
    }
  ): Promise<CoordinationResult> {
    if (!this.#federationConfig.canDelegate) {
      return {
        success: false,
        error: {
          code: 'DELEGATION_NOT_ALLOWED',
          message: 'This project is not allowed to delegate tasks',
        },
      };
    }

    // Try to find a suitable member within the project first
    if (!options?.external) {
      let targetMember: Person | undefined;

      if (options?.preferredMember) {
        targetMember = this.getMember(options.preferredMember);
        if (!targetMember) {
          return {
            success: false,
            error: {
              code: 'PREFERRED_MEMBER_NOT_FOUND',
              message: `Preferred member ${options.preferredMember} not found in project`,
            },
          };
        }
      } else if (options?.requiredCapabilities) {
        const suitableMembers = this.getMembersWithSkills(options.requiredCapabilities);
        if (suitableMembers.length > 0) {
          // For now, just pick the first suitable member
          // Could be enhanced with more sophisticated assignment logic
          targetMember = suitableMembers[0];
        }
      } else {
        // No specific requirements, pick any member
        const members = Array.from(this.#members.values());
        if (members.length > 0) {
          targetMember = members[0];
        }
      }

      if (targetMember) {
        return targetMember.delegate({
          priority: 'medium',
          payload: {
            task,
            requiredCapabilities: options?.requiredCapabilities,
            deadline: options?.deadline,
            context: options?.context,
          },
        });
      }
    }

    // If no suitable internal member found or external delegation requested
    const delegationRequest: DelegationRequest = {
      initiatorId: this.id,
      requestType: 'delegation',
      priority: 'medium',
      payload: {
        task,
        requiredCapabilities: options?.requiredCapabilities,
        deadline: options?.deadline,
        context: options?.context,
      },
    };

    // Emit delegation request event for external handling
    if (this.#mastra?.pubsub) {
      await this.#mastra.pubsub.publish('federation:delegation-request', {
        
        type: 'federation:delegation-request',
        data: delegationRequest,
        runId: randomUUID(),
      });
    }

    return {
      success: true,
      data: {
        message: 'Task delegated externally',
        delegationId: randomUUID(),
      },
      metadata: {
        executionTime: Date.now(),
        resourcesUsed: ['delegation-system'],
        delegationChain: [this.id],
      },
    };
  }

  /**
   * Coordinate collaboration between project members
   */
  public async coordinateCollaboration(
    topic: string,
    type: 'brainstorm' | 'review' | 'decision' | 'execution',
    participantIds?: string[],
    sessionConfig?: Record<string, any>
  ): Promise<CoordinationResult> {
    const participants = participantIds || Array.from(this.#members.keys());
    
    // Ensure all participants are project members
    const validParticipants = participants.filter(id => this.#members.has(id));
    
    if (validParticipants.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_VALID_PARTICIPANTS',
          message: 'No valid participants found for collaboration',
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
        participants: validParticipants,
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

    // Notify all participants
    const notificationPromises = validParticipants.map(async (participantId) => {
      const member = this.#members.get(participantId);
      if (member) {
        return member.handleCoordinationRequest(collaborationRequest);
      }
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
        participants: validParticipants,
        notifiedParticipants: successfulNotifications,
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
   * Get a comprehensive status of the project
   */
  public getProjectStatus(): {
    id: string;
    name: string;
    organizationId: string;
    status: string;
    goals: string[];
    memberCount: number;
    members: Array<{ id: string; name: string; skills: string[] }>;
    federationConfig: FederationConfig;
  } {
    return {
      id: this.id,
      name: this.name,
      organizationId: this.#organizationId,
      status: this.#status,
      goals: this.#goals,
      memberCount: this.#members.size,
      members: Array.from(this.#members.entries()).map(([id, member]) => ({
        id,
        name: member.name,
        skills: member.getSkills(),
      })),
      federationConfig: this.#federationConfig,
    };
  }

  /**
   * Handle delegation requests to the project
   */
  async #handleDelegationRequest(request: DelegationRequest): Promise<CoordinationResult> {
    if (!this.#federationConfig.canReceiveDelegation) {
      return {
        success: false,
        error: {
          code: 'DELEGATION_NOT_ACCEPTED',
          message: 'This project cannot receive delegated tasks',
        },
      };
    }

    // Delegate internally to the most suitable member
    return this.delegateTask(request.payload.task, {
      requiredCapabilities: request.payload.requiredCapabilities,
      deadline: request.payload.deadline,
      context: request.payload.context,
    });
  }

  /**
   * Handle collaboration requests to the project
   */
  async #handleCollaborationRequest(request: CollaborationRequest): Promise<CoordinationResult> {
    // Join the collaboration session with project members
    return {
      success: true,
      data: {
        message: `Project ${this.name} joined collaboration on ${request.payload.topic}`,
        projectId: this.id,
        availableMembers: Array.from(this.#members.keys()),
      },
      metadata: {
        executionTime: Date.now(),
        resourcesUsed: ['collaboration-system'],
      },
    };
  }

  /**
   * Handle information requests
   */
  async #handleInformationRequest(context: CoordinationContext): Promise<CoordinationResult> {
    return {
      success: true,
      data: this.getProjectStatus(),
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
    // Log the escalation and potentially forward to organization level
    this.logger?.info('Project escalation request received', {
      from: context.initiatorId,
      priority: context.priority,
      payload: context.payload,
    });

    return {
      success: true,
      data: {
        message: 'Escalation acknowledged by project',
        escalationId: randomUUID(),
        forwardedToOrganization: true,
      },
      metadata: {
        executionTime: Date.now(),
        resourcesUsed: ['escalation-system'],
      },
    };
  }
}