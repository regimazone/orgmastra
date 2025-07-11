import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @clack/prompts
vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  isCancel: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

// Mock the templates module
vi.mock('../templates', () => ({
  TEMPLATES: [
    {
      url: 'https://github.com/mastra-ai/template-test',
      name: 'Test Template',
      slug: 'template-test',
      agents: ['test-agent'],
      mcp: [],
      tools: ['test-tool'],
      networks: [],
      workflows: [],
    },
  ],
}));

describe('template-utils', () => {
  describe('loadTemplates', () => {
    it('should load templates from TEMPLATES constant', async () => {
      const { loadTemplates } = await import('./template-utils');
      const templates = await loadTemplates();

      expect(templates).toEqual([
        {
          url: 'https://github.com/mastra-ai/template-test',
          name: 'Test Template',
          slug: 'template-test',
          agents: ['test-agent'],
          mcp: [],
          tools: ['test-tool'],
          networks: [],
          workflows: [],
        },
      ]);
    });
  });

  describe('findTemplateByName', () => {
    const mockTemplates = [
      {
        url: 'https://github.com/mastra-ai/template-browsing-agent',
        name: 'Browsing Agent',
        slug: 'template-browsing-agent',
        agents: ['web-agent'],
        mcp: [],
        tools: ['search-tool'],
        networks: [],
        workflows: [],
      },
      {
        url: 'https://github.com/mastra-ai/template-data-analyst',
        name: 'Data Analyst Agent',
        slug: 'template-data-analyst',
        agents: ['analyst-agent'],
        mcp: [],
        tools: ['query-tool'],
        networks: [],
        workflows: [],
      },
    ];

    it('should find template by exact slug match', async () => {
      const { findTemplateByName } = await import('./template-utils');
      const result = findTemplateByName(mockTemplates, 'template-browsing-agent');
      expect(result).toEqual(mockTemplates[0]);
    });

    it('should find template by slug without template- prefix', async () => {
      const { findTemplateByName } = await import('./template-utils');
      const result = findTemplateByName(mockTemplates, 'browsing-agent');
      expect(result).toEqual(mockTemplates[0]);
    });

    it('should find template by case-insensitive name match', async () => {
      const { findTemplateByName } = await import('./template-utils');
      const result = findTemplateByName(mockTemplates, 'browsing agent');
      expect(result).toEqual(mockTemplates[0]);
    });

    it('should return null if template not found', async () => {
      const { findTemplateByName } = await import('./template-utils');
      const result = findTemplateByName(mockTemplates, 'non-existent-template');
      expect(result).toBeNull();
    });
  });

  describe('getDefaultProjectName', () => {
    it('should remove template- prefix from slug', async () => {
      const mockTemplate = {
        url: 'https://github.com/mastra-ai/template-browsing-agent',
        name: 'Browsing Agent',
        slug: 'template-browsing-agent',
        agents: [],
        mcp: [],
        tools: [],
        networks: [],
        workflows: [],
      };

      const { getDefaultProjectName } = await import('./template-utils');
      const result = getDefaultProjectName(mockTemplate);
      expect(result).toBe('browsing-agent');
    });

    it('should return slug as-is if no template- prefix', async () => {
      const mockTemplate = {
        url: 'https://github.com/mastra-ai/custom-agent',
        name: 'Custom Agent',
        slug: 'custom-agent',
        agents: [],
        mcp: [],
        tools: [],
        networks: [],
        workflows: [],
      };

      const { getDefaultProjectName } = await import('./template-utils');
      const result = getDefaultProjectName(mockTemplate);
      expect(result).toBe('custom-agent');
    });
  });

  describe('selectTemplate', () => {
    it('should return selected template when user selects one', async () => {
      const mockTemplates = [
        {
          url: 'https://github.com/mastra-ai/template-test',
          name: 'Test Template',
          slug: 'template-test',
          agents: ['test-agent'],
          mcp: [],
          tools: ['test-tool'],
          networks: [],
          workflows: ['test-workflow'],
        },
      ];

      const { select, isCancel } = await import('@clack/prompts');
      vi.mocked(select).mockResolvedValue(mockTemplates[0]);
      vi.mocked(isCancel).mockReturnValue(false);

      const { selectTemplate } = await import('./template-utils');
      const result = await selectTemplate(mockTemplates);

      expect(result).toEqual(mockTemplates[0]);
      expect(select).toHaveBeenCalledWith({
        message: 'Select a template:',
        options: [
          {
            value: mockTemplates[0],
            label: 'Test Template',
            hint: '1 agents, 1 tools, 1 workflows',
          },
        ],
      });
    });

    it('should return null when user cancels selection', async () => {
      const mockTemplates = [
        {
          url: 'https://github.com/mastra-ai/template-test',
          name: 'Test Template',
          slug: 'template-test',
          agents: [],
          mcp: [],
          tools: [],
          networks: [],
          workflows: [],
        },
      ];

      const { select, isCancel } = await import('@clack/prompts');
      vi.mocked(select).mockResolvedValue('cancelled');
      vi.mocked(isCancel).mockReturnValue(true);

      const { selectTemplate } = await import('./template-utils');
      const result = await selectTemplate(mockTemplates);

      expect(result).toBeNull();
    });

    it('should handle templates with no components gracefully', async () => {
      const mockTemplates = [
        {
          url: 'https://github.com/mastra-ai/template-empty',
          name: 'Empty Template',
          slug: 'template-empty',
          agents: [],
          mcp: [],
          tools: [],
          networks: [],
          workflows: [],
        },
      ];

      const { select, isCancel } = await import('@clack/prompts');
      vi.mocked(select).mockResolvedValue(mockTemplates[0]);
      vi.mocked(isCancel).mockReturnValue(false);

      const { selectTemplate } = await import('./template-utils');
      const result = await selectTemplate(mockTemplates);

      expect(result).toEqual(mockTemplates[0]);
      expect(select).toHaveBeenCalledWith({
        message: 'Select a template:',
        options: [
          {
            value: mockTemplates[0],
            label: 'Empty Template',
            hint: 'Template components',
          },
        ],
      });
    });
  });
});
