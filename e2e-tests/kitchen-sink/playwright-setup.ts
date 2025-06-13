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
  await pingMastraServer();

  console.log('Tests ready to go!');
}

const pingMastraServer = async () => {
  let intervalCount = 0;

  return new Promise((resolve, reject) => {
    const intervalId = setInterval(async () => {
      if (intervalCount > 10) {
        clearInterval(intervalId);
        reject(new Error('Mastra server not responding'));
      }

      fetch('http://localhost:4111/agents')
        .then(res => {
          if (res.ok) {
            clearInterval(intervalId);
            resolve(undefined);
          }
        })
        .catch(() => {
          console.log(`Server sleeping... Attempt: ${intervalCount}`);
        });

      intervalCount++;
    }, 100);
  });
};

export default globalSetup;
