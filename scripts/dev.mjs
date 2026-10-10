#!/usr/bin/env node
// Arranca el servidor (API + Socket.IO) y el cliente de Vite en paralelo para desarrollo.
// Los puertos se toman de SERVER_PORT / CLIENT_DEV_PORT o de los archivos .env (PORT / CLIENT_DEV_PORT).
// La variable PORT del entorno se ignora a propósito: en desarrollo es ambigua (algunas herramientas
// la definen para el cliente), así que el servidor recibe siempre un puerto explícito.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fileEnv() {
  const values = {};
  for (const file of [resolve(root, '.env'), resolve(root, 'server', '.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/);
      if (m) values[m[1]] = m[2].trim();
    }
  }
  return values;
}

const env = fileEnv();
const serverPort = process.env.SERVER_PORT || env.SERVER_PORT || env.PORT || '3001';
const clientPort = process.env.CLIENT_DEV_PORT || env.CLIENT_DEV_PORT || '5173';

const colors = { server: '\x1b[35m', client: '\x1b[36m' };
const children = [];

function run(name, args, extraEnv) {
  // En Windows npm es un .cmd y requiere shell; se pasa como una sola cadena (los argumentos son fijos).
  const isWin = process.platform === 'win32';
  const child = spawn(isWin ? `npm ${args.join(' ')}` : 'npm', isWin ? [] : args, {
    cwd: root,
    shell: isWin,
    env: { ...process.env, ...extraEnv },
    // stdin se ignora: heredarlo puede bloquear a Vite en algunos terminales de Windows.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `${colors[name]}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}terminó (código ${code})`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('server', ['run', 'dev', '-w', 'server'], { PORT: serverPort, CLIENT_DEV_PORT: clientPort, NODE_ENV: 'development' });
run('client', ['run', 'dev', '-w', 'client'], { SERVER_PORT: serverPort, CLIENT_DEV_PORT: clientPort });
