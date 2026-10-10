import { createHash } from 'node:crypto';
import { CATEGORY_IDS, DIFFICULTIES, type CategoryId, type Difficulty } from '@trivia/shared';
import { z } from 'zod';

const DIFFICULTY_ALIASES: Record<string, Difficulty> = {
  facil: 'facil',
  fácil: 'facil',
  easy: 'facil',
  media: 'media',
  medio: 'media',
  medium: 'media',
  normal: 'media',
  dificil: 'dificil',
  difícil: 'dificil',
  hard: 'dificil',
};

const difficultyInput = z
  .string()
  .transform((v, ctx) => {
    const d = DIFFICULTY_ALIASES[v.trim().toLowerCase()];
    if (!d) {
      ctx.addIssue({ code: 'custom', message: `Dificultad desconocida "${v}" (usa: ${DIFFICULTIES.join(', ')})` });
      return z.NEVER;
    }
    return d;
  });

const answerInput = z.union([
  z.number().int().min(0).max(3),
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const upper = v.toUpperCase();
      if (/^[ABCD]$/.test(upper)) return upper.charCodeAt(0) - 65;
      if (/^[0-3]$/.test(v)) return Number(v);
      ctx.addIssue({ code: 'custom', message: `Respuesta "${v}" inválida (usa 0-3 o A-D)` });
      return z.NEVER;
    }),
]);

const tagsInput = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((v) => {
    const list = Array.isArray(v) ? v : (v ?? '').split(/[,|]/);
    return [...new Set(list.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  });

const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} es obligatorio` })
    .transform((v) => v.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(min, `${label}: mínimo ${min} caracteres`).max(max, `${label}: máximo ${max} caracteres`));

/** Formato canónico de una pregunta en los archivos de importación. */
export const questionInputSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_-]{2,63}$/i, 'id: solo letras, números, guiones (3-64 caracteres)')
    .optional(),
  question: text(8, 250, 'question'),
  options: z.array(text(1, 90, 'option')).length(4, 'options: deben ser exactamente 4'),
  answer: answerInput,
  explanation: text(15, 600, 'explanation'),
  category: z.enum(CATEGORY_IDS, { error: (iss) => `Categoría desconocida "${String(iss.input)}"` }),
  difficulty: difficultyInput,
  source: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() ? v.trim().slice(0, 300) : null)),
  tags: tagsInput,
});

export type QuestionInput = z.input<typeof questionInputSchema>;
export type ParsedQuestionInput = z.output<typeof questionInputSchema>;

/** Pregunta normalizada y lista para guardarse en la base de datos. */
export interface NormalizedQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  answerIndex: number;
  explanation: string;
  categoryId: CategoryId;
  difficulty: Difficulty;
  source: string | null;
  tags: string[];
  normalizedText: string;
}

/** Minúsculas, sin tildes, sin signos de puntuación y con espacios simples. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deriveId(category: string, normalized: string): string {
  const prefix = category.replace(/[^a-z]/g, '').slice(0, 4);
  return `${prefix}-${createHash('sha1').update(normalized).digest('hex').slice(0, 10)}`;
}

export function toNormalized(q: ParsedQuestionInput): NormalizedQuestion {
  const normalizedText = normalizeText(q.question);
  return {
    id: q.id ?? deriveId(q.category, normalizedText),
    text: q.question,
    options: q.options as [string, string, string, string],
    answerIndex: q.answer,
    explanation: q.explanation,
    categoryId: q.category,
    difficulty: q.difficulty,
    source: q.source,
    tags: q.tags,
    normalizedText,
  };
}
