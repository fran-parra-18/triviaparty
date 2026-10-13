import { CATEGORIES, DIFFICULTY_LABELS, type CategoryId, type Difficulty } from '@trivia/shared';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useMusicVolume, useMuted, unlockAudio } from '../lib/sound';

export const AVATAR_COLORS = [
  '#ff4d8d', '#7c4dff', '#22d3ee', '#a3e635', '#f59e0b', '#f97316', '#10b981', '#e879f9',
  '#60a5fa', '#facc15', '#fb7185', '#34d399', '#c084fc', '#38bdf8', '#fbbf24', '#4ade80',
];

export function Avatar({ name, index, size = 40 }: { name: string; index: number; size?: number }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-night-950 shadow-md"
      style={{ width: size, height: size, fontSize: size * 0.48, background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
    >
      {initial}
    </span>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  // En tamaños grandes se muestra el emblema completo, que ya incluye «Trivia Party».
  if (size === 'lg' || size === 'xl') {
    const img = size === 'xl' ? 'w-64 md:w-80' : 'w-44 md:w-56';
    return (
      <img
        src="/logo.webp"
        alt="Trivia Party"
        className={`${img} select-none rounded-[22%] shadow-[0_12px_40px_rgba(124,77,255,0.45)] ring-1 ring-white/10`}
      />
    );
  }
  const text = { sm: 'text-2xl', md: 'text-4xl' }[size];
  const icon = { sm: 40, md: 56 }[size];
  return (
    <div className="flex items-center justify-center gap-3 select-none">
      <img src="/logo.webp" width={icon} height={icon} alt="" className="rounded-[22%] shadow-lg" />
      <span className={`font-display font-bold leading-none tracking-tight ${text}`}>
        <span className="bg-gradient-to-r from-brand-pink via-fuchsia-400 to-brand-violet bg-clip-text text-transparent">Trivia</span>{' '}
        <span className="text-white">Party</span>
      </span>
    </div>
  );
}

/** Nombre accesible de cada opción: su ícono y su color, para no depender solo del color. */
export const OPTION_NAMES = ['Ondas celestes', 'Triángulos violetas', 'Diana rosa', 'Estrella turquesa'];

const OPTION_COLORS = ['var(--color-opt-0)', 'var(--color-opt-1)', 'var(--color-opt-2)', 'var(--color-opt-3)'];

export type OptionState = 'idle' | 'correct' | 'dim';

/** Clases y color de una tarjeta de opción (vidrio oscuro con borde neón). */
export function optionCard(index: number, state: OptionState = 'idle'): { className: string; style: CSSProperties } {
  const extra = state === 'correct' ? 'option-card-correct' : state === 'dim' ? 'scale-[0.97] opacity-35 saturate-50' : '';
  return { className: `option-card ${extra}`, style: { '--opt': OPTION_COLORS[index] } as CSSProperties };
}

/** Ícono de cada opción dentro de un círculo con borde del color de la opción. */
export function OptionIcon({ index, className = 'h-12 w-12' }: { index: number; className?: string }) {
  const icons = [
    // Ondas de sonido
    <g key="0" strokeWidth="2.2" strokeLinecap="round">
      <path d="M5 10v4M8.5 7v10M12 4v16M15.5 7v10M19 10v4" />
    </g>,
    // Tres triángulos
    <g key="1" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3.5 15.6 9.8H8.4z" />
      <path d="M7.5 12.2 11.1 18.5H3.9z" />
      <path d="M16.5 12.2 20.1 18.5H12.9z" />
    </g>,
    // Diana
    <g key="2" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </g>,
    // Estrella de cuatro puntas
    <path key="3" d="M12 2.5c.9 5.2 3.4 7.7 9.5 9.5-6.1 1.8-8.6 4.3-9.5 9.5-.9-5.2-3.4-7.7-9.5-9.5 6.1-1.8 8.6-4.3 9.5-9.5z" fill="currentColor" stroke="none" />,
  ];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border-2 bg-night-950/60 ${className}`}
      style={{
        borderColor: `color-mix(in srgb, ${OPTION_COLORS[index]} 70%, transparent)`,
        color: OPTION_COLORS[index],
        boxShadow: `0 0 14px color-mix(in srgb, ${OPTION_COLORS[index]} 35%, transparent)`,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none" stroke="currentColor">
        {icons[index]}
      </svg>
    </span>
  );
}

/** Subrayado de color bajo el texto de la opción; al revelar, muestra la proporción de votos. */
export function OptionAccent({ index, fill, className = 'mt-2 h-1.5 max-w-xs' }: { index: number; fill: number; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-full bg-white/10 ${className}`} aria-hidden>
      <div
        className="h-full rounded-full transition-[width] duration-1000"
        style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%`, background: OPTION_COLORS[index], boxShadow: `0 0 10px ${OPTION_COLORS[index]}` }}
      />
    </div>
  );
}

/** Onda decorativa a la derecha de la opción. */
export function OptionWave({ index, className = 'h-10' }: { index: number; className?: string }) {
  const bars = [0.35, 0.6, 0.85, 1, 0.7, 0.45];
  return (
    <span className={`flex shrink-0 items-center gap-1 ${className}`} style={{ color: OPTION_COLORS[index] }} aria-hidden>
      {bars.map((h, i) => (
        <span key={i} className="w-1 rounded-full bg-current" style={{ height: `${h * 100}%`, opacity: 0.45 + h * 0.5 }} />
      ))}
    </span>
  );
}

export function categoryLabel(id: CategoryId) {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? `${c.emoji} ${c.name}` : id;
}

export function CategoryBadge({ category, difficulty }: { category: CategoryId; difficulty?: Difficulty }) {
  const diffColor = { facil: 'bg-emerald-400/20 text-emerald-200', media: 'bg-amber-400/20 text-amber-200', dificil: 'bg-rose-400/20 text-rose-200' };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="chip">{categoryLabel(category)}</span>
      {difficulty && <span className={`chip border-transparent ${diffColor[difficulty]}`}>{DIFFICULTY_LABELS[difficulty]}</span>}
    </div>
  );
}

export function SoundToggle({ className = '' }: { className?: string }) {
  const [muted, setMuted] = useMuted();
  return (
    <button
      type="button"
      className={`btn-secondary px-3 py-2 text-base ${className}`}
      onClick={() => {
        setMuted(!muted);
        if (muted) unlockAudio();
      }}
      aria-pressed={muted}
      aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
      title={muted ? 'Activar sonido (M)' : 'Silenciar (M)'}
    >
      <span aria-hidden>{muted ? '🔇' : '🔊'}</span>
    </button>
  );
}

/** Volumen de la música (fragmentos de las pistas musicales) en la pantalla principal. */
export function MusicVolume({ className = '' }: { className?: string }) {
  const [volume, setVolume] = useMusicVolume();
  const [muted] = useMuted();
  const percent = Math.round(volume * 100);
  return (
    <label
      className={`glass flex items-center gap-2 px-3 py-1.5 ${muted ? 'opacity-50' : ''} ${className}`}
      title={muted ? 'El sonido está apagado (M)' : 'Volumen de la música (teclas − y +)'}
    >
      <span aria-hidden>{volume === 0 ? '🔈' : '🎵'}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        onChange={(e) => setVolume(Number(e.target.value) / 100)}
        className="w-24 accent-brand-cyan"
        aria-label="Volumen de la música"
        aria-valuetext={`${percent} %`}
      />
      <span className="w-10 text-right text-sm tabular-nums text-white/70">{percent} %</span>
    </label>
  );
}

export function useFullscreen() {
  const [isFull, setFull] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  return { isFull, toggle, supported: !!document.documentElement.requestFullscreen };
}

export function FullscreenToggle() {
  const { isFull, toggle, supported } = useFullscreen();
  if (!supported) return null;
  return (
    <button
      type="button"
      className="btn-secondary px-3 py-2 text-base"
      onClick={toggle}
      aria-label={isFull ? 'Salir de pantalla completa' : 'Pantalla completa'}
      title="Pantalla completa (F)"
    >
      <span aria-hidden>{isFull ? '🗗' : '⛶'}</span>
    </button>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-brand-pink" />
      {label && <p className="text-white/70">{label}</p>}
    </div>
  );
}

export function ConnectionBanner({ connected, everConnected }: { connected: boolean; everConnected: boolean }) {
  if (connected) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 flex justify-center p-2">
      <div className="flex items-center gap-2 rounded-full bg-amber-400 px-4 py-2 text-sm font-bold text-night-950 shadow-lg">
        <span className="h-2.5 w-2.5 animate-ping rounded-full bg-night-950" />
        {everConnected ? 'Conexión perdida. Reconectando…' : 'Conectando con el servidor…'}
      </div>
    </div>
  );
}

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div role="alert" className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <button
        type="button"
        onClick={onClose}
        className="animate-slide-up rounded-2xl bg-rose-500 px-5 py-3 text-left font-semibold text-white shadow-xl"
      >
        {message}
      </button>
    </div>
  );
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`app-bg relative min-h-dvh overflow-hidden ${className}`}>{children}</div>;
}

/** Manchas de color animadas de fondo (decorativas). */
export function BackgroundBlobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="absolute -left-24 top-1/4 h-72 w-72 animate-float rounded-full bg-brand-pink/20 blur-3xl" />
      <div className="absolute -right-16 top-10 h-96 w-96 animate-float rounded-full bg-brand-violet/25 blur-3xl [animation-delay:-2s]" />
      <div className="absolute bottom-0 left-1/3 h-80 w-80 animate-float rounded-full bg-brand-cyan/15 blur-3xl [animation-delay:-4s]" />
    </div>
  );
}
