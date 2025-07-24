import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    workers: 'src/workers/index.ts',
    engine: 'src/engine/engine.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  treeshake: 'smallest',
  splitting: true,
  external: [
    'cloudflare:workers',
    'cloudflare:workflows',
    'cloudflare:email',
    'cloudflare:sockets',
    'cloudflare:pipelines',
  ],
});
