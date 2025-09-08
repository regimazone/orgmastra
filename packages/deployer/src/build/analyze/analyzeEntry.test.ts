import { analyzeEntry } from './analyzeEntry';
import { describe, it, expect, vi } from 'vitest';
import { readFile } from 'fs-extra';
import { join } from 'path';
import { noopLogger } from '@mastra/core/logger';

// vi.mock('@mastra/core/logger', () => ({
//   createLogger: () => noopLogger,
// }));

vi.spyOn(process, 'cwd').mockReturnValue(join(import.meta.dirname, '__fixtures__', 'default'));

describe('analyzeEntry', () => {
  it('should analyze the entry file', async () => {
    const entryAsString = await readFile(join(import.meta.dirname, '__fixtures__', 'default', 'entry.ts'), 'utf-8');

    const result = await analyzeEntry({ entry: entryAsString, isVirtualFile: true }, ``, {
      logger: noopLogger,
      sourcemapEnabled: false,
      workspaceMap: new Map(),
    });

    expect(result.dependencies.size).toBe(4);
    expect(result.dependencies).toMatchInlineSnapshot(`
      Map {
        "@mastra/core/logger" => {
          "exports": [
            "createLogger",
          ],
          "isWorkspace": false,
          "rootPath": "/Users/ward/projects/mastra/mastra-oss/packages/core",
        },
        "@mastra/core/mastra" => {
          "exports": [
            "Mastra",
          ],
          "isWorkspace": false,
          "rootPath": "/Users/ward/projects/mastra/mastra-oss/packages/core",
        },
        "@mastra/core/agent" => {
          "exports": [
            "Agent",
          ],
          "isWorkspace": false,
          "rootPath": "/Users/ward/projects/mastra/mastra-oss/packages/core",
        },
        "@ai-sdk/openai" => {
          "exports": [
            "openai",
          ],
          "isWorkspace": false,
          "rootPath": null,
        },
      }
    `);
    expect(result.output).toMatchSnapshot();
  });
});
