import {
  AUTO_LEADERBOARD_DELAY_MS,
  AUTO_NEXT_DELAY_MS,
  AUTO_REVEAL_DELAY_MS,
  AUDIO_MIN_SECONDS,
  BETWEEN_QUESTIONS_COUNTDOWN_MS,
  COUNTDOWN_MS,
  DEFAULT_SETTINGS,
  SCORING_PRESETS,
  gameSettingsSchema,
  type CategoryId,
  type Difficulty,
  type FinalView,
  type GamePhase,
  type GameSettings,
  type HostView,
  type LeaderboardEntry,
  type PlayerStats,
  type PlayerView,
  type PublicPlayer,
  type QuestionSummary,
  type QuestionView,
  type RevealView,
  type SessionHistoryEntry,
  type TimerView,
} from '@trivia/shared';
import type { QuestionRepository } from '../questions/repository';
import { nameKey, sanitizeName } from '../security/sanitize';
import { generateId, generateToken } from '../security/tokens';
import { GameError } from './errors';
import { rankPlayers } from './ranking';
import { computePoints } from './scoring';
import { secureRng, selectQuestionIds, shuffleOptions, type Rng } from './selection';

/** Pregunta en juego. Solo existe en el servidor: incluye la respuesta correcta. */
export interface GameQuestion {
  id: string;
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  source: string | null;
  category: CategoryId;
  difficulty: Difficulty;
  audioUrl: string | null;
}

interface AnswerRecord {
  choice: number;
  elapsedMs: number;
}

interface QuestionResult {
  choice: number | null;
  correct: boolean;
  points: number;
  elapsedMs: number | null;
}

/** Datos visibles para los clientes; se actualizan solo al revelar resultados. */
interface PublishedStanding {
  score: number;
  rank: number | null;
  correctCount: number;
  streak: number;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  nameKey: string;
  avatar: number;
  joinOrder: number;
  socketId: string | null;
  connected: boolean;
  disconnectedAt: number | null;
  joinedLate: boolean;
  score: number;
  correctCount: number;
  totalCorrectMs: number;
  streak: number;
  bestStreak: number;
  answeredCount: number;
  lastPoints: number;
  results: Map<number, QuestionResult>;
  published: PublishedStanding;
}

export interface FinishedGame {
  roomCode: string;
  gameNumber: number;
  startedAt: number;
  endedAt: number;
  endedEarly: boolean;
  settings: GameSettings;
  final: FinalView;
}

export interface RoomDeps {
  repository: QuestionRepository;
  hardMaxPlayers: number;
  onChange: (room: Room) => void;
  onGameFinished?: (game: FinishedGame) => void;
  rng?: Rng;
}

type TimerKind = 'countdown' | 'question' | 'auto';

const ACTIVE_PHASES: GamePhase[] = ['countdown', 'question', 'locked', 'reveal', 'leaderboard'];
const NO_RESULTS_ADVANCE_DELAY_MS = 2000;
const AVATAR_COUNT = 16;

export class Room {
  readonly hostToken = generateToken();
  readonly createdAt = Date.now();
  hostSocketId: string | null = null;
  hostConnected = false;
  hostDisconnectedAt: number | null = Date.now();
  settings: GameSettings;
  readonly players = new Map<string, Player>();
  phase: GamePhase = 'lobby';
  paused = false;
  gameNumber = 0;
  readonly history: SessionHistoryEntry[] = [];
  lastActivity = Date.now();
  notice: string | null = null;
  closed = false;
  /** Jugador que puede controlar la partida desde su celular (lo designa el anfitrión). */
  leaderId: string | null = null;

  private readonly tokens = new Map<string, string>(); // token → playerId
  private readonly rng: Rng;
  private questions: GameQuestion[] = [];
  private currentIndex = -1;
  private readonly answers = new Map<string, AnswerRecord>();
  private timer: NodeJS.Timeout | null = null;
  private timerKind: TimerKind | null = null;
  private timerDeadline: number | null = null;
  private timerAction: (() => void) | null = null;
  private pausedRemaining: number | null = null;
  private questionDurationMs = 0;
  private reveal: RevealView | null = null;
  private leaderboard: LeaderboardEntry[] = [];
  private readonly usedQuestionIds = new Set<string>();
  private questionSummaries: QuestionSummary[] = [];
  private fastestAnswer: { name: string; ms: number } | null = null;
  private final: FinalView | null = null;
  private startedAt = 0;
  private joinCounter = 0;
  private starting = false;

  constructor(
    readonly code: string,
    private readonly deps: RoomDeps,
    settings: unknown = {},
  ) {
    this.rng = deps.rng ?? secureRng;
    this.settings = DEFAULT_SETTINGS;
    this.settings = this.parseSettings(settings);
  }

  // ───────────────────────── Conexiones ─────────────────────────

  /** Asocia un socket como anfitrión. Devuelve el socket anterior (para desconectarlo). */
  attachHost(socketId: string): string | null {
    const previous = this.hostSocketId;
    this.hostSocketId = socketId;
    this.hostConnected = true;
    this.hostDisconnectedAt = null;
    if (this.notice?.startsWith('El anfitrión')) this.notice = null;
    this.touch();
    this.changed();
    return previous !== socketId ? previous : null;
  }

  addPlayer(rawName: unknown, socketId: string): Player {
    this.assertOpen();
    const name = sanitizeName(rawName);
    if (!name) throw new GameError('INVALID_NAME');
    if (ACTIVE_PHASES.includes(this.phase) && !this.settings.allowLateJoin) throw new GameError('GAME_IN_PROGRESS');
    if (this.players.size >= Math.min(this.settings.maxPlayers, this.deps.hardMaxPlayers)) {
      throw new GameError('ROOM_FULL');
    }
    const key = nameKey(name);
    for (const p of this.players.values()) if (p.nameKey === key) throw new GameError('NAME_TAKEN');

    const joinOrder = this.joinCounter++;
    const player: Player = {
      id: generateId('p_'),
      token: generateToken(),
      name,
      nameKey: key,
      avatar: joinOrder % AVATAR_COUNT,
      joinOrder,
      socketId,
      connected: true,
      disconnectedAt: null,
      joinedLate: ACTIVE_PHASES.includes(this.phase),
      ...freshStats(),
    };
    this.players.set(player.id, player);
    this.tokens.set(player.token, player.id);
    this.touch();
    this.changed();
    return player;
  }

  /** Reconexión con el token secreto. No crea un jugador nuevo ni toca la puntuación. */
  reconnectPlayer(token: string, socketId: string): { player: Player; previousSocketId: string | null } {
    this.assertOpen();
    const id = this.tokens.get(token);
    const player = id ? this.players.get(id) : undefined;
    if (!player) throw new GameError('INVALID_TOKEN');
    const previousSocketId = player.socketId && player.socketId !== socketId ? player.socketId : null;
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    this.touch();
    this.changed();
    return { player, previousSocketId };
  }

  /** Marca como desconectado al dueño del socket (anfitrión o jugador). */
  handleDisconnect(socketId: string) {
    if (this.hostSocketId === socketId) {
      this.hostSocketId = null;
      this.hostConnected = false;
      this.hostDisconnectedAt = Date.now();
      if (ACTIVE_PHASES.includes(this.phase) && !this.paused) {
        this.pause();
        this.notice = 'El anfitrión se desconectó. La partida está en pausa hasta que vuelva.';
      }
      this.changed();
      return;
    }
    const player = this.findPlayerBySocket(socketId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = Date.now();
    if (this.phase === 'question' && this.allConnectedAnswered()) this.closeQuestion();
    else this.changed();
  }

  /** Expulsión (anfitrión) o salida voluntaria. El token deja de ser válido. */
  removePlayer(playerId: string): Player {
    const player = this.players.get(playerId);
    if (!player) throw new GameError('INVALID_PAYLOAD', 'Ese jugador no está en la sala.');
    this.players.delete(playerId);
    this.tokens.delete(player.token);
    this.answers.delete(playerId);
    if (this.leaderId === playerId) this.leaderId = null;
    this.leaderboard = this.leaderboard.filter((e) => e.playerId !== playerId);
    if (this.phase === 'question' && this.allConnectedAnswered()) this.closeQuestion();
    else this.changed();
    return player;
  }

  findPlayerBySocket(socketId: string): Player | undefined {
    for (const p of this.players.values()) if (p.socketId === socketId) return p;
    return undefined;
  }

  connectedPlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.connected);
  }

  /** Designa al líder (o lo quita con null). Solo puede haber uno. */
  setLeader(playerId: string | null) {
    this.assertOpen();
    if (playerId !== null && !this.players.has(playerId)) {
      throw new GameError('INVALID_PAYLOAD', 'Ese jugador no está en la sala.');
    }
    this.leaderId = playerId;
    this.touch();
    this.changed();
  }

  isLeader(playerId: string): boolean {
    return this.leaderId !== null && this.leaderId === playerId;
  }

  // ───────────────────────── Configuración ─────────────────────────

  updateSettings(raw: unknown) {
    this.assertOpen();
    if (this.phase !== 'lobby' && this.phase !== 'finished') {
      throw new GameError('INVALID_STATE', 'Solo puedes cambiar la configuración antes de empezar.');
    }
    this.settings = this.parseSettings(raw);
    this.touch();
    this.changed();
  }

  private parseSettings(raw: unknown): GameSettings {
    const patch = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const merged: Record<string, unknown> = { ...this.settings, ...patch };
    if (patch.scoring && typeof patch.scoring === 'object') {
      merged.scoring = { ...this.settings.scoring, ...(patch.scoring as object) };
    }
    const parsed = gameSettingsSchema.safeParse(merged);
    if (!parsed.success) {
      throw new GameError('INVALID_PAYLOAD', parsed.error.issues[0]?.message ?? 'Configuración inválida');
    }
    const settings = parsed.data;
    const preset = settings.scoring.preset;
    if (preset !== 'personalizado') settings.scoring = { preset, ...SCORING_PRESETS[preset] };
    settings.maxPlayers = Math.min(settings.maxPlayers, this.deps.hardMaxPlayers);
    settings.minPlayers = Math.min(settings.minPlayers, settings.maxPlayers);
    settings.categories = [...new Set(settings.categories)];
    return settings;
  }

  // ───────────────────────── Flujo de la partida ─────────────────────────

  async start() {
    this.assertOpen();
    if (this.phase !== 'lobby') throw new GameError('INVALID_STATE', 'La partida ya está en curso.');
    if (this.starting) throw new GameError('INVALID_STATE', 'La partida ya se está iniciando.');
    if (this.connectedPlayers().length < this.settings.minPlayers) throw new GameError('NOT_ENOUGH_PLAYERS');

    this.starting = true;
    try {
      const pool = await this.deps.repository.listMeta(this.settings.categories);
      const ids = selectQuestionIds(
        pool,
        {
          count: this.settings.questionCount,
          categories: this.settings.categories,
          difficulty: this.settings.difficulty,
          random: this.settings.randomOrder,
          excludeIds: this.usedQuestionIds,
        },
        this.rng,
      );
      if (ids.length === 0) {
        throw new GameError(
          'NOT_ENOUGH_QUESTIONS',
          'No quedan preguntas sin usar en esta sesión con esos filtros. Elige otras categorías o dificultad.',
        );
      }
      const records = await this.deps.repository.getByIds(ids);
      if (this.closed || this.phase !== 'lobby') return;

      this.questions = records.map((r) => {
        const { options, correctIndex } = shuffleOptions(r.options, r.answerIndex, this.rng);
        return {
          id: r.id,
          text: r.text,
          options,
          correctIndex,
          explanation: r.explanation,
          source: r.source,
          category: r.categoryId,
          difficulty: r.difficulty,
          audioUrl: r.audioUrl,
        };
      });
      this.notice =
        this.questions.length < this.settings.questionCount
          ? `Solo había ${this.questions.length} preguntas disponibles con esos filtros; la partida tendrá ${this.questions.length}.`
          : null;
      this.gameNumber++;
      this.startedAt = Date.now();
      this.currentIndex = -1;
      this.questionSummaries = [];
      this.fastestAnswer = null;
      this.leaderboard = [];
      this.reveal = null;
      this.final = null;
      this.paused = false;
      for (const p of this.players.values()) Object.assign(p, freshStats(), { joinedLate: false });
      this.phase = 'countdown';
      this.schedule('countdown', COUNTDOWN_MS, () => this.openQuestion(0));
      this.touch();
      this.changed();
    } finally {
      this.starting = false;
    }
  }

  private openQuestion(index: number) {
    const q = this.questions[index];
    if (!q) return this.finish(false);
    this.currentIndex = index;
    this.phase = 'question';
    this.answers.clear();
    this.reveal = null;
    this.usedQuestionIds.add(q.id);
    // Las preguntas con audio duran al menos lo que el fragmento, para poder escucharlo entero.
    const seconds = q.audioUrl ? Math.max(this.settings.timePerQuestion, AUDIO_MIN_SECONDS) : this.settings.timePerQuestion;
    this.questionDurationMs = seconds * 1000;
    this.schedule('question', this.questionDurationMs, () => this.closeQuestion());
    this.changed();
  }

  submitAnswer(playerId: string, questionIndex: number, choice: number) {
    this.assertOpen();
    const player = this.players.get(playerId);
    if (!player) throw new GameError('NOT_ALLOWED');
    if (this.phase !== 'question' || questionIndex !== this.currentIndex) {
      throw new GameError(questionIndex <= this.currentIndex ? 'TOO_LATE' : 'INVALID_STATE');
    }
    if (this.paused) throw new GameError('INVALID_STATE', 'La partida está en pausa.');
    if (this.answers.has(playerId)) throw new GameError('ALREADY_ANSWERED');
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new GameError('INVALID_PAYLOAD');
    const now = Date.now();
    if (this.timerKind !== 'question' || this.timerDeadline === null || now > this.timerDeadline) {
      throw new GameError('TOO_LATE');
    }
    const elapsedMs = Math.min(this.questionDurationMs, Math.max(0, this.questionDurationMs - (this.timerDeadline - now)));
    this.answers.set(playerId, { choice, elapsedMs });
    this.touch();
    if (this.allConnectedAnswered()) this.closeQuestion();
    else this.changed();
  }

  /** Cierra la pregunta: bloquea respuestas y calcula los puntos (aún sin publicarlos). */
  private closeQuestion() {
    if (this.phase !== 'question') return;
    this.clearTimer();
    const q = this.questions[this.currentIndex]!;
    this.phase = 'locked';

    const counts: [number, number, number, number] = [0, 0, 0, 0];
    let correctCount = 0;
    let fastest: { name: string; ms: number } | null = null;
    for (const p of this.players.values()) {
      const ans = this.answers.get(p.id);
      const correct = ans?.choice === q.correctIndex;
      const points = computePoints({
        correct,
        elapsedMs: ans?.elapsedMs ?? this.questionDurationMs,
        durationMs: this.questionDurationMs,
        difficulty: q.difficulty,
        scoring: this.settings.scoring,
      });
      p.results.set(this.currentIndex, { choice: ans?.choice ?? null, correct, points, elapsedMs: ans?.elapsedMs ?? null });
      p.lastPoints = points;
      if (ans) {
        p.answeredCount++;
        counts[ans.choice as 0 | 1 | 2 | 3]++;
      }
      if (correct && ans) {
        p.score += points;
        p.correctCount++;
        p.totalCorrectMs += ans.elapsedMs;
        p.streak++;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
        correctCount++;
        if (!fastest || ans.elapsedMs < fastest.ms) fastest = { name: p.name, ms: ans.elapsedMs };
      } else {
        p.streak = 0;
      }
    }
    if (fastest && (!this.fastestAnswer || fastest.ms < this.fastestAnswer.ms)) this.fastestAnswer = fastest;

    this.reveal = {
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      source: q.source,
      counts,
      answeredCount: this.answers.size,
      correctCount,
      fastestCorrect: fastest,
    };
    this.questionSummaries.push({
      index: this.currentIndex,
      text: q.text,
      category: q.category,
      difficulty: q.difficulty,
      correctAnswer: q.options[q.correctIndex]!,
      correctRate: this.players.size ? correctCount / this.players.size : 0,
    });

    if (!this.settings.showResultsAfterEach) {
      this.schedule('auto', NO_RESULTS_ADVANCE_DELAY_MS, () => this.goToNextQuestion());
    } else if (this.settings.autoAdvance) {
      this.schedule('auto', AUTO_REVEAL_DELAY_MS, () => this.revealAnswer());
    }
    this.changed();
  }

  private revealAnswer() {
    if (this.phase !== 'locked') return;
    this.clearTimer();
    this.phase = 'reveal';
    this.publishStandings();
    if (this.settings.autoAdvance) this.schedule('auto', AUTO_LEADERBOARD_DELAY_MS, () => this.showLeaderboard());
    this.changed();
  }

  private showLeaderboard() {
    if (this.phase !== 'reveal') return;
    this.clearTimer();
    this.phase = 'leaderboard';
    if (this.settings.autoAdvance) this.schedule('auto', AUTO_NEXT_DELAY_MS, () => this.goToNextQuestion());
    this.changed();
  }

  private goToNextQuestion() {
    if (this.phase !== 'locked' && this.phase !== 'leaderboard') return;
    this.clearTimer();
    const next = this.currentIndex + 1;
    if (next >= this.questions.length) return this.finish(false);
    this.phase = 'countdown';
    this.schedule('countdown', BETWEEN_QUESTIONS_COUNTDOWN_MS, () => this.openQuestion(next));
    this.changed();
  }

  /** Acción principal del anfitrión: avanza a la siguiente fase. */
  next() {
    this.assertOpen();
    if (this.paused) {
      this.paused = false;
      this.pausedRemaining = null;
    }
    this.touch();
    switch (this.phase) {
      case 'countdown': {
        const action = this.timerAction;
        this.clearTimer();
        action?.();
        return;
      }
      case 'question':
        return this.closeQuestion();
      case 'locked':
        return this.settings.showResultsAfterEach ? this.revealAnswer() : this.goToNextQuestion();
      case 'reveal':
        return this.showLeaderboard();
      case 'leaderboard':
        return this.goToNextQuestion();
      default:
        throw new GameError('INVALID_STATE');
    }
  }

  pause() {
    this.assertOpen();
    if (!ACTIVE_PHASES.includes(this.phase)) throw new GameError('INVALID_STATE', 'No hay nada que pausar.');
    if (this.paused) return;
    this.paused = true;
    if (this.timer && this.timerDeadline !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.pausedRemaining = Math.max(0, this.timerDeadline - Date.now());
      this.timerDeadline = null;
    }
    this.touch();
    this.changed();
  }

  resume() {
    this.assertOpen();
    if (!this.paused) return;
    this.paused = false;
    if (this.notice?.startsWith('El anfitrión')) this.notice = null;
    if (this.pausedRemaining !== null && this.timerAction && this.timerKind) {
      this.arm(this.pausedRemaining);
    }
    this.pausedRemaining = null;
    this.touch();
    this.changed();
  }

  /** Termina la partida anticipadamente. Una pregunta abierta sin cerrar no puntúa. */
  end() {
    this.assertOpen();
    if (!ACTIVE_PHASES.includes(this.phase)) throw new GameError('INVALID_STATE', 'No hay ninguna partida en curso.');
    this.finish(this.questionSummaries.length < this.questions.length);
  }

  private finish(endedEarly: boolean) {
    this.clearTimer();
    this.paused = false;
    this.pausedRemaining = null;
    this.phase = 'finished';
    this.publishStandings();
    this.final = this.buildFinal(endedEarly);
    this.history.push({
      gameNumber: this.gameNumber,
      endedAt: Date.now(),
      questionCount: this.questionSummaries.length,
      playerCount: this.players.size,
      podium: this.final.ranking.slice(0, 3).map((e) => ({ name: e.name, score: e.score })),
    });
    this.deps.onGameFinished?.({
      roomCode: this.code,
      gameNumber: this.gameNumber,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      endedEarly,
      settings: this.settings,
      final: this.final,
    });
    this.changed();
  }

  /** Vuelve a la sala de espera con los mismos jugadores. Las preguntas ya usadas no se repiten. */
  playAgain() {
    this.assertOpen();
    if (this.phase !== 'finished') throw new GameError('INVALID_STATE');
    this.phase = 'lobby';
    this.questions = [];
    this.currentIndex = -1;
    this.reveal = null;
    this.leaderboard = [];
    this.final = null;
    this.notice = null;
    for (const p of this.players.values()) Object.assign(p, freshStats(), { joinedLate: false });
    this.touch();
    this.changed();
  }

  destroy() {
    this.clearTimer();
    this.closed = true;
  }

  // ───────────────────────── Temporizador ─────────────────────────

  private schedule(kind: TimerKind, ms: number, action: () => void) {
    this.clearTimer();
    this.timerKind = kind;
    this.timerAction = action;
    if (this.paused) this.pausedRemaining = ms;
    else this.arm(ms);
  }

  private arm(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timerDeadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      const action = this.timerAction;
      this.timer = null;
      this.timerDeadline = null;
      this.timerAction = null;
      this.timerKind = null;
      try {
        action?.();
      } catch (err) {
        console.error(`[sala ${this.code}] error en el temporizador`, err);
      }
    }, ms);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.timerDeadline = null;
    this.timerAction = null;
    this.timerKind = null;
    this.pausedRemaining = null;
  }

  // ───────────────────────── Resultados ─────────────────────────

  private allConnectedAnswered(): boolean {
    const connected = this.connectedPlayers();
    return connected.length > 0 && connected.every((p) => this.answers.has(p.id));
  }

  /** Publica puntuaciones y clasificación (hasta este momento los clientes ven las anteriores). */
  private publishStandings() {
    const previous = new Map(this.leaderboard.map((e) => [e.playerId, e.rank]));
    const ranked = rankPlayers(
      [...this.players.values()].map((p) => ({
        id: p.id,
        score: p.score,
        correctCount: p.correctCount,
        totalCorrectMs: p.totalCorrectMs,
        joinOrder: p.joinOrder,
        player: p,
      })),
    );
    this.leaderboard = ranked.map(({ item, rank }) => ({
      playerId: item.player.id,
      name: item.player.name,
      avatar: item.player.avatar,
      score: item.player.score,
      rank,
      previousRank: previous.get(item.player.id) ?? null,
      lastPoints: item.player.lastPoints,
      correctCount: item.player.correctCount,
      connected: item.player.connected,
    }));
    for (const { item, rank } of ranked) {
      item.player.published = {
        score: item.player.score,
        rank,
        correctCount: item.player.correctCount,
        streak: item.player.streak,
      };
    }
  }

  private playerStats(p: Player): PlayerStats {
    const played = p.results.size;
    return {
      playerId: p.id,
      name: p.name,
      answered: p.answeredCount,
      correct: p.correctCount,
      accuracy: played ? p.correctCount / played : 0,
      avgCorrectMs: p.correctCount ? Math.round(p.totalCorrectMs / p.correctCount) : null,
      bestStreak: p.bestStreak,
    };
  }

  private buildFinal(endedEarly: boolean): FinalView {
    const stats = [...this.players.values()].map((p) => this.playerStats(p));
    const summaries = this.questionSummaries;
    const byRate = [...summaries].sort((a, b) => a.correctRate - b.correctRate || a.index - b.index);
    const streakLeader = [...this.players.values()].sort((a, b) => b.bestStreak - a.bestStreak)[0];
    return {
      ranking: this.leaderboard,
      stats,
      questions: summaries,
      highlights: {
        hardestQuestion: byRate.length > 1 && byRate[byRate.length - 1]!.correctRate > byRate[0]!.correctRate ? byRate[0]! : null,
        easiestQuestion:
          byRate.length > 1 && byRate[byRate.length - 1]!.correctRate > byRate[0]!.correctRate ? byRate[byRate.length - 1]! : null,
        fastestAnswer: this.fastestAnswer,
        bestStreak: streakLeader && streakLeader.bestStreak > 1 ? { name: streakLeader.name, streak: streakLeader.bestStreak } : null,
      },
      endedEarly,
    };
  }

  // ───────────────────────── Vistas ─────────────────────────

  private questionView(): QuestionView | null {
    const visible: GamePhase[] = ['question', 'locked', 'reveal', 'leaderboard'];
    const q = this.questions[this.currentIndex];
    if (!q || !visible.includes(this.phase)) return null;
    // Se construye campo a campo: la respuesta correcta nunca forma parte de esta vista.
    return {
      index: this.currentIndex,
      total: this.questions.length,
      text: q.text,
      options: [...q.options] as [string, string, string, string],
      category: q.category,
      difficulty: q.difficulty,
      audioUrl: q.audioUrl,
    };
  }

  private progress() {
    if (!ACTIVE_PHASES.includes(this.phase) || this.questions.length === 0) return null;
    const index = this.phase === 'countdown' ? this.currentIndex + 1 : this.currentIndex;
    return { index, total: this.questions.length };
  }

  private timerView(): TimerView | null {
    if (this.phase === 'question') {
      const remainingMs = this.paused
        ? (this.pausedRemaining ?? 0)
        : Math.max(0, (this.timerDeadline ?? Date.now()) - Date.now());
      return {
        durationMs: this.questionDurationMs,
        endsAt: this.paused ? null : this.timerDeadline,
        remainingMs,
        paused: this.paused,
      };
    }
    if (this.phase === 'locked' || this.phase === 'reveal' || this.phase === 'leaderboard') {
      return { durationMs: this.questionDurationMs, endsAt: null, remainingMs: 0, paused: this.paused };
    }
    return null;
  }

  private publicReveal(): RevealView | null {
    return this.phase === 'reveal' || this.phase === 'leaderboard' ? this.reveal : null;
  }

  hostView(): HostView {
    const connected = this.connectedPlayers().length;
    const players: PublicPlayer[] = [...this.players.values()]
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        score: p.published.score,
        avatar: p.avatar,
        joinedLate: p.joinedLate,
        isLeader: p.id === this.leaderId,
      }));
    return {
      role: 'host',
      code: this.code,
      phase: this.phase,
      paused: this.paused,
      hostConnected: this.hostConnected,
      settings: this.settings,
      players,
      minPlayersMet: connected >= this.settings.minPlayers,
      progress: this.progress(),
      question: this.questionView(),
      timer: this.timerView(),
      countdownEndsAt: this.timerKind === 'countdown' && !this.paused ? this.timerDeadline : null,
      nextAudioUrl: this.phase === 'countdown' ? (this.questions[this.currentIndex + 1]?.audioUrl ?? null) : null,
      answeredCount: this.answers.size,
      expectedCount: connected,
      reveal: this.publicReveal(),
      leaderboard: this.leaderboard,
      final: this.phase === 'finished' ? this.final : null,
      history: this.history,
      gameNumber: this.gameNumber,
      leaderId: this.leaderId,
      autoAdvanceAt: this.timerKind === 'auto' && !this.paused ? this.timerDeadline : null,
      serverNow: Date.now(),
      notice: this.notice,
    };
  }

  playerView(playerId: string): PlayerView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const answer = this.answers.get(playerId);
    const showResult = (this.phase === 'reveal' || this.phase === 'leaderboard') && this.settings.showResultsAfterEach;
    const result = showResult ? p.results.get(this.currentIndex) : undefined;
    const q = this.questions[this.currentIndex];
    const inQuestion = this.phase === 'question' || this.phase === 'locked';

    let final: PlayerView['final'] = null;
    if (this.phase === 'finished' && this.final) {
      final = {
        rank: p.published.rank ?? this.players.size,
        score: p.published.score,
        podium: this.final.ranking.slice(0, 3),
        stats: this.final.stats.find((s) => s.playerId === p.id) ?? null,
        totalPlayers: this.players.size,
      };
    }

    return {
      role: 'player',
      code: this.code,
      phase: this.phase,
      paused: this.paused,
      hostConnected: this.hostConnected,
      me: {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.published.score,
        rank: p.published.rank,
        correctCount: p.published.correctCount,
        streak: p.published.streak,
        isLeader: p.id === this.leaderId,
      },
      minPlayersMet: this.connectedPlayers().length >= this.settings.minPlayers,
      playerCount: this.players.size,
      players: [...this.players.values()]
        .sort((a, b) => a.joinOrder - b.joinOrder)
        .map((x) => ({ id: x.id, name: x.name, avatar: x.avatar, connected: x.connected })),
      progress: this.progress(),
      question: this.questionView(),
      timer: this.timerView(),
      countdownEndsAt: this.timerKind === 'countdown' && !this.paused ? this.timerDeadline : null,
      myAnswer: inQuestion && answer ? { choice: answer.choice, elapsedMs: answer.elapsedMs } : null,
      answeredCount: this.answers.size,
      result:
        result && q
          ? {
              correct: result.correct,
              answered: result.choice !== null,
              myChoice: result.choice,
              correctIndex: q.correctIndex,
              pointsEarned: result.points,
              explanation: q.explanation,
            }
          : null,
      leaderboard: this.leaderboard.slice(0, 5),
      final,
      showResultsAfterEach: this.settings.showResultsAfterEach,
      settings: p.id === this.leaderId ? this.settings : null,
      playedGames: this.history.length,
      gameNumber: this.gameNumber,
      serverNow: Date.now(),
    };
  }

  // ───────────────────────── Utilidades ─────────────────────────

  touch() {
    this.lastActivity = Date.now();
  }

  private changed() {
    if (!this.closed) this.deps.onChange(this);
  }

  private assertOpen() {
    if (this.closed) throw new GameError('ROOM_CLOSED');
  }

  /** Solo para pruebas y diagnósticos internos: nunca se envía a los clientes. */
  _debugCurrentQuestion(): GameQuestion | undefined {
    return this.questions[this.currentIndex];
  }

  _debugUsedQuestionIds(): ReadonlySet<string> {
    return this.usedQuestionIds;
  }
}

function freshStats() {
  return {
    score: 0,
    correctCount: 0,
    totalCorrectMs: 0,
    streak: 0,
    bestStreak: 0,
    answeredCount: 0,
    lastPoints: 0,
    results: new Map<number, QuestionResult>(),
    published: { score: 0, rank: null, correctCount: 0, streak: 0 } as PublishedStanding,
  };
}
