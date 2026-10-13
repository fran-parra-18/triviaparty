import type { Award, AwardKind, SpecialKind } from '@trivia/shared';
import { shuffle, type Rng } from './selection';

/**
 * Reparte las preguntas especiales del Modo Fiesta:
 *  - la última es siempre «Última oportunidad» (si hay al menos 3 preguntas);
 *  - entre la segunda y la penúltima, aproximadamente 1 de cada 3,5 es especial, nunca dos seguidas;
 *  - como mucho una «bomba» por partida, y nunca un «relámpago» en una pregunta de audio
 *    (el fragmento necesita su tiempo).
 */
export function planSpecials(questions: readonly { audioUrl: string | null }[], rng: Rng): (SpecialKind | null)[] {
  const n = questions.length;
  const plan: (SpecialKind | null)[] = Array.from({ length: n }, () => null);
  if (n < 3) return plan;
  plan[n - 1] = 'final';

  const target = Math.max(1, Math.round((n - 1) / 3.5));
  const chosen: number[] = [];
  // Candidatas: de la segunda a la antepenúltima, para no pegarse a la «Última oportunidad».
  const candidates = shuffle(
    Array.from({ length: Math.max(0, n - 3) }, (_, i) => i + 1),
    rng,
  );
  for (const i of candidates) {
    if (chosen.length >= target) break;
    if (chosen.some((c) => Math.abs(c - i) < 2)) continue;
    chosen.push(i);
  }

  let bombUsed = false;
  for (const i of chosen.sort((a, b) => a - b)) {
    const isAudio = !!questions[i]!.audioUrl;
    const roll = rng();
    if (!bombUsed && n >= 6 && roll < 0.25) {
      plan[i] = 'bomba';
      bombUsed = true;
    } else if (!isAudio && roll < 0.6) {
      plan[i] = 'relampago';
    } else {
      plan[i] = 'doble';
    }
  }
  return plan;
}

/**
 * Elige las preguntas con apuesta del Modo Fiesta: aproximadamente 1 de cada 5, nunca la primera
 * (todos tienen 0 puntos) ni una pregunta especial, y sin dos seguidas.
 */
export function planBets(specials: readonly (SpecialKind | null)[], rng: Rng): boolean[] {
  const n = specials.length;
  const plan = Array.from({ length: n }, () => false);
  if (n < 4) return plan;
  const target = Math.max(1, Math.floor(n / 5));
  const candidates = shuffle(
    Array.from({ length: n - 1 }, (_, i) => i + 1).filter((i) => specials[i] === null),
    rng,
  );
  const chosen: number[] = [];
  for (const i of candidates) {
    if (chosen.length >= target) break;
    if (chosen.some((c) => Math.abs(c - i) < 2)) continue;
    chosen.push(i);
  }
  for (const i of chosen) plan[i] = true;
  return plan;
}

export interface AwardInput {
  playerId: string;
  name: string;
  avatar: number;
  joinOrder: number;
  score: number;
  correct: number;
  wrong: number;
  hardCorrect: number;
  avgCorrectMs: number | null;
  bestStreak: number;
}

/**
 * Premios graciosos del podio. Cada uno exige un mínimo para no repartir premios vacíos
 * (por ejemplo, «El Imparable» necesita una racha de 3). En caso de empate gana quien tenga más puntos.
 */
export function computeAwards(players: readonly AwardInput[]): Award[] {
  const awards: Award[] = [];
  const pick = (kind: AwardKind, eligible: AwardInput[], better: (a: AwardInput, b: AwardInput) => number, detail: (p: AwardInput) => string) => {
    const winner = [...eligible].sort((a, b) => better(a, b) || b.score - a.score || a.joinOrder - b.joinOrder)[0];
    if (winner) awards.push({ kind, playerId: winner.playerId, name: winner.name, avatar: winner.avatar, detail: detail(winner) });
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  pick('cerebrito', players.filter((p) => p.correct > 0), (a, b) => b.correct - a.correct, (p) => plural(p.correct, 'acierto', 'aciertos'));
  pick(
    'rayo',
    players.filter((p) => p.avgCorrectMs !== null && p.correct >= 2),
    (a, b) => a.avgCorrectMs! - b.avgCorrectMs!,
    (p) => `${(p.avgCorrectMs! / 1000).toFixed(1).replace('.', ',')} s de media al acertar`,
  );
  pick('imparable', players.filter((p) => p.bestStreak >= 3), (a, b) => b.bestStreak - a.bestStreak, (p) => `${p.bestStreak} aciertos seguidos`);
  pick(
    'suertudo',
    players.filter((p) => p.hardCorrect > 0),
    (a, b) => b.hardCorrect - a.hardCorrect,
    (p) => plural(p.hardCorrect, 'pregunta difícil acertada', 'preguntas difíciles acertadas'),
  );
  pick(
    'caotico',
    players.filter((p) => p.wrong >= 2),
    (a, b) => b.wrong - a.wrong,
    (p) => `${p.wrong} respuestas incorrectas, ¡pero con estilo!`,
  );
  return awards;
}
