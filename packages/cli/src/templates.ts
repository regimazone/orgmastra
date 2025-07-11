import { Template } from './utils/template-utils';

export const TEMPLATES: Template[] = [
  {
    url: 'https://github.com/mastra-ai/template-browsing-agent',
    name: 'Browsing Agent',
    slug: 'template-browsing-agent',
    agents: ['web-agent'],
    tools: ['page-act-tool', 'page-extract-tool', 'page-navigate-tool', 'page-observe-tool'],
    mcp: [],
    networks: [],
    workflows: []
  },
  {
    url: 'https://github.com/mastra-ai/template-deep-research',
    name: 'Deep Research Agent',
    slug: 'template-deep-research',
    agents: ['evaluationAgent', 'learningExtractionAgent', 'reportAgent', 'researchAgent'],
    tools: ['evaluateResultTool', 'extractLearningTool', 'webSearchTool'],
    workflows: ['generateReportWorkflow', 'researchWorkflow'],
    mcp: [],
    networks: []
  },
  {
    url: 'https://github.com/mastra-ai/template-pdf-questions',
    name: 'PDF OCR Agent',
    slug: 'template-pdf-questions',
    agents: ['questionGeneratorAgent'],
    tools: ['simpleOCR'],
    workflows: ['pdfToQuestionsWorkflow'],
    mcp: [],
    networks: []
  }
];