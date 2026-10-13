import { MUSIC_STAGE_RULES, musicStageAt, type MusicStage, type TimerView } from '@trivia/shared';
import { formatPoints, useRemaining } from '../lib/hooks';

/** Momento de la pregunta (ms desde que se abrió) según el reloj del servidor; se congela en pausa. */
export function useQuestionElapsed(timer: TimerView | null): number {
  const remaining = useRemaining(timer?.paused ? null : timer?.endsAt, timer?.remainingMs ?? 0);
  return timer ? Math.max(0, timer.durationMs - remaining) : 0;
}

const NOTES = ['🎵', '🎵🎵', '🎵🎵🎵'];

/**
 * Tramos del Modo Musical: cuál suena, cuánto vale acertar ahora y cuánto falta para el siguiente.
 * La pantalla principal lo muestra grande; el celular, compacto.
 */
export function MusicStageBar({ stages, timer, compact = false }: { stages: MusicStage[]; timer: TimerView | null; compact?: boolean }) {
  const elapsed = useQuestionElapsed(timer);
  const current = musicStageAt(stages, elapsed);
  const stage = stages[current]!;
  const playing = elapsed >= stage.startMs && elapsed < stage.startMs + stage.playMs;

  return (
    <div className={`flex w-full flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={`font-display font-bold ${compact ? 'text-base' : 'text-2xl'}`}>
          {NOTES[current]} Tramo {current + 1} de {stages.length}
          <span className={`ml-2 font-semibold text-white/60 ${compact ? 'text-sm' : 'text-xl'}`}>
            {timer?.paused ? '· en pausa' : playing ? '· sonando' : current < stages.length - 1 ? '· ¡piensen!' : ''}
          </span>
        </p>
        <p
          key={current}
          className={`animate-pop-in rounded-2xl bg-gradient-to-r from-brand-pink to-brand-cyan font-display font-bold text-night-950 shadow-lg ${
            compact ? 'px-3 py-1 text-lg' : 'px-5 py-2 text-4xl'
          }`}
          aria-live="polite"
        >
          Ahora vale {formatPoints(stage.points)}
        </p>
      </div>
      <div className="flex gap-2" aria-hidden>
        {stages.map((s, i) => {
          const fill = i < current ? 1 : i > current ? 0 : Math.min(1, (elapsed - s.startMs) / (s.endMs - s.startMs));
          return (
            <div key={i} className="flex flex-col gap-1" style={{ flexGrow: s.endMs - s.startMs, flexBasis: 0 }}>
              <div className={`overflow-hidden rounded-full bg-white/10 ${compact ? 'h-2' : 'h-4'}`}>
                <div className={`h-full ${i < current ? 'bg-white/25' : 'bg-brand-cyan'}`} style={{ width: `${fill * 100}%` }} />
              </div>
              {!compact && (
                <span className={`text-center text-sm font-semibold ${i === current ? 'text-white' : 'text-white/45'}`}>
                  {NOTES[i]} {MUSIC_STAGE_RULES[i]?.label} · {formatPoints(s.points)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
