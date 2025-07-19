import { MastraSandbox } from '../sandbox';
import type { SandboxConfig, SandboxInfo, ProcessConfig, ProcessResult } from '../types';

// Mock implementation for testing
class MockSandbox extends MastraSandbox {
  private sandboxes = new Map<string, SandboxInfo>();

  async create(config: SandboxConfig): Promise<SandboxInfo> {
    const id = `mock-${Date.now()}`;
    const info: SandboxInfo = {
      id,
      name: config.name,
      status: 'running',
      createdAt: new Date(),
      environment: config.environment || {},
    };
    this.sandboxes.set(id, info);
    return info;
  }

  async destroy(sandboxId: string): Promise<void> {
    this.sandboxes.delete(sandboxId);
  }

  async getInfo(sandboxId: string): Promise<SandboxInfo> {
    const info = this.sandboxes.get(sandboxId);
    if (!info) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }
    return info;
  }

  async listSandboxes(): Promise<SandboxInfo[]> {
    return Array.from(this.sandboxes.values());
  }

  async execute(sandboxId: string, config: ProcessConfig): Promise<ProcessResult> {
    // Mock execution
    return {
      processId: `proc-${Date.now()}`,
      exitCode: 0,
      output: `Executed: ${config.command} ${config.args?.join(' ') || ''}`,
      error: '',
      duration: 100,
      status: 'completed',
    };
  }

  async executeStream() {
    throw new Error('Stream execution not implemented in mock');
  }

  async kill() {
    // Mock kill
  }

  async uploadFile() {
    // Mock upload
  }

  async downloadFile() {
    // Mock download
  }

  async listFiles() {
    return [];
  }

  async getResourceUsage() {
    return {
      cpuUsage: 0.1,
      memoryUsage: 100,
      diskUsage: 50,
      networkUsage: 10,
    };
  }
}

describe('MastraSandbox', () => {
  let sandbox: MockSandbox;

  beforeEach(() => {
    sandbox = new MockSandbox({ name: 'test-sandbox' });
  });

  test('should create and destroy sandbox', async () => {
    const config = {
      name: 'test-env',
      environment: {
        env: { NODE_ENV: 'test' },
        timeout: 5000,
      },
    };

    const info = await sandbox.create(config);
    expect(info.name).toBe(config.name);
    expect(info.status).toBe('running');
    expect(info.id).toBeDefined();

    // Should be able to get info
    const retrievedInfo = await sandbox.getInfo(info.id);
    expect(retrievedInfo.id).toBe(info.id);

    // Should be in list
    const list = await sandbox.listSandboxes();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(info.id);

    // Should be able to destroy
    await sandbox.destroy(info.id);
    const emptyList = await sandbox.listSandboxes();
    expect(emptyList).toHaveLength(0);
  });

  test('should execute commands', async () => {
    const sandboxInfo = await sandbox.create({ name: 'exec-test' });

    const result = await sandbox.execute(sandboxInfo.id, {
      command: 'echo',
      args: ['hello', 'world'],
      environment: { timeout: 1000 },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('echo hello world');
    expect(result.status).toBe('completed');
    expect(result.processId).toBeDefined();
  });

  test('should get resource usage', async () => {
    const sandboxInfo = await sandbox.create({ name: 'resource-test' });

    const usage = await sandbox.getResourceUsage(sandboxInfo.id);
    expect(usage.cpuUsage).toBeDefined();
    expect(usage.memoryUsage).toBeDefined();
    expect(usage.diskUsage).toBeDefined();
    expect(usage.networkUsage).toBeDefined();
  });

  test('should handle non-existent sandbox', async () => {
    await expect(sandbox.getInfo('non-existent')).rejects.toThrow('not found');
  });

  test('should have correct logger component', () => {
    expect(sandbox['name']).toBe('test-sandbox');
  });
});