import { vi } from 'vitest';

export const mockIssueData = {
  number: 123,
  title: "Test issue for debugging",
  body: "This is a test issue body with some details about the problem.",
  url: "https://github.com/mastra-ai/mastra/issues/123",
  state: "open",
  labels: [
    { name: "bug", color: "d73a4a" },
    { name: "help wanted", color: "008672" }
  ],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  author: { login: "testuser" },
  comments: [],
  assignees: []
};

export const mockIssueWithComments = {
  ...mockIssueData,
  comments: [
    {
      id: 1,
      body: "I've investigated this issue and found the root cause.",
      createdAt: "2024-01-01T12:00:00Z",
      author: { login: "contributor1" }
    },
    {
      id: 2,
      body: "Here's a potential fix for this problem.",
      createdAt: "2024-01-01T14:00:00Z",
      author: { login: "contributor2" }
    }
  ]
};

export const mockIssuesList = [
  {
    number: 100,
    title: "Feature request: Add new functionality",
    body: "Would be great to have this feature",
    url: "https://github.com/mastra-ai/mastra/issues/100",
    state: "open",
    labels: [{ name: "enhancement", color: "a2eeef" }],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    author: { login: "user1" },
    comments: [],
    assignees: []
  },
  {
    number: 101,
    title: "Bug: Application crashes on startup",
    body: "The app crashes when...",
    url: "https://github.com/mastra-ai/mastra/issues/101",
    state: "open",
    labels: [{ name: "bug", color: "d73a4a" }],
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    author: { login: "user2" },
    comments: [],
    assignees: [{ login: "testuser" }]
  }
];

export function setupGhMocks(execaMock: any) {
  // Mock gh --version (installed check)
  execaMock.mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === 'gh' && args[0] === '--version') {
      return { stdout: 'gh version 2.0.0 (2024-01-01)' };
    }
    
    // Mock gh auth status (authenticated check)
    if (cmd === 'gh' && args[0] === 'auth' && args[1] === 'status') {
      return { stdout: 'Logged in to github.com as testuser' };
    }
    
    // Mock gh issue view
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') {
      const issueNumber = args[2];
      if (issueNumber === '123') {
        return { stdout: JSON.stringify(mockIssueData) };
      } else if (issueNumber === '456') {
        return { stdout: JSON.stringify(mockIssueWithComments) };
      }
      throw new Error(`no issue found for ${issueNumber}`);
    }
    
    // Mock gh issue list
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'list') {
      if (args.includes('--assignee') && args.includes('@me')) {
        // Return only assigned issues
        return { 
          stdout: JSON.stringify(mockIssuesList.filter(i => i.assignees.some(a => a.login === 'testuser')))
        };
      }
      return { stdout: JSON.stringify(mockIssuesList) };
    }
    
    // Mock gh search issues
    if (cmd === 'gh' && args[0] === 'search' && args[1] === 'issues') {
      const query = args[2];
      if (query.includes('bug')) {
        return { 
          stdout: JSON.stringify(mockIssuesList.filter(i => i.labels.some(l => l.name === 'bug')))
        };
      }
      return { stdout: JSON.stringify([]) };
    }
    
    // Default case - command not mocked
    throw new Error(`Command not mocked: ${cmd} ${args.join(' ')}`);
  });
}

export function setupGhNotInstalledMock(execaMock: any) {
  execaMock.mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === 'gh' && args[0] === '--version') {
      throw new Error('command not found: gh');
    }
    throw new Error(`Command not mocked: ${cmd} ${args.join(' ')}`);
  });
}

export function setupGhNotAuthenticatedMock(execaMock: any) {
  execaMock.mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === 'gh' && args[0] === '--version') {
      return { stdout: 'gh version 2.0.0 (2024-01-01)' };
    }
    if (cmd === 'gh' && args[0] === 'auth' && args[1] === 'status') {
      throw new Error('You are not logged into any GitHub hosts');
    }
    throw new Error(`Command not mocked: ${cmd} ${args.join(' ')}`);
  });
}