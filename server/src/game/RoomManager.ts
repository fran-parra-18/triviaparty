import type { QuestionRepository } from '../questions/repository';
import { generateRoomCode } from '../security/tokens';
import { GameError } from './errors';
import { Room, type FinishedGame } from './Room';

export interface RoomManagerOptions {
  repository: QuestionRepository;
  hardMaxPlayers: number;
  maxRooms: number;
  hostGraceMs: number;
  roomIdleMs: number;
  /** Jugadores desconectados en la sala de espera se eliminan pasado este tiempo. */
  lobbyDisconnectRemoveMs?: number;
  onRoomChange: (room: Room) => void;
  onRoomClosed: (room: Room, reason: string) => void;
  onGameFinished?: (game: FinishedGame) => void;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(private readonly opts: RoomManagerOptions) {}

  startSweeper(intervalMs = 15_000) {
    this.sweeper = setInterval(() => this.sweep(), intervalMs);
    this.sweeper.unref();
  }

  stop() {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const room of [...this.rooms.values()]) this.close(room.code, 'El servidor se está reiniciando.');
  }

  create(settings?: unknown): Room {
    if (this.rooms.size >= this.opts.maxRooms) throw new GameError('SERVER_FULL');
    let code = generateRoomCode();
    for (let i = 0; this.rooms.has(code); i++) {
      if (i > 50) throw new GameError('SERVER_FULL');
      code = generateRoomCode();
    }
    const room = new Room(
      code,
      {
        repository: this.opts.repository,
        hardMaxPlayers: this.opts.hardMaxPlayers,
        onChange: this.opts.onRoomChange,
        onGameFinished: this.opts.onGameFinished,
      },
      settings,
    );
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  require(code: string): Room {
    const room = this.rooms.get(code);
    if (!room || room.closed) throw new GameError('ROOM_NOT_FOUND');
    return room;
  }

  close(code: string, reason: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    room.destroy();
    this.opts.onRoomClosed(room, reason);
  }

  get size() {
    return this.rooms.size;
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  /** Limpieza periódica: anfitriones ausentes, salas inactivas y jugadores que abandonaron la sala de espera. */
  sweep(now = Date.now()) {
    const lobbyRemoveMs = this.opts.lobbyDisconnectRemoveMs ?? 5 * 60_000;
    for (const room of [...this.rooms.values()]) {
      if (!room.hostConnected && room.hostDisconnectedAt !== null && now - room.hostDisconnectedAt > this.opts.hostGraceMs) {
        this.close(room.code, 'El anfitrión no volvió y la sala se cerró.');
        continue;
      }
      if (now - room.lastActivity > this.opts.roomIdleMs) {
        this.close(room.code, 'La sala se cerró por inactividad.');
        continue;
      }
      if (room.phase === 'lobby') {
        for (const p of [...room.players.values()]) {
          if (!p.connected && p.disconnectedAt !== null && now - p.disconnectedAt > lobbyRemoveMs) {
            room.removePlayer(p.id);
          }
        }
      }
    }
  }
}
