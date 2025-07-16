import { createScoresTest } from '../domains/scores/test-utils';
import { MockStore } from '../mock';
// import { createTestSuite } from "./test-utils/storage";

createScoresTest({ storage: new MockStore() });
