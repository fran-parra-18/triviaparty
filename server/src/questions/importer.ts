import type { PrismaClient } from '@prisma/client';
import { CATEGORIES } from '@trivia/shared';
import type { NormalizedQuestion } from './schema';
import type { Issue } from './validate';

export async function ensureCategories(prisma: PrismaClient) {
  await prisma.$transaction(
    CATEGORIES.map((c, i) =>
      prisma.category.upsert({
        where: { id: c.id },
        create: { id: c.id, name: c.name, emoji: c.emoji, sortOrder: i },
        update: { name: c.name, emoji: c.emoji, sortOrder: i },
      }),
    ),
  );
}

export interface ImportOptions {
  dryRun?: boolean;
  /** Elimina de la base de datos las preguntas cuyo id no aparece en el lote importado. */
  prune?: boolean;
}

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  pruned: number;
  conflicts: Issue[];
}

function sameContent(q: NormalizedQuestion, row: Record<string, unknown>) {
  return (
    row.text === q.text &&
    row.option0 === q.options[0] &&
    row.option1 === q.options[1] &&
    row.option2 === q.options[2] &&
    row.option3 === q.options[3] &&
    row.answerIndex === q.answerIndex &&
    row.explanation === q.explanation &&
    row.categoryId === q.categoryId &&
    row.difficulty === q.difficulty &&
    (row.source ?? null) === q.source &&
    row.tags === q.tags.join(',') &&
    row.active === true
  );
}

/**
 * Inserta o actualiza (por id) preguntas ya validadas. Rechaza las que tengan el mismo enunciado
 * que otra pregunta existente con distinto id, para no introducir duplicados.
 */
export async function importQuestions(
  prisma: PrismaClient,
  questions: NormalizedQuestion[],
  opts: ImportOptions = {},
): Promise<ImportResult> {
  await ensureCategories(prisma);
  const existing = await prisma.question.findMany();
  const byId = new Map(existing.map((r) => [r.id, r]));
  const idByText = new Map(existing.map((r) => [r.normalizedText, r.id]));

  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, pruned: 0, conflicts: [] };
  const toCreate: NormalizedQuestion[] = [];
  const toUpdate: NormalizedQuestion[] = [];

  for (const q of questions) {
    const ownerOfText = idByText.get(q.normalizedText);
    if (ownerOfText && ownerOfText !== q.id) {
      result.conflicts.push({
        ref: q.id,
        id: q.id,
        message: `El enunciado ya existe en la base de datos con el id "${ownerOfText}"`,
      });
      continue;
    }
    const row = byId.get(q.id);
    if (!row) toCreate.push(q);
    else if (sameContent(q, row)) result.unchanged++;
    else toUpdate.push(q);
  }

  const importedIds = new Set(questions.map((q) => q.id));
  const toPrune = opts.prune ? existing.filter((r) => !importedIds.has(r.id)).map((r) => r.id) : [];

  result.created = toCreate.length;
  result.updated = toUpdate.length;
  result.pruned = toPrune.length;
  if (opts.dryRun) return result;

  const data = (q: NormalizedQuestion) => ({
    text: q.text,
    option0: q.options[0],
    option1: q.options[1],
    option2: q.options[2],
    option3: q.options[3],
    answerIndex: q.answerIndex,
    explanation: q.explanation,
    categoryId: q.categoryId,
    difficulty: q.difficulty,
    source: q.source,
    tags: q.tags.join(','),
    normalizedText: q.normalizedText,
    active: true,
  });

  if (toPrune.length) await prisma.question.deleteMany({ where: { id: { in: toPrune } } });
  const CHUNK = 250;
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    await prisma.question.createMany({ data: toCreate.slice(i, i + CHUNK).map((q) => ({ id: q.id, ...data(q) })) });
  }
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    await prisma.$transaction(
      toUpdate.slice(i, i + CHUNK).map((q) => prisma.question.update({ where: { id: q.id }, data: data(q) })),
    );
  }
  return result;
}
