import { mastra } from './mastra';

async function main() {
  const run = await mastra.getWorkflow('simpleWorkflow').createRunAsync();
  console.log('Run ID:', run.runId);
  console.log('run', run);

  const result = await run.start({
    inputData: {
      message: 'Hello Mastra!',
      count: 5,
    },
  });
  console.log('Result:', result);
}

main();
