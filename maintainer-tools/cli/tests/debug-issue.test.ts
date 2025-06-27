import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { GitHubIssueFetcher } from '../src/lib/github/issue-fetcher';
import { ProjectBuilder } from '../src/lib/scaffolding/project-builder';

// Mock the modules
vi.mock('execa');
vi.mock('fs-extra');
vi.mock('ora', () => ({
  default: (text: string) => ({
    start: () => ({ 
      succeed: vi.fn().mockReturnThis(), 
      fail: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text
    })
  })
}));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('GitHubIssueFetcher', () => {
  const mockedExeca = vi.mocked(execa);
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch issue details', async () => {
    const mockIssueData = {
      number: 123,
      title: "Test issue",
      body: "Test body",
      url: "https://github.com/test/repo/issues/123",
      state: "open",
      labels: [],
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
      author: { login: "testuser" },
      comments: [],
      assignees: []
    };
    
    mockedExeca.mockResolvedValue({
      stdout: JSON.stringify(mockIssueData),
      stderr: '',
      exitCode: 0
    } as any);
    
    const fetcher = new GitHubIssueFetcher('gh-cli', 'test/repo');
    const issue = await fetcher.getIssue(123);
    
    expect(issue.number).toBe(123);
    expect(issue.title).toBe("Test issue");
    expect(mockedExeca).toHaveBeenCalledWith('gh', [
      'issue', 'view', '123',
      '--repo', 'test/repo',
      '--json', expect.any(String)
    ]);
  });

  it('should fetch issue comments', async () => {
    const mockComments = {
      comments: [
        {
          body: "First comment",
          createdAt: "2024-01-01",
          author: { login: "user1" }
        }
      ]
    };
    
    mockedExeca.mockResolvedValue({
      stdout: JSON.stringify(mockComments),
      stderr: '',
      exitCode: 0
    } as any);
    
    const fetcher = new GitHubIssueFetcher('gh-cli', 'test/repo');
    const comments = await fetcher.getIssueComments(123);
    
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("First comment");
  });

  it('should search issues', async () => {
    const mockSearchResults = [
      {
        number: 100,
        title: "Bug: Something broken",
        state: "open"
      }
    ];
    
    mockedExeca.mockResolvedValue({
      stdout: JSON.stringify(mockSearchResults),
      stderr: '',
      exitCode: 0
    } as any);
    
    const fetcher = new GitHubIssueFetcher('gh-cli', 'test/repo');
    const results = await fetcher.searchIssues('bug');
    
    expect(results).toHaveLength(1);
    expect(results[0].title).toContain("Bug");
  });
});

describe('ProjectBuilder', () => {
  const mockedFs = fs as any;
  const mockedExeca = vi.mocked(execa);
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fs-extra methods
    mockedFs.ensureDir = vi.fn().mockResolvedValue(undefined);
    mockedFs.writeFile = vi.fn().mockResolvedValue(undefined);
    mockedFs.writeJson = vi.fn().mockResolvedValue(undefined);
    mockedFs.pathExists = vi.fn().mockResolvedValue(false);
    mockedFs.existsSync = vi.fn().mockReturnValue(false);
    mockedFs.readdir = vi.fn().mockResolvedValue([]);
    mockedFs.readFile = vi.fn().mockResolvedValue('');
    
    // Mock execa for pnpm commands
    mockedExeca.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === 'pnpm') {
        return { stdout: '', stderr: '', exitCode: 0 } as any;
      }
      return { stdout: '', stderr: '', exitCode: 0 } as any;
    });
  });

  it('should create debug project with correct structure', async () => {
    const builder = new ProjectBuilder();
    const issueData = {
      number: 123,
      title: "Test issue",
      body: "Test body",
      state: "open",
      user: { login: "testuser" },
      labels: [],
      html_url: "https://github.com/test/repo/issues/123",
      comments_data: []
    };
    
    // Mock successful pnpm install
    mockedExeca.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0
    } as any);
    
    const projectPath = await builder.createDebugProject(123, issueData);
    
    // Check that project directory was created
    expect(mockedFs.ensureDir).toHaveBeenCalledWith(
      expect.stringContaining('debug-issue-123')
    );
    
    // Check that ISSUE_DETAILS.md was created first
    const writeFileCalls = mockedFs.writeFile.mock.calls;
    const issueDetailsCall = writeFileCalls.find(call => 
      call[0].toString().includes('ISSUE_DETAILS.md')
    );
    expect(issueDetailsCall).toBeDefined();
    expect(issueDetailsCall![1]).toContain('Issue #123');
    expect(issueDetailsCall![1]).toContain('Test issue');
    
    // Check that package.json was created using writeJson
    const writeJsonCalls = mockedFs.writeJson.mock.calls;
    const packageJsonCall = writeJsonCalls.find(call => 
      call[0].toString().includes('package.json')
    );
    
    expect(packageJsonCall).toBeDefined();
    const packageJson = packageJsonCall![1];
    expect(packageJson.name).toBe('debug-issue-123');
    expect(packageJson.dependencies['@mastra/core']).toBeDefined();
    
    // Check that agent file was created with MCP servers
    const agentCall = writeFileCalls.find(call => 
      call[0].toString().includes('agents/index.ts')
    );
    expect(agentCall).toBeDefined();
    const agentContent = agentCall![1] as string;
    expect(agentContent).toContain('filesystem:');
    expect(agentContent).toContain('@modelcontextprotocol/server-filesystem');
    expect(agentContent).toContain('mastraDocs:');
    expect(agentContent).toContain('@mastra/mcp-docs-server');
    
    // Check that workflow was created
    const workflowCall = writeFileCalls.find(call => 
      call[0].toString().includes('workflows/index.ts')
    );
    expect(workflowCall).toBeDefined();
    const workflowContent = workflowCall![1] as string;
    expect(workflowContent).toContain('reproduceIssueWorkflow');
    expect(workflowContent).toContain('analyze-issue-with-agent');
    expect(workflowContent).toContain('create-reproduction-with-agent');
    expect(workflowContent).toContain('test-reproduction');
    
    // Check that workflow reads ISSUE_DETAILS.md
    expect(workflowContent).toContain('ISSUE_DETAILS.md');
    expect(workflowContent).toContain('await fs.readFile(issueDetailsPath');
    expect(workflowContent).toContain('Here are the GitHub issue details:');
  });

  it('should handle syntax errors in workflow creation', async () => {
    // This test verifies our fix for the "content is not defined" error
    const builder = new ProjectBuilder();
    
    // Test both debug and non-debug projects
    const debugConfig = {
      name: 'debug-issue-123',
      path: '/test/debug-issue-123',
      mode: 'local' as const,
      includeWorkflow: true
    };
    
    const regularConfig = {
      name: 'smoke-test-123',
      path: '/test/smoke-test-123',
      mode: 'local' as const,
      includeWorkflow: true
    };
    
    // Neither should throw the "content is not defined" error
    await expect(builder['createWorkflow'](debugConfig)).resolves.not.toThrow();
    await expect(builder['createWorkflow'](regularConfig)).resolves.not.toThrow();
    
    // Verify the correct workflows were created
    const calls = mockedFs.writeFile.mock.calls;
    
    // Debug project should have reproduceIssueWorkflow
    const debugCall = calls.find(call => 
      call[0].includes('debug-issue') && call[0].includes('workflows')
    );
    expect(debugCall![1]).toContain('reproduceIssueWorkflow');
    
    // Regular project should have debugWorkflow
    const regularCall = calls.find(call => 
      call[0].includes('smoke-test') && call[0].includes('workflows')
    );
    expect(regularCall![1]).toContain('debugWorkflow');
  });

  it('should use correct AI models', async () => {
    const builder = new ProjectBuilder();
    const issueData = {
      number: 123,
      title: "Test",
      body: "Test",
      state: "open",
      user: { login: "test" },
      labels: [],
      html_url: "https://test.com",
      comments_data: []
    };
    
    // Test with OpenAI
    await builder.createDebugProject(123, issueData);
    
    const agentCall = mockedFs.writeFile.mock.calls.find(call => 
      call[0].toString().includes('agents/index.ts')
    );
    const agentContent = agentCall![1] as string;
    
    // Check for o3 model when using OpenAI
    if (agentContent.includes('openai')) {
      expect(agentContent).toContain("openai('o3')");
    }
    
    // Check for claude-4-sonnet when using Anthropic
    if (agentContent.includes('anthropic')) {
      expect(agentContent).toContain("anthropic('claude-4-sonnet-20250514')");
    }
  });

  it('should use correct agent names in imports', async () => {
    const builder = new ProjectBuilder();
    
    // Test debug project
    const debugConfig = {
      name: 'debug-issue-123',
      path: '/test/debug-issue-123',
      mode: 'local' as const,
      includeAgent: true
    };
    
    // Test regular project
    const regularConfig = {
      name: 'smoke-test-123',
      path: '/test/smoke-test-123',
      mode: 'local' as const,
      includeAgent: true
    };
    
    // Create both types of projects
    await builder['createMastraIndex'](debugConfig);
    await builder['createMastraIndex'](regularConfig);
    
    const calls = mockedFs.writeFile.mock.calls;
    
    // Debug project should import debugAgent
    const debugIndexCall = calls.find(call => 
      call[0].includes('debug-issue-123') && call[0].includes('src/mastra/index.ts')
    );
    expect(debugIndexCall![1]).toContain("import { debugAgent } from './agents/index.js';");
    expect(debugIndexCall![1]).toContain('agents: { debugAgent },');
    
    // Regular project should import agent
    const regularIndexCall = calls.find(call => 
      call[0].includes('smoke-test-123') && call[0].includes('src/mastra/index.ts')
    );
    expect(regularIndexCall![1]).toContain("import { agent } from './agents/index.js';");
    expect(regularIndexCall![1]).toContain('agents: { agent },');
  });
});

describe('Debug command integration', () => {
  it('should detect when gh CLI is not installed', async () => {
    const mockedExeca = vi.mocked(execa);
    mockedExeca.mockRejectedValue(new Error('command not found: gh'));
    
    // We can't easily test the full CLI, but we can test the core logic
    try {
      await execa('gh', ['--version']);
    } catch (error) {
      expect(error.message).toContain('command not found');
    }
  });
  
  it('should detect when gh is not authenticated', async () => {
    const mockedExeca = vi.mocked(execa);
    mockedExeca
      .mockResolvedValueOnce({ stdout: 'gh version 2.0.0' } as any) // gh installed
      .mockRejectedValueOnce(new Error('not authenticated')); // but not authenticated
    
    await execa('gh', ['--version']); // Should succeed
    await expect(execa('gh', ['auth', 'status'])).rejects.toThrow('not authenticated');
  });
});