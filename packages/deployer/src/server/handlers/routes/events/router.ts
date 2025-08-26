import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { describeRoute } from 'hono-openapi';
import type { BodyLimitOptions } from '../../../types';
import { sendEventHandler } from './handlers';

export function eventsRouter(bodyLimitOptions: BodyLimitOptions) {
  const router = new Hono();

  router.post(
    '/events/:topic',
    bodyLimit(bodyLimitOptions),
    describeRoute({
      description: 'Send an event to a topic',
      parameters: [
        {
          name: 'topic',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                data: { type: 'object' },
                runId: { type: 'string' },
              },
            },
          },
        },
      },
      tags: ['events'],
      responses: {
        200: {
          description: 'event sent',
        },
      },
    }),
    sendEventHandler,
  );

  return router;
}
