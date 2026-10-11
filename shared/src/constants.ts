/** Alfabeto de los códigos de sala: sin caracteres ambiguos (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_REGEX = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 20;

export const TIME_OPTIONS = [10, 15, 20, 30, 60] as const;
export type TimeOption = (typeof TIME_OPTIONS)[number];

/** Tiempo mínimo de las preguntas con audio: lo que dura la vista previa de iTunes. */
export const AUDIO_MIN_SECONDS = 30;

export const QUESTION_COUNT_MIN = 3;
export const QUESTION_COUNT_MAX = 100;

/** Duración de la cuenta regresiva inicial (y entre preguntas) en milisegundos. */
export const COUNTDOWN_MS = 3000;
export const BETWEEN_QUESTIONS_COUNTDOWN_MS = 1500;

/** Tiempos del modo de avance automático. */
export const AUTO_REVEAL_DELAY_MS = 1500;
export const AUTO_LEADERBOARD_DELAY_MS = 7000;
export const AUTO_NEXT_DELAY_MS = 5000;

export const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export const SCORING_PRESETS = {
  clasico: { basePoints: 1000, speedBonusMax: 500, difficultyMultiplier: false },
  velocidad: { basePoints: 500, speedBonusMax: 1000, difficultyMultiplier: false },
  precision: { basePoints: 1000, speedBonusMax: 0, difficultyMultiplier: false },
  dificultad: { basePoints: 1000, speedBonusMax: 500, difficultyMultiplier: true },
} as const;
export type ScoringPreset = keyof typeof SCORING_PRESETS | 'personalizado';

export const DIFFICULTY_MULTIPLIERS = { facil: 1, media: 1.5, dificil: 2 } as const;
