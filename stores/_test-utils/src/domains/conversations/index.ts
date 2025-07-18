import type { MastraStorage } from '@mastra/core/storage';
import { createMessagesPaginatedTest } from './messages-paginated';
import { createThreadsTest } from './threads';
import { createMessagesUpdateTest } from './messages-update';

export function createConversationsTest({ storage }: { storage: MastraStorage }) {
  createThreadsTest({ storage });

  createMessagesPaginatedTest({ storage });

  createMessagesUpdateTest({ storage });
}
