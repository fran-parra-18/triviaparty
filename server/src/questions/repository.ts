import type { PrismaClient } from '@prisma/client';
import { CATEGORIES, DIFFICULTIES, type CategoryId, type Difficulty } from '@trivia/shared';
import type { NormalizedQuestion } from './schema';

export interface QuestionMeta {
  id: string;
  categoryId: CategoryId;
  difficulty: Difficulty;
}

export interface QuestionRecord extends QuestionMeta {
  text: string;
  options: [string, string, string, string];
  answerIndex: number;
  explanation: string;
  source: string | null;
}

export type CategoryStats = Record<string, { total: number } & Record<Difficulty, number>>;

export interface QuestionRepository {
  listMeta(categories: readonly CategoryId[]): Promise<QuestionMeta[]>;
  getByIds(ids: string[]): Promise<QuestionRecord[]>;
  stats(): Promise<{ total: number; byCategory: CategoryStats }>;
}

function emptyStats(): CategoryStats {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, { total: 0, facil: 0, media: 0, dificil: 0 }]));
}

export class PrismaQuestionRepository implements QuestionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listMeta(categories: readonly CategoryId[]): Promise<QuestionMeta[]> {
    const rows = await this.prisma.question.findMany({
      where: { active: true, categoryId: { in: [...categories] } },
      select: { id: true, categoryId: true, difficulty: true },
      orderBy: { id: 'asc' },
    });
    return rows as QuestionMeta[];
  }

  async getByIds(ids: string[]): Promise<QuestionRecord[]> {
    const rows = await this.prisma.question.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({
        id: r.id,
        categoryId: r.categoryId as CategoryId,
        difficulty: r.difficulty as Difficulty,
        text: r.text,
        options: [r.option0, r.option1, r.option2, r.option3],
        answerIndex: r.answerIndex,
        explanation: r.explanation,
        source: r.source,
      }));
  }

  async stats() {
    const groups = await this.prisma.question.groupBy({
      by: ['categoryId', 'difficulty'],
      where: { active: true },
      _count: { _all: true },
    });
    const byCategory = emptyStats();
    let total = 0;
    for (const g of groups) {
      const cat = byCategory[g.categoryId];
      if (!cat || !(DIFFICULTIES as readonly string[]).includes(g.difficulty)) continue;
      cat[g.difficulty as Difficulty] += g._count._all;
      cat.total += g._count._all;
      total += g._count._all;
    }
    return { total, byCategory };
  }
}

/** Repositorio en memoria (pruebas y herramientas sin base de datos). */
export class InMemoryQuestionRepository implements QuestionRepository {
  private readonly questions: QuestionRecord[];

  constructor(questions: NormalizedQuestion[]) {
    this.questions = questions.map((q) => ({
      id: q.id,
      categoryId: q.categoryId,
      difficulty: q.difficulty,
      text: q.text,
      options: q.options,
      answerIndex: q.answerIndex,
      explanation: q.explanation,
      source: q.source,
    }));
  }

  async listMeta(categories: readonly CategoryId[]) {
    return this.questions
      .filter((q) => categories.includes(q.categoryId))
      .map(({ id, categoryId, difficulty }) => ({ id, categoryId, difficulty }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  async getByIds(ids: string[]) {
    const byId = new Map(this.questions.map((q) => [q.id, q]));
    return ids.map((id) => byId.get(id)).filter((q): q is QuestionRecord => !!q);
  }

  async stats() {
    const byCategory = emptyStats();
    for (const q of this.questions) {
      byCategory[q.categoryId]![q.difficulty]++;
      byCategory[q.categoryId]!.total++;
    }
    return { total: this.questions.length, byCategory };
  }
}
