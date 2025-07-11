import * as p from '@clack/prompts';
import { TEMPLATES } from '../templates';

export interface Template {
  url: string;
  name: string;
  slug: string;
  agents: string[];
  mcp: string[];
  tools: string[];
  networks: string[];
  workflows: string[];
}

export async function loadTemplates(): Promise<Template[]> {
  return TEMPLATES;
}

export async function selectTemplate(templates: Template[]): Promise<Template | null> {
  const choices = templates.map(template => {
    const parts = [];
    if (template.agents?.length) parts.push(`${template.agents.length} agents`);
    if (template.tools?.length) parts.push(`${template.tools.length} tools`);
    if (template.workflows?.length) parts.push(`${template.workflows.length} workflows`);

    return {
      value: template,
      label: template.name,
      hint: parts.join(', ') || 'Template components',
    };
  });

  const selected = await p.select({
    message: 'Select a template:',
    options: choices,
  });

  if (p.isCancel(selected)) {
    return null;
  }

  return selected as Template;
}

export function findTemplateByName(templates: Template[], templateName: string): Template | null {
  // First try to find by exact slug match
  let template = templates.find(t => t.slug === templateName);
  if (template) return template;

  // Then try to find by slug without "template-" prefix
  const slugWithPrefix = `template-${templateName}`;
  template = templates.find(t => t.slug === slugWithPrefix);
  if (template) return template;

  // Finally try case-insensitive name match
  template = templates.find(t => t.name.toLowerCase() === templateName.toLowerCase());
  if (template) return template;

  return null;
}

export function getDefaultProjectName(template: Template): string {
  // Remove "template-" prefix from slug if it exists
  return template.slug.replace(/^template-/, '');
}
