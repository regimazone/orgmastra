import { setupTestProject } from './prepare.js';
import setupVerdaccio from './setup.js';
import { spawn } from 'child_process';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

async function globalSetup() {
  const fixturePath = await mkdtemp(join(tmpdir(), 'mastra-kitchen-sink-test-'));
  const projectPath = join(fixturePath, 'project');

  await setupVerdaccio();
  await setupTestProject(projectPath);
  console.log('SXUUUUUPO');
}

export default globalSetup;
