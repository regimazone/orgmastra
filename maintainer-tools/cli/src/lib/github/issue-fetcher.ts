import { execa } from 'execa';
import chalk from 'chalk';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  html_url: string;
  state: string;
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  comments: number;
  assignees: Array<{ login: string }>;
}

export interface IssueComment {
  id: number;
  body: string;
  created_at: string;
  user: {
    login: string;
  };
}

export class GitHubIssueFetcher {
  private useGhCli: boolean;
  private owner: string;
  private repo: string;

  constructor(token: string, repository: string = 'mastra-ai/mastra') {
    this.useGhCli = token === 'gh-cli';
    const [owner, repo] = repository.split('/');
    this.owner = owner;
    this.repo = repo;
  }

  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    try {
      // Use gh CLI to fetch issue
      const { stdout } = await execa('gh', [
        'issue', 
        'view', 
        issueNumber.toString(),
        '--repo', `${this.owner}/${this.repo}`,
        '--json', 'number,title,body,url,state,labels,createdAt,updatedAt,author,comments,assignees'
      ]);

      const data = JSON.parse(stdout);
      
      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        html_url: data.url,
        state: data.state.toLowerCase(),
        labels: data.labels.map((label: any) => ({
          name: label.name,
          color: label.color
        })),
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        user: {
          login: data.author?.login || 'unknown',
          avatar_url: '' // gh CLI doesn't provide avatar URLs
        },
        comments: data.comments?.length || 0,
        assignees: data.assignees?.map((a: any) => ({ login: a.login })) || []
      };
    } catch (error) {
      if (error.stderr?.includes('no issue found')) {
        throw new Error(`Issue #${issueNumber} not found in ${this.owner}/${this.repo}`);
      }
      throw error;
    }
  }

  async getRecentIssues(limit: number = 10): Promise<GitHubIssue[]> {
    // Use gh CLI to list recent issues
    const { stdout } = await execa('gh', [
      'issue', 
      'list',
      '--repo', `${this.owner}/${this.repo}`,
      '--state', 'open',
      '--limit', limit.toString(),
      '--json', 'number,title,body,url,state,labels,createdAt,updatedAt,author,comments,assignees'
    ]);

    const data = JSON.parse(stdout);
    
    return data.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      html_url: issue.url,
      state: issue.state.toLowerCase(),
      labels: issue.labels.map((label: any) => ({
        name: label.name,
        color: label.color
      })),
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      user: {
        login: issue.author?.login || 'unknown',
        avatar_url: ''
      },
      comments: issue.comments?.length || 0,
      assignees: issue.assignees?.map((a: any) => ({ login: a.login })) || []
    }));
  }

  async getIssueComments(issueNumber: number): Promise<IssueComment[]> {
    // Use gh CLI to get issue with comments
    const { stdout } = await execa('gh', [
      'issue', 
      'view', 
      issueNumber.toString(),
      '--repo', `${this.owner}/${this.repo}`,
      '--comments',
      '--json', 'comments'
    ]);

    const data = JSON.parse(stdout);
    
    return (data.comments || []).map((comment: any) => ({
      id: comment.id || 0,
      body: comment.body || '',
      created_at: comment.createdAt,
      user: {
        login: comment.author?.login || 'unknown'
      }
    }));
  }

  async searchIssues(query: string): Promise<GitHubIssue[]> {
    // Use gh CLI to search issues
    const { stdout } = await execa('gh', [
      'search', 
      'issues',
      query,
      '--repo', `${this.owner}/${this.repo}`,
      '--state', 'open',
      '--limit', '20',
      '--json', 'number,title,body,url,state,labels,createdAt,updatedAt,author,comments,assignees'
    ]);

    const data = JSON.parse(stdout);
    
    return data.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      html_url: issue.url,
      state: issue.state?.toLowerCase() || 'open',
      labels: issue.labels?.map((label: any) => ({
        name: label.name,
        color: label.color
      })) || [],
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      user: {
        login: issue.author?.login || 'unknown',
        avatar_url: ''
      },
      comments: issue.comments?.length || 0,
      assignees: issue.assignees?.map((a: any) => ({ login: a.login })) || []
    }));
  }

  async getAssignedIssues(): Promise<GitHubIssue[]> {
    // Use gh CLI to get issues assigned to the current user
    const { stdout } = await execa('gh', [
      'issue', 
      'list',
      '--repo', `${this.owner}/${this.repo}`,
      '--assignee', '@me',
      '--state', 'open',
      '--limit', '30',
      '--json', 'number,title,body,url,state,labels,createdAt,updatedAt,author,comments,assignees'
    ]);

    const data = JSON.parse(stdout);
    
    return data.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      html_url: issue.url,
      state: issue.state.toLowerCase(),
      labels: issue.labels.map((label: any) => ({
        name: label.name,
        color: label.color
      })),
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      user: {
        login: issue.author?.login || 'unknown',
        avatar_url: ''
      },
      comments: issue.comments?.length || 0,
      assignees: issue.assignees?.map((a: any) => ({ login: a.login })) || []
    }));
  }

  async getIssuesByLabel(label: string): Promise<GitHubIssue[]> {
    // Use gh CLI to get issues by label
    const { stdout } = await execa('gh', [
      'issue', 
      'list',
      '--repo', `${this.owner}/${this.repo}`,
      '--label', label,
      '--state', 'open',
      '--limit', '30',
      '--json', 'number,title,body,url,state,labels,createdAt,updatedAt,author,comments,assignees'
    ]);

    const data = JSON.parse(stdout);
    
    return data.map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      html_url: issue.url,
      state: issue.state.toLowerCase(),
      labels: issue.labels.map((label: any) => ({
        name: label.name,
        color: label.color
      })),
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
      user: {
        login: issue.author?.login || 'unknown',
        avatar_url: ''
      },
      comments: issue.comments?.length || 0,
      assignees: issue.assignees?.map((a: any) => ({ login: a.login })) || []
    }));
  }

  parseIssueUrl(url: string): number | null {
    const match = url.match(/github\.com\/[\w-]+\/[\w-]+\/issues\/(\d+)/);
    return match ? parseInt(match[1]) : null;
  }

  formatIssueForDebug(issue: GitHubIssue, comments?: IssueComment[]): string {
    let formatted = `# Issue #${issue.number}: ${issue.title}\n\n`;
    formatted += `**Status:** ${issue.state}\n`;
    formatted += `**Created by:** @${issue.user.login}\n`;
    formatted += `**Labels:** ${issue.labels.map(l => l.name).join(', ') || 'None'}\n`;
    formatted += `**URL:** ${issue.html_url}\n\n`;
    
    formatted += `## Description\n\n${issue.body || 'No description provided'}\n\n`;

    if (comments && comments.length > 0) {
      formatted += `## Comments (${comments.length})\n\n`;
      comments.forEach(comment => {
        formatted += `### @${comment.user.login} - ${new Date(comment.created_at).toLocaleString()}\n\n`;
        formatted += `${comment.body}\n\n`;
      });
    }

    return formatted;
  }
}