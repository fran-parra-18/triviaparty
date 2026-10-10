/**
 * Simulador de jugadores para pruebas: conecta N «bots» a una sala real por Socket.IO.
 * Los bots NO conocen la respuesta correcta (el servidor nunca la envía antes de revelarla):
 * responden al azar tras un retraso aleatorio, exactamente como lo haría un cliente real.
 *
 *   npm run simulate -- --code=ABC123 [--bots=5] [--url=http://localhost:3001] [--min-delay=1] [--max-delay=8]
 */
import type { ClientToServerEvents, PlayerView, ServerToClientEvents } from '@trivia/shared';
import { io, type Socket } from 'socket.io-client';
import { parseArgs } from './common';

const { values } = parseArgs(process.argv.slice(2));
const code = values.code?.toUpperCase();
if (!code) {
  console.error('Uso: npm run simulate -- --code=ABC123 [--bots=5] [--url=http://localhost:3001]');
  process.exit(1);
}
const url = values.url ?? `http://localhost:${process.env.PORT ?? 3001}`;
const count = Math.min(50, Math.max(1, Number(values.bots ?? 4)));
const minDelay = Number(values['min-delay'] ?? 1) * 1000;
const maxDelay = Number(values['max-delay'] ?? 8) * 1000;
const NAMES = ['Ana Bot', 'Beto Bot', 'Carla Bot', 'Dani Bot', 'Eva Bot', 'Fede Bot', 'Gala Bot', 'Hugo Bot', 'Inés Bot', 'Juan Bot'];

function startBot(i: number) {
  const name = i < NAMES.length ? NAMES[i]! : `Bot ${i + 1}`;
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, { transports: ['websocket'] });
  let token: string | null = null;
  let answered = -1;

  socket.on('connect', () => {
    const payload = token ? { code, token } : { code, name };
    const event = token ? 'player:rejoin' : 'player:join';
    (socket.emit as (...a: unknown[]) => void)(event, payload, (res: { ok: boolean; token?: string; message?: string }) => {
      if (!res.ok) return console.log(`✖ ${name}: ${res.message}`);
      if (res.token) token = res.token;
      console.log(`✔ ${name} conectado`);
    });
  });

  socket.on('player:state', (view: PlayerView) => {
    if (view.phase === 'question' && view.question && answered !== view.question.index && !view.myAnswer && !view.paused) {
      const index = view.question.index;
      answered = index;
      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      setTimeout(() => {
        const choice = Math.floor(Math.random() * 4);
        socket.emit('player:answer', { questionIndex: index, choice }, (res) => {
          if (!res.ok) console.log(`  ${name} no pudo responder: ${res.message}`);
        });
      }, delay);
    }
    if (view.phase === 'reveal' && view.result && view.result.answered) {
      console.log(`  ${name}: ${view.result.correct ? `acertó (+${view.result.pointsEarned})` : 'falló'} · total ${view.me.score}`);
    }
  });
  socket.on('room:closed', ({ reason }) => {
    console.log(`${name}: ${reason}`);
    socket.disconnect();
  });
  socket.on('player:kicked', () => socket.disconnect());
  return socket;
}

console.log(`Conectando ${count} bots a ${url} (sala ${code})… Ctrl+C para salir.`);
const bots = Array.from({ length: count }, (_, i) => startBot(i));
process.on('SIGINT', () => {
  bots.forEach((b) => b.disconnect());
  process.exit(0);
});
