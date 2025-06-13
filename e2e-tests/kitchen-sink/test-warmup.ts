import { setupTestProject } from './prepare.js';
import setupVerdaccio from './setup.js';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

async function warmup() {
  console.log('Warming up...');
  const fixturePath = await mkdtemp(join(tmpdir(), 'mastra-kitchen-sink-test-'));
  const projectPath = join(fixturePath, 'project');

  await setupVerdaccio();
  await setupTestProject(projectPath);
}

warmup();
