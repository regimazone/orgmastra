import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const processDataStep = createStep({
  id: 'processData',
  inputSchema: z.object({
    message: z.string(),
    count: z.number().default(1),
  }),
  outputSchema: z.object({
    processedMessage: z.string(),
    timestamp: z.string(),
  }),
  execute: async ({ inputData }) => {
    // Simulate some processing work
    const processedMessage = `Processed: ${inputData.message} (count: ${inputData.count})`;
    const timestamp = new Date().toISOString();

    console.log(`Processing data: ${inputData.message}`);

    return {
      processedMessage,
      timestamp,
    };
  },
});

const validateStep = createStep({
  id: 'validate',
  inputSchema: z.object({
    processedMessage: z.string(),
    timestamp: z.string(),
  }),
  outputSchema: z.object({
    isValid: z.boolean(),
    validatedMessage: z.string(),
  }),
  execute: async ({ inputData }) => {
    // Simple validation logic
    const isValid = inputData.processedMessage.length > 0;
    const validatedMessage = isValid
      ? `✅ Valid: ${inputData.processedMessage}`
      : `❌ Invalid: ${inputData.processedMessage}`;

    console.log(`Validation result: ${isValid}`);

    return {
      isValid,
      validatedMessage,
    };
  },
});

const finalizeStep = createStep({
  id: 'finalize',
  inputSchema: z.object({
    isValid: z.boolean(),
    validatedMessage: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
    completedAt: z.string(),
  }),
  execute: async ({ inputData }) => {
    const result = inputData.isValid
      ? `SUCCESS: ${inputData.validatedMessage}`
      : `FAILED: ${inputData.validatedMessage}`;

    const completedAt = new Date().toISOString();

    console.log(`Workflow completed: ${result}`);

    return {
      result,
      completedAt,
    };
  },
});

export const simpleWorkflow = createWorkflow({
  id: 'simple-workflow',
  inputSchema: z.object({
    message: z.string(),
    count: z.number().default(1),
  }),
  outputSchema: z.object({
    result: z.string(),
    completedAt: z.string(),
  }),
})
  .then(processDataStep)
  .then(validateStep)
  .then(finalizeStep)
  .commit();
