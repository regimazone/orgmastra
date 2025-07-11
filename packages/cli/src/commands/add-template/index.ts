import fs from 'fs/promises';
import { join } from 'path';
import yoctoSpinner from 'yocto-spinner';
import { logger } from '../../utils/logger';
import { loadTemplates, selectTemplate, type Template } from '../../utils/template-utils';

export async function addTemplate({ dir }: { dir?: string }) {
  const mastraDir = dir ? (dir.startsWith('/') ? dir : join(process.cwd(), dir)) : join(process.cwd(), 'src', 'mastra');
  if (!mastraDir) {
    logger.error(
      'Could not find Mastra directory. Make sure you are in a Mastra project and the mastra directory exists. You can pass in your Mastra directory with the --dir flag.',
    );
    process.exit(1);
  }

  await validateMastraProject(mastraDir);

  const templates = await loadTemplates();
  const selectedTemplate = await selectTemplate(templates);

  if (!selectedTemplate) {
    logger.info('No template selected. Exiting.');
    return;
  }

  await downloadTemplate(selectedTemplate, mastraDir);
  logger.info(`Template "${selectedTemplate.name}" added successfully!`);
}

async function validateMastraProject(mastraDir: string): Promise<void> {
  const indexPath = join(mastraDir, 'index.ts');

  try {
    const indexContent = await fs.readFile(indexPath, 'utf-8');

    // Check if the file exports a mastra instance/class
    if (!indexContent.includes('mastra') && !indexContent.includes('Mastra')) {
      throw new Error('index.ts does not appear to export a Mastra instance');
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      logger.error(`Could not find index.ts in ${mastraDir}. Make sure you are in a valid Mastra project.`);
    } else {
      logger.error(`Invalid Mastra project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    process.exit(1);
  }
}

async function downloadTemplate(template: Template, mastraDir: string): Promise<void> {
  const spinner = yoctoSpinner({ text: `Downloading template "${template.name}"...` }).start();

  try {
    // Define the folder types we need to process
    const folderTypes = ['agents', 'mcp', 'tools', 'networks', 'workflows'] as const;

    for (const folderType of folderTypes) {
      const items = template[folderType];
      if (items.length > 0) {
        await downloadFolderItems(template, folderType, items, mastraDir);
      }
    }

    spinner.success(`Template "${template.name}" downloaded successfully!`);
  } catch (error) {
    spinner.error(`Failed to download template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

async function downloadFolderItems(
  template: Template,
  folderType: string,
  items: string[],
  mastraDir: string,
): Promise<void> {
  const targetDir = join(mastraDir, folderType);

  // Ensure the target directory exists
  await fs.mkdir(targetDir, { recursive: true });

  for (const item of items) {
    const fileUrl = `https://raw.githubusercontent.com/mastra-ai/${template.slug}/refs/heads/main/src/mastra/${folderType}/${item}.ts`;
    const targetPath = join(targetDir, `${item}.ts`);

    try {
      await downloadFile(fileUrl, targetPath);
    } catch (error) {
      logger.warn(
        `Failed to download ${folderType}/${item}.ts: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

async function downloadFile(url: string, targetPath: string): Promise<void> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();
    await fs.writeFile(targetPath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to download ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
