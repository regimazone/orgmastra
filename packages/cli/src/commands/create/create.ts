import * as p from '@clack/prompts';
import color from 'picocolors';

import { init } from '../init/init';
import { interactivePrompt } from '../init/utils';
import type { LLMProvider } from '../init/utils';
import { getPackageManager } from '../utils.js';
import { loadTemplates, selectTemplate, findTemplateByName, getDefaultProjectName } from '../../utils/template-utils';
import { cloneTemplate, installDependencies } from '../../utils/clone-template';

import { createMastraProject } from './utils';

export const create = async (args: {
  projectName?: string;
  components?: string[];
  llmProvider?: LLMProvider;
  addExample?: boolean;
  llmApiKey?: string;
  createVersionTag?: string;
  timeout?: number;
  directory?: string;
  mcpServer?: 'windsurf' | 'cursor' | 'cursor-global';
  template?: string;
}) => {
  // Handle template-based creation
  if (args.template !== undefined) {
    await createFromTemplate(args);
    return;
  }

  // Original create logic for non-template projects
  const { projectName } = await createMastraProject({
    projectName: args?.projectName,
    createVersionTag: args?.createVersionTag,
    timeout: args?.timeout,
  });
  const directory = args.directory || 'src/';

  // We need to explicitly check for undefined instead of using the falsy (!)
  // check because the user might have passed args that are explicitly set
  // to false (in this case, no example code) and we need to distinguish
  // between those and the case where the args were not passed at all.
  if (args.components === undefined || args.llmProvider === undefined || args.addExample === undefined) {
    const result = await interactivePrompt();
    await init({
      ...result,
      llmApiKey: result?.llmApiKey as string,
      components: ['agents', 'tools', 'workflows'],
      addExample: true,
    });
    postCreate({ projectName });
    return;
  }

  const { components = [], llmProvider = 'openai', addExample = false, llmApiKey } = args;

  await init({
    directory,
    components,
    llmProvider,
    addExample,
    llmApiKey,
    configureEditorWithDocsMCP: args.mcpServer,
  });

  postCreate({ projectName });
};

async function createFromTemplate(args: { projectName?: string; template?: string; timeout?: number }) {
  const templates = await loadTemplates();
  let selectedTemplate;

  if (args.template) {
    // Template name provided, find it
    selectedTemplate = findTemplateByName(templates, args.template);
    if (!selectedTemplate) {
      p.log.error(`Template "${args.template}" not found. Available templates:`);
      templates.forEach(t => p.log.info(`  - ${t.name} (use: ${t.slug.replace('template-', '')})`));
      process.exit(1);
    }
  } else {
    // No template specified, let user select
    selectedTemplate = await selectTemplate(templates);
    if (!selectedTemplate) {
      p.log.info('No template selected. Exiting.');
      return;
    }
  }

  // Get project name
  let projectName = args.projectName;
  if (!projectName) {
    const defaultName = getDefaultProjectName(selectedTemplate);
    const response = await p.text({
      message: 'What is your project name?',
      defaultValue: defaultName,
      placeholder: defaultName,
    });

    if (p.isCancel(response)) {
      p.log.info('Project creation cancelled.');
      return;
    }

    projectName = response as string;
  }

  try {
    // Clone the template
    const projectPath = await cloneTemplate({
      template: selectedTemplate,
      projectName,
    });

    // Install dependencies
    await installDependencies(projectPath);

    // Show completion message
    postCreate({ projectName });
  } catch (error) {
    p.log.error(`Failed to create project from template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

const postCreate = ({ projectName }: { projectName: string }) => {
  const packageManager = getPackageManager();
  p.outro(`
   ${color.green('To start your project:')}

    ${color.cyan('cd')} ${projectName}
    ${color.cyan(`${packageManager} run dev`)}
  `);
};
