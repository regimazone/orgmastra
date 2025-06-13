import { setupTestProject } from './prepare.js';
import setupVerdaccio from './setup.js';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

async function setup() {
  const fixturePath = await mkdtemp(join(tmpdir(), 'mastra-kitchen-sink-test-'));
  const projectPath = join(fixturePath, 'project');

  const cleanup = await setupVerdaccio();
  await setupTestProject(projectPath);

  console.log('Project prepared!');

  return () => {
    cleanup();
  };
}

export default setup;
