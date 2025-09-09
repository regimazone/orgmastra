import type { IMastraLogger } from '@mastra/core/logger';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import virtual from '@rollup/plugin-virtual';
import esmShim from '@rollup/plugin-esm-shim';
import { rollup, type OutputChunk } from 'rollup';
import { esbuild } from '../plugins/esbuild';
import { aliasHono } from '../plugins/hono-alias';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { getCompiledDepCachePath, getPackageRootPath } from '../utils';
import { type WorkspacePackageInfo } from '../../bundler/workspaceDependencies';
import type { DependencyMetadata } from '../types';
import { basename } from 'node:path/posix';
import { DEPS_TO_IGNORE } from './constants';

// TODO: Make this extendable or find a rollup plugin that can do this
const globalExternals = ['pino', 'pino-pretty', '@libsql/client', 'pg', 'libsql', '#tools'];
const deprecatedExternals = ['fastembed', 'nodemailer', 'jsdom', 'sqlite3'];

type VirtualDependency = {
  name: string;
  virtual: string;
};

export function createVirtualDependencies(
  depsToOptimize: Map<string, DependencyMetadata>,
  { projectRoot, workspaceRoot, outputDir }: { workspaceRoot: string | null; projectRoot: string; outputDir: string },
): {
  optimizedDependencyEntries: Map<string, VirtualDependency>;
  fileNameToDependencyMap: Map<string, string>;
} {
  const fileNameToDependencyMap = new Map<string, string>();
  const optimizedDependencyEntries = new Map();
  const rootDir = workspaceRoot || projectRoot;

  for (const [dep, { exports }] of depsToOptimize.entries()) {
    const fileName = dep.replaceAll('/', '-');
    const virtualFile: string[] = [];
    const exportStringBuilder = [];

    for (const local of exports) {
      if (local === '*') {
        virtualFile.push(`export * from '${dep}';`);
        continue;
      } else if (local === 'default') {
        exportStringBuilder.push('default');
      } else {
        exportStringBuilder.push(local);
      }
    }

    const chunks = [];
    if (exportStringBuilder.length) {
      chunks.push(`{ ${exportStringBuilder.join(', ')} }`);
    }
    if (chunks.length) {
      virtualFile.push(`export ${chunks.join(', ')} from '${dep}';`);
    }

    // Determine the entry name based on the complexity of exports
    let entryName = `${outputDir}/${fileName}`
      /**
       * The Rollup output.entryFileNames option doesn't allow relative or absolute paths, so the cacheDirAbsolutePath needs to be converted to a name relative to the workspace root.
       */
      .replace(rootDir, '')
      /**
       * Remove leading slashes/backslashes
       */
      .replace(/^[/\\]+/, '');

    fileNameToDependencyMap.set(entryName, dep);
    optimizedDependencyEntries.set(dep, {
      name: entryName,
      virtual: virtualFile.join('\n'),
    });
  }

  // For workspace packages, we still want the dependencies to be imported from the original path
  // We rewrite the path to the original folder inside node_modules/.cache
  for (const [dep, { isWorkspace, rootPath }] of depsToOptimize.entries()) {
    if (!isWorkspace || !rootPath || !workspaceRoot) {
      continue;
    }

    const currentDepPath = optimizedDependencyEntries.get(dep);
    const fileName = basename(currentDepPath.name);
    const absolutePath = getCompiledDepCachePath(rootPath, fileName)
      /**
       * The Rollup output.entryFileNames option doesn't allow relative or absolute paths, so the cacheDirAbsolutePath needs to be converted to a name relative to the workspace root.
       */
      .replace(rootDir, '')
      /**
       * Remove leading slashes/backslashes
       */
      .replace(/^[/\\]+/, '');

    fileNameToDependencyMap.set(absolutePath, dep);
    optimizedDependencyEntries.set(dep, {
      ...currentDepPath,
      name: absolutePath,
    });
  }

  return { optimizedDependencyEntries, fileNameToDependencyMap };
}

async function getInputPlugins(
  virtualDependencies: Map<string, { virtual: string }>,
  transpilePackages: Set<string>,
  workspaceMap: Map<string, WorkspacePackageInfo>,
) {
  const transpilePackagesMap = new Map<string, string>();
  for (const pkg of transpilePackages) {
    const dir = await getPackageRootPath(pkg);

    if (dir) {
      transpilePackagesMap.set(pkg, dir);
    }
  }

  return [
    virtual(
      Array.from(virtualDependencies.entries()).reduce(
        (acc, [dep, virtualDep]) => {
          acc[`#virtual-${dep}`] = virtualDep.virtual;
          return acc;
        },
        {} as Record<string, string>,
      ),
    ),
    transpilePackagesMap.size
      ? esbuild({
          format: 'esm',
          include: [...transpilePackagesMap.values()].map(p => {
            // Match files from transpilePackages but exclude any nested node_modules
            // Escapes regex special characters in the path and uses negative lookahead to avoid node_modules
            // generated by cursor
            return new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?!.*node_modules).*$`);
          }),
        })
      : null,
    commonjs({
      strictRequires: 'strict',
      transformMixedEsModules: true,
      ignoreTryCatch: false,
    }),
    esmShim(),
    nodeResolve({
      preferBuiltins: true,
      exportConditions: ['node'],
      // Do not embed external dependencies into files that we write to `node_modules/.cache` (for the mastra dev + workspace use case)
      ...(workspaceMap.size > 0 ? { resolveOnly: Array.from(workspaceMap.keys()) } : {}),
    }),
    // hono is imported from deployer, so we need to resolve from here instead of the project root
    aliasHono(),
    json(),
  ];
}

async function buildExternalDependencies(
  virtualDependencies: Map<string, VirtualDependency>,
  {
    externals,
    packagesToTranspile,
    workspaceMap,
    rootDir,
  }: {
    externals: string[];
    packagesToTranspile: Set<string>;
    workspaceMap: Map<string, WorkspacePackageInfo>;
    rootDir: string;
  },
) {
  const bundler = await rollup({
    logLevel: process.env.MASTRA_BUNDLER_DEBUG === 'true' ? 'debug' : 'silent',
    input: Array.from(virtualDependencies.entries()).reduce(
      (acc, [dep, virtualDep]) => {
        acc[virtualDep.name] = `#virtual-${dep}`;
        return acc;
      },
      {} as Record<string, string>,
    ),
    external: externals,
    treeshake: 'smallest',
    plugins: getInputPlugins(virtualDependencies, packagesToTranspile, workspaceMap),
  });

  const { output } = await bundler.write({
    format: 'esm',
    dir: rootDir,
    entryFileNames: '[name].mjs',
    chunkFileNames: '[name].mjs',
    hoistTransitiveImports: false,
  });

  await bundler.close();

  return output;
}

function findExternalImporter(module: OutputChunk, external: string, allOutputs: OutputChunk[]): OutputChunk | null {
  const capturedFiles = new Set();

  for (const id of module.imports) {
    if (id === external) {
      return module;
    } else {
      if (id.endsWith('.mjs')) {
        capturedFiles.add(id);
      }
    }
  }

  for (const file of capturedFiles) {
    const nextModule = allOutputs.find(o => o.fileName === file);
    if (nextModule) {
      const importer = findExternalImporter(nextModule, external, allOutputs);

      if (importer) {
        return importer;
      }
    }
  }

  return null;
}

/**
 * Bundles vendor dependencies identified in the analysis step.
 * Creates virtual modules for each dependency and bundles them using rollup.
 *
 * @param depsToOptimize - Map of dependencies to optimize with their metadata (exported bindings, rootPath, isWorkspace)
 * @param outputDir - Directory where bundled files will be written
 * @param logger - Logger instance for debugging
 * @returns Object containing bundle output and reference map for validation
 */
export async function bundleExternals(
  depsToOptimize: Map<string, DependencyMetadata>,
  outputDir: string,
  options: {
    bundlerOptions?: {
      externals?: string[];
      transpilePackages?: string[];
      isDev?: boolean;
    } | null;
    projectRoot?: string;
    workspaceRoot?: string;
    workspaceMap?: Map<string, WorkspacePackageInfo>;
  },
) {
  const { workspaceRoot = null, workspaceMap = new Map(), projectRoot = outputDir, bundlerOptions = {} } = options;
  const { externals: customExternals = [], transpilePackages = [], isDev = false } = bundlerOptions || {};
  const allExternals = [...globalExternals, ...deprecatedExternals, ...customExternals];

  const workspacePackagesNames = Array.from(workspaceMap.keys());
  const packagesToTranspile = new Set([...transpilePackages, ...workspacePackagesNames]);

  const { optimizedDependencyEntries, fileNameToDependencyMap } = createVirtualDependencies(depsToOptimize, {
    workspaceRoot,
    outputDir,
    projectRoot,
  });

  const output = await buildExternalDependencies(optimizedDependencyEntries, {
    externals: allExternals,
    packagesToTranspile,
    workspaceMap: isDev ? workspaceMap : new Map(),
    rootDir: workspaceRoot || projectRoot,
  });

  const moduleResolveMap = {} as Record<string, Record<string, string>>;
  const filteredChunks = output.filter(o => o.type === 'chunk');

  for (const o of filteredChunks.filter(o => o.isEntry || o.isDynamicEntry)) {
    for (const external of allExternals) {
      if (DEPS_TO_IGNORE.includes(external)) {
        continue;
      }

      const importer = findExternalImporter(o, external, filteredChunks);

      if (importer) {
        const fullPath = join(workspaceRoot || projectRoot, importer.fileName);
        moduleResolveMap[fullPath] = moduleResolveMap[fullPath] || {};
        if (importer.moduleIds.length) {
          moduleResolveMap[fullPath][external] = importer.moduleIds[importer.moduleIds.length - 1]?.startsWith(
            '\x00virtual:#virtual',
          )
            ? importer.moduleIds[importer.moduleIds.length - 2]!
            : importer.moduleIds[importer.moduleIds.length - 1]!;
        }
      }
    }
  }

  return { output, fileNameToDependencyMap, usedExternals: moduleResolveMap };
}
