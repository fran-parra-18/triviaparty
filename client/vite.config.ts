import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Lee variables de los archivos .env (raíz y server/) sin mezclarlas con el entorno del proceso. */
function readEnvFiles(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const file of [resolve(__dirname, '..', '.env'), resolve(__dirname, '..', 'server', '.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/);
      if (m) values[m[1]!] = m[2]!.trim();
    }
  }
  return values;
}

export default defineConfig(() => {
  const files = readEnvFiles();
  // Puerto del servidor al que se redirigen /api y /socket.io. scripts/dev.mjs define SERVER_PORT.
  // La variable PORT del entorno se ignora: en desarrollo puede referirse al propio Vite.
  const serverPort = process.env.SERVER_PORT || files.SERVER_PORT || files.PORT || '3001';
  const clientPort = Number(process.env.CLIENT_DEV_PORT || files.CLIENT_DEV_PORT || 5173);
  const target = `http://localhost:${serverPort}`;
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true, // 0.0.0.0: accesible desde los celulares de la misma red
      port: clientPort,
      strictPort: true,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/socket.io': { target, ws: true, changeOrigin: true },
      },
    },
    preview: { host: true, port: 4173 },
    build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 800 },
  };
});
