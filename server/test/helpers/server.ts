import type { AddressInfo } from 'node:net';
import type { AckResult, ClientToServerEvents, HostView, PlayerView, ServerToClientEvents } from '@trivia/shared';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createTriviaApp, type TriviaApp } from '../../src/app';
import { readConfig } from '../../src/config';
import type { QuestionRepository } from '../../src/questions/repository';
import type { RealtimeOptions } from '../../src/realtime/socketServer';
import { bankRepository } from './fixtures';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function startTestServer(
  opts: { repository?: QuestionRepository; env?: Record<string, unknown>; realtime?: Partial<RealtimeOptions> } = {},
) {
  const config = readConfig({ NODE_ENV: 'test', PORT: 0, HOST: '127.0.0.1', ...opts.env });
  const app: TriviaApp = createTriviaApp({
    config,
    repository: opts.repository ?? bankRepository(),
    clientDist: '__no_client__',
    realtime: {
      // Límites altos para que las pruebas no choquen con ellos (hay una prueba específica).
      limits: { perSocket: [200, 100], joinPerIp: [500, 100], createPerIp: [500, 100] },
      ...opts.realtime,
    },
  });
  await new Promise<void>((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = app.httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const sockets: TestSocket[] = [];

  const connect = async (): Promise<TestSocket> => {
    const socket: TestSocket = ioClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return socket;
  };

  const close = async () => {
    for (const s of sockets) s.disconnect();
    await app.close();
  };

  return { app, url, connect, close };
}

/** Emite un evento y espera su respuesta (ack). */
export function emit<E extends keyof ClientToServerEvents>(
  socket: TestSocket,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<AckResult<Record<string, any>>> {
  return new Promise((resolve) => {
    (socket.emit as (...args: unknown[]) => void)(event, payload, resolve);
  });
}

/** Guarda la última vista recibida y permite esperar a que cumpla una condición. */
export function trackState<V extends HostView | PlayerView>(socket: TestSocket, event: 'host:state' | 'player:state') {
  const history: V[] = [];
  let waiters: { pred: (v: V) => boolean; resolve: (v: V) => void }[] = [];
  socket.on(event, (view: any) => {
    history.push(view);
    waiters = waiters.filter((w) => {
      if (w.pred(view)) {
        w.resolve(view);
        return false;
      }
      return true;
    });
  });
  return {
    history,
    get last(): V | undefined {
      return history[history.length - 1];
    },
    waitFor(pred: (v: V) => boolean, timeoutMs = 15_000): Promise<V> {
      const current = history[history.length - 1];
      if (current && pred(current)) return Promise.resolve(current);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Tiempo agotado esperando ${event}`)), timeoutMs);
        waiters.push({
          pred,
          resolve: (v) => {
            clearTimeout(timer);
            resolve(v);
          },
        });
      });
    },
  };
}
