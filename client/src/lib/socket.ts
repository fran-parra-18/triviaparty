import { ERROR_MESSAGES, type AckResult, type ClientToServerEvents, type ServerToClientEvents } from '@trivia/shared';
import { io, type Socket } from 'socket.io-client';
import { syncClock } from './clock';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;

/** Socket único por pestaña. Se reconecta solo, con espera progresiva. */
export function getSocket(): ClientSocket {
  if (!socket) {
    socket = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      timeout: 8000,
    });
    socket.on('connect', () => void syncClock(socket!));
  }
  return socket;
}

type Payload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type AckData<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]>[1] extends (res: infer R) => void ? R : never;

/** Envía un evento y espera la confirmación del servidor, con tiempo máximo. */
export function request<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Payload<E>,
  timeoutMs = 8000,
): Promise<AckData<E>> {
  const s = getSocket();
  return new Promise((resolve) => {
    if (!s.connected) {
      resolve({ ok: false, error: 'INTERNAL', message: 'Sin conexión con el servidor. Reintentando…' } as AckData<E>);
      return;
    }
    (s.timeout(timeoutMs).emit as (...args: unknown[]) => void)(event, payload, (err: Error | null, res: unknown) => {
      if (err) resolve({ ok: false, error: 'INTERNAL', message: 'El servidor no respondió a tiempo.' } as AckData<E>);
      else resolve(res as AckData<E>);
    });
  });
}

export function errorText(res: AckResult<object>): string {
  return res.ok ? '' : res.message || ERROR_MESSAGES[res.error] || 'Error desconocido';
}
