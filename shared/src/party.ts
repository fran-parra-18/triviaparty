// Reglas del Modo Fiesta y de los premios del podio, compartidas por servidor y clientes.

export const SPECIAL_KINDS = ['relampago', 'doble', 'bomba', 'final'] as const;
export type SpecialKind = (typeof SPECIAL_KINDS)[number];

export const SPECIAL_INFO: Record<SpecialKind, { emoji: string; title: string; description: string; multiplier: number }> = {
  relampago: { emoji: '⚡', title: 'Pregunta relámpago', description: '¡Solo la mitad del tiempo!', multiplier: 1 },
  doble: { emoji: '✖️2', title: 'Puntos dobles', description: 'Esta pregunta vale el doble', multiplier: 2 },
  bomba: { emoji: '💣', title: 'Pregunta bomba', description: '¡Vale el triple!', multiplier: 3 },
  final: { emoji: '🏁', title: 'Última oportunidad', description: 'La última pregunta vale el doble: ¡todavía se puede remontar!', multiplier: 2 },
};

/** Las preguntas relámpago duran la mitad, pero nunca menos de esto. */
export const LIGHTNING_MIN_SECONDS = 5;

/** Racha (solo Modo Fiesta): +10 % por cada acierto seguido anterior, con un máximo de +50 %. */
export const STREAK_BONUS_STEP = 0.1;
export const STREAK_BONUS_MAX = 0.5;

/** Bonificación por racha según los aciertos seguidos que el jugador traía antes de esta pregunta. */
export function streakBonus(previousStreak: number): number {
  return Math.min(STREAK_BONUS_MAX, Math.max(0, previousStreak) * STREAK_BONUS_STEP);
}

/**
 * Tiempos del podio con suspenso, en ms desde que termina la partida: se revela el 3.º, luego el 2.º
 * y, tras un redoble, el campeón. Los celulares esperan lo mismo para no adelantar el resultado.
 */
export const PODIUM_TIMINGS = { third: 1500, second: 4000, drumroll: 5500, first: 8000 } as const;
export const PODIUM_REVEAL_MS = PODIUM_TIMINGS.first + 500;

export const AWARD_KINDS = ['cerebrito', 'rayo', 'imparable', 'suertudo', 'caotico'] as const;
export type AwardKind = (typeof AWARD_KINDS)[number];

export const AWARD_INFO: Record<AwardKind, { emoji: string; title: string }> = {
  cerebrito: { emoji: '🧠', title: 'El Cerebrito' },
  rayo: { emoji: '⚡', title: 'El Rayo' },
  imparable: { emoji: '🔥', title: 'El Imparable' },
  suertudo: { emoji: '🍀', title: 'El Suertudo' },
  caotico: { emoji: '🤡', title: 'El Caótico' },
};
