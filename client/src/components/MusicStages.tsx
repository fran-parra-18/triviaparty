import { MUSIC_STAGE_RULES, musicStageAt, musicStageClock, type MusicStage, type TimerView } from '@trivia/shared';
import { formatPoints, useRemaining } from '../lib/hooks';

/** Momento de la pregunta (ms desde que se abrió) según el reloj del servidor; se congela en pausa. */
export function useQuestionElapsed(timer: TimerView | null): number {
  const remaining = useRemaining(timer?.paused ? null : timer?.endsAt, timer?.remainingMs ?? 0);
  return timer ? Math.max(0, timer.durationMs - remaining) : 0;
}

/** Tramo actual y su contador (que se reinicia en cada tramo). */
export function useMusicStage(stages: MusicStage[], timer: TimerView | null) {
  const elapsed = useQuestionElapsed(timer);
  const current = musicStageAt(stages, elapsed);
  const stage = stages[current]!;
  return { elapsed, current, stage, last: current === stages.length - 1, ...musicStageClock(stage, elapsed) };
}

const NOTES = ['🎵', '🎵🎵', '🎵🎵🎵'];

/**
 * Tramos del Modo Musical: cuál suena, cuánto vale acertar ahora y el contador del tramo.
 * La pantalla principal lo muestra grande; el celular, compacto (con los segundos que quedan).
 */
export function MusicStageBar({ stages, timer, compact = false }: { stages: MusicStage[]; timer: TimerView | null; compact?: boolean }) {
  const { elapsed, current, stage, listening, remainingMs } = useMusicStage(stages, timer);
  const status = timer?.paused ? 'en pausa' : listening ? '🎧 escuchando…' : '¡a responder!';

  return (
    <div className={`flex w-full flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={`font-display font-bold ${compact ? 'text-base' : 'text-2xl'}`}>
          {NOTES[current]} Tramo {current + 1} de {stages.length}
          <span className={`ml-2 font-semibold text-white/60 ${compact ? 'text-sm' : 'text-xl'}`}>· {status}</span>
        </p>
        <div className="flex items-center gap-2">
          {compact && !listening && (
            <span className="font-display text-xl font-bold tabular-nums" aria-label={`${Math.ceil(remainingMs / 1000)} segundos para responder`}>
              ⏱ {Math.ceil(remainingMs / 1000)}
            </span>
          )}
          <p
            key={current}
            className={`animate-pop-in rounded-2xl bg-gradient-to-r from-brand-pink to-brand-cyan font-display font-bold text-night-950 shadow-lg ${
              compact ? 'px-3 py-1 text-lg' : 'px-5 py-2 text-4xl'
            }`}
            aria-live="polite"
          >
            Vale {formatPoints(stage.points)}
          </p>
        </div>
      </div>
      <div className="flex gap-2" aria-hidden>
        {stages.map((s, i) => {
          const fill = i < current ? 1 : i > current ? 0 : Math.min(1, (elapsed - s.startMs) / (s.endMs - s.startMs));
          return (
            <div key={i} className="flex flex-1 flex-col gap-1">
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

/** Contador grande del tramo para la pantalla principal: 🎧 mientras suena, luego los segundos para responder. */
export function MusicStageRing({ stages, timer, size = 150 }: { stages: MusicStage[]; timer: TimerView | null; size?: number }) {
  const { listening, remainingMs, totalMs } = useMusicStage(stages, timer);
  const seconds = Math.ceil(remainingMs / 1000);
  const fraction = listening ? 1 : totalMs ? Math.min(1, remainingMs / totalMs) : 0;
  const r = 45;
  const circumference = 2 * Math.PI * r;
  const color = listening ? '#a78bfa' : fraction > 0.5 ? '#22d3ee' : fraction > 0.25 ? '#f59e0b' : '#f43f5e';
  const side = `min(${size}px, 20vh)`;
  const urgent = !listening && seconds <= 3 && seconds > 0 && !timer?.paused;
  return (
    <div
      className={`relative shrink-0 ${urgent ? 'animate-pulse' : ''}`}
      style={{ width: side, height: side }}
      role="timer"
      aria-label={listening ? 'Escuchando el tramo' : `${seconds} segundos para responder en este tramo`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="rgb(255 255 255 / 0.08)" stroke="rgb(255 255 255 / 0.12)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {listening ? (
          <span style={{ fontSize: `calc(${side} * 0.32)` }} aria-hidden>
            🎧
          </span>
        ) : (
          <span className="font-display font-bold tabular-nums" style={{ fontSize: `calc(${side} * 0.36)` }}>
            {seconds}
          </span>
        )}
        {timer?.paused && <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Pausa</span>}
      </div>
    </div>
  );
}
