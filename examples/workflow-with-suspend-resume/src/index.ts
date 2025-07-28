import { mastra } from './mastra';

function generateHugeTestData(count: number): any {
  const data: any = {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    users: [],
  };

  // Generate large arrays of test data
  for (let i = 0; i < count; i++) {
    data.users.push({
      id: `user_${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      profile: {
        age: Math.floor(Math.random() * 80) + 18,
        location: `City ${i % 100}`,
        preferences: Array.from({ length: 20 }, (_, j) => `pref_${j}_${Math.random().toString(36).substring(7)}`),
        history: Array.from({ length: 50 }, (_, j) => ({
          action: `action_${j}`,
          timestamp: new Date(Date.now() - Math.random() * 31536000000).toISOString(),
          data: { value: Math.random() * 1000, category: `cat_${j % 10}` },
        })),
      },
    });
  }

  return data;
}

async function main() {
  console.log('🚀 Starting workflow with suspend/resume example...\n');

  const myWorkflow = mastra.getWorkflow('myWorkflow');
  const run = await myWorkflow.createRunAsync();

  try {
    // Loop the workflow start 3 times
    for (let i = 0; i < 10; i++) {
      console.log(`📝 Starting workflow iteration ${i + 1} with input data`);
      await run.start({
        inputData: {
          data: generateHugeTestData(10000),
        },
      });
      console.log(`📊 Workflow iteration ${i + 1} completed`);
    }
  } catch (e) {
    console.error('❌ Error:', e);
  }
}

main();
