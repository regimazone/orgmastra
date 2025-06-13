import { spawnSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function setupTestProject(pathToStoreFiles) {
  const __dirname = dirname(fileURLToPath(import.meta.url));

  const projectPath = join(__dirname, 'template');
  const newPath = pathToStoreFiles;

  await mkdir(newPath, { recursive: true });
  await cp(projectPath, newPath, { recursive: true });

  spawnSync('pnpm', ['install'], {
    cwd: newPath,
    stdio: 'inherit',
    shell: true,
  });

  console.log('Building project...');
  spawnSync('pnpm', ['build'], {
    cwd: newPath,
    stdio: 'inherit',
    shell: true,
  });

  await pingMastraServer();
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
            resolve();
          }
        })
        .catch(() => {
          console.log(`Server sleeping... Attempt: ${intervalCount}`);
        });

      intervalCount++;
    }, 100);
  });
};
