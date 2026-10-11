import { resolve } from 'node:path';
import { readQuestionFiles } from '../../src/questions/parse';
import { InMemoryQuestionRepository } from '../../src/questions/repository';
import { validateRecords } from '../../src/questions/validate';
import type { NormalizedQuestion } from '../../src/questions/schema';

export const DATA_DIR = resolve(__dirname, '..', '..', 'data', 'questions');

let cached: NormalizedQuestion[] | null = null;

/** Banco real de preguntas (data/questions), validado. */
export function loadBank(): NormalizedQuestion[] {
  if (!cached) {
    const { records } = readQuestionFiles([DATA_DIR]);
    const report = validateRecords(records);
    if (report.errors.length) throw new Error(`El banco tiene errores: ${report.errors[0]!.message}`);
    cached = report.valid;
  }
  return cached;
}

export function bankRepository() {
  return new InMemoryQuestionRepository(loadBank());
}

export function makeQuestion(i: number, overrides: Partial<NormalizedQuestion> = {}): NormalizedQuestion {
  return {
    id: `t-${String(i).padStart(4, '0')}`,
    text: `¿Pregunta de prueba número ${i}?`,
    options: [`Opción A${i}`, `Opción B${i}`, `Opción C${i}`, `Opción D${i}`],
    answerIndex: i % 4,
    explanation: `Explicación de la pregunta de prueba ${i}.`,
    categoryId: 'historia',
    difficulty: (['facil', 'media', 'dificil'] as const)[i % 3]!,
    source: null,
    tags: [],
    audioUrl: null,
    normalizedText: `pregunta de prueba numero ${i}`,
    ...overrides,
  };
}
