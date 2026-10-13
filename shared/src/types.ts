import type { CategoryId, Difficulty } from './categories';
import type { MusicStage } from './music';
import type { AwardKind, SpecialKind } from './party';
import type { GameSettings } from './schemas';

export type GamePhase =
  | 'lobby' // sala de espera
  | 'countdown' // cuenta regresiva antes de una pregunta
  | 'question' // pregunta abierta, se aceptan respuestas
  | 'locked' // respuestas cerradas, esperando revelar
  | 'reveal' // respuesta correcta visible
  | 'leaderboard' // clasificación tras la pregunta
  | 'finished'; // podio final

export interface PublicPlayer {
  id: string;
  name: string;
  connected: boolean;
  score: number;
  /** Índice de color/avatar estable para mostrar al jugador. */
  avatar: number;
  joinedLate: boolean;
  /** Jugador designado por el anfitrión para controlar la partida desde su celular. */
  isLeader: boolean;
}

export interface TimerView {
  durationMs: number;
  /** Instante (reloj del servidor, ms epoch) en que se cierra la pregunta. Null si está en pausa. */
  endsAt: number | null;
  /** Milisegundos restantes en el momento en que se generó la vista. */
  remainingMs: number;
  paused: boolean;
}

/** Pregunta tal como la ve un cliente. NUNCA incluye la respuesta correcta. */
export interface QuestionView {
  index: number;
  total: number;
  text: string;
  options: [string, string, string, string];
  category: CategoryId;
  difficulty: Difficulty;
  /** Fragmento de audio que la pantalla principal reproduce (preguntas de pistas musicales). */
  audioUrl: string | null;
  /** Pregunta especial del Modo Fiesta (null en las normales). */
  special: SpecialKind | null;
  /** Pregunta con apuesta (Modo Fiesta). */
  bet: boolean;
  /** Modo Musical: tramos en los que se revela el fragmento (null fuera de ese modo). */
  musicStages: MusicStage[] | null;
}

/** Apuestas abiertas antes de una pregunta con apuesta (vista de la pantalla principal). */
export interface BettingView {
  questionIndex: number;
  category: CategoryId;
  difficulty: Difficulty;
  /** Apuestas mayores que 0 hechas hasta ahora. */
  bets: { playerId: string; name: string; avatar: number; amount: number }[];
}

export interface RevealView {
  correctIndex: number;
  explanation: string;
  source: string | null;
  /** Cantidad de respuestas por opción. */
  counts: [number, number, number, number];
  answeredCount: number;
  correctCount: number;
  fastestCorrect: { name: string; ms: number } | null;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  avatar: number;
  score: number;
  rank: number;
  previousRank: number | null;
  /** Puntos obtenidos en la última pregunta. */
  lastPoints: number;
  correctCount: number;
  connected: boolean;
}

export interface PlayerStats {
  playerId: string;
  name: string;
  answered: number;
  correct: number;
  accuracy: number; // 0..1
  avgCorrectMs: number | null;
  bestStreak: number;
}

/** Premio gracioso del podio. */
export interface Award {
  kind: AwardKind;
  playerId: string;
  name: string;
  avatar: number;
  /** Motivo en una frase, por ejemplo «8 aciertos». */
  detail: string;
}

export interface QuestionSummary {
  index: number;
  text: string;
  category: CategoryId;
  difficulty: Difficulty;
  correctAnswer: string;
  correctRate: number; // 0..1 sobre jugadores en partida
}

export interface FinalView {
  ranking: LeaderboardEntry[];
  stats: PlayerStats[];
  questions: QuestionSummary[];
  highlights: {
    hardestQuestion: QuestionSummary | null;
    easiestQuestion: QuestionSummary | null;
    fastestAnswer: { name: string; ms: number } | null;
    bestStreak: { name: string; streak: number } | null;
  };
  awards: Award[];
  endedEarly: boolean;
}

export interface SessionHistoryEntry {
  gameNumber: number;
  endedAt: number;
  questionCount: number;
  podium: { name: string; score: number }[];
  playerCount: number;
}

export interface HostView {
  role: 'host';
  code: string;
  phase: GamePhase;
  paused: boolean;
  hostConnected: boolean;
  settings: GameSettings;
  players: PublicPlayer[];
  minPlayersMet: boolean;
  /** Pregunta actual o próxima (durante la cuenta regresiva). */
  progress: { index: number; total: number } | null;
  question: QuestionView | null;
  timer: TimerView | null;
  countdownEndsAt: number | null;
  /** Audio de la próxima pregunta, para precargarlo durante la cuenta regresiva. */
  nextAudioUrl: string | null;
  /** Pregunta especial que viene (solo durante la cuenta regresiva). */
  nextSpecial: SpecialKind | null;
  betting: BettingView | null;
  /** Cuántos usaron el 50/50 en la pregunta actual. */
  fiftyFiftyCount: number;
  answeredCount: number;
  expectedCount: number;
  reveal: RevealView | null;
  leaderboard: LeaderboardEntry[];
  final: FinalView | null;
  history: SessionHistoryEntry[];
  gameNumber: number;
  leaderId: string | null;
  /** Instante en que se programó el siguiente avance automático. */
  autoAdvanceAt: number | null;
  serverNow: number;
  notice: string | null;
}

export interface PlayerResult {
  correct: boolean;
  answered: boolean;
  myChoice: number | null;
  correctIndex: number;
  pointsEarned: number;
  /** Multiplicador de la pregunta especial (1 en las normales). */
  multiplier: number;
  /** Bonificación por racha aplicada, de 0 a 0,5 (solo Modo Fiesta). */
  streakBonus: number;
  /** Si usó el 50/50 en esta pregunta (los puntos se reducen a la mitad). */
  usedFiftyFifty: boolean;
  /** Apuesta hecha (0 si no apostó) y cuánto ganó o perdió con ella. */
  bet: number;
  betDelta: number;
  /** Modo Musical: tramo (0, 1 o 2) en el que respondió; null si no respondió o fuera de ese modo. */
  musicStage: number | null;
  explanation: string;
}

export interface PlayerView {
  role: 'player';
  code: string;
  phase: GamePhase;
  paused: boolean;
  hostConnected: boolean;
  me: {
    id: string;
    name: string;
    avatar: number;
    score: number;
    rank: number | null;
    correctCount: number;
    streak: number;
    /** Si es true, este jugador puede controlar la partida (líder). */
    isLeader: boolean;
  };
  minPlayersMet: boolean;
  playerCount: number;
  players: { id: string; name: string; avatar: number; connected: boolean }[];
  progress: { index: number; total: number } | null;
  question: QuestionView | null;
  timer: TimerView | null;
  countdownEndsAt: number | null;
  /** Pregunta especial que viene (solo durante la cuenta regresiva). */
  nextSpecial: SpecialKind | null;
  /** Apuesta de la próxima pregunta (solo durante su cuenta regresiva). */
  betting: { questionIndex: number; category: CategoryId; difficulty: Difficulty; myBet: number | null; maxBet: number } | null;
  /** Comodín 50/50: si puede usarlo ahora y qué opciones le oculta en la pregunta actual. */
  fiftyFifty: { available: boolean; hiddenOptions: number[] };
  myAnswer: { choice: number; elapsedMs: number } | null;
  answeredCount: number;
  result: PlayerResult | null;
  leaderboard: LeaderboardEntry[];
  final: {
    rank: number;
    score: number;
    podium: LeaderboardEntry[];
    stats: PlayerStats | null;
    totalPlayers: number;
    /** Premios graciosos que ganó este jugador. */
    awards: Award[];
  } | null;
  showResultsAfterEach: boolean;
  /** Configuración de la partida: solo se envía al líder, que puede cambiarla desde el celular. */
  settings: GameSettings | null;
  /** Partidas ya jugadas en esta sesión (sus preguntas no se repiten). */
  playedGames: number;
  gameNumber: number;
  serverNow: number;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_CLOSED'
  | 'NAME_TAKEN'
  | 'INVALID_NAME'
  | 'GAME_IN_PROGRESS'
  | 'NOT_ALLOWED'
  | 'INVALID_PAYLOAD'
  | 'INVALID_STATE'
  | 'RATE_LIMITED'
  | 'TOO_LATE'
  | 'ALREADY_ANSWERED'
  | 'NOT_ENOUGH_QUESTIONS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_TOKEN'
  | 'SERVER_FULL'
  | 'INTERNAL';

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: ErrorCode; message: string }) => void;
export type AckResult<T = object> = Parameters<Ack<T>>[0];
