import { setupTestProject } from './prepare.js';
import setupVerdaccio from './setup.js';
import { chromium, type FullConfig } from '@playwright/test';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

async function globalSetup() {
  const fixturePath = await mkdtemp(join(tmpdir(), 'mastra-kitchen-sink-test-'));
  const projectPath = join(fixturePath, 'project');

  await setupVerdaccio();
  await setupTestProject(projectPath);
}

export default globalSetup;
