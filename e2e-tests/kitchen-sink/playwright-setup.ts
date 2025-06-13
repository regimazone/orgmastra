import { setupTestProject } from './prepare.js';
import setupVerdaccio from './setup.js';
import { spawn } from 'child_process';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

async function globalSetup() {
  console.log('SXUUUUUPO');
  const fixturePath = await mkdtemp(join(tmpdir(), 'mastra-kitchen-sink-test-'));
  const projectPath = join(fixturePath, 'project');

  console.log('SXUUUUUPO2');

  await setupVerdaccio();
  await setupTestProject(projectPath);
}

export default globalSetup;
