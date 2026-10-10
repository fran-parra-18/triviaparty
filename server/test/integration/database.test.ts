import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Room } from '../../src/game/Room';
import { importQuestions } from '../../src/questions/importer';
import { PrismaQuestionRepository } from '../../src/questions/repository';
import { loadBank, makeQuestion } from '../helpers/fixtures';

const SERVER_DIR = resolve(__dirname, '..', '..');
const DB_FILE = resolve(SERVER_DIR, 'prisma', 'test-integration.db');
const DB_URL = 'file:./test-integration.db';
let prisma: PrismaClient;

beforeAll(() => {
  rmSync(DB_FILE, { force: true });
  execSync('node scripts/prisma.mjs migrate deploy', {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: DB_URL },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasourceUrl: DB_URL });
});

afterAll(async () => {
  await prisma?.$disconnect();
  rmSync(DB_FILE, { force: true });
});

describe('base de datos (SQLite + migraciones de Prisma)', () => {
  it('importa el banco completo y es idempotente', async () => {
    const bank = loadBank();
    const first = await importQuestions(prisma, bank);
    expect(first.created).toBe(bank.length);
    expect(first.conflicts).toEqual([]);
    const second = await importQuestions(prisma, bank);
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: bank.length });
    expect(await prisma.question.count()).toBe(bank.length);
    expect(await prisma.category.count()).toBe(16);
  });

  it('actualiza por id y rechaza un enunciado duplicado con otro id', async () => {
    const q = makeQuestion(1, { id: 'zz-update-1' });
    await importQuestions(prisma, [q]);
    const changed = { ...q, explanation: 'Explicación corregida para la prueba de actualización.' };
    expect((await importQuestions(prisma, [changed])).updated).toBe(1);
    const dup = { ...q, id: 'zz-otro-id' };
    const res = await importQuestions(prisma, [dup]);
    expect(res.created).toBe(0);
    expect(res.conflicts[0]!.message).toMatch(/ya existe/);
  });

  it('el modo simulación no escribe nada', async () => {
    const before = await prisma.question.count();
    const res = await importQuestions(prisma, [makeQuestion(999, { id: 'zz-dry' })], { dryRun: true });
    expect(res.created).toBe(1);
    expect(await prisma.question.count()).toBe(before);
  });

  it('el repositorio filtra por categoría y devuelve las preguntas completas', async () => {
    const repo = new PrismaQuestionRepository(prisma);
    const meta = await repo.listMeta(['historia']);
    expect(meta.length).toBeGreaterThan(100);
    expect(meta.every((m) => m.categoryId === 'historia')).toBe(true);
    const [full] = await repo.getByIds([meta[0]!.id]);
    expect(full!.options).toHaveLength(4);
    expect(full!.answerIndex).toBeGreaterThanOrEqual(0);
    const stats = await repo.stats();
    expect(stats.byCategory.historia!.total).toBe(meta.length);
  });

  it('una sala real selecciona preguntas de la base de datos', async () => {
    const room = new Room('DBTEST', {
      repository: new PrismaQuestionRepository(prisma),
      hardMaxPlayers: 10,
      onChange: () => {},
    }, { questionCount: 5, categories: ['historia'] });
    room.addPlayer('Ana', 's1');
    await room.start();
    expect(room.phase).toBe('countdown');
    room.destroy();
  });
});
