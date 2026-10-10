import { DIFFICULTY_MULTIPLIERS, type Difficulty, type ScoringSettings } from '@trivia/shared';

export interface ScoreInput {
  correct: boolean;
  /** Tiempo que tardó el jugador en responder (sin contar pausas), en ms. */
  elapsedMs: number;
  durationMs: number;
  difficulty: Difficulty;
  scoring: ScoringSettings;
}

/**
 * Puntos por una respuesta:
 *   incorrecta o sin responder → 0
 *   correcta → base + bonificación × (tiempo restante / tiempo total)
 *   opcional: × multiplicador por dificultad (fácil 1, media 1,5, difícil 2)
 */
export function computePoints({ correct, elapsedMs, durationMs, difficulty, scoring }: ScoreInput): number {
  if (!correct) return 0;
  const remainingFraction = Math.min(1, Math.max(0, 1 - elapsedMs / durationMs));
  let points = scoring.basePoints + scoring.speedBonusMax * remainingFraction;
  if (scoring.difficultyMultiplier) points *= DIFFICULTY_MULTIPLIERS[difficulty];
  return Math.round(points);
}
