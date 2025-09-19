import type { Agent } from '../agent';
import type { ToolsInput, ToolsetsInput } from '../agent/types';
import type { IMastraLogger } from '../logger';
import type { Mastra } from '../mastra';
import type { MastraMemory } from '../memory/memory';
import type { MastraStorage } from '../storage';
import type { Telemetry } from '../telemetry';
import type { DynamicArgument } from '../types';
import type { MastraVector } from '../vector';
import type { Workflow } from '../workflows';

/**
 * Represents a role within an organization or project
 */
export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  capabilities: string[];
}

/**
 * Represents the hierarchical position of an entity within an organization
 */
export interface OrganizationalPosition {
  organizationId: string;
  projectId?: string;
  roleId: string;
  reportingTo?: string; // ID of supervisor
  teammates?: string[]; // IDs of peers
}

/**
 * Configuration for federated coordination between entities
 */
export interface FederationConfig {
  /** Whether this entity can delegate tasks to others */
  canDelegate: boolean;
  /** Whether this entity can receive delegated tasks */
  canReceiveDelegation: boolean;
  /** Maximum depth of delegation chains this entity can initiate */
  maxDelegationDepth: number;
  /** Entities this one trusts for delegation */
  trustedDelegates: string[];
  /** Communication protocols supported */
  supportedProtocols: ('direct' | 'broadcast' | 'hierarchical')[];
}

/**
 * Base configuration for organizational entities
 */
export interface OrganizationalEntityConfig {
  id: string;
  name: string;
  description?: string;
  federationConfig?: FederationConfig;
  metadata?: Record<string, any>;
}

/**
 * Configuration for a Person entity
 */
export interface PersonConfig extends OrganizationalEntityConfig {
  /** The underlying agent that powers this person */
  agent?: Agent;
  /** Agent configuration if no agent is provided */
  agentConfig?: {
    instructions: DynamicArgument<string>;
    model: DynamicArgument<any>;
    tools?: DynamicArgument<ToolsInput>;
    memory?: DynamicArgument<MastraMemory>;
  };
  /** Organizational position */
  position: OrganizationalPosition;
  /** Personal skills and capabilities */
  skills?: string[];
  /** Personal preferences and settings */
  preferences?: Record<string, any>;
}

/**
 * Configuration for a Project/Team entity
 */
export interface ProjectConfig extends OrganizationalEntityConfig {
  /** Organization this project belongs to */
  organizationId: string;
  /** Project goals and objectives */
  goals?: string[];
  /** Members of this project */
  members?: Record<string, PersonConfig>;
  /** Project-specific tools and resources */
  tools?: DynamicArgument<ToolsetsInput>;
  /** Project workflows */
  workflows?: DynamicArgument<Record<string, Workflow>>;
  /** Project-specific memory configuration */
  memory?: DynamicArgument<MastraMemory>;
  /** Project status */
  status?: 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled';
}

/**
 * Configuration for an Organization entity
 */
export interface OrganizationConfig extends OrganizationalEntityConfig {
  /** Projects within this organization */
  projects?: Record<string, ProjectConfig>;
  /** Organization-wide roles */
  roles?: Record<string, Role>;
  /** Organization policies and rules */
  policies?: {
    collaboration?: Record<string, any>;
    delegation?: Record<string, any>;
    security?: Record<string, any>;
  };
  /** Shared organizational resources */
  sharedResources?: {
    tools?: DynamicArgument<ToolsetsInput>;
    workflows?: DynamicArgument<Record<string, Workflow>>;
    memory?: DynamicArgument<MastraMemory>;
    storage?: MastraStorage;
    vectors?: Record<string, MastraVector>;
  };
}

/**
 * Context passed during coordination and communication
 */
export interface CoordinationContext {
  /** ID of the initiating entity */
  initiatorId: string;
  /** Type of coordination request */
  requestType: 'delegation' | 'collaboration' | 'information' | 'escalation';
  /** Priority level */
  priority: 'low' | 'medium' | 'high' | 'urgent';
  /** Request payload */
  payload: any;
  /** Tracing information */
  traceId?: string;
  /** Authentication context */
  authContext?: Record<string, any>;
}

/**
 * Result of a coordination request
 */
export interface CoordinationResult {
  /** Whether the request was successful */
  success: boolean;
  /** Result data if successful */
  data?: any;
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  /** Execution metadata */
  metadata?: {
    executionTime: number;
    resourcesUsed: string[];
    delegationChain?: string[];
  };
}

/**
 * Delegation request structure
 */
export interface DelegationRequest extends CoordinationContext {
  requestType: 'delegation';
  payload: {
    /** Task to be delegated */
    task: string;
    /** Required capabilities for the task */
    requiredCapabilities?: string[];
    /** Deadline for completion */
    deadline?: Date;
    /** Expected output format */
    expectedOutput?: any;
    /** Additional context */
    context?: Record<string, any>;
  };
}

/**
 * Collaboration request structure
 */
export interface CollaborationRequest extends CoordinationContext {
  requestType: 'collaboration';
  payload: {
    /** Collaboration type */
    type: 'brainstorm' | 'review' | 'decision' | 'execution';
    /** Topic or subject */
    topic: string;
    /** Participants */
    participants: string[];
    /** Session configuration */
    sessionConfig?: Record<string, any>;
  };
}

/**
 * Primitives available to organizational entities
 */
export interface OrganizationalPrimitives {
  logger?: IMastraLogger;
  telemetry?: Telemetry;
  storage?: MastraStorage;
  memory?: MastraMemory;
  vectors?: Record<string, MastraVector>;
  mastra?: Mastra;
}

/**
 * Events emitted by organizational entities
 */
export interface OrganizationalEvents {
  'person:task-received': { personId: string; task: any; from: string };
  'person:task-completed': { personId: string; task: any; result: any };
  'person:task-failed': { personId: string; task: any; error: any };
  'project:member-added': { projectId: string; personId: string };
  'project:member-removed': { projectId: string; personId: string };
  'project:status-changed': { projectId: string; oldStatus: string; newStatus: string };
  'organization:project-created': { organizationId: string; projectId: string };
  'organization:project-deleted': { organizationId: string; projectId: string };
  'federation:delegation-request': DelegationRequest;
  'federation:delegation-response': CoordinationResult;
  'federation:collaboration-request': CollaborationRequest;
  'federation:collaboration-response': CoordinationResult;
}