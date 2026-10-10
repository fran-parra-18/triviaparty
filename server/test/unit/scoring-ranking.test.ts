import { describe, expect, it } from 'vitest';
import { rankPlayers } from '../../src/game/ranking';
import { computePoints } from '../../src/game/scoring';

const classic = { preset: 'clasico' as const, basePoints: 1000, speedBonusMax: 500, difficultyMultiplier: false };

describe('computePoints', () => {
  it('da 0 puntos a respuestas incorrectas o sin responder', () => {
    expect(computePoints({ correct: false, elapsedMs: 100, durationMs: 20000, difficulty: 'facil', scoring: classic })).toBe(0);
  });

  it('da base + bonificación completa a una respuesta instantánea', () => {
    expect(computePoints({ correct: true, elapsedMs: 0, durationMs: 20000, difficulty: 'facil', scoring: classic })).toBe(1500);
  });

  it('la bonificación es proporcional al tiempo restante', () => {
    expect(computePoints({ correct: true, elapsedMs: 10000, durationMs: 20000, difficulty: 'facil', scoring: classic })).toBe(1250);
    expect(computePoints({ correct: true, elapsedMs: 15000, durationMs: 20000, difficulty: 'facil', scoring: classic })).toBe(1125);
  });

  it('una respuesta al final del tiempo recibe solo los puntos base', () => {
    expect(computePoints({ correct: true, elapsedMs: 20000, durationMs: 20000, difficulty: 'media', scoring: classic })).toBe(1000);
    expect(computePoints({ correct: true, elapsedMs: 25000, durationMs: 20000, difficulty: 'media', scoring: classic })).toBe(1000);
  });

  it('aplica el multiplicador de dificultad si está activo', () => {
    const scoring = { ...classic, difficultyMultiplier: true };
    expect(computePoints({ correct: true, elapsedMs: 0, durationMs: 10000, difficulty: 'dificil', scoring })).toBe(3000);
    expect(computePoints({ correct: true, elapsedMs: 0, durationMs: 10000, difficulty: 'media', scoring })).toBe(2250);
  });

  it('sin bonificación por rapidez todas las correctas valen lo mismo', () => {
    const scoring = { ...classic, speedBonusMax: 0 };
    expect(computePoints({ correct: true, elapsedMs: 1, durationMs: 10000, difficulty: 'facil', scoring })).toBe(1000);
    expect(computePoints({ correct: true, elapsedMs: 9999, durationMs: 10000, difficulty: 'facil', scoring })).toBe(1000);
  });
});

describe('rankPlayers (desempates)', () => {
  const p = (id: string, score: number, correctCount: number, totalCorrectMs: number, joinOrder: number) => ({
    id,
    score,
    correctCount,
    totalCorrectMs,
    joinOrder,
  });

  it('ordena por puntuación descendente', () => {
    const r = rankPlayers([p('a', 100, 1, 1000, 0), p('b', 300, 1, 1000, 1), p('c', 200, 1, 1000, 2)]);
    expect(r.map((x) => [x.item.id, x.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('a igual puntuación gana quien tiene más aciertos', () => {
    const r = rankPlayers([p('a', 1000, 1, 500, 0), p('b', 1000, 2, 9000, 1)]);
    expect(r[0]!.item.id).toBe('b');
    expect(r[1]!.rank).toBe(2);
  });

  it('a igual puntuación y aciertos gana quien respondió más rápido en total', () => {
    const r = rankPlayers([p('a', 1000, 2, 9000, 0), p('b', 1000, 2, 4000, 1)]);
    expect(r[0]!.item.id).toBe('b');
  });

  it('empate total: comparten posición y el siguiente salta (1, 1, 3)', () => {
    const r = rankPlayers([p('a', 500, 1, 3000, 0), p('b', 500, 1, 3000, 1), p('c', 100, 1, 3000, 2)]);
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3]);
    // El orden de incorporación solo decide cómo se listan, no la posición.
    expect(r.map((x) => x.item.id)).toEqual(['a', 'b', 'c']);
  });
});
