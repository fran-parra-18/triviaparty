// Reglas del Modo Musical («Adivina la canción»), compartidas por servidor y clientes.
import { CATEGORY_IDS, type CategoryId } from './categories';

/** Categorías que se pueden jugar en el Modo Musical: las de pistas musicales. */
export const MUSIC_CATEGORY_IDS = CATEGORY_IDS.filter((id) => id.startsWith('pistas-')) as CategoryId[];

export const isMusicCategory = (id: string) => id.startsWith('pistas-');

/** Tiempo para pensar (en silencio) después de cada tramo corto. */
export const MUSIC_THINK_OPTIONS = [3, 5, 8] as const;

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
  /** Hasta cuándo vale lo de este tramo (incluye el tiempo para pensar). */
  endMs: number;
  points: number;
}

/**
 * Línea de tiempo de una canción: 2 s + pausa para pensar, 5 s + pausa, y el fragmento completo.
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

/** Tramo en el que cae un instante de la pregunta (el último si ya pasó todo). */
export function musicStageAt(stages: readonly MusicStage[], elapsedMs: number): number {
  const i = stages.findIndex((s) => elapsedMs < s.endMs);
  return i === -1 ? stages.length - 1 : i;
}
