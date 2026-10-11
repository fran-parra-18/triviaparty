import type { HostView } from '@trivia/shared';
import { useEffect, useRef, useState } from 'react';
import { useMuted } from '../lib/sound';

const VOLUME = 0.8;

/**
 * Reproduce en la pantalla principal el fragmento de las preguntas de pistas musicales.
 * Se precarga durante la cuenta regresiva, suena mientras la pregunta está abierta y sigue
 * de fondo al revelar la respuesta; se detiene en la clasificación.
 */
export function useMusicClip(view: HostView) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted] = useMuted();

  const url = view.question?.audioUrl ?? null;
  const playingPhase = view.phase === 'question' || view.phase === 'locked' || view.phase === 'reveal';
  const shouldPlay = !!url && playingPhase && !view.paused && !muted;
  const clipKey = url ? `${view.gameNumber}-${view.question?.index}` : null;

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
    audioRef.current.volume = VOLUME;
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => setEnded(true);
    const onPlay = () => setEnded(false);
    a.addEventListener('ended', onEnded);
    a.addEventListener('play', onPlay);
    return () => {
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('play', onPlay);
    };
  }, []);

  // Precarga el fragmento de la próxima pregunta durante la cuenta regresiva.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !view.nextAudioUrl || a.src === view.nextAudioUrl) return;
    a.src = view.nextAudioUrl;
    a.load();
  }, [view.nextAudioUrl]);

  // Cada pregunta nueva empieza el fragmento desde el principio.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !url) return;
    if (a.src !== url) a.src = url;
    a.currentTime = 0;
    setEnded(false);
  }, [clipKey, url]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!shouldPlay) {
      a.pause();
      return;
    }
    a.play().then(
      () => setBlocked(false),
      () => setBlocked(true), // el navegador exige un clic antes de reproducir
    );
  }, [shouldPlay, clipKey]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const retry = () => {
    void audioRef.current?.play().then(() => setBlocked(false), () => setBlocked(true));
  };

  /** Vuelve a reproducir el fragmento desde el principio. */
  const replay = () => {
    const a = audioRef.current;
    if (!a || !shouldPlay) return;
    a.currentTime = 0;
    retry();
  };

  return {
    active: !!url,
    playing: shouldPlay && !blocked && !ended,
    blocked: shouldPlay && blocked,
    ended: shouldPlay && ended,
    canReplay: shouldPlay && !blocked,
    muted,
    retry,
    replay,
  };
}

/** Indicador visual del fragmento: ecualizador animado o botón si el navegador bloqueó el audio. */
export function MusicIndicator({ clip }: { clip: ReturnType<typeof useMusicClip> }) {
  if (!clip.active) return null;
  if (clip.blocked) {
    return (
      <button type="button" className="btn-primary animate-pop-in px-6 py-3 text-xl" onClick={clip.retry}>
        🔊 Tocar para escuchar
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="glass flex items-center gap-3 px-5 py-2" aria-label={clip.muted ? 'Sonido desactivado' : 'Reproduciendo fragmento'}>
        <span className="flex h-8 items-end gap-1" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`w-1.5 rounded-full bg-brand-cyan ${clip.playing ? 'animate-equalizer' : 'h-2'}`}
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </span>
        <span className="font-display text-xl font-semibold">
          {clip.muted ? '🔇 Sonido apagado (pulsa M)' : clip.playing ? '🎧 ¡Escuchen!' : clip.ended ? '🎧 Fragmento terminado' : '🎧 Fragmento en pausa'}
        </span>
      </div>
      {clip.canReplay && (
        <button type="button" className="btn-secondary px-5 py-2 text-lg" onClick={clip.replay} title="Repetir el fragmento (R)">
          🔁 Repetir
        </button>
      )}
    </div>
  );
}
