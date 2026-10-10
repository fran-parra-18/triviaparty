import type { Socket } from 'socket.io-client';

/**
 * Sincronización con el reloj del servidor (estilo NTP): el servidor decide cuándo abre y cierra
 * cada pregunta; el cliente solo usa el desfase para dibujar la cuenta regresiva.
 */
let offsetMs = 0;
let bestRtt = Infinity;
let syncing = false;

export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Estimación aproximada a partir de una vista recibida, si todavía no hubo sincronización precisa. */
export function observeServerTime(serverTimestamp: number) {
  if (bestRtt === Infinity) offsetMs = serverTimestamp - Date.now();
}

export async function syncClock(socket: Socket, samples = 5) {
  if (syncing) return;
  syncing = true;
  bestRtt = Infinity;
  try {
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now();
      const server = await new Promise<number | null>((resolve) => {
        socket.timeout(3000).emit('time:sync', {}, (err: Error | null, value: number) => resolve(err ? null : value));
      });
      const t1 = Date.now();
      if (server === null) continue;
      const rtt = t1 - t0;
      if (rtt < bestRtt) {
        bestRtt = rtt;
        offsetMs = server + rtt / 2 - t1;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  } finally {
    syncing = false;
  }
}

/** Milisegundos que faltan hasta `endsAt` (hora del servidor). */
export function msUntil(endsAt: number | null | undefined): number {
  if (!endsAt) return 0;
  return Math.max(0, endsAt - serverNow());
}
