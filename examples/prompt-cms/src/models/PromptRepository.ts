import Database from '../database/connection.js';
import { randomUUID } from 'crypto';
import type {
  Prompt,
  PromptVersion,
  PromptExecution,
  CreatePrompt,
  UpdatePrompt,
  CreateVersion,
  PromptWithVersions,
  PromptStats,
} from '../types/index.js';

export class PromptRepository {
  private db: Database.Database;

  constructor() {
    this.db = Database;
  }

  // Prompt CRUD operations
  async createPrompt(data: CreatePrompt, createdBy?: string): Promise<Prompt> {
    const id = randomUUID();
    const now = new Date();

    const prompt: Prompt = {
      id,
      name: data.name,
      description: data.description,
      category: data.category,
      tags: data.tags,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    const stmt = this.db.prepare(`
      INSERT INTO prompts (id, name, description, category, tags, is_active, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      prompt.id,
      prompt.name,
      prompt.description,
      prompt.category,
      JSON.stringify(prompt.tags),
      prompt.isActive ? 1 : 0,
      prompt.createdAt.toISOString(),
      prompt.updatedAt.toISOString(),
      prompt.createdBy,
    );

    // Create initial version
    await this.createVersion(
      id,
      {
        content: data.content,
        variables: data.variables,
        metadata: data.metadata,
        version: '1.0.0',
      },
      createdBy,
    );

    return prompt;
  }

  async getPromptById(id: string): Promise<Prompt | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM prompts WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapRowToPrompt(row);
  }

  async getPromptByName(name: string): Promise<Prompt | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM prompts WHERE name = ?
    `);

    const row = stmt.get(name) as any;
    if (!row) return null;

    return this.mapRowToPrompt(row);
  }

  async getAllPrompts(activeOnly: boolean = false): Promise<Prompt[]> {
    let query = 'SELECT * FROM prompts';
    if (activeOnly) {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY updated_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all() as any[];

    return rows.map(row => this.mapRowToPrompt(row));
  }

  async updatePrompt(id: string, data: UpdatePrompt): Promise<Prompt | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description);
    }
    if (data.category !== undefined) {
      updates.push('category = ?');
      values.push(data.category);
    }
    if (data.tags !== undefined) {
      updates.push('tags = ?');
      values.push(JSON.stringify(data.tags));
    }
    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return this.getPromptById(id);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE prompts SET ${updates.join(', ')} WHERE id = ?
    `);

    const result = stmt.run(...values);
    if (result.changes === 0) return null;

    return this.getPromptById(id);
  }

  async deletePrompt(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM prompts WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Version operations
  async createVersion(promptId: string, data: CreateVersion, createdBy?: string): Promise<PromptVersion> {
    const id = randomUUID();
    const version = data.version || (await this.generateNextVersion(promptId));

    const promptVersion: PromptVersion = {
      id,
      promptId,
      version,
      content: data.content,
      variables: data.variables,
      metadata: data.metadata,
      isPublished: false,
      createdAt: new Date(),
      createdBy,
    };

    const stmt = this.db.prepare(`
      INSERT INTO prompt_versions (id, prompt_id, version, content, variables, metadata, is_published, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      promptVersion.id,
      promptVersion.promptId,
      promptVersion.version,
      promptVersion.content,
      JSON.stringify(promptVersion.variables),
      JSON.stringify(promptVersion.metadata),
      promptVersion.isPublished ? 1 : 0,
      promptVersion.createdAt.toISOString(),
      promptVersion.createdBy,
    );

    return promptVersion;
  }

  async getVersionsByPromptId(promptId: string): Promise<PromptVersion[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY created_at DESC
    `);

    const rows = stmt.all(promptId) as any[];
    return rows.map(row => this.mapRowToPromptVersion(row));
  }

  async getVersionById(id: string): Promise<PromptVersion | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM prompt_versions WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapRowToPromptVersion(row);
  }

  async getVersionByPromptAndVersion(promptId: string, version: string): Promise<PromptVersion | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM prompt_versions WHERE prompt_id = ? AND version = ?
    `);

    const row = stmt.get(promptId, version) as any;
    if (!row) return null;

    return this.mapRowToPromptVersion(row);
  }

  async getPublishedVersion(promptId: string): Promise<PromptVersion | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM prompt_versions 
      WHERE prompt_id = ? AND is_published = 1 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    const row = stmt.get(promptId) as any;
    if (!row) return null;

    return this.mapRowToPromptVersion(row);
  }

  async publishVersion(versionId: string): Promise<boolean> {
    // First unpublish all versions for this prompt
    const version = await this.getVersionById(versionId);
    if (!version) return false;

    const unpublishStmt = this.db.prepare(`
      UPDATE prompt_versions SET is_published = 0 WHERE prompt_id = ?
    `);
    unpublishStmt.run(version.promptId);

    // Then publish the specified version
    const publishStmt = this.db.prepare(`
      UPDATE prompt_versions SET is_published = 1 WHERE id = ?
    `);
    const result = publishStmt.run(versionId);

    return result.changes > 0;
  }

  // Execution operations
  async recordExecution(execution: Omit<PromptExecution, 'id' | 'executedAt'>): Promise<PromptExecution> {
    const id = randomUUID();
    const executedAt = new Date();

    const fullExecution: PromptExecution = {
      ...execution,
      id,
      executedAt,
    };

    const stmt = this.db.prepare(`
      INSERT INTO prompt_executions (id, prompt_version_id, input, output, model, tokens, duration, success, error, executed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullExecution.id,
      fullExecution.promptVersionId,
      JSON.stringify(fullExecution.input),
      fullExecution.output,
      fullExecution.model,
      fullExecution.tokens,
      fullExecution.duration,
      fullExecution.success ? 1 : 0,
      fullExecution.error,
      fullExecution.executedAt.toISOString(),
    );

    return fullExecution;
  }

  async getExecutionsByVersionId(versionId: string, limit: number = 50): Promise<PromptExecution[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM prompt_executions 
      WHERE prompt_version_id = ? 
      ORDER BY executed_at DESC 
      LIMIT ?
    `);

    const rows = stmt.all(versionId, limit) as any[];
    return rows.map(row => this.mapRowToPromptExecution(row));
  }

  // Utility methods
  async getPromptWithVersions(id: string): Promise<PromptWithVersions | null> {
    const prompt = await this.getPromptById(id);
    if (!prompt) return null;

    const versions = await this.getVersionsByPromptId(id);
    const publishedVersion = await this.getPublishedVersion(id);
    const latestVersion = versions[0]; // Already sorted by created_at DESC

    return {
      ...prompt,
      versions,
      latestVersion,
      publishedVersion,
    };
  }

  async getStats(): Promise<PromptStats> {
    const totalPrompts = this.db.prepare('SELECT COUNT(*) as count FROM prompts').get() as any;
    const totalVersions = this.db.prepare('SELECT COUNT(*) as count FROM prompt_versions').get() as any;
    const totalExecutions = this.db.prepare('SELECT COUNT(*) as count FROM prompt_executions').get() as any;
    const recentExecutions = this.db
      .prepare(
        `
      SELECT COUNT(*) as count FROM prompt_executions 
      WHERE executed_at > datetime('now', '-24 hours')
    `,
      )
      .get() as any;

    return {
      totalPrompts: totalPrompts.count,
      totalVersions: totalVersions.count,
      totalExecutions: totalExecutions.count,
      recentExecutions: recentExecutions.count,
    };
  }

  private async generateNextVersion(promptId: string): Promise<string> {
    const versions = await this.getVersionsByPromptId(promptId);
    if (versions.length === 0) return '1.0.0';

    // Simple version increment logic (could be more sophisticated)
    const latestVersion = versions[0].version;
    const parts = latestVersion.split('.').map(Number);
    parts[2]++; // Increment patch version

    return parts.join('.');
  }

  private mapRowToPrompt(row: any): Prompt {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      tags: row.tags ? JSON.parse(row.tags) : [],
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      createdBy: row.created_by,
    };
  }

  private mapRowToPromptVersion(row: any): PromptVersion {
    return {
      id: row.id,
      promptId: row.prompt_id,
      version: row.version,
      content: row.content,
      variables: row.variables ? JSON.parse(row.variables) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      isPublished: Boolean(row.is_published),
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
    };
  }

  private mapRowToPromptExecution(row: any): PromptExecution {
    return {
      id: row.id,
      promptVersionId: row.prompt_version_id,
      input: JSON.parse(row.input),
      output: row.output,
      model: row.model,
      tokens: row.tokens,
      duration: row.duration,
      success: Boolean(row.success),
      error: row.error,
      executedAt: new Date(row.executed_at),
    };
  }
}
