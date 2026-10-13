import {
  ERROR_MESSAGES,
  answerPayloadSchema,
  betPayloadSchema,
  fiftyFiftyPayloadSchema,
  hostReclaimPayloadSchema,
  joinPayloadSchema,
  kickPayloadSchema,
  leaderControlPayloadSchema,
  setLeaderPayloadSchema,
  updateSettingsPayloadSchema,
  rejoinPayloadSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@trivia/shared';
import type { Server, Socket } from 'socket.io';
import type { z } from 'zod';
import { GameError } from '../game/errors';
import type { Room } from '../game/Room';
import type { RoomManager } from '../game/RoomManager';
import { RateLimiter } from '../security/rateLimit';
import { safeEqual } from '../security/tokens';

export interface SocketData {
  role: 'host' | 'player' | null;
  code: string | null;
  playerId: string | null;
  ip: string;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface RealtimeOptions {
  trustProxy: boolean;
  /** Límites por IP (ajustables en pruebas). */
  limits?: {
    perSocket?: [capacity: number, perSecond: number];
    joinPerIp?: [capacity: number, perSecond: number];
    createPerIp?: [capacity: number, perSecond: number];
  };
}

/** Envía las vistas actualizadas, agrupando todos los cambios de un mismo ciclo del bucle de eventos. */
export function createBroadcaster(io: IoServer) {
  const pending = new Set<Room>();
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const rooms = [...pending];
    pending.clear();
    for (const room of rooms) {
      if (room.closed) continue;
      if (room.hostSocketId) io.to(room.hostSocketId).emit('host:state', room.hostView());
      for (const p of room.players.values()) {
        if (!p.socketId) continue;
        const view = room.playerView(p.id);
        if (view) io.to(p.socketId).emit('player:state', view);
      }
    }
  };
  return (room: Room) => {
    pending.add(room);
    if (!scheduled) {
      scheduled = true;
      setImmediate(flush);
    }
  };
}

/** Notifica el cierre de una sala a todos sus sockets y los desvincula. */
export function notifyRoomClosed(io: IoServer, room: Room, reason: string) {
  const socketIds = [room.hostSocketId, ...[...room.players.values()].map((p) => p.socketId)].filter(
    (id): id is string => !!id,
  );
  for (const id of socketIds) {
    io.to(id).emit('room:closed', { reason });
    const s = io.sockets.sockets.get(id);
    if (s && s.data.code === room.code) Object.assign(s.data, { role: null, code: null, playerId: null });
  }
}

function clientIp(socket: IoSocket, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = socket.handshake.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address;
}

function parse<S extends z.ZodType>(schema: S, payload: unknown): z.output<S> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new GameError('INVALID_PAYLOAD', result.error.issues[0]?.message ?? ERROR_MESSAGES.INVALID_PAYLOAD);
  }
  return result.data;
}

export function registerSocketHandlers(io: IoServer, manager: RoomManager, opts: RealtimeOptions) {
  const [sockCap, sockRate] = opts.limits?.perSocket ?? [30, 10];
  const [joinCap, joinRate] = opts.limits?.joinPerIp ?? [20, 0.5];
  const [createCap, createRate] = opts.limits?.createPerIp ?? [8, 0.1];
  const socketLimiter = new RateLimiter(sockCap, sockRate);
  const joinLimiter = new RateLimiter(joinCap, joinRate);
  const createLimiter = new RateLimiter(createCap, createRate);

  io.on('connection', (socket: IoSocket) => {
    socket.data = { role: null, code: null, playerId: null, ip: clientIp(socket, opts.trustProxy) };

    /** Registra un manejador con validación, límite de frecuencia y respuesta (ack) uniforme. */
    const handle = (
      event: keyof ClientToServerEvents,
      fn: (payload: unknown) => Promise<object | void> | object | void,
    ) => {
      socket.on(event, async (payload: unknown, ack?: unknown) => {
        const reply = typeof ack === 'function' ? (ack as (r: unknown) => void) : () => {};
        if (!socketLimiter.take(socket.id)) {
          return reply({ ok: false, error: 'RATE_LIMITED', message: ERROR_MESSAGES.RATE_LIMITED });
        }
        try {
          const result = await fn(payload ?? {});
          reply({ ok: true, ...(result ?? {}) });
        } catch (err) {
          if (err instanceof GameError) return reply({ ok: false, error: err.code, message: err.message });
          console.error(`[socket] error en ${event}`, err);
          reply({ ok: false, error: 'INTERNAL', message: ERROR_MESSAGES.INTERNAL });
        }
      });
    };

    /** Desvincula el socket de la sala anterior si cambia de sala o de rol. */
    const detach = () => {
      const { code } = socket.data;
      if (code) manager.get(code)?.handleDisconnect(socket.id);
      Object.assign(socket.data, { role: null, code: null, playerId: null });
    };

    const requireHost = (): Room => {
      if (socket.data.role !== 'host' || !socket.data.code) throw new GameError('NOT_ALLOWED');
      const room = manager.require(socket.data.code);
      if (room.hostSocketId !== socket.id) throw new GameError('NOT_ALLOWED');
      return room;
    };

    const requirePlayer = (): { room: Room; playerId: string } => {
      if (socket.data.role !== 'player' || !socket.data.code || !socket.data.playerId) throw new GameError('NOT_ALLOWED');
      const room = manager.require(socket.data.code);
      const player = room.players.get(socket.data.playerId);
      if (!player || player.socketId !== socket.id) throw new GameError('INVALID_TOKEN');
      return { room, playerId: player.id };
    };

    const replaceSocket = (previousId: string) => {
      const prev = io.sockets.sockets.get(previousId);
      if (!prev) return;
      Object.assign(prev.data, { role: null, code: null, playerId: null });
      prev.emit('session:replaced', { reason: 'Tu sesión se abrió en otra pestaña o dispositivo.' });
      prev.disconnect(true);
    };

    // ───────────── Anfitrión ─────────────

    handle('host:create', (payload) => {
      if (!createLimiter.take(socket.data.ip)) throw new GameError('RATE_LIMITED');
      const settings = (payload as { settings?: unknown }).settings;
      detach();
      const room = manager.create(settings);
      Object.assign(socket.data, { role: 'host', code: room.code, playerId: null });
      room.attachHost(socket.id);
      return { code: room.code, hostToken: room.hostToken };
    });

    handle('host:reclaim', (payload) => {
      if (!joinLimiter.take(socket.data.ip)) throw new GameError('RATE_LIMITED');
      const { code, hostToken } = parse(hostReclaimPayloadSchema, payload);
      const room = manager.require(code);
      if (!safeEqual(hostToken, room.hostToken)) throw new GameError('INVALID_TOKEN');
      if (socket.data.code !== code) detach();
      Object.assign(socket.data, { role: 'host', code, playerId: null });
      const previous = room.attachHost(socket.id);
      if (previous) replaceSocket(previous);
      return { code };
    });

    handle('host:updateSettings', (payload) => {
      requireHost().updateSettings((payload as { settings?: unknown }).settings);
    });
    handle('host:start', async () => {
      await requireHost().start();
    });
    handle('host:next', () => requireHost().next());
    handle('host:pause', () => requireHost().pause());
    handle('host:resume', () => requireHost().resume());
    handle('host:end', () => requireHost().end());
    handle('host:playAgain', () => requireHost().playAgain());
    handle('host:kick', (payload) => {
      const room = requireHost();
      const { playerId } = parse(kickPayloadSchema, payload);
      const removed = room.removePlayer(playerId);
      if (removed.socketId) {
        const target = io.sockets.sockets.get(removed.socketId);
        if (target) {
          Object.assign(target.data, { role: null, code: null, playerId: null });
          target.emit('player:kicked', { reason: 'El anfitrión te retiró de la sala.' });
        }
      }
    });
    handle('host:setLeader', (payload) => {
      const { playerId } = parse(setLeaderPayloadSchema, payload);
      requireHost().setLeader(playerId);
    });
    handle('host:close', () => {
      const room = requireHost();
      manager.close(room.code, 'El anfitrión cerró la sala.');
    });

    // ───────────── Participantes ─────────────

    handle('player:join', (payload) => {
      if (!joinLimiter.take(socket.data.ip)) throw new GameError('RATE_LIMITED');
      const { code, name } = parse(joinPayloadSchema, payload);
      const room = manager.require(code);
      detach();
      const player = room.addPlayer(name, socket.id);
      Object.assign(socket.data, { role: 'player', code, playerId: player.id });
      return { code, playerId: player.id, token: player.token, name: player.name };
    });

    handle('player:rejoin', (payload) => {
      if (!joinLimiter.take(socket.data.ip, 0.5)) throw new GameError('RATE_LIMITED');
      const { code, token } = parse(rejoinPayloadSchema, payload);
      const room = manager.require(code);
      if (socket.data.code !== code) detach();
      const { player, previousSocketId } = room.reconnectPlayer(token, socket.id);
      Object.assign(socket.data, { role: 'player', code, playerId: player.id });
      if (previousSocketId) replaceSocket(previousSocketId);
      return { code, playerId: player.id, name: player.name };
    });

    handle('player:answer', (payload) => {
      const { room, playerId } = requirePlayer();
      const { questionIndex, choice } = parse(answerPayloadSchema, payload);
      room.submitAnswer(playerId, questionIndex, choice);
    });

    handle('player:bet', (payload) => {
      const { room, playerId } = requirePlayer();
      const { questionIndex, amount } = parse(betPayloadSchema, payload);
      room.placeBet(playerId, questionIndex, amount);
    });

    handle('player:fiftyFifty', (payload) => {
      const { room, playerId } = requirePlayer();
      room.useFiftyFifty(playerId, parse(fiftyFiftyPayloadSchema, payload).questionIndex);
    });

    // El líder puede configurar la partida desde el celular, con las mismas reglas que el anfitrión.
    handle('player:updateSettings', (payload) => {
      const { room, playerId } = requirePlayer();
      if (!room.isLeader(playerId)) throw new GameError('NOT_ALLOWED', 'Solo el líder de la partida puede hacer esto.');
      room.updateSettings(parse(updateSettingsPayloadSchema, payload).settings);
    });

    // El líder puede manejar el avance de la partida desde su celular (no terminarla).
    handle('player:control', async (payload) => {
      const { room, playerId } = requirePlayer();
      if (!room.isLeader(playerId)) throw new GameError('NOT_ALLOWED', 'Solo el líder de la partida puede hacer esto.');
      const { action } = parse(leaderControlPayloadSchema, payload);
      if (action === 'start') await room.start();
      else if (action === 'next') {
        // El líder también juega: si pudiera cerrar la pregunta, respondería y la cerraría antes que los demás.
        if (room.phase === 'question') {
          throw new GameError('NOT_ALLOWED', 'La pregunta se cierra sola cuando todos responden o se acaba el tiempo.');
        }
        room.next();
      }
      else if (action === 'pause') room.pause();
      else if (action === 'resume') room.resume();
      else room.playAgain();
    });

    handle('player:leave', () => {
      const { room, playerId } = requirePlayer();
      room.removePlayer(playerId);
      Object.assign(socket.data, { role: null, code: null, playerId: null });
    });

    // ───────────── Utilidades ─────────────

    socket.on('time:sync', (_payload, ack) => {
      if (typeof ack !== 'function' || !socketLimiter.take(socket.id, 0.25)) return;
      ack(Date.now());
    });

    socket.on('disconnect', () => {
      socketLimiter.delete(socket.id);
      const { code } = socket.data;
      if (code) manager.get(code)?.handleDisconnect(socket.id);
    });
  });
}
