import type { Ack, HostView, PlayerView } from './types';

export const LEADER_ACTIONS = ['start', 'next', 'pause', 'resume', 'playAgain'] as const;
export type LeaderAction = (typeof LEADER_ACTIONS)[number];

/** Eventos que el cliente envía al servidor. Todos los payloads se validan con Zod en el servidor. */
export interface ClientToServerEvents {
  // ── Anfitrión ──
  'host:create': (payload: { settings?: unknown }, ack: Ack<{ code: string; hostToken: string }>) => void;
  'host:reclaim': (payload: { code: string; hostToken: string }, ack: Ack<{ code: string }>) => void;
  'host:updateSettings': (payload: { settings: unknown }, ack: Ack) => void;
  'host:start': (payload: Record<string, never>, ack: Ack) => void;
  /** Avanza la partida según la fase: cierra la pregunta, revela, muestra la tabla o pasa a la siguiente. */
  'host:next': (payload: Record<string, never>, ack: Ack) => void;
  'host:pause': (payload: Record<string, never>, ack: Ack) => void;
  'host:resume': (payload: Record<string, never>, ack: Ack) => void;
  'host:end': (payload: Record<string, never>, ack: Ack) => void;
  'host:playAgain': (payload: Record<string, never>, ack: Ack) => void;
  'host:kick': (payload: { playerId: string }, ack: Ack) => void;
  /** Designa (o quita, con null) al jugador líder que controla la partida desde su celular. */
  'host:setLeader': (payload: { playerId: string | null }, ack: Ack) => void;
  'host:close': (payload: Record<string, never>, ack: Ack) => void;

  // ── Participante ──
  'player:join': (
    payload: { code: string; name: string },
    ack: Ack<{ code: string; playerId: string; token: string; name: string }>,
  ) => void;
  'player:rejoin': (payload: { code: string; token: string }, ack: Ack<{ code: string; playerId: string; name: string }>) => void;
  'player:answer': (payload: { questionIndex: number; choice: number }, ack: Ack) => void;
  'player:leave': (payload: Record<string, never>, ack: Ack) => void;
  /** Acciones de control permitidas al jugador líder. */
  'player:control': (payload: { action: LeaderAction }, ack: Ack) => void;
  /** El líder cambia la configuración desde su celular (solo antes de empezar o al terminar). */
  'player:updateSettings': (payload: { settings: unknown }, ack: Ack) => void;

  // ── Utilidades ──
  /** Sincronización de reloj: devuelve la hora del servidor. */
  'time:sync': (payload: Record<string, never>, ack: (serverNow: number) => void) => void;
}

/** Eventos que el servidor envía a los clientes. */
export interface ServerToClientEvents {
  'host:state': (view: HostView) => void;
  'player:state': (view: PlayerView) => void;
  'room:closed': (payload: { reason: string }) => void;
  'player:kicked': (payload: { reason: string }) => void;
  'session:replaced': (payload: { reason: string }) => void;
}
