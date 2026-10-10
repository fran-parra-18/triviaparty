import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostView, PlayerView } from '@trivia/shared';
import { emit, startTestServer, trackState, type TestSocket } from '../helpers/server';

type Server = Awaited<ReturnType<typeof startTestServer>>;
let server: Server;

beforeEach(async () => {
  server = await startTestServer();
});
afterEach(async () => {
  await server.close();
});

async function createRoom(settings: object = {}) {
  const host = await server.connect();
  const hostState = trackState<HostView>(host, 'host:state');
  const res = await emit(host, 'host:create', { settings: { questionCount: 3, timePerQuestion: 10, ...settings } });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(res.message);
  await hostState.waitFor((v) => v.code === res.code);
  return { host, hostState, code: res.code as string, hostToken: res.hostToken as string };
}

async function joinPlayer(code: string, name: string) {
  const socket = await server.connect();
  const state = trackState<PlayerView>(socket, 'player:state');
  const res = await emit(socket, 'player:join', { code, name });
  if (!res.ok) throw new Error(`${res.error}: ${res.message}`);
  await state.waitFor((v) => v.me.id === res.playerId);
  return { socket, state, playerId: res.playerId as string, token: res.token as string };
}

/** Respuesta correcta conocida solo por el servidor (acceso interno de prueba). */
function correctIndexOf(code: string) {
  return server.app.manager.get(code)!._debugCurrentQuestion()!.correctIndex;
}

describe('partida completa en tiempo real', () => {
  it('anfitrión y 3 jugadores juegan de principio a fin con puntuación del servidor', async () => {
    const { host, hostState, code } = await createRoom();
    const players = await Promise.all([joinPlayer(code, 'Ana'), joinPlayer(code, 'Beto'), joinPlayer(code, 'Carla')]);
    const lobby = await hostState.waitFor((v) => v.players.length === 3);
    expect(lobby.players.map((p) => p.name).sort()).toEqual(['Ana', 'Beto', 'Carla']);
    expect(lobby.players.every((p) => p.connected)).toBe(true);

    expect((await emit(host, 'host:start', {})).ok).toBe(true);
    const seenQuestionTexts = new Set<string>();
    const expectedScores = new Map<string, number>(players.map((p) => [p.playerId, 0]));

    for (let i = 0; i < 3; i++) {
      // Todos reciben la misma pregunta, sin la respuesta correcta.
      const views = await Promise.all(players.map((p) => p.state.waitFor((v) => v.phase === 'question' && v.question?.index === i)));
      const texts = new Set(views.map((v) => v.question!.text));
      expect(texts.size).toBe(1);
      const text = views[0]!.question!.text;
      expect(seenQuestionTexts.has(text)).toBe(false);
      seenQuestionTexts.add(text);
      for (const v of views) {
        expect(v.timer!.endsAt).toBeGreaterThan(Date.now());
        expect(JSON.stringify(v)).not.toMatch(/correctIndex|explanation/);
      }

      const correct = correctIndexOf(code);
      // Ana acierta, Beto falla, Carla acierta.
      const choices = [correct, (correct + 1) % 4, correct];
      for (let k = 0; k < players.length; k++) {
        const res = await emit(players[k]!.socket, 'player:answer', { questionIndex: i, choice: choices[k]! });
        expect(res.ok).toBe(true);
      }
      // Una segunda respuesta se rechaza.
      const dup = await emit(players[0]!.socket, 'player:answer', { questionIndex: i, choice: (correct + 2) % 4 });
      expect(dup).toMatchObject({ ok: false });

      const locked = await hostState.waitFor((v) => v.phase === 'locked' && v.progress?.index === i);
      expect(locked.answeredCount).toBe(3);
      expect(locked.reveal).toBeNull();

      expect((await emit(host, 'host:next', {})).ok).toBe(true); // revelar
      const reveal = await hostState.waitFor((v) => v.phase === 'reveal' && v.progress?.index === i);
      expect(reveal.reveal!.correctIndex).toBe(correct);
      expect(reveal.reveal!.correctCount).toBe(2);

      const playerReveals = await Promise.all(players.map((p) => p.state.waitFor((v) => v.phase === 'reveal' && v.progress?.index === i)));
      expect(playerReveals.map((v) => v.result!.correct)).toEqual([true, false, true]);
      for (let k = 0; k < players.length; k++) {
        const r = playerReveals[k]!.result!;
        expect(r.correctIndex).toBe(correct);
        if (r.correct) expect(r.pointsEarned).toBeGreaterThanOrEqual(1000);
        else expect(r.pointsEarned).toBe(0);
        expectedScores.set(players[k]!.playerId, expectedScores.get(players[k]!.playerId)! + r.pointsEarned);
        expect(playerReveals[k]!.me.score).toBe(expectedScores.get(players[k]!.playerId));
      }

      await emit(host, 'host:next', {}); // clasificación
      const lb = await hostState.waitFor((v) => v.phase === 'leaderboard');
      expect(lb.leaderboard).toHaveLength(3);
      expect(lb.leaderboard.find((e) => e.name === 'Beto')!.score).toBe(0);
      await emit(host, 'host:next', {}); // siguiente
    }

    const final = await hostState.waitFor((v) => v.phase === 'finished');
    expect(final.final!.ranking).toHaveLength(3);
    expect(final.final!.ranking[2]!.name).toBe('Beto');
    for (const e of final.final!.ranking) expect(e.score).toBe(expectedScores.get(e.playerId));
    expect(final.history).toHaveLength(1);

    const anaFinal = await players[0]!.state.waitFor((v) => v.phase === 'finished');
    expect(anaFinal.final!.podium).toHaveLength(3);
    expect(anaFinal.final!.stats!.correct).toBe(3);

    // Repetir partida: vuelven a la sala de espera con 0 puntos.
    expect((await emit(host, 'host:playAgain', {})).ok).toBe(true);
    const again = await players[1]!.state.waitFor((v) => v.phase === 'lobby' && v.gameNumber === 1);
    expect(again.me.score).toBe(0);
  });

  it('ningún mensaje a los jugadores contiene la respuesta correcta antes de revelarla', async () => {
    const { host, hostState, code } = await createRoom({ questionCount: 3 });
    const a = await joinPlayer(code, 'Ana');
    const b = await joinPlayer(code, 'Beto');
    await emit(host, 'host:start', {});
    for (let i = 0; i < 3; i++) {
      await a.state.waitFor((v) => v.phase === 'question' && v.question?.index === i);
      await emit(a.socket, 'player:answer', { questionIndex: i, choice: 0 });
      await emit(b.socket, 'player:answer', { questionIndex: i, choice: 1 });
      await hostState.waitFor((v) => v.phase === 'locked' && v.progress?.index === i);
      await emit(host, 'host:next', {});
      await emit(host, 'host:next', {});
      await emit(host, 'host:next', {});
    }
    await a.state.waitFor((v) => v.phase === 'finished');
    for (const view of [...a.state.history, ...b.state.history, ...hostState.history]) {
      if (['countdown', 'question', 'locked', 'lobby'].includes(view.phase)) {
        const json = JSON.stringify(view);
        expect(json).not.toMatch(/correctIndex|explanation|answerIndex/);
      }
    }
  });
});

describe('reconexión', () => {
  it('un jugador que se reconecta recupera su estado sin duplicarse ni duplicar puntos', async () => {
    const { host, hostState, code } = await createRoom();
    const a = await joinPlayer(code, 'Ana');
    const b = await joinPlayer(code, 'Beto');
    await emit(host, 'host:start', {});
    await a.state.waitFor((v) => v.phase === 'question');
    await emit(a.socket, 'player:answer', { questionIndex: 0, choice: correctIndexOf(code) });

    a.socket.disconnect();
    const afterDrop = await hostState.waitFor((v) => v.players.some((p) => p.name === 'Ana' && !p.connected));
    expect(afterDrop.players).toHaveLength(2);
    // Con Ana desconectada, solo falta Beto; al responder, la pregunta se cierra.
    await emit(b.socket, 'player:answer', { questionIndex: 0, choice: (correctIndexOf(code) + 1) % 4 });
    await hostState.waitFor((v) => v.phase === 'locked');
    await emit(host, 'host:next', {});

    const a2 = await server.connect();
    const a2State = trackState<PlayerView>(a2, 'player:state');
    const res = await emit(a2, 'player:rejoin', { code, token: a.token });
    expect(res).toMatchObject({ ok: true, playerId: a.playerId, name: 'Ana' });
    const view = await a2State.waitFor((v) => v.phase === 'reveal');
    expect(view.me.id).toBe(a.playerId);
    expect(view.result!.correct).toBe(true);
    const scoreAfterReconnect = view.me.score;
    expect(scoreAfterReconnect).toBeGreaterThan(1000);

    const hv = await hostState.waitFor((v) => v.players.every((p) => p.connected));
    expect(hv.players).toHaveLength(2);

    // Reconectar de nuevo con el mismo token desde otro dispositivo reemplaza la sesión anterior.
    const a3 = await server.connect();
    const replaced = new Promise((resolve) => a2.once('session:replaced', resolve));
    await emit(a3, 'player:rejoin', { code, token: a.token });
    await replaced;
    const a3State = trackState<PlayerView>(a3, 'player:state');
    await emit(host, 'host:next', {});
    const lb = await a3State.waitFor((v) => v.phase === 'leaderboard');
    expect(lb.me.score).toBe(scoreAfterReconnect);
    expect(server.app.manager.get(code)!.players.size).toBe(2);
  });

  it('el anfitrión desconectado pausa la partida y recupera el control con su token', async () => {
    const { host, code, hostToken } = await createRoom();
    const a = await joinPlayer(code, 'Ana');
    await emit(host, 'host:start', {});
    await a.state.waitFor((v) => v.phase === 'question');
    host.disconnect();
    const paused = await a.state.waitFor((v) => v.paused && !v.hostConnected);
    expect(paused.phase).toBe('question');

    const host2 = await server.connect();
    const host2State = trackState<HostView>(host2, 'host:state');
    expect(await emit(host2, 'host:reclaim', { code, hostToken: 'x'.repeat(32) })).toMatchObject({ ok: false, error: 'INVALID_TOKEN' });
    expect((await emit(host2, 'host:reclaim', { code, hostToken })).ok).toBe(true);
    const hv = await host2State.waitFor((v) => v.hostConnected && v.paused);
    expect(hv.phase).toBe('question');
    expect((await emit(host2, 'host:resume', {})).ok).toBe(true);
    await a.state.waitFor((v) => !v.paused && v.hostConnected && v.timer!.endsAt !== null);
  });
});

describe('seguridad y permisos', () => {
  it('un participante no puede ejecutar acciones de anfitrión', async () => {
    const { code } = await createRoom();
    const a = await joinPlayer(code, 'Ana');
    for (const event of ['host:start', 'host:next', 'host:pause', 'host:end', 'host:close'] as const) {
      expect(await emit(a.socket, event, {})).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
    }
    expect(await emit(a.socket, 'host:kick', { playerId: a.playerId })).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
    expect(await emit(a.socket, 'host:updateSettings', { settings: { questionCount: 50 } })).toMatchObject({ ok: false });
    // Un socket sin sala tampoco puede responder ni controlar.
    const stranger = await server.connect();
    expect(await emit(stranger, 'player:answer', { questionIndex: 0, choice: 0 })).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
    expect(await emit(stranger, 'host:next', {})).toMatchObject({ ok: false, error: 'NOT_ALLOWED' });
  });

  it('valida códigos de sala, nombres y respuestas', async () => {
    const { host, code } = await createRoom();
    const s = await server.connect();
    expect(await emit(s, 'player:join', { code: 'abc', name: 'X' })).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    expect(await emit(s, 'player:join', { code: 'ZZZZZZ', name: 'X' })).toMatchObject({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(await emit(s, 'player:join', { code, name: '<<>>' })).toMatchObject({ ok: false, error: 'INVALID_NAME' });
    expect(await emit(s, 'player:join', { code: code.toLowerCase(), name: '<b>Eva</b>' })).toMatchObject({ ok: true, name: 'bEva/b' });
    expect(await emit(s, 'player:join', { code, name: 'Otra' })).toMatchObject({ ok: true });
    await emit(host, 'host:start', {});
    expect(await emit(s, 'player:answer', { questionIndex: 0, choice: 7 })).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
    expect(await emit(s, 'player:answer', { questionIndex: 0, choice: '1' } as never)).toMatchObject({ ok: false, error: 'INVALID_PAYLOAD' });
  });

  it('expulsar a un jugador invalida su sesión', async () => {
    const { host, hostState, code } = await createRoom();
    const a = await joinPlayer(code, 'Ana');
    const kicked = new Promise((resolve) => a.socket.once('player:kicked', resolve));
    expect((await emit(host, 'host:kick', { playerId: a.playerId })).ok).toBe(true);
    await kicked;
    await hostState.waitFor((v) => v.players.length === 0);
    const again = await server.connect();
    expect(await emit(again, 'player:rejoin', { code, token: a.token })).toMatchObject({ ok: false, error: 'INVALID_TOKEN' });
  });

  it('cerrar la sala avisa a todos los participantes', async () => {
    const { host, code } = await createRoom();
    const a = await joinPlayer(code, 'Ana');
    const closed = new Promise<{ reason: string }>((resolve) => a.socket.once('room:closed', resolve));
    await emit(host, 'host:close', {});
    expect((await closed).reason).toMatch(/cerró/);
    expect(server.app.manager.get(code)).toBeUndefined();
  });

  it('la API HTTP no expone respuestas y valida el código de sala', async () => {
    const { code } = await createRoom();
    const meta = await (await fetch(`${server.url}/api/meta`)).text();
    expect(meta).not.toMatch(/answer|correct|explanation/i);
    expect(JSON.parse(meta).totalQuestions).toBeGreaterThan(0);
    expect((await fetch(`${server.url}/api/rooms/${code}`)).status).toBe(200);
    expect((await fetch(`${server.url}/api/rooms/NOPE`)).status).toBe(404);
    const net = await (await fetch(`${server.url}/api/network`)).json();
    expect(Array.isArray(net.lanAddresses)).toBe(true);
  });
});

describe('límite de frecuencia', () => {
  it('bloquea intentos masivos de unirse desde la misma IP', async () => {
    await server.close();
    server = await startTestServer({ realtime: { limits: { joinPerIp: [5, 0.01] } } });
    const { code } = await createRoom();
    const s = await server.connect();
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await emit(s, 'player:join', { code: 'ZZZZZZ', name: `N${i}` }));
    expect(results.slice(0, 5).every((r) => !r.ok && r.error === 'ROOM_NOT_FOUND')).toBe(true);
    expect(results.slice(5).every((r) => !r.ok && r.error === 'RATE_LIMITED')).toBe(true);
    void code;
  });
});

describe('temporizador del servidor', () => {
  it('cierra la pregunta al terminar el tiempo aunque falten respuestas', async () => {
    const { host, hostState, code } = await createRoom({ timePerQuestion: 10 });
    const a = await joinPlayer(code, 'Ana');
    const b = await joinPlayer(code, 'Beto');
    await emit(host, 'host:start', {});
    const q = await a.state.waitFor((v) => v.phase === 'question');
    const offset = q.serverNow - Date.now();
    expect(Math.abs(offset)).toBeLessThan(1000);
    expect(q.timer!.endsAt! - q.serverNow).toBeGreaterThan(9000);
    await emit(a.socket, 'player:answer', { questionIndex: 0, choice: 0 });
    const started = Date.now();
    const locked = await hostState.waitFor((v) => v.phase === 'locked', 15_000);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThan(8500);
    expect(locked.answeredCount).toBe(1);
    expect(await emit(b.socket, 'player:answer', { questionIndex: 0, choice: 0 })).toMatchObject({ ok: false, error: 'TOO_LATE' });
  }, 25_000);
});
