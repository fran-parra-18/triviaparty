#!/usr/bin/env node
// Envoltorio de la CLI de Prisma que elige el esquema según DATABASE_URL:
//   file:...          → prisma/schema.prisma           (SQLite)
//   postgres(ql)://   → prisma/postgres/schema.prisma  (PostgreSQL)
// Uso: node scripts/prisma.mjs <comando prisma> [...args]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const file of [resolve(serverDir, '.env'), resolve(serverDir, '..', '.env')]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = 'file:./trivia.db';

const url = process.env.DATABASE_URL;
const isPostgres = /^postgres(ql)?:\/\//i.test(url);
const schema = isPostgres ? 'prisma/postgres/schema.prisma' : 'prisma/schema.prisma';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`Uso: node scripts/prisma.mjs <comando>  (esquema actual: ${schema})`);
  process.exit(0);
}

const result = spawnSync('npx', ['prisma', ...args, '--schema', schema], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});
process.exit(result.status ?? 1);
