import { PODIUM_TIMINGS, type LeaderboardEntry, type TimerView } from '@trivia/shared';
import confetti from 'canvas-confetti';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { msUntil } from '../lib/clock';
import { formatPoints, useCountUp, useRemaining } from '../lib/hooks';
import { sounds } from '../lib/sound';
import { Avatar } from './ui';

/** Temporizador circular (pantalla principal). El tiempo lo decide el servidor: aquí solo se dibuja. */
export function TimerRing({ timer, size = 160 }: { timer: TimerView | null; size?: number }) {
  const remaining = useRemaining(timer?.paused ? null : timer?.endsAt, timer?.remainingMs ?? 0);
  if (!timer) return null;
  const fraction = timer.durationMs ? Math.min(1, remaining / timer.durationMs) : 0;
  const seconds = Math.ceil(remaining / 1000);
  const r = 45;
  const circumference = 2 * Math.PI * r;
  const color = fraction > 0.5 ? '#22d3ee' : fraction > 0.25 ? '#f59e0b' : '#f43f5e';
  const side = `min(${size}px, 20vh)`;
  return (
    <div
      className={`relative shrink-0 ${seconds <= 5 && seconds > 0 && !timer.paused ? 'animate-pulse' : ''}`}
      style={{ width: side, height: side }}
      role="timer"
      aria-label={`${seconds} segundos restantes`}
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
        <span className="font-display font-bold tabular-nums" style={{ fontSize: `calc(${side} * 0.36)` }}>
          {seconds}
        </span>
        {timer.paused && <span className="text-xs font-bold uppercase tracking-widest text-amber-300">Pausa</span>}
      </div>
    </div>
  );
}

/** Barra de tiempo horizontal (celulares). */
export function TimerBar({ timer }: { timer: TimerView | null }) {
  const remaining = useRemaining(timer?.paused ? null : timer?.endsAt, timer?.remainingMs ?? 0);
  if (!timer) return null;
  const fraction = timer.durationMs ? Math.min(1, remaining / timer.durationMs) : 0;
  const color = fraction > 0.5 ? 'bg-brand-cyan' : fraction > 0.25 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${Math.ceil(remaining / 1000)} segundos restantes`}>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className="w-8 text-right font-display text-xl font-bold tabular-nums">{Math.ceil(remaining / 1000)}</span>
    </div>
  );
}

/** Cuenta regresiva 3-2-1 sincronizada con el servidor. */
export function useCountdownNumber(endsAt: number | null) {
  const remaining = useRemaining(endsAt);
  return endsAt ? Math.max(1, Math.ceil(remaining / 1000)) : null;
}

export function CountdownNumber({ endsAt, size = 'text-[10rem]' }: { endsAt: number | null; size?: string }) {
  const n = useCountdownNumber(endsAt);
  if (n === null) return null;
  return (
    <span key={n} className={`block animate-count font-display font-bold leading-none ${size}`} aria-live="assertive">
      {n}
    </span>
  );
}

/** Tabla de posiciones con animación de cambios de puesto. */
export function Leaderboard({
  entries,
  max = 10,
  highlightId,
  compact = false,
}: {
  entries: LeaderboardEntry[];
  max?: number;
  highlightId?: string;
  compact?: boolean;
}) {
  const shown = entries.slice(0, max);
  const rowH = compact ? 52 : 76;
  // Primero se dibuja el orden anterior y, tras un instante, el nuevo: las filas se deslizan a su puesto.
  const [settled, setSettled] = useState(false);
  const key = shown.map((e) => `${e.playerId}:${e.score}`).join('|');
  useEffect(() => {
    setSettled(false);
    const t = setTimeout(() => setSettled(true), 450);
    return () => clearTimeout(t);
  }, [key]);
  const previousOrder = useMemo(() => {
    const withPrev = shown.map((e, i) => ({ id: e.playerId, prev: e.previousRank ?? i + 1, i }));
    withPrev.sort((a, b) => a.prev - b.prev || a.i - b.i);
    return new Map(withPrev.map((x, i) => [x.id, i]));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ol className="relative w-full" style={{ height: shown.length * rowH }} aria-label="Clasificación">
      {shown.map((e, i) => {
        const pos = settled ? i : (previousOrder.get(e.playerId) ?? i);
        const moved = e.previousRank !== null && e.previousRank > e.rank;
        return (
          <li
            key={e.playerId}
            className="absolute inset-x-0 transition-[top] duration-700 ease-out"
            style={{ top: pos * rowH, height: rowH - (compact ? 6 : 10) }}
          >
            <div
              className={`flex h-full items-center gap-3 rounded-2xl px-4 ${
                e.playerId === highlightId ? 'bg-brand-violet/40 ring-2 ring-brand-cyan' : i === 0 ? 'bg-amber-400/15' : 'bg-white/[0.07]'
              }`}
            >
              <span className={`w-10 text-center font-display font-bold ${compact ? 'text-xl' : 'text-3xl'} ${i === 0 ? 'text-amber-300' : 'text-white/70'}`}>
                {e.rank}
              </span>
              <Avatar name={e.name} index={e.avatar} size={compact ? 32 : 46} />
              <span className={`min-w-0 flex-1 truncate font-bold ${compact ? 'text-lg' : 'text-2xl'} ${e.connected ? '' : 'opacity-50'}`}>
                {e.name}
                {moved && settled && <span className="ml-2 text-base text-emerald-300" aria-label="sube">▲</span>}
              </span>
              {e.lastPoints > 0 && !compact && (
                <span className="animate-pop-in rounded-full bg-emerald-400/20 px-3 py-1 text-lg font-bold text-emerald-200">
                  +{formatPoints(e.lastPoints)}
                </span>
              )}
              <ScoreValue value={e.score} className={`font-display font-bold tabular-nums ${compact ? 'text-xl' : 'text-3xl'}`} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ScoreValue({ value, className }: { value: number; className?: string }) {
  const shown = useCountUp(value);
  return <span className={className}>{formatPoints(shown)}</span>;
}

/** Podio animado: aparecen 3.º, 2.º y 1.º en ese orden. */
/**
 * Podio que aparece del 3.º al 1.º. Con `suspense` (pantalla principal) lo hace despacio, con un texto
 * para cada puesto, un redoble antes del campeón y la fanfarria al final (ver PODIUM_TIMINGS).
 */
export function Podium({ entries, compact = false, suspense = false }: { entries: LeaderboardEntry[]; compact?: boolean; suspense?: boolean }) {
  // 1 = tercero, 2 = segundo, 3 = redoble, 4 = campeón
  const [stage, setStage] = useState(0);
  useEffect(() => {
    setStage(0);
    const t = suspense ? PODIUM_TIMINGS : { third: 600, second: 1600, drumroll: null, first: 2800 };
    const at = (ms: number, fn: () => void) => setTimeout(fn, ms);
    const timers = [
      at(t.third, () => {
        setStage(1);
        if (suspense && entries[2]) sounds.podiumHit();
      }),
      at(t.second, () => {
        setStage(2);
        if (suspense && entries[1]) sounds.podiumHit();
      }),
      ...(t.drumroll !== null
        ? [
            at(t.drumroll, () => {
              setStage(3);
              sounds.drumroll();
            }),
          ]
        : []),
      at(t.first, () => {
        setStage(4);
        if (suspense) sounds.fanfare();
        fireConfetti();
      }),
    ];
    return () => timers.forEach(clearTimeout);
  }, [entries.map((e) => e.playerId).join(), suspense]); // eslint-disable-line react-hooks/exhaustive-deps

  const [first, second, third] = entries;
  const caption =
    stage >= 4 && first
      ? `🏆 ¡${first.name}!`
      : stage === 3
        ? 'Y el campeón es… 🥁'
        : stage === 2 && second
          ? 'En segundo lugar…'
          : stage === 1 && third
            ? 'En tercer lugar…'
            : '';
  const medals = ['🥇', '🥈', '🥉'];
  // En caso de empate se muestra el puesto real (por ejemplo, dos medallas de oro).
  const slots = [
    { e: second, place: 2, height: compact ? 'h-20' : 'h-40 md:h-52', color: 'from-slate-300 to-slate-500', show: stage >= 2 },
    { e: first, place: 1, height: compact ? 'h-28' : 'h-56 md:h-72', color: 'from-amber-300 to-amber-500', show: stage >= 4 },
    { e: third, place: 3, height: compact ? 'h-14' : 'h-28 md:h-36', color: 'from-orange-400 to-orange-700', show: stage >= 1 },
  ].filter((s) => s.e);
  return (
    <div className="flex flex-col items-center gap-4">
      {suspense && (
        <p key={stage} className="animate-pop-in h-12 font-display text-4xl font-bold text-amber-200" aria-live="polite">
          {caption}
        </p>
      )}
      <div className="flex items-end justify-center gap-3 md:gap-6">
        {slots.map(({ e, place, height, color, show }) => (
          <div key={place} className={`flex flex-col items-center ${compact ? 'w-24' : 'w-28 md:w-48'}`}>
            <div className={`mb-3 flex flex-col items-center transition-all duration-500 ${show && e ? 'opacity-100' : 'translate-y-4 opacity-0'}`}>
              {e && (
                <>
                  <span className={compact ? 'text-2xl' : 'text-4xl md:text-5xl'}>{medals[e.rank - 1] ?? ''}</span>
                  <Avatar name={e.name} index={e.avatar} size={compact ? (place === 1 ? 44 : 36) : place === 1 ? 72 : 56} />
                  <span className={`mt-1 max-w-full truncate text-center font-display font-bold ${compact ? 'text-base' : 'text-xl md:text-2xl'}`}>{e.name}</span>
                  <span className="font-bold tabular-nums text-white/80">{formatPoints(e.score)} pts</span>
                </>
              )}
            </div>
            <div
              className={`w-full origin-bottom rounded-t-2xl bg-gradient-to-b ${color} ${height} flex items-start justify-center pt-3 shadow-xl ${
                show ? 'animate-rise' : 'scale-y-0'
              }`}
            >
              <span className={`font-display font-bold text-night-950/70 ${compact ? 'text-2xl' : 'text-5xl'}`}>{e?.rank ?? place}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function fireConfetti(intensity = 1) {
  try {
    const end = Date.now() + 1200 * intensity;
    const colors = ['#ff4d8d', '#7c4dff', '#22d3ee', '#a3e635', '#f59e0b'];
    const frame = () => {
      void confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors, disableForReducedMotion: true });
      void confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors, disableForReducedMotion: true });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  } catch {
    /* sin canvas */
  }
}

export function QrCode({ value, size = 280 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#140b33', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [value, size]);
  // El tamaño se adapta a la altura de la pantalla para que el lobby quepa sin desplazarse.
  const side = `min(${size}px, 30vh)`;
  return (
    <div className="shrink-0 rounded-3xl bg-white p-3 shadow-2xl">
      {src ? (
        <img src={src} style={{ width: side, height: side }} alt={`Código QR para unirse: ${value}`} />
      ) : (
        <div style={{ width: side, height: side }} />
      )}
    </div>
  );
}

/** Segundos restantes de un avance automático, para mostrar «Siguiente en 5…». */
export function AutoAdvanceHint({ at }: { at: number | null }) {
  const remaining = useRemaining(at);
  if (!at || remaining <= 0) return null;
  return <span className="text-white/60">Continúa en {Math.ceil(msUntil(at) / 1000)} s</span>;
}
