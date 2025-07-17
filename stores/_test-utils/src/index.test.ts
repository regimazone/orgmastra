import { MockStore } from "@mastra/core/storage";
import { createTestSuite } from "./default-tests";

createTestSuite(new MockStore());
