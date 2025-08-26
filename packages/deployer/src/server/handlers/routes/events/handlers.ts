import type { Mastra } from '@mastra/core';
import { sendEventHandler as getOriginalSendEventHandler } from '@mastra/server/handlers/events';
import type { Context } from 'hono';

import { handleError } from '../../error';

export async function sendEventHandler(c: Context) {
  try {
    const mastra: Mastra = c.get('mastra');

    const event = await getOriginalSendEventHandler({
      mastra,
      topic: c.req.param('topic'),
      event: c.req.param('event'),
    });

    return c.json(event);
  } catch (error) {
    return handleError(error, 'Error getting workflows');
  }
}
