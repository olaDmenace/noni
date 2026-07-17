import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  dts: false,
  // Workspace packages ship raw TypeScript (main -> src/index.ts) and don't exist
  // in the runtime image — bundle them into dist instead of importing at runtime.
  noExternal: [/^@noni\//],
});
