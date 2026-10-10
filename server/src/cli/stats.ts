/** Muestra cuántas preguntas activas hay en la base de datos, por categoría y dificultad. */
import { CATEGORIES } from '@trivia/shared';
import { loadEnvFiles, readConfig } from '../config';

loadEnvFiles();
process.env.DATABASE_URL = readConfig().DATABASE_URL;
const { getPrisma, disconnectPrisma } = await import('../db');
const { PrismaQuestionRepository } = await import('../questions/repository');

const repo = new PrismaQuestionRepository(getPrisma());
const { total, byCategory } = await repo.stats();
console.table(
  CATEGORIES.map((c) => {
    const s = byCategory[c.id]!;
    return { Categoría: `${c.emoji} ${c.name}`, Fácil: s.facil, Media: s.media, Difícil: s.dificil, Total: s.total };
  }),
);
console.log(`Total de preguntas activas en la base de datos: ${total}`);
await disconnectPrisma();
