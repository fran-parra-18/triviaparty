import { CATEGORIES, DIFFICULTY_LABELS, type CategoryId, type Difficulty } from '@trivia/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useMuted, unlockAudio } from '../lib/sound';

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
  const text = { sm: 'text-2xl', md: 'text-4xl', lg: 'text-6xl', xl: 'text-7xl md:text-8xl' }[size];
  const icon = { sm: 32, md: 48, lg: 72, xl: 96 }[size];
  return (
    <div className="flex items-center justify-center gap-3 select-none">
      <img src="/favicon.svg" width={icon} height={icon} alt="" className="drop-shadow-lg" />
      <span className={`font-display font-bold leading-none tracking-tight ${text}`}>
        <span className="bg-gradient-to-r from-brand-pink via-fuchsia-400 to-brand-violet bg-clip-text text-transparent">Trivia</span>{' '}
        <span className="text-white">Party</span>
      </span>
    </div>
  );
}

/** Forma asociada a cada opción, para no depender solo del color (accesibilidad). */
export function OptionShape({ index, className = 'h-8 w-8' }: { index: number; className?: string }) {
  const shapes = [
    <path key="0" d="M12 3 22 20H2z" />,
    <path key="1" d="M12 2 22 12 12 22 2 12z" />,
    <circle key="2" cx="12" cy="12" r="10" />,
    <rect key="3" x="3" y="3" width="18" height="18" rx="2" />,
  ];
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      {shapes[index]}
    </svg>
  );
}

export const OPTION_BG = ['bg-opt-0', 'bg-opt-1', 'bg-opt-2', 'bg-opt-3'];
export const OPTION_TEXT = ['text-white', 'text-white', 'text-night-950', 'text-white'];
export const OPTION_NAMES = ['Triángulo rojo', 'Rombo azul', 'Círculo amarillo', 'Cuadrado verde'];

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
