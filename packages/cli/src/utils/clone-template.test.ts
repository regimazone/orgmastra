import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import child_process from 'node:child_process';
import util from 'node:util';

// Mock the logger
vi.mock('./logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    break: vi.fn(),
  },
}));

// Mock yocto-spinner
vi.mock('yocto-spinner', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock child_process.exec
vi.mock('node:child_process', () => ({
  default: {
    exec: vi.fn(),
  },
}));

// Mock util.promisify and path
vi.mock('node:util', () => ({
  default: {
    promisify: vi.fn(fn => fn),
  },
}));

vi.mock('path', () => ({
  default: {
    resolve: vi.fn((...args) => args.join('/')),
    join: vi.fn((...args) => args.join('/')),
  },
  resolve: vi.fn((...args) => args.join('/')),
  join: vi.fn((...args) => args.join('/')),
}));

beforeEach(() => {
  vol.reset();
  vi.resetAllMocks();
});

// Mock fs after importing vol
vi.mock('fs/promises', async () => {
  const memfs = await vi.importActual('memfs');
  return {
    default: memfs.fs.promises,
    ...memfs.fs.promises,
  };
});

describe('clone-template', () => {
  describe('cloneTemplate', () => {
    const mockTemplate = {
      url: 'https://github.com/mastra-ai/template-test',
      name: 'Test Template',
      slug: 'template-test',
      agents: [],
      mcp: [],
      tools: [],
      networks: [],
      workflows: [],
    };

    it('should clone template successfully using degit', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      vol.fromJSON({
        '/test-project/package.json': JSON.stringify({ name: 'old-name' }),
      });

      const { cloneTemplate } = await import('./clone-template');
      const result = await cloneTemplate({
        template: mockTemplate,
        projectName: 'test-project',
      });

      expect(result).toBe('/test-project');
      expect(mockExec).toHaveBeenCalledWith('npx degit mastra-ai/template-test "/test-project"', {
        cwd: process.cwd(),
      });
    });

    it('should fallback to git clone when degit fails', async () => {
      const mockExec = vi
        .fn()
        .mockRejectedValueOnce(new Error('degit failed'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git clone succeeds

      vi.mocked(child_process.exec).mockImplementation(mockExec);

      vol.fromJSON({
        '/test-project/.git/config': 'git config',
        '/test-project/package.json': JSON.stringify({ name: 'old-name' }),
      });

      const { cloneTemplate } = await import('./clone-template');
      const result = await cloneTemplate({
        template: mockTemplate,
        projectName: 'test-project',
      });

      expect(result).toBe('/test-project');
      expect(mockExec).toHaveBeenCalledWith('npx degit mastra-ai/template-test "/test-project"', {
        cwd: process.cwd(),
      });
      expect(mockExec).toHaveBeenCalledWith('git clone "https://github.com/mastra-ai/template-test" "/test-project"', {
        cwd: process.cwd(),
      });
    });

    it('should update package.json with new project name', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      vol.fromJSON({
        '/test-project/package.json': JSON.stringify({ name: 'old-name', version: '1.0.0' }),
      });

      const { cloneTemplate } = await import('./clone-template');
      await cloneTemplate({
        template: mockTemplate,
        projectName: 'test-project',
      });

      const fs = await import('fs/promises');
      const packageJsonContent = await fs.readFile('/test-project/package.json', 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      expect(packageJson.name).toBe('test-project');
      expect(packageJson.version).toBe('1.0.0'); // Should preserve other fields
    });

    it('should handle missing package.json gracefully', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      const { logger } = await import('./logger');
      const { cloneTemplate } = await import('./clone-template');

      const result = await cloneTemplate({
        template: mockTemplate,
        projectName: 'test-project',
      });

      expect(result).toBe('/test-project');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Could not update package.json'));
    });

    it('should throw error if directory already exists', async () => {
      vol.fromJSON({
        '/existing-project/some-file.txt': 'content',
      });

      const { cloneTemplate } = await import('./clone-template');

      await expect(
        cloneTemplate({
          template: mockTemplate,
          projectName: 'existing-project',
        }),
      ).rejects.toThrow('Directory existing-project already exists');
    });

    it('should throw error if both degit and git clone fail', async () => {
      const mockExec = vi
        .fn()
        .mockRejectedValueOnce(new Error('degit failed'))
        .mockRejectedValueOnce(new Error('git clone failed'));

      vi.mocked(child_process.exec).mockImplementation(mockExec);

      const { cloneTemplate } = await import('./clone-template');

      await expect(
        cloneTemplate({
          template: mockTemplate,
          projectName: 'test-project',
        }),
      ).rejects.toThrow('Failed to clone repository');
    });

    it('should use custom target directory when provided', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      const { cloneTemplate } = await import('./clone-template');
      const result = await cloneTemplate({
        template: mockTemplate,
        projectName: 'test-project',
        targetDir: '/custom/path',
      });

      expect(result).toBe('/custom/path/test-project');
      expect(mockExec).toHaveBeenCalledWith('npx degit mastra-ai/template-test "/custom/path/test-project"', {
        cwd: process.cwd(),
      });
    });
  });

  describe('installDependencies', () => {
    it('should install dependencies with detected package manager', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      vol.fromJSON({
        '/test-project/pnpm-lock.yaml': 'lockfile content',
      });

      const { installDependencies } = await import('./clone-template');
      await installDependencies('/test-project');

      expect(mockExec).toHaveBeenCalledWith('pnpm install', {
        cwd: '/test-project',
      });
    });

    it('should use provided package manager', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      const { installDependencies } = await import('./clone-template');
      await installDependencies('/test-project', 'yarn');

      expect(mockExec).toHaveBeenCalledWith('yarn install', {
        cwd: '/test-project',
      });
    });

    it('should default to npm when no lock file is found', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      const { installDependencies } = await import('./clone-template');
      await installDependencies('/test-project');

      expect(mockExec).toHaveBeenCalledWith('npm install', {
        cwd: '/test-project',
      });
    });

    it('should detect yarn from yarn.lock', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      vol.fromJSON({
        '/test-project/yarn.lock': 'yarn lockfile',
      });

      const { installDependencies } = await import('./clone-template');
      await installDependencies('/test-project');

      expect(mockExec).toHaveBeenCalledWith('yarn install', {
        cwd: '/test-project',
      });
    });

    it('should detect npm from package-lock.json', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      vol.fromJSON({
        '/test-project/package-lock.json': 'npm lockfile',
      });

      const { installDependencies } = await import('./clone-template');
      await installDependencies('/test-project');

      expect(mockExec).toHaveBeenCalledWith('npm install', {
        cwd: '/test-project',
      });
    });

    it('should throw error if dependency installation fails', async () => {
      const mockExec = vi.fn().mockRejectedValue(new Error('Install failed'));
      vi.mocked(child_process.exec).mockImplementation(mockExec);

      const { installDependencies } = await import('./clone-template');

      await expect(installDependencies('/test-project')).rejects.toThrow('Failed to install dependencies');
    });
  });
});
