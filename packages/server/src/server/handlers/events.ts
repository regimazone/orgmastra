import { HTTPException } from '../http-exception';
import type { Context } from '../types';
import { handleError } from './error';

export async function sendEventHandler({
  mastra,
  topic,
  event,
}: Context & {
  topic: string;
  event: any;
}) {
  try {
    if (!topic) {
      throw new HTTPException(400, { message: 'Topic is required' });
    }

    if (!event) {
      throw new HTTPException(400, { message: 'Event is required' });
    }

    await mastra?.pubsub.publish(topic, event);

    return { message: `Event sent to topic ${topic}.` };
  } catch (error) {
    return handleError(error, `Error sending event to topic ${topic}`);
  }
}
