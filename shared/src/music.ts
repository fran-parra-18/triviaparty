// Reglas del Modo Musical («Adivina la canción»), compartidas por servidor y clientes.
import { CATEGORY_IDS, type CategoryId } from './categories';

/** Categorías que se pueden jugar en el Modo Musical: las de pistas musicales. */
export const MUSIC_CATEGORY_IDS = CATEGORY_IDS.filter((id) => id.startsWith('pistas-')) as CategoryId[];

export const isMusicCategory = (id: string) => id.startsWith('pistas-');

/** Tiempo para responder después de cada tramo corto: el contador se reinicia en cada tramo. */
export const MUSIC_THINK_OPTIONS = [10, 15, 20] as const;
export const MUSIC_THINK_DEFAULT = 10;

/** Los tres tramos: cuánto suena cada uno (desde el principio del fragmento) y cuánto vale acertar en él. */
export const MUSIC_STAGE_RULES = [
  { playMs: 2000, points: 1500, label: '2 s' },
  { playMs: 5000, points: 1000, label: '5 s' },
  { playMs: 30000, points: 500, label: 'Completo' },
] as const;

/** Un tramo en la línea de tiempo de la pregunta (ms desde que se abre). */
export interface MusicStage {
  /** Cuándo empieza a sonar. */
  startMs: number;
  /** Cuánto suena (el fragmento siempre arranca desde el principio). */
  playMs: number;
  /** Hasta cuándo vale lo de este tramo (incluye el tiempo para responder). */
  endMs: number;
  points: number;
}

/**
 * Línea de tiempo de una canción: 2 s + tiempo para responder, 5 s + tiempo para responder, y el
 * fragmento completo (su contador corre mientras suena).
 * El servidor la usa para puntuar según el momento de la respuesta y los clientes para dibujarla.
 */
export function musicTimeline(thinkSeconds: number): MusicStage[] {
  const think = thinkSeconds * 1000;
  let start = 0;
  return MUSIC_STAGE_RULES.map((rule, i) => {
    const last = i === MUSIC_STAGE_RULES.length - 1;
    const stage = { startMs: start, playMs: rule.playMs, endMs: start + rule.playMs + (last ? 0 : think), points: rule.points };
    start = stage.endMs;
    return stage;
  });
}

/**
 * Contador del tramo: mientras suena un tramo corto se escucha (sin contar); después corre el tiempo
 * para responder. En el último tramo el contador corre mientras suena el fragmento.
 */
export function musicStageClock(stage: MusicStage, elapsedMs: number) {
  const playEnd = stage.startMs + stage.playMs;
  const listening = elapsedMs < playEnd && stage.endMs > playEnd;
  const countFrom = stage.endMs > playEnd ? playEnd : stage.startMs;
  return { listening, remainingMs: Math.max(0, stage.endMs - Math.max(elapsedMs, countFrom)), totalMs: stage.endMs - countFrom };
}

/** Tramo en el que cae un instante de la pregunta (el último si ya pasó todo). */
export function musicStageAt(stages: readonly MusicStage[], elapsedMs: number): number {
  const i = stages.findIndex((s) => elapsedMs < s.endMs);
  return i === -1 ? stages.length - 1 : i;
}
