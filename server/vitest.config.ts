import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Las pruebas de integración levantan servidores y bases de datos reales: se ejecutan en serie.
    fileParallelism: false,
  },
});
