import { z } from 'zod';
import { CATEGORY_IDS } from './categories';
import {
  NAME_MAX_LENGTH,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
  ROOM_CODE_REGEX,
  TIME_OPTIONS,
} from './constants';

export const difficultyModeSchema = z.enum(['mixta', 'facil', 'media', 'dificil', 'progresiva']);
export type DifficultyMode = z.infer<typeof difficultyModeSchema>;

export const scoringSchema = z.object({
  preset: z.enum(['clasico', 'velocidad', 'precision', 'dificultad', 'personalizado']).default('clasico'),
  basePoints: z.number().int().min(0).max(10000).default(1000),
  speedBonusMax: z.number().int().min(0).max(10000).default(500),
  difficultyMultiplier: z.boolean().default(false),
});
export type ScoringSettings = z.infer<typeof scoringSchema>;

export const gameSettingsSchema = z
  .object({
    questionCount: z.number().int().min(QUESTION_COUNT_MIN).max(QUESTION_COUNT_MAX).default(10),
    timePerQuestion: z
      .number()
      .int()
      .refine((v) => (TIME_OPTIONS as readonly number[]).includes(v), 'Tiempo no permitido')
      .default(20),
    categories: z.array(z.enum(CATEGORY_IDS)).min(1, 'Elige al menos una categoría').default([...CATEGORY_IDS]),
    difficulty: difficultyModeSchema.default('mixta'),
    minPlayers: z.number().int().min(1).max(1000).default(1),
    maxPlayers: z.number().int().min(1).max(1000).default(50),
    scoring: scoringSchema.default({
      preset: 'clasico',
      basePoints: 1000,
      speedBonusMax: 500,
      difficultyMultiplier: false,
    }),
    allowLateJoin: z.boolean().default(true),
    showResultsAfterEach: z.boolean().default(true),
    randomOrder: z.boolean().default(true),
    autoAdvance: z.boolean().default(false),
    /** Modo Fiesta: preguntas especiales al azar, última oportunidad y bonificación por racha. */
    partyMode: z.boolean().default(false),
  })
  .refine((s) => s.minPlayers <= s.maxPlayers, {
    message: 'El mínimo de jugadores no puede superar al máximo',
    path: ['minPlayers'],
  });
export type GameSettings = z.infer<typeof gameSettingsSchema>;

export const DEFAULT_SETTINGS: GameSettings = gameSettingsSchema.parse({});

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_REGEX, 'Código de sala inválido');

/** Validación superficial; la limpieza real se hace en el servidor (sanitizeName). */
export const playerNameSchema = z.string().min(1).max(NAME_MAX_LENGTH * 3);

export const tokenSchema = z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/);

export const joinPayloadSchema = z.object({ code: roomCodeSchema, name: playerNameSchema });
export const rejoinPayloadSchema = z.object({ code: roomCodeSchema, token: tokenSchema });
export const hostReclaimPayloadSchema = z.object({ code: roomCodeSchema, hostToken: tokenSchema });
export const answerPayloadSchema = z.object({
  questionIndex: z.number().int().min(0).max(QUESTION_COUNT_MAX),
  choice: z.number().int().min(0).max(3),
});
export const betPayloadSchema = z.object({
  questionIndex: z.number().int().min(0).max(QUESTION_COUNT_MAX),
  amount: z.union([z.literal(0), z.literal(250), z.literal(500)]),
});
export const fiftyFiftyPayloadSchema = z.object({ questionIndex: z.number().int().min(0).max(QUESTION_COUNT_MAX) });
export const setLeaderPayloadSchema = z.object({ playerId: z.string().min(1).max(64).nullable() });
export const leaderControlPayloadSchema = z.object({
  action: z.enum(['start', 'next', 'pause', 'resume', 'playAgain']),
});
export const kickPayloadSchema = z.object({ playerId: z.string().min(1).max(64) });
export const updateSettingsPayloadSchema = z.object({ settings: z.unknown() });
