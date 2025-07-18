import type { MastraStorage } from '@mastra/core/storage';
import { createMessagesPaginatedTest } from './messages-paginated';
import { createThreadsTest } from './threads';
import { createMessagesUpdateTest } from './messages-update';
import { createResourcesTest } from './resources';

export function createMemoryTest({ storage }: { storage: MastraStorage }) {
  createThreadsTest({ storage });

  createMessagesPaginatedTest({ storage });

  createMessagesUpdateTest({ storage });

  createResourcesTest({ storage });
}
