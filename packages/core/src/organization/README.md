# Organizational Structure with Federated Agency

This implementation adds comprehensive organizational structure capabilities to Mastra, enabling nested organizations, projects/teams, and persons/agents to coordinate through federated agency.

## Quick Start

```typescript
import { Mastra } from '@mastra/core';
import { Organization, Project, Person } from '@mastra/core/organization';

// Create organization
const company = new Organization({
  id: 'my-company',
  name: 'My Company',
  description: 'An innovative tech company',
});

// Create project
const project = new Project({
  id: 'mobile-app',
  name: 'Mobile App Development',
  organizationId: 'my-company',
  status: 'active',
});

// Create person
const engineer = new Person({
  id: 'john-engineer',
  name: 'John Smith',
  position: {
    organizationId: 'my-company',
    projectId: 'mobile-app',
    roleId: 'engineer',
  },
  skills: ['javascript', 'react-native'],
  agentConfig: {
    instructions: 'You are a mobile app developer...',
    model: openai('gpt-4'),
  },
});

// Add to organization
company.addProject('mobile-app', project);
project.addMember('john-engineer', engineer);
```

## Key Features

### 🏢 Hierarchical Organization
- **Organizations** contain multiple projects/teams
- **Projects** coordinate members toward shared goals
- **Persons** wrap agents with organizational context

### 🤝 Federated Agency
- **Task Delegation**: Intelligent routing based on capabilities
- **Cross-Project Collaboration**: Coordinate between teams
- **Trust Networks**: Configurable delegation chains
- **Automatic Routing**: Find best person/team for tasks

### 🧠 Smart Coordination
- **Capability Matching**: Route tasks to skilled individuals
- **Load Balancing**: Distribute work across available resources
- **Retry Mechanisms**: Handle failures gracefully
- **Event-Driven**: Real-time coordination updates

## Core Components

### Organization
Top-level container managing shared resources and policies.

```typescript
const org = new Organization({
  id: 'acme-corp',
  name: 'ACME Corporation',
  roles: {
    'engineer': {
      id: 'engineer',
      name: 'Software Engineer',
      permissions: ['develop-code', 'review-code'],
      capabilities: ['programming', 'testing'],
    },
  },
  policies: {
    delegation: { maxDepth: 3 },
    collaboration: { requiresApproval: false },
  },
});
```

### Project
Mid-level coordination unit for teams working on specific goals.

```typescript
const project = new Project({
  id: 'ai-platform',
  name: 'AI Platform',
  organizationId: 'acme-corp',
  goals: ['Build AI platform', 'Scale to 1M users'],
  status: 'active',
});
```

### Person
Individual entity with skills, role, and agent capabilities.

```typescript
const person = new Person({
  id: 'alice-senior',
  name: 'Alice Johnson',
  position: {
    organizationId: 'acme-corp',
    projectId: 'ai-platform',
    roleId: 'senior-engineer',
  },
  skills: ['machine-learning', 'python', 'tensorflow'],
  agentConfig: {
    instructions: 'You are a senior ML engineer...',
    model: openai('gpt-4'),
  },
});
```

## Federated Operations

### Task Delegation
Delegate tasks to the most suitable person or team:

```typescript
// Organization-level delegation
const result = await organization.coordinateTask(
  'Design ML architecture for recommendation system',
  {
    requiredCapabilities: ['machine-learning', 'architecture-design'],
    priority: 'high',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }
);

// Person-level delegation
const delegationResult = await seniorEngineer.delegate({
  priority: 'medium',
  payload: {
    task: 'Review ML model implementation',
    requiredCapabilities: ['machine-learning', 'code-review'],
  },
});
```

### Cross-Project Collaboration
Coordinate between multiple teams:

```typescript
const collaboration = await organization.coordinateCrossProjectCollaboration(
  'API Design Review',
  'review',
  ['mobile-app', 'backend-platform'],
  {
    duration: '2 hours',
    deliverables: ['api-specification', 'security-requirements'],
  }
);
```

### Advanced Coordination
Use coordination systems for sophisticated routing:

```typescript
import { FederationCoordinator, DelegationManager, RoutingSystem } from '@mastra/core/organization';

const coordinator = new FederationCoordinator(mastra.pubsub);
const delegationManager = new DelegationManager();
const routingSystem = new RoutingSystem();

// Register entities
coordinator.registerOrganization(organization);
coordinator.registerProject(project);
coordinator.registerPerson(person);

// Route requests intelligently
const route = routingSystem.findOptimalRoute('sender-id', request);
```

## Integration with Mastra

The organizational structure integrates seamlessly with existing Mastra features:

```typescript
const mastra = new Mastra({
  agents: {
    // Regular agents
    assistantAgent,
  },
  // Organizations can be added separately
});

// Register with coordination systems
const coordinator = new FederationCoordinator(mastra.pubsub);
coordinator.registerOrganization(organization);
```

## Example: Tech Company Structure

See the complete example at `examples/organizational-structure/` which demonstrates:

- CEO delegating strategic decisions to CTO
- CTO coordinating with Engineering Managers
- Cross-team collaboration between Mobile and Platform teams
- Automatic task routing based on required skills
- Real-time coordination with federated agency

The example shows how a tech company with multiple projects can coordinate effectively using the organizational structure.

## Benefits

1. **Scalable Coordination**: Manage large teams and complex projects
2. **Intelligent Routing**: Automatically find the right person for each task
3. **Federated Agency**: Distributed decision-making with centralized oversight
4. **Flexible Hierarchy**: Support various organizational structures
5. **Event-Driven**: Real-time updates and coordination
6. **Extensible**: Build on existing Mastra architecture

This implementation provides a robust foundation for organizational AI coordination while maintaining the simplicity and power of the Mastra framework.