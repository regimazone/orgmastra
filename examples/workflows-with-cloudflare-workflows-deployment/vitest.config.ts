import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000, // 30 seconds for CF workflow execution
  },
  resolve: {
    alias: {
      // If needed, add any path aliases here
    },
  },
});
