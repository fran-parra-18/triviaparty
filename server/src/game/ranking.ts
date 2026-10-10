export interface Rankable {
  id: string;
  score: number;
  correctCount: number;
  /** Suma de los tiempos de respuesta de las respuestas correctas (ms). */
  totalCorrectMs: number;
  joinOrder: number;
}

/**
 * Criterios de desempate (en este orden):
 *  1. Mayor puntuación.
 *  2. Más respuestas correctas.
 *  3. Menor tiempo acumulado en las respuestas correctas (más rápido).
 * Si los tres coinciden, los jugadores comparten la posición (1, 1, 3…).
 * El orden de incorporación solo se usa para mostrarlos de forma estable, no da ventaja.
 */
export function compareRankables(a: Rankable, b: Rankable): number {
  return b.score - a.score || b.correctCount - a.correctCount || a.totalCorrectMs - b.totalCorrectMs;
}

export function rankPlayers<T extends Rankable>(players: T[]): { item: T; rank: number }[] {
  const sorted = [...players].sort((a, b) => compareRankables(a, b) || a.joinOrder - b.joinOrder);
  const out: { item: T; rank: number }[] = [];
  sorted.forEach((item, i) => {
    const prev = out[i - 1];
    const rank = prev && compareRankables(prev.item, item) === 0 ? prev.rank : i + 1;
    out.push({ item, rank });
  });
  return out;
}
