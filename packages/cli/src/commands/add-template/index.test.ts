import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';

// Mock the logger
vi.mock('../../utils/logger', () => ({
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

// Mock template utilities
vi.mock('../../utils/template-utils', () => ({
  loadTemplates: vi.fn(),
  selectTemplate: vi.fn(),
}));

// Mock fetch for downloading files
global.fetch = vi.fn();

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

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
  },
  join: vi.fn((...args) => args.join('/')),
}));

describe('add-template command', () => {
  const mockTemplate = {
    url: 'https://github.com/mastra-ai/template-test',
    name: 'Test Template',
    slug: 'template-test',
    agents: ['test-agent'],
    mcp: [],
    tools: ['test-tool'],
    networks: [],
    workflows: ['test-workflow'],
  };

  describe('addTemplate', () => {
    it('should add template to existing Mastra project', async () => {
      // Setup valid Mastra project
      vol.fromJSON({
        '/project/src/mastra/index.ts': 'export const mastra = new Mastra({})',
        '/project/src/mastra/agents/.gitkeep': '',
        '/project/src/mastra/tools/.gitkeep': '',
        '/project/src/mastra/workflows/.gitkeep': '',
      });

      const { loadTemplates, selectTemplate } = await import('../../utils/template-utils');
      vi.mocked(loadTemplates).mockResolvedValue([mockTemplate]);
      vi.mocked(selectTemplate).mockResolvedValue(mockTemplate);

      // Mock successful file downloads
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('// Agent code\nexport const testAgent = {};'),
      } as Response);

      // Change to project directory
      vi.spyOn(process, 'cwd').mockReturnValue('/project');

      // Mock path.join to return expected paths
      const path = await import('path');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));

      const { addTemplate } = await import('./index');
      await addTemplate({});

      // Verify files were created
      const fs = await import('fs/promises');
      expect(await fs.readFile('/project/src/mastra/agents/test-agent.ts', 'utf-8')).toBe(
        '// Agent code\nexport const testAgent = {};',
      );
      expect(await fs.readFile('/project/src/mastra/tools/test-tool.ts', 'utf-8')).toBe(
        '// Agent code\nexport const testAgent = {};',
      );
      expect(await fs.readFile('/project/src/mastra/workflows/test-workflow.ts', 'utf-8')).toBe(
        '// Agent code\nexport const testAgent = {};',
      );
    });

    it('should use custom directory when provided', async () => {
      vol.fromJSON({
        '/custom/mastra/index.ts': 'export const mastra = new Mastra({})',
      });

      const { loadTemplates, selectTemplate } = await import('../../utils/template-utils');
      vi.mocked(loadTemplates).mockResolvedValue([mockTemplate]);
      vi.mocked(selectTemplate).mockResolvedValue(mockTemplate);

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('// Template code'),
      } as Response);

      const { addTemplate } = await import('./index');
      await addTemplate({ dir: '/custom/mastra' });

      const fs = await import('fs/promises');
      expect(await fs.readFile('/custom/mastra/agents/test-agent.ts', 'utf-8')).toBe('// Template code');
    });

    it('should use relative directory path', async () => {
      vol.fromJSON({
        '/project/custom/mastra/index.ts': 'export const mastra = new Mastra({})',
      });

      vi.spyOn(process, 'cwd').mockReturnValue('/project');

      const { loadTemplates, selectTemplate } = await import('../../utils/template-utils');
      vi.mocked(loadTemplates).mockResolvedValue([mockTemplate]);
      vi.mocked(selectTemplate).mockResolvedValue(mockTemplate);

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('// Template code'),
      } as Response);

      const { addTemplate } = await import('./index');
      await addTemplate({ dir: 'custom/mastra' });

      const fs = await import('fs/promises');
      expect(await fs.readFile('/project/custom/mastra/agents/test-agent.ts', 'utf-8')).toBe('// Template code');
    });

    it('should exit if Mastra directory not found', async () => {
      // Don't create any directories in vol to simulate directory not found
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      vi.spyOn(process, 'cwd').mockReturnValue('/empty-project');

      const { logger } = await import('../../utils/logger');
      const { addTemplate } = await import('./index');

      await expect(addTemplate({})).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not find index.ts'));
    });

    it('should exit if index.ts does not exist', async () => {
      vol.fromJSON({
        '/project/src/mastra/agents/.gitkeep': '',
      });

      vi.spyOn(process, 'cwd').mockReturnValue('/project');

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const { logger } = await import('../../utils/logger');
      const { addTemplate } = await import('./index');

      await expect(addTemplate({})).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not find index.ts'));
    });

    it('should exit if index.ts does not contain Mastra export', async () => {
      vol.fromJSON({
        '/project/src/mastra/index.ts': 'export const somethingElse = {};',
      });

      vi.spyOn(process, 'cwd').mockReturnValue('/project');

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const { logger } = await import('../../utils/logger');
      const { addTemplate } = await import('./index');

      await expect(addTemplate({})).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Mastra project'));
    });

    it('should exit when no template is selected', async () => {
      vol.fromJSON({
        '/project/src/mastra/index.ts': 'export const mastra = new Mastra({})',
      });

      vi.spyOn(process, 'cwd').mockReturnValue('/project');

      const { loadTemplates, selectTemplate } = await import('../../utils/template-utils');
      vi.mocked(loadTemplates).mockResolvedValue([mockTemplate]);
      vi.mocked(selectTemplate).mockResolvedValue(null);

      const { logger } = await import('../../utils/logger');
      const { addTemplate } = await import('./index');

      await addTemplate({});

      expect(logger.info).toHaveBeenCalledWith('No template selected. Exiting.');
    });

    it('should handle download failures gracefully', async () => {
      vol.fromJSON({
        '/project/src/mastra/index.ts': 'export const mastra = new Mastra({})',
      });

      vi.spyOn(process, 'cwd').mockReturnValue('/project');

      const { loadTemplates, selectTemplate } = await import('../../utils/template-utils');
      vi.mocked(loadTemplates).mockResolvedValue([mockTemplate]);
      vi.mocked(selectTemplate).mockResolvedValue(mockTemplate);

      // Mock failed download
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const { logger } = await import('../../utils/logger');
      const { addTemplate } = await import('./index');

      await addTemplate({});

      // Should warn about failed downloads but still complete
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to download'));
      expect(logger.info).toHaveBeenCalledWith('Template "Test Template" added successfully!');
    });

    it('should create target directories if they do not exist', async () => {
      vol.fromJSON({
        '/project/src/mastra/index.ts': 'export const mastra = new Mastra({})',
      });

      vi.spyOn(process, 'cwd').mockReturnValue('/project');

      const { loadTemplates, selectTemplate } = await import('../../utils/template-utils');
      vi.mocked(loadTemplates).mockResolvedValue([mockTemplate]);
      vi.mocked(selectTemplate).mockResolvedValue(mockTemplate);

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('// Template code'),
      } as Response);

      const { addTemplate } = await import('./index');
      await addTemplate({});

      // Verify directories were created
      const fs = await import('fs/promises');
      const agentsStat = await fs.stat('/project/src/mastra/agents');
      const toolsStat = await fs.stat('/project/src/mastra/tools');
      const workflowsStat = await fs.stat('/project/src/mastra/workflows');

      expect(agentsStat.isDirectory()).toBe(true);
      expect(toolsStat.isDirectory()).toBe(true);
      expect(workflowsStat.isDirectory()).toBe(true);
    });

    it('should skip empty component arrays', async () => {
      const templateWithEmptyArrays = {
        ...mockTemplate,
        agents: [],
        mcp: [],
        tools: [],
        networks: [],
        workflows: [],
      };

      vol.fromJSON({
        '/project/src/mastra/index.ts': 'export const mastra = new Mastra({})',
      });

      vi.spyOn(process, 'cwd').mockReturnValue('/project');

      const { loadTemplates, selectTemplate } = await import('../../utils/template-utils');
      vi.mocked(loadTemplates).mockResolvedValue([templateWithEmptyArrays]);
      vi.mocked(selectTemplate).mockResolvedValue(templateWithEmptyArrays);

      const { addTemplate } = await import('./index');
      await addTemplate({});

      // fetch should not be called since no files to download
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
