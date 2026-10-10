/**
 * Exporta las preguntas de la base de datos a JSON o CSV (formato reimportable).
 *   npm run questions:export -- salida.json
 *   npm run questions:export -- salida.csv [--category=historia]
 */
import { writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { loadEnvFiles, readConfig } from '../config';
import { parseArgs } from './common';

loadEnvFiles();
process.env.DATABASE_URL = readConfig().DATABASE_URL;
const { getPrisma, disconnectPrisma } = await import('../db');

const { values, positional } = parseArgs(process.argv.slice(2));
const out = positional[0];
if (!out) {
  console.error('Uso: npm run questions:export -- <salida.json|salida.csv> [--category=<id>]');
  process.exit(1);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const prisma = getPrisma();
const rows = await prisma.question.findMany({
  where: { active: true, ...(values.category ? { categoryId: values.category } : {}) },
  orderBy: [{ categoryId: 'asc' }, { id: 'asc' }],
});
const questions = rows.map((r) => ({
  id: r.id,
  question: r.text,
  options: [r.option0, r.option1, r.option2, r.option3],
  answer: r.answerIndex,
  explanation: r.explanation,
  category: r.categoryId,
  difficulty: r.difficulty,
  source: r.source,
  tags: r.tags ? r.tags.split(',') : [],
}));

if (extname(out).toLowerCase() === '.csv') {
  const header = 'id,question,option_a,option_b,option_c,option_d,answer,explanation,category,difficulty,source,tags';
  const lines = questions.map((q) =>
    [q.id, q.question, ...q.options, 'ABCD'[q.answer], q.explanation, q.category, q.difficulty, q.source, q.tags.join('|')]
      .map(csvCell)
      .join(','),
  );
  writeFileSync(out, String.fromCharCode(0xfeff) +[header, ...lines].join('\r\n') + '\r\n', 'utf8');
} else {
  writeFileSync(out, JSON.stringify(questions, null, 2) + '\n', 'utf8');
}
console.log(`✔ ${questions.length} preguntas exportadas a ${out}`);
await disconnectPrisma();
