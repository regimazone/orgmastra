import { randomUUID } from 'crypto';
import type { CoreMessage } from 'ai';
import { Agent } from '../agent';
import type { AgentGenerateOptions, AgentStreamOptions } from '../agent/types';
import { MastraBase } from '../base';
import { MastraError, ErrorDomain, ErrorCategory } from '../error';
import type { Mastra } from '../mastra';
import { InstrumentClass } from '../telemetry';
import type {
  PersonConfig,
  OrganizationalPosition,
  FederationConfig,
  CoordinationContext,
  CoordinationResult,
  DelegationRequest,
  CollaborationRequest,
  OrganizationalPrimitives,
} from './types';

/**
 * Represents a person within an organizational structure.
 * A Person wraps an Agent and adds organizational context, relationships, and coordination capabilities.
 */
@InstrumentClass({
  prefix: 'person',
  excludeMethods: ['__registerMastra', '__registerPrimitives', '__setLogger', '__setTelemetry'],
})
export class Person extends MastraBase {
  #agent: Agent;
  #position: OrganizationalPosition;
  #skills: string[];
  #preferences: Record<string, any>;
  #federationConfig: FederationConfig;
  #metadata: Record<string, any>;
  #mastra?: Mastra;

  public readonly id: string;
  public readonly name: string;
  public readonly description?: string;

  constructor(config: PersonConfig) {
    super({ name: config.name });
    
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.#position = config.position;
    this.#skills = config.skills || [];
    this.#preferences = config.preferences || {};
    this.#metadata = config.metadata || {};

    // Set up federation configuration with defaults
    this.#federationConfig = {
      canDelegate: true,
      canReceiveDelegation: true,
      maxDelegationDepth: 3,
      trustedDelegates: [],
      supportedProtocols: ['direct', 'hierarchical'],
      ...config.federationConfig,
    };

    // Create or use provided agent
    if (config.agent) {
      this.#agent = config.agent;
    } else if (config.agentConfig) {
      this.#agent = new Agent({
        name: `${config.name}_agent`,
        instructions: config.agentConfig.instructions,
        model: config.agentConfig.model,
        tools: config.agentConfig.tools,
        memory: config.agentConfig.memory,
      });
    } else {
      throw new MastraError({
        id: 'PERSON_MISSING_AGENT_CONFIG',
        domain: ErrorDomain.MASTRA,
        category: ErrorCategory.USER,
        text: 'Person must have either an agent or agentConfig',
        details: { personId: this.id, personName: this.name },
      });
    }
  }

  /**
   * Register the Mastra instance with this person
   */
  __registerMastra(mastra: Mastra): void {
    this.#mastra = mastra;
    this.#agent.__registerMastra(mastra);
  }

  /**
   * Register primitives with this person
   */
  __registerPrimitives(primitives: OrganizationalPrimitives): void {
    this.#agent.__registerPrimitives(primitives);
  }

  /**
   * Get the underlying agent
   */
  public getAgent(): Agent {
    return this.#agent;
  }

  /**
   * Get the person's organizational position
   */
  public getPosition(): OrganizationalPosition {
    return { ...this.#position };
  }

  /**
   * Update the person's organizational position
   */
  public updatePosition(position: Partial<OrganizationalPosition>): void {
    this.#position = { ...this.#position, ...position };
  }

  /**
   * Get the person's skills
   */
  public getSkills(): string[] {
    return [...this.#skills];
  }

  /**
   * Add skills to the person
   */
  public addSkills(skills: string[]): void {
    this.#skills.push(...skills.filter(skill => !this.#skills.includes(skill)));
  }

  /**
   * Remove skills from the person
   */
  public removeSkills(skills: string[]): void {
    this.#skills = this.#skills.filter(skill => !skills.includes(skill));
  }

  /**
   * Check if the person has specific capabilities
   */
  public hasCapabilities(requiredCapabilities: string[]): boolean {
    return requiredCapabilities.every(capability => this.#skills.includes(capability));
  }

  /**
   * Get the person's federation configuration
   */
  public getFederationConfig(): FederationConfig {
    return { ...this.#federationConfig };
  }

  /**
   * Update the person's federation configuration
   */
  public updateFederationConfig(config: Partial<FederationConfig>): void {
    this.#federationConfig = { ...this.#federationConfig, ...config };
  }

  /**
   * Generate a response using the person's agent with organizational context
   */
  public async generate(
    input: string | CoreMessage[],
    options?: AgentGenerateOptions & {
      includeOrganizationalContext?: boolean;
      contextScope?: 'personal' | 'project' | 'organization';
    }
  ) {
    const enhancedOptions = await this.#enhanceOptionsWithContext(options);
    return this.#agent.generate(input, enhancedOptions);
  }

  /**
   * Stream a response using the person's agent with organizational context
   */
  public async stream(
    input: string | CoreMessage[],
    options?: AgentStreamOptions & {
      includeOrganizationalContext?: boolean;
      contextScope?: 'personal' | 'project' | 'organization';
    }
  ) {
    const enhancedOptions = await this.#enhanceOptionsWithContext(options);
    return this.#agent.stream(input, enhancedOptions);
  }

  /**
   * Delegate a task to another person or agent
   */
  public async delegate(request: Omit<DelegationRequest, 'initiatorId' | 'requestType'>): Promise<CoordinationResult> {
    if (!this.#federationConfig.canDelegate) {
      return {
        success: false,
        error: {
          code: 'DELEGATION_NOT_ALLOWED',
          message: 'This person is not allowed to delegate tasks',
        },
      };
    }

    const delegationRequest: DelegationRequest = {
      ...request,
      initiatorId: this.id,
      requestType: 'delegation',
    };

    // Emit delegation request event
    if (this.#mastra?.pubsub) {
      await this.#mastra.pubsub.publish('federation:delegation-request', {
        
        type: 'federation:delegation-request',
        data: delegationRequest,
        runId: randomUUID(),
      });
    }

    // For now, return a placeholder response
    // In a full implementation, this would route to the appropriate entity
    return {
      success: true,
      data: {
        message: 'Delegation request submitted',
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
   * Initiate collaboration with other persons or agents
   */
  public async collaborate(request: Omit<CollaborationRequest, 'initiatorId' | 'requestType'>): Promise<CoordinationResult> {
    const collaborationRequest: CollaborationRequest = {
      ...request,
      initiatorId: this.id,
      requestType: 'collaboration',
    };

    // Emit collaboration request event
    if (this.#mastra?.pubsub) {
      await this.#mastra.pubsub.publish('federation:collaboration-request', {
        
        type: 'federation:collaboration-request',
        data: collaborationRequest,
        runId: randomUUID(),
      });
    }

    // For now, return a placeholder response
    // In a full implementation, this would coordinate with other entities
    return {
      success: true,
      data: {
        message: 'Collaboration session initiated',
        sessionId: randomUUID(),
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
   * Get a summary of the person's current status and context
   */
  public getStatus(): {
    id: string;
    name: string;
    position: OrganizationalPosition;
    skills: string[];
    federationConfig: FederationConfig;
    agentStatus: string;
  } {
    return {
      id: this.id,
      name: this.name,
      position: this.#position,
      skills: this.#skills,
      federationConfig: this.#federationConfig,
      agentStatus: 'active', // Could be enhanced to check actual agent status
    };
  }

  /**
   * Enhance options with organizational context
   */
  async #enhanceOptionsWithContext(
    options?: any
  ): Promise<any> {
    if (!options?.includeOrganizationalContext) {
      return options;
    }

    const contextMessages: CoreMessage[] = [];
    
    // Add personal context
    contextMessages.push({
      role: 'system',
      content: `You are ${this.name}, working in ${this.#position.organizationId}${
        this.#position.projectId ? ` on project ${this.#position.projectId}` : ''
      }. Your skills include: ${this.#skills.join(', ')}.`,
    });

    // Add project context if available and requested
    if (options.contextScope === 'project' && this.#position.projectId && this.#mastra) {
      // Could add project-specific context here
      contextMessages.push({
        role: 'system',
        content: `You are currently working on project ${this.#position.projectId}.`,
      });
    }

    // Add organization context if requested
    if (options.contextScope === 'organization' && this.#mastra) {
      // Could add organization-wide context here
      contextMessages.push({
        role: 'system',
        content: `You are part of the ${this.#position.organizationId} organization.`,
      });
    }

    return {
      ...options,
      context: [...(options.context || []), ...contextMessages],
    };
  }

  /**
   * Handle delegation requests
   */
  async #handleDelegationRequest(request: DelegationRequest): Promise<CoordinationResult> {
    if (!this.#federationConfig.canReceiveDelegation) {
      return {
        success: false,
        error: {
          code: 'DELEGATION_NOT_ACCEPTED',
          message: 'This person cannot receive delegated tasks',
        },
      };
    }

    // Check if the person has required capabilities
    const requiredCapabilities = request.payload.requiredCapabilities || [];
    if (!this.hasCapabilities(requiredCapabilities)) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_CAPABILITIES',
          message: 'Person does not have required capabilities for this task',
          details: {
            required: requiredCapabilities,
            available: this.#skills,
          },
        },
      };
    }

    // Execute the delegated task using the agent
    try {
      const result = await this.#agent.generate(request.payload.task, {
        context: request.payload.context ? [
          {
            role: 'system',
            content: `Additional context: ${JSON.stringify(request.payload.context)}`,
          },
        ] : undefined,
      });

      return {
        success: true,
        data: result,
        metadata: {
          executionTime: Date.now(),
          resourcesUsed: ['agent'],
          delegationChain: [request.initiatorId, this.id],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TASK_EXECUTION_FAILED',
          message: 'Failed to execute delegated task',
          details: error,
        },
      };
    }
  }

  /**
   * Handle collaboration requests
   */
  async #handleCollaborationRequest(request: CollaborationRequest): Promise<CoordinationResult> {
    // For now, just acknowledge the collaboration request
    // In a full implementation, this would join the collaboration session
    return {
      success: true,
      data: {
        message: `${this.name} joined collaboration on ${request.payload.topic}`,
        participantId: this.id,
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
  async #handleInformationRequest(_context: CoordinationContext): Promise<CoordinationResult> {
    return {
      success: true,
      data: this.getStatus(),
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
    // For now, just log the escalation
    this.logger?.info('Escalation request received', {
      from: context.initiatorId,
      priority: context.priority,
      payload: context.payload,
    });

    return {
      success: true,
      data: {
        message: 'Escalation acknowledged',
        escalationId: randomUUID(),
      },
      metadata: {
        executionTime: Date.now(),
        resourcesUsed: ['escalation-system'],
      },
    };
  }
}