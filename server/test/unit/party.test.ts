import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BET_COUNTDOWN_MS, BETWEEN_QUESTIONS_COUNTDOWN_MS, COUNTDOWN_MS, musicStageAt, musicStageClock, musicTimeline, streakBonus } from '@trivia/shared';
import { computeAwards, planBets, planSpecials, type AwardInput } from '../../src/game/party';
import { Room } from '../../src/game/Room';
import { InMemoryQuestionRepository } from '../../src/questions/repository';
import { makeQuestion } from '../helpers/fixtures';

/** Generador pseudoaleatorio reproducible para las pruebas. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe('planSpecials', () => {
  it('reparte especiales sin dos seguidas, con una sola bomba y la última como «Última oportunidad»', () => {
    for (let n = 3; n <= 30; n++) {
      for (let seed = 1; seed <= 40; seed++) {
        const questions = Array.from({ length: n }, (_, i) => ({ audioUrl: i % 3 === 0 ? 'https://a.example/x.m4a' : null }));
        const plan = planSpecials(questions, seeded(seed * 97 + n));
        expect(plan).toHaveLength(n);
        expect(plan[n - 1]).toBe('final');
        expect(plan[0]).toBeNull();
        const specials = plan.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
        for (let j = 1; j < specials.length; j++) expect(specials[j]! - specials[j - 1]!).toBeGreaterThanOrEqual(2);
        expect(plan.filter((k) => k === 'bomba').length).toBeLessThanOrEqual(1);
        expect(plan.filter((k) => k === 'final')).toHaveLength(1);
        plan.forEach((k, i) => {
          if (k === 'relampago') expect(questions[i]!.audioUrl).toBeNull();
        });
      }
    }
  });

  it('en una partida de 10 hay entre 2 y 4 especiales', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const count = planSpecials(Array.from({ length: 10 }, () => ({ audioUrl: null })), seeded(seed)).filter(Boolean).length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  it('con menos de 3 preguntas no hay especiales', () => {
    expect(planSpecials([{ audioUrl: null }, { audioUrl: null }], seeded(1))).toEqual([null, null]);
  });
});

describe('planBets', () => {
  it('nunca en la primera ni en una especial, sin dos seguidas y aproximadamente 1 de cada 5', () => {
    for (let n = 4; n <= 30; n++) {
      for (let seed = 1; seed <= 30; seed++) {
        const rng = seeded(seed * 31 + n);
        const specials = planSpecials(Array.from({ length: n }, () => ({ audioUrl: null })), rng);
        const bets = planBets(specials, rng);
        expect(bets[0]).toBe(false);
        bets.forEach((b, i) => b && expect(specials[i]).toBeNull());
        const idx = bets.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
        for (let j = 1; j < idx.length; j++) expect(idx[j]! - idx[j - 1]!).toBeGreaterThanOrEqual(2);
        expect(idx.length).toBeLessThanOrEqual(Math.max(1, Math.floor(n / 5)));
      }
    }
  });
});

describe('streakBonus', () => {
  it('suma 10 % por acierto seguido previo, hasta un 50 %', () => {
    expect([0, 1, 2, 5, 9].map(streakBonus)).toEqual([0, 0.1, 0.2, 0.5, 0.5]);
  });
});

describe('computeAwards', () => {
  const base: Omit<AwardInput, 'playerId' | 'name' | 'joinOrder'> = {
    avatar: 0, score: 0, correct: 0, wrong: 0, hardCorrect: 0, avgCorrectMs: null, bestStreak: 0,
  };
  const p = (name: string, joinOrder: number, extra: Partial<AwardInput>): AwardInput => ({ ...base, playerId: name, name, joinOrder, ...extra });

  it('da cada premio a quien corresponde y omite los que nadie merece', () => {
    const awards = computeAwards([
      p('Ana', 0, { score: 9000, correct: 8, avgCorrectMs: 4000, bestStreak: 5, hardCorrect: 1 }),
      p('Beto', 1, { score: 5000, correct: 5, avgCorrectMs: 2500, bestStreak: 2, hardCorrect: 3, wrong: 4 }),
      p('Caro', 2, { score: 100, correct: 1, avgCorrectMs: 900, wrong: 1 }),
    ]);
    const byKind = Object.fromEntries(awards.map((a) => [a.kind, a.name]));
    expect(byKind).toEqual({ cerebrito: 'Ana', rayo: 'Beto', imparable: 'Ana', suertudo: 'Beto', caotico: 'Beto' });
    expect(awards.find((a) => a.kind === 'rayo')!.detail).toBe('2,5 s de media al acertar');
  });

  it('en caso de empate gana quien tiene más puntos', () => {
    const awards = computeAwards([p('Ana', 0, { score: 100, correct: 3 }), p('Beto', 1, { score: 900, correct: 3 })]);
    expect(awards.find((a) => a.kind === 'cerebrito')!.name).toBe('Beto');
  });

  it('sin aciertos ni errores no hay premios', () => {
    expect(computeAwards([p('Ana', 0, {})])).toEqual([]);
  });
});

describe('Room — Modo Fiesta', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const bank = Array.from({ length: 40 }, (_, i) => makeQuestion(i));
  const precision = { preset: 'precision', basePoints: 1000, speedBonusMax: 0, difficultyMultiplier: false };

  function makeRoom(settings: object, seed = 7) {
    const room = new Room(
      'ABCDEF',
      { repository: new InMemoryQuestionRepository(bank), hardMaxPlayers: 10, onChange: vi.fn(), onGameFinished: vi.fn(), rng: seeded(seed) },
      { questionCount: 3, timePerQuestion: 10, scoring: precision, ...settings },
    );
    room.attachHost('host-socket');
    return room;
  }

  /** Juega toda la partida: Ana acierta siempre. Devuelve lo observado en cada pregunta. */
  async function playAll(room: Room, playerId: string) {
    const seen: { special: string | null; durationMs: number; points: number; multiplier: number; streakBonus: number }[] = [];
    let announced: string | null | undefined;
    await room.start();
    vi.advanceTimersByTime(COUNTDOWN_MS);
    for (let i = 0; room.phase !== 'finished'; i++) {
      const view = room.hostView();
      // Lo anunciado en la cuenta regresiva coincide con la pregunta que se abre.
      if (announced !== undefined) expect(view.question!.special).toBe(announced);
      const q = room._debugCurrentQuestion()!;
      room.submitAnswer(playerId, i, q.correctIndex);
      room.next(); // revelar
      const r = room.playerView(playerId)!.result!;
      seen.push({ special: view.question!.special, durationMs: view.timer!.durationMs, points: r.pointsEarned, multiplier: r.multiplier, streakBonus: r.streakBonus });
      room.next(); // clasificación o, tras la última, el podio
      if (room.phase === 'leaderboard') room.next();
      if (room.phase === 'countdown') {
        announced = room.hostView().nextSpecial;
        // Antes de una pregunta con apuesta la cuenta regresiva es más larga.
        vi.advanceTimersByTime(room.hostView().betting ? BET_COUNTDOWN_MS : BETWEEN_QUESTIONS_COUNTDOWN_MS);
      }
    }
    return seen;
  }

  it('en el modo clásico no hay especiales ni bonificación por racha', async () => {
    const room = makeRoom({ partyMode: false });
    const a = room.addPlayer('Ana', 's1');
    const seen = await playAll(room, a.id);
    expect(seen.map((s) => s.special)).toEqual([null, null, null]);
    expect(seen.map((s) => s.points)).toEqual([1000, 1000, 1000]);
  });

  it('aplica la racha y la «Última oportunidad»: 1000 + 1100 + 1000 × 2 × 1,2', async () => {
    const room = makeRoom({ partyMode: true });
    const a = room.addPlayer('Ana', 's1');
    const seen = await playAll(room, a.id);
    expect(seen.map((s) => s.special)).toEqual([null, null, 'final']);
    expect(seen.map((s) => s.points)).toEqual([1000, 1100, 2400]);
    expect(seen[2]).toMatchObject({ multiplier: 2, streakBonus: 0.2 });
    expect(room.players.get(a.id)!.score).toBe(4500);
  });

  it('las relámpago duran la mitad y las dobles y bombas multiplican los puntos', async () => {
    for (let seed = 1; seed <= 6; seed++) {
      const room = makeRoom({ partyMode: true, questionCount: 20 }, seed);
      const a = room.addPlayer('Ana', 's1');
      const seen = await playAll(room, a.id);
      for (const s of seen) {
        expect(s.durationMs).toBe(s.special === 'relampago' ? 5000 : 10000);
        const expected = { doble: 2, bomba: 3, final: 2 }[s.special as string] ?? 1;
        expect(s.multiplier).toBe(expected);
        expect(s.points).toBe(Math.round(1000 * expected * (1 + s.streakBonus)));
      }
    }
  });

  it('el podio incluye premios y cada jugador recibe los suyos', async () => {
    const room = makeRoom({ partyMode: false });
    const a = room.addPlayer('Ana', 's1');
    await playAll(room, a.id);
    const final = room.hostView().final!;
    const kinds = final.awards.map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['cerebrito', 'rayo', 'imparable']));
    expect(kinds).not.toContain('caotico'); // no falló ninguna
    expect(room.playerView(a.id)!.final!.awards).toHaveLength(final.awards.length);
  });

  /** Avanza hasta la cuenta regresiva de la primera pregunta con apuesta, con Ana acertando todo. */
  async function toFirstBet(seed: number, players: string[]) {
    const room = makeRoom({ partyMode: true, questionCount: 10 }, seed);
    const ids = players.map((n, i) => room.addPlayer(n, `s${i}`).id);
    await room.start();
    vi.advanceTimersByTime(COUNTDOWN_MS);
    for (let i = 0; i < 10; i++) {
      const q = room._debugCurrentQuestion()!;
      ids.forEach((id, k) => room.submitAnswer(id, i, k === 0 ? q.correctIndex : (q.correctIndex + 1) % 4));
      room.next();
      room.next();
      room.next();
      if (room.hostView().betting) return { room, ids, index: i + 1 };
      vi.advanceTimersByTime(BETWEEN_QUESTIONS_COUNTDOWN_MS);
    }
    throw new Error('No hubo pregunta con apuesta');
  }

  it('apuestas: se gana o se pierde lo apostado, sin bajar de 0, y solo lo que se tiene', async () => {
    const { room, ids, index } = await toFirstBet(3, ['Ana', 'Beto']);
    const [ana, beto] = ids as [string, string];
    const anaScore = room.players.get(ana)!.score;
    expect(room.playerView(ana)!.betting).toMatchObject({ questionIndex: index, myBet: null, maxBet: anaScore });
    // Beto tiene 0 puntos: no puede apostar más de lo que tiene.
    expect(() => room.placeBet(beto, index, 250)).toThrow();
    expect(() => room.placeBet(ana, index, 300)).toThrow();
    expect(() => room.placeBet(ana, index + 1, 250)).toThrow();
    room.placeBet(beto, index, 0);
    room.placeBet(ana, index, 250);
    room.placeBet(ana, index, 500); // puede cambiar de idea
    expect(room.hostView().betting!.bets).toEqual([expect.objectContaining({ name: 'Ana', amount: 500 })]);

    vi.advanceTimersByTime(BET_COUNTDOWN_MS);
    expect(room.phase).toBe('question');
    expect(room.hostView().question!.bet).toBe(true);
    const q = room._debugCurrentQuestion()!;
    room.submitAnswer(ana, index, (q.correctIndex + 1) % 4); // Ana falla
    room.submitAnswer(beto, index, q.correctIndex);
    room.next();
    const r = room.playerView(ana)!.result!;
    expect(r).toMatchObject({ bet: 500, betDelta: -500, pointsEarned: 0 });
    expect(room.players.get(ana)!.score).toBe(anaScore - 500);
    expect(() => room.placeBet(ana, index, 0)).toThrow(); // ya no hay apuestas abiertas
  });

  it('50/50: oculta dos incorrectas solo a quien lo usa, una vez por partida, y da la mitad de puntos', async () => {
    const room = makeRoom({ partyMode: true, questionCount: 5 });
    const a = room.addPlayer('Ana', 's1');
    const b = room.addPlayer('Beto', 's2');
    await room.start();
    vi.advanceTimersByTime(COUNTDOWN_MS);
    const q = room._debugCurrentQuestion()!;
    expect(room.playerView(a.id)!.fiftyFifty).toEqual({ available: true, hiddenOptions: [] });
    room.useFiftyFifty(a.id, 0);
    const hidden = room.playerView(a.id)!.fiftyFifty.hiddenOptions;
    expect(hidden).toHaveLength(2);
    expect(hidden).not.toContain(q.correctIndex);
    expect(room.playerView(b.id)!.fiftyFifty.hiddenOptions).toEqual([]);
    expect(room.hostView().fiftyFiftyCount).toBe(1);
    expect(() => room.useFiftyFifty(a.id, 0)).toThrow();
    expect(() => room.submitAnswer(a.id, 0, hidden[0]!)).toThrow();
    room.submitAnswer(a.id, 0, q.correctIndex);
    room.submitAnswer(b.id, 0, q.correctIndex);
    room.next();
    expect(room.playerView(a.id)!.result).toMatchObject({ usedFiftyFifty: true, pointsEarned: 500 });
    expect(room.playerView(b.id)!.result).toMatchObject({ usedFiftyFifty: false, pointsEarned: 1000 });
    room.next();
    room.next();
    vi.advanceTimersByTime(8000);
    expect(room.playerView(a.id)!.fiftyFifty.available).toBe(false); // ya lo gastó
    expect(() => room.useFiftyFifty(a.id, 1)).toThrow();
  });

  it('en el modo clásico no hay 50/50 ni apuestas', async () => {
    const room = makeRoom({ partyMode: false, questionCount: 10 });
    const a = room.addPlayer('Ana', 's1');
    await room.start();
    vi.advanceTimersByTime(COUNTDOWN_MS);
    expect(room.playerView(a.id)!.fiftyFifty.available).toBe(false);
    expect(() => room.useFiftyFifty(a.id, 0)).toThrow();
    for (let i = 0; i < 9; i++) {
      room.submitAnswer(a.id, i, 0);
      room.next();
      room.next();
      room.next();
      expect(room.hostView().betting).toBeNull();
      vi.advanceTimersByTime(BETWEEN_QUESTIONS_COUNTDOWN_MS);
    }
  });
});

describe('Modo Musical — línea de tiempo', () => {
  it('tramos de 2 s y 5 s con tiempo para responder, y el fragmento completo', () => {
    expect(musicTimeline(10)).toEqual([
      { startMs: 0, playMs: 2000, endMs: 12_000, points: 1500 },
      { startMs: 12_000, playMs: 5000, endMs: 27_000, points: 1000 },
      { startMs: 27_000, playMs: 30_000, endMs: 57_000, points: 500 },
    ]);
  });

  it('ubica cada instante en su tramo', () => {
    const t = musicTimeline(10);
    expect([0, 11_999, 12_000, 26_999, 27_000, 99_999].map((ms) => musicStageAt(t, ms))).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('el contador de cada tramo se reinicia: se escucha y después corre el tiempo para responder', () => {
    const [first, , last] = musicTimeline(10);
    expect(musicStageClock(first!, 1000)).toEqual({ listening: true, remainingMs: 10_000, totalMs: 10_000 });
    expect(musicStageClock(first!, 5000)).toEqual({ listening: false, remainingMs: 7000, totalMs: 10_000 });
    // En el último tramo el contador corre mientras suena.
    expect(musicStageClock(last!, 37_000)).toEqual({ listening: false, remainingMs: 20_000, totalMs: 30_000 });
  });
});
