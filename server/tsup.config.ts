import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/import.ts', 'src/cli/validate.ts', 'src/cli/export.ts', 'src/cli/stats.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  // El paquete compartido se distribuye como código TypeScript: se incluye en el bundle.
  noExternal: ['@trivia/shared'],
});
