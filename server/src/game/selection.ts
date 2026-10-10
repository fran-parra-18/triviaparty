import { randomInt } from 'node:crypto';
import { CATEGORIES, type CategoryId, type Difficulty, type DifficultyMode } from '@trivia/shared';
import type { QuestionMeta } from '../questions/repository';

export type Rng = () => number; // [0, 1)

export const secureRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export function shuffle<T>(items: readonly T[], rng: Rng = secureRng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const CATEGORY_ORDER = new Map(CATEGORIES.map((c, i) => [c.id as string, i]));
const DIFFICULTY_ORDER: Record<Difficulty, number> = { facil: 0, media: 1, dificil: 2 };

/** Toma `count` preguntas alternando categorías para que la partida sea variada. */
function balancedPick(pool: QuestionMeta[], count: number, rng: Rng): QuestionMeta[] {
  const groups = new Map<string, QuestionMeta[]>();
  for (const q of pool) (groups.get(q.categoryId) ?? groups.set(q.categoryId, []).get(q.categoryId)!).push(q);
  const queues = shuffle([...groups.values()], rng).map((g) => shuffle(g, rng));
  const out: QuestionMeta[] = [];
  while (out.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) {
      const next = queue.pop();
      if (next) out.push(next);
      if (out.length >= count) break;
    }
  }
  // Barajar el resultado evita que el orden de categorías sea un ciclo predecible.
  return shuffle(out, rng);
}

export interface SelectionOptions {
  count: number;
  categories: readonly CategoryId[];
  difficulty: DifficultyMode;
  random: boolean;
  excludeIds: ReadonlySet<string>;
}

/**
 * Elige los ids de las preguntas de una partida. Nunca repite ids ni usa los de `excludeIds`
 * (preguntas ya jugadas en la sesión). Puede devolver menos de `count` si no hay suficientes.
 */
export function selectQuestionIds(pool: QuestionMeta[], opts: SelectionOptions, rng: Rng = secureRng): string[] {
  const seen = new Set<string>();
  let filtered = pool.filter((q) => {
    if (seen.has(q.id) || opts.excludeIds.has(q.id) || !opts.categories.includes(q.categoryId)) return false;
    seen.add(q.id);
    return true;
  });
  if (opts.difficulty === 'facil' || opts.difficulty === 'media' || opts.difficulty === 'dificil') {
    filtered = filtered.filter((q) => q.difficulty === opts.difficulty);
  }

  const sequentialSort = (a: QuestionMeta, b: QuestionMeta) =>
    CATEGORY_ORDER.get(a.categoryId)! - CATEGORY_ORDER.get(b.categoryId)! || a.id.localeCompare(b.id);

  if (opts.difficulty !== 'progresiva') {
    if (!opts.random) return [...filtered].sort(sequentialSort).slice(0, opts.count).map((q) => q.id);
    return balancedPick(filtered, opts.count, rng).map((q) => q.id);
  }

  // Dificultad progresiva: primero fáciles, luego medias y al final difíciles.
  const third = Math.floor(opts.count / 3);
  const targets: Record<Difficulty, number> = { facil: opts.count - 2 * third, media: third, dificil: third };
  const levels: Difficulty[] = ['facil', 'media', 'dificil'];
  const picked: QuestionMeta[] = [];
  const pick = (candidates: QuestionMeta[], n: number) =>
    opts.random ? balancedPick(candidates, n, rng) : [...candidates].sort(sequentialSort).slice(0, n);
  for (const level of levels) {
    picked.push(...pick(filtered.filter((q) => q.difficulty === level), targets[level]));
  }
  // Si faltan preguntas de algún nivel, se completa con las de cualquier nivel no usadas.
  if (picked.length < opts.count) {
    const used = new Set(picked.map((q) => q.id));
    picked.push(...pick(filtered.filter((q) => !used.has(q.id)), opts.count - picked.length));
  }
  return picked
    .map((q, i) => ({ q, i }))
    .sort((a, b) => DIFFICULTY_ORDER[a.q.difficulty] - DIFFICULTY_ORDER[b.q.difficulty] || a.i - b.i)
    .map(({ q }) => q.id);
}

/** Baraja las 4 opciones y devuelve el nuevo índice de la respuesta correcta. */
export function shuffleOptions(
  options: readonly [string, string, string, string],
  answerIndex: number,
  rng: Rng = secureRng,
): { options: [string, string, string, string]; correctIndex: number } {
  const order = shuffle([0, 1, 2, 3], rng);
  return {
    options: order.map((i) => options[i]!) as [string, string, string, string],
    correctIndex: order.indexOf(answerIndex),
  };
}
