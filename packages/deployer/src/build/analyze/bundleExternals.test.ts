import { describe, it, expect } from 'vitest';
import { createVirtualDependencies } from './bundleExternals';
import type { DependencyMetadata } from '../types';

describe('createVirtualDependencies', () => {
  it('should handle named exports only', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        'lodash',
        {
          exports: ['map', 'filter', 'reduce'],
          rootPath: '/node_modules/lodash',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.fileNameToDependencyMap.get('.mastra/.build/lodash')).toBe('lodash');
    expect(result.optimizedDependencyEntries.get('lodash')).toEqual({
      name: '.mastra/.build/lodash',
      virtual: "export { map, filter, reduce } from 'lodash';",
    });
  });

  it('should handle default export only', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        'react',
        {
          exports: ['default'],
          rootPath: '/node_modules/react',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.fileNameToDependencyMap.get('.mastra/.build/react')).toBe('react');
    expect(result.optimizedDependencyEntries.get('react')).toEqual({
      name: '.mastra/.build/react',
      virtual: "export { default } from 'react';",
    });
  });

  it('should handle star export only', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        '@types/node',
        {
          exports: ['*'],
          rootPath: '/node_modules/@types/node',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.fileNameToDependencyMap.get('.mastra/.build/@types-node')).toBe('@types/node');
    expect(result.optimizedDependencyEntries.get('@types/node')).toEqual({
      name: '.mastra/.build/@types-node',
      virtual: "export * from '@types/node';",
    });
  });

  it('should handle mixed exports (named + default)', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        'axios',
        {
          exports: ['default', 'AxiosError', 'AxiosResponse'],
          rootPath: '/node_modules/axios',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.optimizedDependencyEntries.get('axios')).toEqual({
      name: '.mastra/.build/axios',
      virtual: "export { default, AxiosError, AxiosResponse } from 'axios';",
    });
  });

  it('should handle mixed exports (named + star)', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        'utils-lib',
        {
          exports: ['*', 'specificUtil', 'anotherUtil'],
          rootPath: '/node_modules/utils-lib',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.optimizedDependencyEntries.get('utils-lib')).toEqual({
      name: '.mastra/.build/utils-lib',
      virtual: "export *, { specificUtil, anotherUtil } from 'utils-lib';",
    });
  });

  it('should handle mixed exports (default + star)', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        'full-lib',
        {
          exports: ['*', 'default'],
          rootPath: '/node_modules/full-lib',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.optimizedDependencyEntries.get('full-lib')).toEqual({
      name: '.mastra/.build/full-lib',
      virtual: "export *, { default } from 'full-lib';",
    });
  });

  it('should handle all export types together', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        'complete-lib',
        {
          exports: ['*', 'default', 'namedExport1', 'namedExport2'],
          rootPath: '/node_modules/complete-lib',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.optimizedDependencyEntries.get('complete-lib')).toEqual({
      name: '.mastra/.build/complete-lib',
      virtual: "export *, { default, namedExport1, namedExport2 } from 'complete-lib';",
    });
  });

  it('should handle scoped package names by replacing slashes with dashes', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        '@scope/package',
        {
          exports: ['someExport'],
          rootPath: '/node_modules/@scope/package',
          isWorkspace: false,
        },
      ],
      [
        '@another/deeply/nested/package',
        {
          exports: ['anotherExport'],
          rootPath: '/node_modules/@another/deeply/nested/package',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.fileNameToDependencyMap.get('.mastra/.build/@scope-package')).toBe('@scope/package');
    expect(result.fileNameToDependencyMap.get('.mastra/.build/@another-deeply-nested-package')).toBe(
      '@another/deeply/nested/package',
    );

    expect(result.optimizedDependencyEntries.get('@scope/package')).toEqual({
      name: '.mastra/.build/@scope-package',
      virtual: "export { someExport } from '@scope/package';",
    });
  });

  it('should handle multiple dependencies', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        'lodash',
        {
          exports: ['map', 'filter'],
          rootPath: '/node_modules/lodash',
          isWorkspace: false,
        },
      ],
      [
        'react',
        {
          exports: ['default'],
          rootPath: '/node_modules/react',
          isWorkspace: false,
        },
      ],
      [
        '@types/node',
        {
          exports: ['*'],
          rootPath: '/node_modules/@types/node',
          isWorkspace: false,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.fileNameToDependencyMap.size).toBe(3);
    expect(result.optimizedDependencyEntries.size).toBe(3);

    expect(result.optimizedDependencyEntries.get('lodash')?.virtual).toBe("export { map, filter } from 'lodash';");
    expect(result.optimizedDependencyEntries.get('react')?.virtual).toBe("export { default } from 'react';");
    expect(result.optimizedDependencyEntries.get('@types/node')?.virtual).toBe("export * from '@types/node';");
  });

  it('should handle empty exports array', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: null,
      projectRoot: '/',
      outputDir: '/.mastra/.build',
    });

    expect(result.fileNameToDependencyMap.get('empty-lib')).toBeUndefined();
    expect(result.optimizedDependencyEntries.get('empty-lib')).toBeUndefined();
  });

  it('should handle workspace packages', () => {
    const depsToOptimize = new Map<string, DependencyMetadata>([
      [
        '@workspace/internal-lib',
        {
          exports: ['internalUtil', 'default'],
          rootPath: '/workspace/packages/internal-lib',
          isWorkspace: true,
        },
      ],
    ]);

    const result = createVirtualDependencies(depsToOptimize, {
      workspaceRoot: '/workspace',
      projectRoot: '/workspace/app',
      outputDir: '/workspace/app/.mastra/.build',
    });

    const compiledDepCachePath = `packages/internal-lib/node_modules/.cache/@workspace-internal-lib`;
    expect(result.fileNameToDependencyMap.get(compiledDepCachePath)).toBe('@workspace/internal-lib');
    expect(result.optimizedDependencyEntries.get('@workspace/internal-lib')).toEqual({
      name: compiledDepCachePath,
      virtual: "export { internalUtil, default } from '@workspace/internal-lib';",
    });
  });
});
