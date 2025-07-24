import { z } from 'zod';

export const executeParamsSchema = z.object({
  workflowId: z.string().min(1),
  runId: z.string().optional(),
  input: z.any().optional().default({}),
  resume: z.any().optional(),
  retryConfig: z
    .object({
      attempts: z.number().int().min(0).optional(),
      delay: z.number().int().min(0).optional(),
    })
    .optional(),
  runtimeContextData: z.record(z.any()).optional(),
});

export const methodSchema = z.enum(['execute']);
