import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Carga server/.env y luego .env de la raíz (las variables ya definidas no se sobrescriben). */
export function loadEnvFiles() {
  for (const file of [resolve(SERVER_ROOT, '.env'), resolve(SERVER_ROOT, '..', '.env')]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'si', 'sí'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('file:./trivia.db'),
  PUBLIC_URL: z
    .string()
    .default('')
    .transform((v) => v.trim().replace(/\/+$/, '')),
  CLIENT_DEV_PORT: z.coerce.number().int().default(5173),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  HOST_GRACE_MINUTES: z.coerce.number().min(0.05).default(10),
  ROOM_IDLE_MINUTES: z.coerce.number().min(1).default(120),
  MAX_PLAYERS_HARD_LIMIT: z.coerce.number().int().min(2).max(1000).default(100),
  MAX_ROOMS: z.coerce.number().int().min(1).default(500),
  TRUST_PROXY: boolish.default(false),
});

export type AppConfig = z.infer<typeof envSchema>;

export function readConfig(overrides: Partial<Record<keyof AppConfig, unknown>> = {}): AppConfig {
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida en variables de entorno:\n${issues}`);
  }
  return parsed.data;
}
