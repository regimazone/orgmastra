import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { executeParamsSchema } from '../schema';

/**
 * Creates a fetch handler for both triggering Mastra workflows via HTTP and handling method forwarding
 * @param workflowBinding - The Cloudflare Workflow binding
 * @param mastra - The Mastra instance for direct method execution
 * @returns A fetch handler function
 */
export function createMastraFetchHandler(workflowBinding: any, mastra: Mastra) {
  const app = new Hono();

  app.get(
    '/instance/status/:instanceId',
    zValidator(
      'param',
      z.object({
        instanceId: z.string().uuid('Invalid instance ID format'),
      }),
    ),
    async c => {
      const { instanceId } = c.req.valid('param');
      const instance = await workflowBinding.get(instanceId);
      const status = await instance.status();
      return c.json(status);
    },
  );

  app.post('/execute', zValidator('json', executeParamsSchema), async c => {
    const body = await c.req.valid('json');
    const instance = await workflowBinding.create({
      params: {
        method: 'execute',
        params: body,
      },
    });

    const status = await instance.status();

    return c.json({
      status,
      instanceId: instance.id,
      runId: body.runId,
      workflowId: body.workflowId,
      input: body.input,
    });
  });

  return app.fetch;
}
