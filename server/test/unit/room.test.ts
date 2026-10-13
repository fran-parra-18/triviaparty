import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BETWEEN_QUESTIONS_COUNTDOWN_MS, COUNTDOWN_MS } from '@trivia/shared';
import { GameError } from '../../src/game/errors';
import { Room } from '../../src/game/Room';
import { InMemoryQuestionRepository } from '../../src/questions/repository';
import { makeQuestion } from '../helpers/fixtures';

const bank = Array.from({ length: 30 }, (_, i) => makeQuestion(i));

function makeRoom(settings: object = {}) {
  const onChange = vi.fn();
  const onGameFinished = vi.fn();
  const room = new Room(
    'ABCDEF',
    { repository: new InMemoryQuestionRepository(bank), hardMaxPlayers: 10, onChange, onGameFinished },
    { questionCount: 3, timePerQuestion: 10, ...settings },
  );
  room.attachHost('host-socket');
  return { room, onChange, onGameFinished };
}

/** Avanza la cuenta regresiva hasta que la pregunta esté abierta. */
async function openFirstQuestion(room: Room) {
  await room.start();
  expect(room.phase).toBe('countdown');
  vi.advanceTimersByTime(COUNTDOWN_MS);
  expect(room.phase).toBe('question');
}

function correctChoice(room: Room) {
  return room._debugCurrentQuestion()!.correctIndex;
}

function expectGameError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(GameError);
    expect((err as GameError).code).toBe(code);
    return;
  }
  throw new Error(`Se esperaba GameError ${code}`);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Room — jugadores', () => {
  it('rechaza nombres duplicados (sin distinguir mayúsculas ni tildes)', () => {
    const { room } = makeRoom();
    room.addPlayer('José', 's1');
    expectGameError(() => room.addPlayer('jose', 's2'), 'NAME_TAKEN');
    expectGameError(() => room.addPlayer('   ', 's3'), 'INVALID_NAME');
  });

  it('respeta el máximo de jugadores', () => {
    const { room } = makeRoom({ maxPlayers: 2 });
    room.addPlayer('A', 's1');
    room.addPlayer('B', 's2');
    expectGameError(() => room.addPlayer('C', 's3'), 'ROOM_FULL');
  });

  it('no deja empezar sin el mínimo de jugadores conectados', async () => {
    const { room } = makeRoom({ minPlayers: 2 });
    room.addPlayer('A', 's1');
    await expect(room.start()).rejects.toMatchObject({ code: 'NOT_ENOUGH_PLAYERS' });
  });

  it('la reconexión con token recupera al mismo jugador sin duplicarlo', async () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    room.submitAnswer(a.id, 0, correctChoice(room));
    room.handleDisconnect('s1');
    expect(room.players.get(a.id)!.connected).toBe(false);
    const { player, previousSocketId } = room.reconnectPlayer(a.token, 's1b');
    expect(player.id).toBe(a.id);
    expect(previousSocketId).toBeNull();
    expect(room.players.size).toBe(1);
    expectGameError(() => room.reconnectPlayer('token-falso-que-no-existe', 's9'), 'INVALID_TOKEN');
  });

  it('no permite incorporarse durante la partida si allowLateJoin = false', async () => {
    const { room } = makeRoom({ allowLateJoin: false });
    room.addPlayer('A', 's1');
    await room.start();
    expectGameError(() => room.addPlayer('Tarde', 's2'), 'GAME_IN_PROGRESS');
  });

  it('permite incorporarse tarde si allowLateJoin = true', async () => {
    const { room } = makeRoom({ allowLateJoin: true });
    room.addPlayer('A', 's1');
    await room.start();
    const late = room.addPlayer('Tarde', 's2');
    expect(late.joinedLate).toBe(true);
  });
});

describe('Room — líder', () => {
  it('solo puede haber un líder y aparece en las vistas', () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    const b = room.addPlayer('Beto', 's2');
    room.setLeader(a.id);
    expect(room.isLeader(a.id)).toBe(true);
    room.setLeader(b.id);
    expect(room.isLeader(a.id)).toBe(false);
    expect(room.playerView(b.id)!.me.isLeader).toBe(true);
    expect(room.hostView().leaderId).toBe(b.id);
    expect(room.hostView().players.find((p) => p.id === b.id)!.isLeader).toBe(true);
    room.setLeader(null);
    expect(room.hostView().leaderId).toBeNull();
  });

  it('rechaza un líder inexistente y lo quita si el jugador sale de la sala', () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    expectGameError(() => room.setLeader('p_inexistente'), 'INVALID_PAYLOAD');
    room.setLeader(a.id);
    room.removePlayer(a.id);
    expect(room.leaderId).toBeNull();
  });
});

describe('Room — flujo de partida', () => {
  it('juega una partida completa con puntuación y podio', async () => {
    const { room, onGameFinished } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    const b = room.addPlayer('Beto', 's2');
    await openFirstQuestion(room);

    for (let i = 0; i < 3; i++) {
      expect(room.phase).toBe('question');
      vi.advanceTimersByTime(2000);
      room.submitAnswer(a.id, i, correctChoice(room)); // Ana acierta siempre a los 2 s
      vi.advanceTimersByTime(3000);
      room.submitAnswer(b.id, i, (correctChoice(room) + 1) % 4); // Beto falla siempre
      expect(room.phase).toBe('locked'); // todos respondieron → se cierra antes de tiempo
      room.next(); // revelar
      expect(room.phase).toBe('reveal');
      if (i < 2) {
        room.next(); // clasificación
        expect(room.phase).toBe('leaderboard');
      }
      room.next(); // siguiente pregunta; tras la última, directo al podio (sin clasificación que lo adelante)
      if (i < 2) vi.advanceTimersByTime(BETWEEN_QUESTIONS_COUNTDOWN_MS);
    }
    expect(room.phase).toBe('finished');
    // 1000 base + 500 × (8/10 de tiempo restante) = 1400 por pregunta
    expect(room.players.get(a.id)!.score).toBe(3 * 1400);
    expect(room.players.get(b.id)!.score).toBe(0);
    const view = room.hostView();
    expect(view.final!.ranking[0]!.name).toBe('Ana');
    expect(view.final!.ranking[0]!.rank).toBe(1);
    expect(view.final!.endedEarly).toBe(false);
    expect(onGameFinished).toHaveBeenCalledTimes(1);
  });

  it('tras la última pregunta va directo al podio, sin publicar posiciones que lo adelanten', async () => {
    const { room } = makeRoom({ questionCount: 3 });
    const a = room.addPlayer('Ana', 's1');
    const b = room.addPlayer('Beto', 's2');
    await openFirstQuestion(room);
    for (let i = 0; i < 3; i++) {
      // Beto acierta solo la última: así la última pregunta cambia el orden.
      room.submitAnswer(a.id, i, i < 2 ? correctChoice(room) : (correctChoice(room) + 1) % 4);
      room.submitAnswer(b.id, i, i < 2 ? (correctChoice(room) + 1) % 4 : correctChoice(room));
      room.next(); // revelar
      if (i < 2) {
        room.next();
        room.next();
        vi.advanceTimersByTime(BETWEEN_QUESTIONS_COUNTDOWN_MS);
      }
    }
    expect(room.phase).toBe('reveal');
    expect(room.hostView().leaderboard.map((e) => e.score)).toEqual([expect.any(Number), 0]); // la de la pregunta 2
    expect(room.playerView(b.id)!.me.score).toBe(0); // los puntos de la última aún no se ven
    expect(room.playerView(b.id)!.result!.pointsEarned).toBeGreaterThan(0); // pero sí si acertó
    room.next();
    expect(room.phase).toBe('finished');
    expect(room.playerView(b.id)!.me.score).toBeGreaterThan(0);
  });

  it('cierra la pregunta al agotarse el tiempo del servidor y rechaza respuestas tardías', async () => {
    const { room } = makeRoom({ timePerQuestion: 10 });
    const a = room.addPlayer('Ana', 's1');
    room.addPlayer('Beto', 's2');
    await openFirstQuestion(room);
    vi.advanceTimersByTime(9999);
    expect(room.phase).toBe('question');
    vi.advanceTimersByTime(2);
    expect(room.phase).toBe('locked');
    expectGameError(() => room.submitAnswer(a.id, 0, 0), 'TOO_LATE');
  });

  it('no permite responder dos veces ni cambiar la respuesta', async () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    room.addPlayer('Beto', 's2');
    await openFirstQuestion(room);
    room.submitAnswer(a.id, 0, 1);
    expectGameError(() => room.submitAnswer(a.id, 0, 2), 'ALREADY_ANSWERED');
    expectGameError(() => room.submitAnswer(a.id, 0, 1), 'ALREADY_ANSWERED');
  });

  it('rechaza respuestas a otra pregunta distinta de la actual', async () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    expectGameError(() => room.submitAnswer(a.id, 1, 0), 'INVALID_STATE');
  });

  it('la pausa congela el temporizador del servidor y no descuenta tiempo', async () => {
    const { room } = makeRoom({ timePerQuestion: 10 });
    const a = room.addPlayer('Ana', 's1');
    room.addPlayer('Beto', 's2');
    await openFirstQuestion(room);
    vi.advanceTimersByTime(4000);
    room.pause();
    expect(room.hostView().timer!.remainingMs).toBe(6000);
    expectGameError(() => room.submitAnswer(a.id, 0, 0), 'INVALID_STATE');
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('question');
    room.resume();
    vi.advanceTimersByTime(1000);
    room.submitAnswer(a.id, 0, correctChoice(room));
    vi.advanceTimersByTime(5001);
    expect(room.phase).toBe('locked');
    // Respondió con 5 s de 10 consumidos → 1000 + 250
    expect(room.players.get(a.id)!.score).toBe(1250);
  });

  it('no publica los puntos hasta revelar la respuesta', async () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    room.submitAnswer(a.id, 0, correctChoice(room));
    expect(room.phase).toBe('locked');
    const lockedView = room.playerView(a.id)!;
    expect(lockedView.me.score).toBe(0);
    expect(lockedView.result).toBeNull();
    expect(room.hostView().reveal).toBeNull();
    expect(room.hostView().leaderboard).toEqual([]);
    room.next();
    const revealView = room.playerView(a.id)!;
    expect(revealView.me.score).toBeGreaterThan(1000);
    expect(revealView.result!.correct).toBe(true);
  });

  it('las vistas nunca incluyen la respuesta correcta mientras la pregunta está abierta', async () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    room.addPlayer('Beto', 's2');
    await openFirstQuestion(room);
    const pv = room.playerView(a.id)!;
    const hv = room.hostView();
    for (const view of [pv, hv]) {
      const json = JSON.stringify(view);
      expect(json).not.toMatch(/correctIndex|answerIndex|explanation/);
      expect(view.question).toBeTruthy();
    }
  });

  it('terminar anticipadamente muestra el podio y no puntúa la pregunta abierta', async () => {
    const { room } = makeRoom();
    const a = room.addPlayer('Ana', 's1');
    room.addPlayer('Beto', 's2');
    await openFirstQuestion(room);
    room.submitAnswer(a.id, 0, correctChoice(room));
    room.end();
    expect(room.phase).toBe('finished');
    expect(room.players.get(a.id)!.score).toBe(0);
    expect(room.hostView().final!.endedEarly).toBe(true);
  });

  it('no repite preguntas entre partidas de la misma sesión', async () => {
    const { room } = makeRoom({ questionCount: 10 });
    const a = room.addPlayer('Ana', 's1');
    const seen: string[] = [];
    for (let game = 0; game < 3; game++) {
      await openFirstQuestion(room);
      for (let i = 0; i < 10; i++) {
        seen.push(room._debugCurrentQuestion()!.id);
        room.submitAnswer(a.id, i, 0);
        room.next();
        room.next();
        if (i < 9) {
          room.next();
          vi.advanceTimersByTime(2000);
        }
      }
      expect(room.phase).toBe('finished');
      room.playAgain();
      expect(room.phase).toBe('lobby');
      expect(room.players.get(a.id)!.score).toBe(0);
    }
    expect(new Set(seen).size).toBe(30);
    // El banco de prueba tiene 30 preguntas: no quedan más sin usar.
    await expect(room.start()).rejects.toMatchObject({ code: 'NOT_ENOUGH_QUESTIONS' });
  });

  it('sin resultados entre preguntas avanza solo tras cerrar', async () => {
    const { room } = makeRoom({ showResultsAfterEach: false });
    const a = room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    room.submitAnswer(a.id, 0, correctChoice(room));
    expect(room.phase).toBe('locked');
    expect(room.playerView(a.id)!.result).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(room.phase).toBe('countdown');
  });

  it('el modo automático avanza sin intervención del anfitrión', async () => {
    const { room } = makeRoom({ autoAdvance: true, questionCount: 3 });
    room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    vi.advanceTimersByTime(10_000 * 3 + 30_000 * 3);
    expect(room.phase).toBe('finished');
  });

  it('si el anfitrión se desconecta, la partida se pausa; al volver puede reanudar', async () => {
    const { room } = makeRoom();
    room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    room.handleDisconnect('host-socket');
    expect(room.paused).toBe(true);
    expect(room.hostConnected).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(room.phase).toBe('question');
    room.attachHost('host-socket-2');
    room.resume();
    expect(room.paused).toBe(false);
  });

  it('solo se puede cambiar la configuración antes de empezar', async () => {
    const { room } = makeRoom();
    room.addPlayer('Ana', 's1');
    room.updateSettings({ timePerQuestion: 30 });
    expect(room.settings.timePerQuestion).toBe(30);
    expectGameError(() => room.updateSettings({ timePerQuestion: 7 }), 'INVALID_PAYLOAD');
    await room.start();
    expectGameError(() => room.updateSettings({ timePerQuestion: 15 }), 'INVALID_STATE');
  });
});

describe('Room — pistas musicales', () => {
  const audioBank = Array.from({ length: 5 }, (_, i) =>
    makeQuestion(100 + i, { categoryId: 'pistas-80s', audioUrl: `https://audio.example.com/${i}.m4a` }),
  );

  function makeAudioRoom(timePerQuestion: number) {
    const room = new Room(
      'ABCDEF',
      { repository: new InMemoryQuestionRepository(audioBank), hardMaxPlayers: 10, onChange: vi.fn(), onGameFinished: vi.fn() },
      { questionCount: 3, timePerQuestion, categories: ['pistas-80s'] },
    );
    room.attachHost('host-socket');
    room.addPlayer('Ana', 's1');
    return room;
  }

  it('las preguntas con audio duran al menos 30 s aunque se haya elegido menos', async () => {
    const room = makeAudioRoom(10);
    await openFirstQuestion(room);
    expect(room.hostView().timer?.durationMs).toBe(30_000);
    expect(room.hostView().question?.audioUrl).toMatch(/^https:/);
    vi.advanceTimersByTime(29_999);
    expect(room.phase).toBe('question');
    vi.advanceTimersByTime(2);
    expect(room.phase).toBe('locked');
  });

  it('respeta un tiempo mayor elegido por el anfitrión', async () => {
    const room = makeAudioRoom(60);
    await openFirstQuestion(room);
    expect(room.hostView().timer?.durationMs).toBe(60_000);
  });

  it('anuncia el audio de la próxima pregunta durante la cuenta regresiva para precargarlo', async () => {
    const room = makeAudioRoom(10);
    await room.start();
    expect(room.hostView().nextAudioUrl).toMatch(/^https:/);
  });
});

describe('Room — Modo Musical', () => {
  const songs = [
    ...Array.from({ length: 6 }, (_, i) => makeQuestion(200 + i, { categoryId: 'pistas-80s', audioUrl: `https://audio.example.com/a${i}.m4a` })),
    ...Array.from({ length: 6 }, (_, i) => makeQuestion(300 + i, { categoryId: 'pistas-90s', audioUrl: `https://audio.example.com/b${i}.m4a` })),
  ];

  function makeMusicRoom(settings: object = {}) {
    const room = new Room(
      'ABCDEF',
      { repository: new InMemoryQuestionRepository([...bank, ...songs]), hardMaxPlayers: 10, onChange: vi.fn(), onGameFinished: vi.fn() },
      { questionCount: 10, categories: ['historia'], musicMode: true, music: { songCount: 4, categories: ['pistas-90s'], thinkSeconds: 10 }, ...settings },
    );
    room.attachHost('host-socket');
    return room;
  }

  it('usa su propia configuración: cantidad de canciones y categorías musicales', async () => {
    const room = makeMusicRoom();
    room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    const view = room.hostView();
    expect(view.progress?.total).toBe(4);
    expect(view.question?.category).toBe('pistas-90s');
    // 2 s + 10 para responder, 5 s + 10 para responder y el fragmento completo (30 s).
    expect(view.question?.musicStages?.map((s) => s.points)).toEqual([1500, 1000, 500]);
    expect(view.timer?.durationMs).toBe(57_000);
  });

  it('puntúa según el tramo en el que se respondió, sin castigo por fallar', async () => {
    const room = makeMusicRoom();
    const ana = room.addPlayer('Ana', 's1');
    const beto = room.addPlayer('Beto', 's2');
    const caro = room.addPlayer('Caro', 's3');
    const dani = room.addPlayer('Dani', 's4');
    await openFirstQuestion(room);
    const right = correctChoice(room);
    vi.advanceTimersByTime(1000);
    room.submitAnswer(ana.id, 0, right);
    room.submitAnswer(dani.id, 0, (right + 1) % 4);
    vi.advanceTimersByTime(12_000); // 13 s: segundo tramo
    room.submitAnswer(beto.id, 0, right);
    vi.advanceTimersByTime(17_000); // 30 s: tercer tramo
    room.submitAnswer(caro.id, 0, right);
    expect(room.phase).toBe('locked');
    room.next();
    const points = (id: string) => room.playerView(id)!.result!;
    expect(points(ana.id)).toMatchObject({ pointsEarned: 1500, musicStage: 0 });
    expect(points(beto.id)).toMatchObject({ pointsEarned: 1000, musicStage: 1 });
    expect(points(caro.id)).toMatchObject({ pointsEarned: 500, musicStage: 2 });
    expect(points(dani.id)).toMatchObject({ pointsEarned: 0, correct: false, musicStage: 0 });
    expect(room.playerView(dani.id)!.me.score).toBe(0);
  });

  it('el tiempo para responder alarga los tramos', async () => {
    const room = makeMusicRoom({ music: { songCount: 3, categories: ['pistas-80s'], thinkSeconds: 20 } });
    const ana = room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    expect(room.hostView().timer?.durationMs).toBe(2000 + 20_000 + 5000 + 20_000 + 30_000);
    vi.advanceTimersByTime(21_000); // todavía dentro del primer tramo (2 s + 20 para responder)
    room.submitAnswer(ana.id, 0, correctChoice(room));
    room.next();
    expect(room.playerView(ana.id)!.result!.pointsEarned).toBe(1500);
  });

  it('no se mezcla con el Modo Fiesta ni cambia la puntuación de los otros modos', async () => {
    const room = makeMusicRoom({ partyMode: true });
    expect(room.settings.partyMode).toBe(false);
    room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    expect(room.hostView().question?.special).toBeNull();

    const classic = new Room(
      'GHJKMN',
      { repository: new InMemoryQuestionRepository(songs), hardMaxPlayers: 10, onChange: vi.fn(), onGameFinished: vi.fn() },
      { questionCount: 3, categories: ['pistas-80s'] },
    );
    classic.attachHost('h2');
    classic.addPlayer('Beto', 's9');
    await openFirstQuestion(classic);
    expect(classic.hostView().question?.musicStages).toBeNull();
    expect(classic.hostView().timer?.durationMs).toBe(30_000);
  });

  it('rechaza categorías que no son musicales en su configuración', () => {
    const room = makeMusicRoom();
    expectGameError(() => room.updateSettings({ music: { categories: ['historia'] } }), 'INVALID_PAYLOAD');
    expectGameError(() => room.updateSettings({ music: { thinkSeconds: 5 } }), 'INVALID_PAYLOAD');
    room.updateSettings({ music: { thinkSeconds: 15 } });
    expect(room.settings.music).toMatchObject({ songCount: 4, thinkSeconds: 15, categories: ['pistas-90s'] });
  });

  it('el anfitrión puede pasar al siguiente tramo; lo que vale sigue el reloj del servidor', async () => {
    const room = makeMusicRoom();
    const ana = room.addPlayer('Ana', 's1');
    room.addPlayer('Beto', 's2');
    await openFirstQuestion(room);
    vi.advanceTimersByTime(3000);
    room.skipMusicStage(); // al principio del tramo 2 (12 s)
    expect(room.hostView().timer?.remainingMs).toBe(57_000 - 12_000);
    room.skipMusicStage(); // al principio del tramo 3 (29 s)
    expectGameError(() => room.skipMusicStage(), 'INVALID_STATE');
    room.submitAnswer(ana.id, 0, correctChoice(room));
    vi.advanceTimersByTime(28_000);
    expect(room.phase).toBe('question');
    vi.advanceTimersByTime(2000);
    expect(room.phase).toBe('locked'); // el último tramo dura sus 30 s
    room.next();
    expect(room.playerView(ana.id)!.result).toMatchObject({ pointsEarned: 500, musicStage: 2 });
  });

  it('una configuración guardada de una versión anterior no impide crear la sala', () => {
    const room = makeMusicRoom({ music: { songCount: 4, categories: ['pistas-90s'], thinkSeconds: 3 } });
    expect(room.settings.musicMode).toBe(true);
    expect(room.settings.music.thinkSeconds).toBe(10);
  });

  it('no se puede pasar de tramo fuera del Modo Musical', async () => {
    const { room } = makeRoom();
    room.addPlayer('Ana', 's1');
    await openFirstQuestion(room);
    expectGameError(() => room.skipMusicStage(), 'INVALID_STATE');
  });
});
