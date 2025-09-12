import { Mastra } from '@mastra/core';
import { openai } from '@ai-sdk/openai';
import {
  Organization,
  Project,
  Person,
  FederationCoordinator,
  DelegationManager,
  RoutingSystem,
} from '@mastra/core/organization';

/**
 * Example demonstrating a tech company organizational structure with federated agency
 */

// Create the main Mastra instance
const mastra = new Mastra({
  // We'll register organizations separately
});

// Set up coordination systems
const federationCoordinator = new FederationCoordinator(mastra.pubsub);
const delegationManager = new DelegationManager();
const routingSystem = new RoutingSystem();

console.log('🏢 Setting up TechCorp organizational structure...\n');

// Define roles within the organization
const roles = {
  'ceo': {
    id: 'ceo',
    name: 'Chief Executive Officer',
    description: 'Strategic leadership and decision making',
    permissions: ['delegate-any', 'create-projects', 'manage-organization'],
    capabilities: ['strategic-planning', 'leadership', 'decision-making'],
  },
  'cto': {
    id: 'cto',
    name: 'Chief Technology Officer',
    description: 'Technical leadership and architecture',
    permissions: ['delegate-technical', 'review-architecture', 'manage-engineering'],
    capabilities: ['technical-architecture', 'engineering-leadership', 'technology-strategy'],
  },
  'engineering-manager': {
    id: 'engineering-manager',
    name: 'Engineering Manager',
    description: 'Manages engineering teams and projects',
    permissions: ['delegate-team', 'assign-tasks', 'review-code'],
    capabilities: ['team-management', 'project-planning', 'technical-review'],
  },
  'senior-engineer': {
    id: 'senior-engineer',
    name: 'Senior Software Engineer',
    description: 'Experienced engineer with mentoring responsibilities',
    permissions: ['mentor-junior', 'review-code', 'architect-solutions'],
    capabilities: ['software-development', 'architecture-design', 'mentoring', 'code-review'],
  },
  'engineer': {
    id: 'engineer',
    name: 'Software Engineer',
    description: 'Develops software solutions',
    permissions: ['develop-code', 'participate-reviews'],
    capabilities: ['software-development', 'testing', 'documentation'],
  },
  'product-manager': {
    id: 'product-manager',
    name: 'Product Manager',
    description: 'Manages product strategy and requirements',
    permissions: ['define-requirements', 'prioritize-features'],
    capabilities: ['product-strategy', 'requirements-analysis', 'stakeholder-management'],
  },
  'designer': {
    id: 'designer',
    name: 'UX/UI Designer',
    description: 'Designs user experiences and interfaces',
    permissions: ['create-designs', 'conduct-research'],
    capabilities: ['ux-design', 'ui-design', 'user-research', 'prototyping'],
  },
};

// Create the main organization
const techCorp = new Organization({
  id: 'techcorp',
  name: 'TechCorp',
  description: 'An innovative technology company',
  roles,
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 5,
    trustedDelegates: [],
    supportedProtocols: ['direct', 'broadcast', 'hierarchical'],
  },
  policies: {
    collaboration: {
      requiresApproval: false,
      maxParticipants: 10,
    },
    delegation: {
      maxDepth: 3,
      requiresCapabilityMatch: true,
    },
    security: {
      authenticationRequired: true,
      auditAllRequests: true,
    },
  },
});

// Create engineering project
const mobileAppProject = new Project({
  id: 'mobile-app-v2',
  name: 'Mobile App V2',
  description: 'Next generation mobile application',
  organizationId: 'techcorp',
  goals: [
    'Improve user experience',
    'Add new features',
    'Enhance performance',
    'Implement modern architecture',
  ],
  status: 'active',
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 3,
    trustedDelegates: [],
    supportedProtocols: ['direct', 'hierarchical'],
  },
});

// Create platform project
const platformProject = new Project({
  id: 'platform-infrastructure',
  name: 'Platform Infrastructure',
  description: 'Core platform and infrastructure development',
  organizationId: 'techcorp',
  goals: [
    'Scale infrastructure',
    'Improve reliability',
    'Reduce costs',
    'Enhance security',
  ],
  status: 'active',
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 3,
    trustedDelegates: [],
    supportedProtocols: ['direct', 'hierarchical'],
  },
});

// Create CEO
const ceo = new Person({
  id: 'alice-ceo',
  name: 'Alice Johnson',
  description: 'Visionary leader with 15 years of experience',
  position: {
    organizationId: 'techcorp',
    roleId: 'ceo',
  },
  skills: ['strategic-planning', 'leadership', 'decision-making', 'business-development'],
  agentConfig: {
    instructions: 'You are Alice, the CEO of TechCorp. You focus on strategic decisions, business growth, and organizational leadership. You delegate technical matters to your CTO and product matters to product managers.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 5,
    trustedDelegates: ['bob-cto'],
    supportedProtocols: ['direct', 'hierarchical'],
  },
});

// Create CTO
const cto = new Person({
  id: 'bob-cto',
  name: 'Bob Chen',
  description: 'Technical leader with deep architectural expertise',
  position: {
    organizationId: 'techcorp',
    roleId: 'cto',
    reportingTo: 'alice-ceo',
  },
  skills: ['technical-architecture', 'engineering-leadership', 'technology-strategy', 'system-design'],
  agentConfig: {
    instructions: 'You are Bob, the CTO of TechCorp. You oversee all technical decisions, architecture, and engineering teams. You work closely with engineering managers to ensure technical excellence.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 4,
    trustedDelegates: ['carol-em', 'david-em'],
    supportedProtocols: ['direct', 'hierarchical'],
  },
});

// Create Engineering Managers
const mobileEm = new Person({
  id: 'carol-em',
  name: 'Carol Rodriguez',
  description: 'Engineering manager for mobile development',
  position: {
    organizationId: 'techcorp',
    projectId: 'mobile-app-v2',
    roleId: 'engineering-manager',
    reportingTo: 'bob-cto',
  },
  skills: ['team-management', 'mobile-development', 'project-planning', 'technical-review'],
  agentConfig: {
    instructions: 'You are Carol, an Engineering Manager leading the mobile app development team. You coordinate between product requirements and technical implementation, ensuring your team delivers high-quality mobile solutions.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 3,
    trustedDelegates: ['eve-senior', 'frank-engineer'],
    supportedProtocols: ['direct', 'hierarchical'],
  },
});

const platformEm = new Person({
  id: 'david-em',
  name: 'David Kim',
  description: 'Engineering manager for platform infrastructure',
  position: {
    organizationId: 'techcorp',
    projectId: 'platform-infrastructure',
    roleId: 'engineering-manager',
    reportingTo: 'bob-cto',
  },
  skills: ['team-management', 'infrastructure', 'devops', 'scalability'],
  agentConfig: {
    instructions: 'You are David, an Engineering Manager leading the platform infrastructure team. You focus on scalability, reliability, and infrastructure optimization to support the entire organization.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 3,
    trustedDelegates: ['grace-senior', 'henry-engineer'],
    supportedProtocols: ['direct', 'hierarchical'],
  },
});

// Create Senior Engineers
const mobileSenior = new Person({
  id: 'eve-senior',
  name: 'Eve Thompson',
  description: 'Senior mobile engineer and tech lead',
  position: {
    organizationId: 'techcorp',
    projectId: 'mobile-app-v2',
    roleId: 'senior-engineer',
    reportingTo: 'carol-em',
  },
  skills: ['mobile-development', 'ios', 'android', 'architecture-design', 'mentoring'],
  agentConfig: {
    instructions: 'You are Eve, a Senior Mobile Engineer and tech lead. You design mobile architecture, mentor junior developers, and ensure code quality across mobile platforms.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 2,
    trustedDelegates: ['frank-engineer'],
    supportedProtocols: ['direct'],
  },
});

const platformSenior = new Person({
  id: 'grace-senior',
  name: 'Grace Liu',
  description: 'Senior platform engineer specializing in distributed systems',
  position: {
    organizationId: 'techcorp',
    projectId: 'platform-infrastructure',
    roleId: 'senior-engineer',
    reportingTo: 'david-em',
  },
  skills: ['distributed-systems', 'kubernetes', 'microservices', 'performance-optimization'],
  agentConfig: {
    instructions: 'You are Grace, a Senior Platform Engineer specializing in distributed systems. You design and optimize platform infrastructure to handle massive scale and ensure high availability.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: true,
    canReceiveDelegation: true,
    maxDelegationDepth: 2,
    trustedDelegates: ['henry-engineer'],
    supportedProtocols: ['direct'],
  },
});

// Create Engineers
const mobileEngineer = new Person({
  id: 'frank-engineer',
  name: 'Frank Wilson',
  description: 'Mobile engineer focused on iOS development',
  position: {
    organizationId: 'techcorp',
    projectId: 'mobile-app-v2',
    roleId: 'engineer',
    reportingTo: 'eve-senior',
  },
  skills: ['ios-development', 'swift', 'ui-development', 'testing'],
  agentConfig: {
    instructions: 'You are Frank, a Mobile Engineer specializing in iOS development. You implement features, write tests, and collaborate with designers to create excellent user experiences.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: false,
    canReceiveDelegation: true,
    maxDelegationDepth: 1,
    trustedDelegates: [],
    supportedProtocols: ['direct'],
  },
});

const platformEngineer = new Person({
  id: 'henry-engineer',
  name: 'Henry Davis',
  description: 'Platform engineer focused on backend services',
  position: {
    organizationId: 'techcorp',
    projectId: 'platform-infrastructure',
    roleId: 'engineer',
    reportingTo: 'grace-senior',
  },
  skills: ['backend-development', 'api-design', 'database-optimization', 'monitoring'],
  agentConfig: {
    instructions: 'You are Henry, a Platform Engineer focused on backend services. You build robust APIs, optimize database performance, and implement monitoring solutions.',
    model: openai('gpt-4'),
  },
  federationConfig: {
    canDelegate: false,
    canReceiveDelegation: true,
    maxDelegationDepth: 1,
    trustedDelegates: [],
    supportedProtocols: ['direct'],
  },
});

// Add members to projects
mobileAppProject.addMember('carol-em', {
  id: 'carol-em',
  name: 'Carol Rodriguez',
  position: mobileEm.getPosition(),
  agent: mobileEm.getAgent(),
});

mobileAppProject.addMember('eve-senior', {
  id: 'eve-senior',
  name: 'Eve Thompson',
  position: mobileSenior.getPosition(),
  agent: mobileSenior.getAgent(),
});

mobileAppProject.addMember('frank-engineer', {
  id: 'frank-engineer',
  name: 'Frank Wilson',
  position: mobileEngineer.getPosition(),
  agent: mobileEngineer.getAgent(),
});

platformProject.addMember('david-em', {
  id: 'david-em',
  name: 'David Kim',
  position: platformEm.getPosition(),
  agent: platformEm.getAgent(),
});

platformProject.addMember('grace-senior', {
  id: 'grace-senior',
  name: 'Grace Liu',
  position: platformSenior.getPosition(),
  agent: platformSenior.getAgent(),
});

platformProject.addMember('henry-engineer', {
  id: 'henry-engineer',
  name: 'Henry Davis',
  position: platformEngineer.getPosition(),
  agent: platformEngineer.getAgent(),
});

// Add projects to organization
techCorp.addProject('mobile-app-v2', mobileAppProject);
techCorp.addProject('platform-infrastructure', platformProject);

// Register entities with coordination systems
federationCoordinator.registerOrganization(techCorp);
federationCoordinator.registerProject(mobileAppProject);
federationCoordinator.registerProject(platformProject);
federationCoordinator.registerPerson(ceo);
federationCoordinator.registerPerson(cto);
federationCoordinator.registerPerson(mobileEm);
federationCoordinator.registerPerson(platformEm);
federationCoordinator.registerPerson(mobileSenior);
federationCoordinator.registerPerson(platformSenior);
federationCoordinator.registerPerson(mobileEngineer);
federationCoordinator.registerPerson(platformEngineer);

// Set up routing connections
routingSystem.registerEntity({
  id: 'alice-ceo',
  type: 'person',
  capabilities: ceo.getSkills(),
  trustLevel: 1.0,
  currentLoad: 0,
  connections: ['bob-cto'],
});

routingSystem.registerEntity({
  id: 'bob-cto',
  type: 'person',
  capabilities: cto.getSkills(),
  trustLevel: 0.9,
  currentLoad: 0,
  connections: ['alice-ceo', 'carol-em', 'david-em'],
});

routingSystem.addConnection('alice-ceo', 'bob-cto');
routingSystem.addConnection('bob-cto', 'carol-em');
routingSystem.addConnection('bob-cto', 'david-em');
routingSystem.addConnection('carol-em', 'eve-senior');
routingSystem.addConnection('eve-senior', 'frank-engineer');
routingSystem.addConnection('david-em', 'grace-senior');
routingSystem.addConnection('grace-senior', 'henry-engineer');

console.log('✅ Organization structure created successfully!\n');

// Demonstrate federated agency in action
async function demonstrateFederatedAgency() {
  console.log('🚀 Demonstrating federated agency...\n');

  // Scenario 1: CEO delegates a strategic technical decision to CTO
  console.log('📋 Scenario 1: Strategic Technical Decision');
  console.log('CEO Alice needs to make a decision about mobile app architecture...\n');

  const strategicTask = await ceo.delegate({
    priority: 'high',
    payload: {
      task: 'We need to decide on the architecture for our new mobile app. Should we go with a native approach for each platform or use a cross-platform framework like React Native or Flutter? Consider performance, development speed, and long-term maintenance.',
      requiredCapabilities: ['technical-architecture', 'mobile-development'],
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      context: {
        budget: 'medium',
        timeline: '6 months',
        teamSize: '4 engineers',
      },
    },
  });

  console.log('Strategic delegation result:', strategicTask);
  console.log('');

  // Scenario 2: Cross-project collaboration
  console.log('📋 Scenario 2: Cross-Project Collaboration');
  console.log('Mobile team needs platform team input on API design...\n');

  const collaborationResult = await techCorp.coordinateCrossProjectCollaboration(
    'API Design for Mobile App V2',
    'review',
    ['mobile-app-v2', 'platform-infrastructure'],
    {
      duration: '2 hours',
      format: 'technical-review',
      deliverables: ['api-specification', 'security-requirements'],
    }
  );

  console.log('Collaboration result:', collaborationResult);
  console.log('');

  // Scenario 3: Automatic task routing based on capabilities
  console.log('📋 Scenario 3: Automatic Task Routing');
  console.log('Organization receives a task that needs iOS expertise...\n');

  const iOSTask = await techCorp.coordinateTask(
    'Implement biometric authentication for iOS app login',
    {
      requiredCapabilities: ['ios-development', 'security'],
      priority: 'medium',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      context: {
        feature: 'biometric-auth',
        platforms: ['ios'],
        securityLevel: 'high',
      },
    }
  );

  console.log('iOS task routing result:', iOSTask);
  console.log('');

  // Scenario 4: Individual person delegation
  console.log('📋 Scenario 4: Individual Person Delegation');
  console.log('Senior engineer Eve delegates code review to Frank...\n');

  const codeReviewTask = await mobileSenior.delegate({
    priority: 'medium',
    payload: {
      task: 'Please review this pull request for the new user profile screen implementation. Check for code quality, iOS best practices, and potential performance issues.',
      requiredCapabilities: ['ios-development', 'code-review'],
      context: {
        pullRequest: 'PR #123',
        files: ['ProfileViewController.swift', 'ProfileView.swift'],
        complexity: 'medium',
      },
    },
  });

  console.log('Code review delegation result:', codeReviewTask);
  console.log('');

  // Get organization status
  console.log('📊 Final Organization Status:');
  const orgStatus = techCorp.getOrganizationStatus();
  console.log(JSON.stringify(orgStatus, null, 2));
  console.log('');

  // Get federation statistics
  console.log('📈 Federation Statistics:');
  const fedStats = federationCoordinator.getStatistics();
  console.log(JSON.stringify(fedStats, null, 2));
  console.log('');

  console.log('✅ Federated agency demonstration complete!');
}

// Run the demonstration
demonstrateFederatedAgency().catch(console.error);