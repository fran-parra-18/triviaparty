import { DIFFICULTY_LABELS, nextActionLabel, type HostView, type MusicStage, type TimerView } from '@trivia/shared';
import { useEffect, useRef, useState } from 'react';
import { AutoAdvanceHint, CountdownNumber, Leaderboard, TimerRing, useCountdownNumber } from '../../components/game';
import { MusicIndicator, useMusicClip } from '../../components/MusicClip';
import { MusicStageBar, MusicStageRing, useMusicStage } from '../../components/MusicStages';
import { SpecialAnnouncement, SpecialBadge } from '../../components/party';
import { Avatar, CategoryBadge, categoryLabel, OptionAccent, OptionIcon, OptionWave, optionCard } from '../../components/ui';
import { useOnChange, useRemaining } from '../../lib/hooks';
import { sounds } from '../../lib/sound';
import type { HostActions } from './HostPage';

export function HostPlay({ view, actions }: { view: HostView; actions: HostActions }) {
  const primaryLabel = nextActionLabel(view.phase, view.progress, view.settings.showResultsAfterEach);
  // Vive aquí (no en QuestionScreen) para que el fragmento siga sonando al pasar de la pregunta a la revelación.
  const clip = useMusicClip(view);
  const { replay } = clip;
  const canSkipStage = view.phase === 'question' && !view.paused && !!view.question?.musicStages;
  const { skipStage } = actions;

  // R: repetir el fragmento de las pistas musicales. T: pasar al siguiente tramo (Modo Musical).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea, [role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'r') replay();
      else if (key === 't' && canSkipStage) void skipStage();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replay, canSkipStage, skipStage]);

  return (
    <main className="relative flex flex-1 flex-col px-4 pb-4 md:px-8">
      <div className="flex flex-1 flex-col">
        {view.phase === 'countdown' && <CountdownScreen view={view} />}
        {(view.phase === 'question' || view.phase === 'locked' || view.phase === 'reveal') && (
          <QuestionScreen view={view} clip={clip} onSkipStage={canSkipStage ? () => void skipStage() : null} />
        )}
        {view.phase === 'leaderboard' && <LeaderboardScreen view={view} />}
      </div>

      {view.paused && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-night-950/70 backdrop-blur-sm" role="status">
          <div className="glass animate-pop-in p-10 text-center">
            <div className="text-7xl">⏸</div>
            <p className="mt-3 font-display text-5xl font-bold">Partida en pausa</p>
            <button type="button" className="btn-primary mt-6 px-10 py-4 text-2xl" onClick={() => void actions.resume()}>
              ▶ Reanudar
            </button>
          </div>
        </div>
      )}

      <footer className="relative z-30 mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void (view.paused ? actions.resume() : actions.pause())}
          title="Pausar / reanudar (P)"
        >
          {view.paused ? '▶ Reanudar' : '⏸ Pausar'}
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            if (confirm('¿Terminar la partida ahora y mostrar el podio?')) void actions.end();
          }}
        >
          ⏹ Terminar
        </button>
        <span className="hidden flex-1 text-center text-sm text-white/40 md:block">
          Espacio: siguiente · P: pausa · F: pantalla completa · M: sonido{clip.active && ' · −/+: volumen · R: repetir'}
          {view.question?.musicStages && ' · T: siguiente tramo'}
        </span>
        <AutoAdvanceHint at={view.autoAdvanceAt} />
        <button type="button" className="btn-primary ml-auto px-8 py-4 text-xl" onClick={() => void actions.next()} title="Siguiente (Espacio)">
          {primaryLabel ?? 'Siguiente'}
        </button>
      </footer>
    </main>
  );
}

function CountdownScreen({ view }: { view: HostView }) {
  const n = useCountdownNumber(view.countdownEndsAt);
  useOnChange(n === null ? null : String(n), () => sounds.countdown());
  useEffect(() => {
    if (view.nextSpecial) sounds.special();
  }, [view.nextSpecial, view.progress?.index]);
  const index = view.progress?.index ?? 0;
  const music = view.settings.musicMode;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <p className="font-display text-4xl text-white/80 md:text-5xl">
        {index === 0 ? (music ? '🎵 ¡Adivinen la canción!' : '¡Prepárense!') : music ? 'Siguiente canción' : 'Siguiente pregunta'}
      </p>
      <p className="font-display text-3xl font-bold text-brand-cyan">
        {music ? 'Canción' : 'Pregunta'} {index + 1} de {view.progress?.total}
      </p>
      {music && index === 0 && (
        <p className="max-w-3xl text-2xl text-white/70">
          Primero suenan 2 segundos, después 5 y al final el fragmento completo, y cada tramo tiene su propio contador. Cuanto antes
          respondan, más vale: 1.500, 1.000 o 500.
        </p>
      )}
      {view.nextSpecial && <SpecialAnnouncement kind={view.nextSpecial} />}
      {view.betting && (
        <div className="glass animate-pop-in w-full max-w-3xl space-y-4 p-6">
          <p className="font-display text-5xl font-bold text-amber-200">💰 ¡Pregunta con apuesta!</p>
          <p className="text-2xl">
            {categoryLabel(view.betting.category)} · {DIFFICULTY_LABELS[view.betting.difficulty]}
          </p>
          <p className="text-xl text-white/70">Apuesten desde el celular: si aciertan, ganan lo apostado; si fallan, lo pierden.</p>
          <div className="flex min-h-12 flex-wrap justify-center gap-3" aria-live="polite">
            {view.betting.bets.length === 0 ? (
              <span className="text-lg text-white/50">Nadie apostó todavía…</span>
            ) : (
              view.betting.bets.map((b) => (
                <span key={b.playerId} className="animate-pop-in chip gap-2 text-xl">
                  <Avatar name={b.name} index={b.avatar} size={28} /> {b.name} apostó <strong className="text-amber-200">{b.amount}</strong>
                </span>
              ))
            )}
          </div>
        </div>
      )}
      <div className={`flex items-center justify-center ${view.betting ? 'h-28' : 'h-56'}`}>
        {view.paused ? (
          <span className="text-8xl">⏸</span>
        ) : (
          <CountdownNumber endsAt={view.countdownEndsAt} size={view.betting ? 'text-8xl' : 'text-[12rem]'} />
        )}
      </div>
    </div>
  );
}

function QuestionScreen({
  view,
  clip,
  onSkipStage,
}: {
  view: HostView;
  clip: ReturnType<typeof useMusicClip>;
  onSkipStage: (() => void) | null;
}) {
  const q = view.question!;
  const reveal = view.reveal;
  const locked = view.phase === 'locked';
  const remaining = useRemaining(view.phase === 'question' && !view.paused ? view.timer?.endsAt : null);
  const lastTick = useRef<number | null>(null);

  // Tic-tac en los últimos 5 segundos (en el Modo Musical, lo hace cada tramo).
  useEffect(() => {
    const s = Math.ceil(remaining / 1000);
    if (view.phase === 'question' && !q.musicStages && s <= 5 && s > 0 && s !== lastTick.current) {
      lastTick.current = s;
      sounds.urgentTick();
    }
  }, [remaining, view.phase, q.musicStages]);

  const maxCount = reveal ? Math.max(1, ...reveal.counts) : 1;
  // Tamaños ligados a la altura de la pantalla: el contenido cabe en un televisor sin desplazarse.
  const textSize =
    q.text.length > 140 ? 'text-[clamp(1.5rem,3.8vh,3.2rem)]' : q.text.length > 80 ? 'text-[clamp(1.75rem,4.6vh,3.8rem)]' : 'text-[clamp(2rem,5.4vh,4.5rem)]';
  const allAnswered = view.expectedCount > 0 && view.answeredCount >= view.expectedCount;

  return (
    <div className="flex flex-1 flex-col gap-[clamp(0.5rem,2vh,1.25rem)]">
      <div className="flex items-start gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-2xl font-bold text-brand-cyan">
              {q.index + 1} / {q.total}
            </span>
            <CategoryBadge category={q.category} difficulty={q.difficulty} />
            {q.special && <SpecialBadge kind={q.special} />}
            {q.bet && <span className="chip font-bold text-amber-200">💰 Con apuesta</span>}
            {view.fiftyFiftyCount > 0 && (
              <span className="chip">
                🃏 {view.fiftyFiftyCount} {view.fiftyFiftyCount === 1 ? 'usó' : 'usaron'} el 50/50
              </span>
            )}
          </div>
          <h1 key={q.index} className={`animate-slide-up font-display font-bold leading-tight ${textSize}`}>
            {q.text}
          </h1>
          <div className="flex flex-wrap items-center gap-3 self-start">
            <MusicIndicator clip={clip} />
            {onSkipStage && q.musicStages && <SkipStageButton stages={q.musicStages} timer={view.timer} onSkip={onSkipStage} />}
          </div>
          {q.musicStages && view.phase === 'question' && <MusicStageBar stages={q.musicStages} timer={view.timer} />}
        </div>
        <div className="flex flex-col items-center gap-2">
          {view.phase === 'question' && q.musicStages ? (
            <>
              <MusicStageRing stages={q.musicStages} timer={view.timer} size={150} />
              <MusicStageSounds stages={q.musicStages} timer={view.timer} />
            </>
          ) : view.phase === 'question' ? (
            <TimerRing timer={view.timer} size={150} />
          ) : (
            <div className="flex h-[min(150px,20vh)] w-[min(150px,20vh)] items-center justify-center rounded-full bg-white/10 text-center font-display text-2xl font-bold">
              {locked ? (allAnswered ? '¡Listo!' : '¡Tiempo!') : '✓'}
            </div>
          )}
          <AnsweredCounter answered={reveal ? reveal.answeredCount : view.answeredCount} expected={view.expectedCount} />
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        {q.options.map((opt, i) => {
          const isCorrect = reveal?.correctIndex === i;
          const card = optionCard(i, reveal ? (isCorrect ? 'correct' : 'dim') : 'idle');
          return (
            <div
              key={`${q.index}-${i}`}
              className={`relative flex min-h-[clamp(4rem,11vh,9rem)] animate-pop-in items-center gap-[clamp(0.75rem,2vw,1.75rem)] rounded-3xl px-[clamp(1rem,2.5vw,2.25rem)] py-3 ${card.className}`}
              style={{ ...card.style, animationDelay: `${i * 70}ms` }}
            >
              <OptionIcon index={i} className="h-[clamp(3rem,8vh,5.5rem)] w-[clamp(3rem,8vh,5.5rem)]" />
              <div className="min-w-0 flex-1">
                <span
                  className={`block font-display font-bold leading-tight ${opt.length > 40 ? 'text-[clamp(1.1rem,2.8vh,2.1rem)]' : 'text-[clamp(1.3rem,3.6vh,2.7rem)]'}`}
                >
                  {opt}
                </span>
                {/* Antes de revelar es un adorno; al revelar, muestra cuántos la eligieron. */}
                <OptionAccent index={i} fill={reveal ? reveal.counts[i]! / maxCount : 0.55} />
              </div>
              {reveal ? (
                <div className="flex shrink-0 items-center gap-3">
                  {isCorrect && (
                    <span className="animate-pop-in text-5xl" aria-label="Respuesta correcta">
                      ✔
                    </span>
                  )}
                  <span className="font-display text-4xl font-bold tabular-nums" aria-label={`${reveal.counts[i]} respuestas`}>
                    {reveal.counts[i]}
                  </span>
                </div>
              ) : (
                <OptionWave index={i} className="hidden h-[clamp(2rem,6vh,4rem)] lg:flex" />
              )}
            </div>
          );
        })}
      </div>

      {reveal && (
        <div className="glass animate-slide-up flex flex-col gap-2 px-5 py-3 md:flex-row md:items-center md:gap-6">
          <div className="flex-1">
            <p className="text-[clamp(1.05rem,2.7vh,2rem)] leading-snug">💡 {reveal.explanation}</p>
            {reveal.source && <p className="mt-1 text-sm text-white/50">Fuente: {reveal.source}</p>}
          </div>
          <div className="shrink-0 text-xl text-white/80">
            <p>
              <strong className="text-emerald-300">{reveal.correctCount}</strong> de {reveal.answeredCount} acertaron
            </p>
            {reveal.fastestCorrect && (
              <p>
                ⚡ Más rápido: <strong>{reveal.fastestCorrect.name}</strong> ({(reveal.fastestCorrect.ms / 1000).toFixed(1)} s)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Modo Musical: pasar al siguiente tramo si nadie la reconoce (no aparece en el último). */
function SkipStageButton({ stages, timer, onSkip }: { stages: MusicStage[]; timer: TimerView | null; onSkip: () => void }) {
  const { last } = useMusicStage(stages, timer);
  if (last) return null;
  return (
    <button type="button" className="btn-secondary px-5 py-2 text-lg" onClick={onSkip} title="Pasar al siguiente tramo (T)">
      ⏭ Siguiente tramo
    </button>
  );
}

/** Modo Musical: aviso al cambiar de tramo y tic-tac al final de cada uno. */
function MusicStageSounds({ stages, timer }: { stages: MusicStage[]; timer: TimerView | null }) {
  const { current, listening, remainingMs, last } = useMusicStage(stages, timer);
  const seconds = Math.ceil(remainingMs / 1000);
  useOnChange(String(current), () => sounds.special());
  const lastTick = useRef<string | null>(null);
  useEffect(() => {
    const key = `${current}-${seconds}`;
    if (timer?.paused || listening || seconds > (last ? 5 : 3) || seconds <= 0 || key === lastTick.current) return;
    lastTick.current = key;
    sounds.urgentTick();
  }, [current, seconds, listening, last, timer?.paused]);
  return null;
}

function AnsweredCounter({ answered, expected }: { answered: number; expected: number }) {
  return (
    <div className="text-center" aria-live="polite">
      <div className="font-display text-4xl font-bold tabular-nums">
        {answered}
        <span className="text-white/40">/{expected}</span>
      </div>
      <div className="text-sm text-white/60">respuestas</div>
    </div>
  );
}

function LeaderboardScreen({ view }: { view: HostView }) {
  const leader = view.leaderboard[0];
  const leaderChanged = leader && leader.previousRank !== null && leader.previousRank !== 1;
  const firstLeader = leader && leader.previousRank === null && (view.progress?.index ?? 0) === 0 && leader.score > 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5">
      <h1 className="text-center text-5xl font-bold">Clasificación</h1>
      {leader && (leaderChanged || firstLeader) && (
        <div className="animate-pop-in rounded-3xl bg-gradient-to-r from-amber-300 to-orange-400 px-6 py-4 text-center font-display text-3xl font-bold text-night-950 shadow-xl">
          👑 ¡{leader.name} {leaderChanged ? 'toma la delantera' : 'va en cabeza'}!
        </div>
      )}
      {view.leaderboard.length === 0 ? (
        <p className="text-center text-2xl text-white/60">Todavía no hay puntos.</p>
      ) : (
        <Leaderboard entries={view.leaderboard} max={8} />
      )}
    </div>
  );
}
