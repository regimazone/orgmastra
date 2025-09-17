// Export types
export type * from './types';

// Export main classes
export { Organization } from './organization';
export { Project } from './project';
export { Person } from './person';

// Export coordination classes
export { FederationCoordinator } from './coordination/federation';
export { DelegationManager } from './coordination/delegation';
export { RoutingSystem } from './coordination/routing';

// Export cognitive architecture components
export * from './cognitive';

// Export coordination types
export type {
  EntityRegistry,
  FederationCoordinatorConfig,
} from './coordination/federation';

export type {
  DelegationTask,
  DelegationManagerConfig,
  DelegationStatistics,
} from './coordination/delegation';

export type {
  Route,
  RoutingConfig,
  RoutingEntity,
} from './coordination/routing';