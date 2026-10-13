import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BETWEEN_QUESTIONS_COUNTDOWN_MS, COUNTDOWN_MS, streakBonus } from '@trivia/shared';
import { computeAwards, planSpecials, type AwardInput } from '../../src/game/party';
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
        vi.advanceTimersByTime(BETWEEN_QUESTIONS_COUNTDOWN_MS);
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
});
