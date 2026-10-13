import { musicStageAt, type HostView } from '@trivia/shared';
import { useEffect, useRef, useState } from 'react';
import { msUntil } from '../lib/clock';
import { getMusicVolume, musicGain, useMusicVolume, useMuted } from '../lib/sound';

/**
 * Reproduce en la pantalla principal el fragmento de las preguntas de pistas musicales.
 * Se precarga durante la cuenta regresiva, suena mientras la pregunta está abierta y sigue
 * de fondo al revelar la respuesta; se detiene en la clasificación.
 *
 * En el Modo Musical, mientras la pregunta está abierta, suena por tramos (1 s, 3 s, completo),
 * siempre desde el principio y sincronizado con el reloj del servidor, que es el que puntúa.
 */
export function useMusicClip(view: HostView) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [muted] = useMuted();
  const [volume] = useMusicVolume();
  /** Repetición manual del tramo actual: hasta qué segundo del fragmento suena y de qué tramo es. */
  const replayRef = useRef<{ stage: number; untilSec: number } | null>(null);
  /** Tramo que estaba sonando, para reiniciar el fragmento cuando cambia. */
  const stageRef = useRef<number | null>(null);

  const url = view.question?.audioUrl ?? null;
  const playingPhase = view.phase === 'question' || view.phase === 'locked' || view.phase === 'reveal';
  const shouldPlay = !!url && playingPhase && !view.paused && !muted;
  const clipKey = url ? `${view.gameNumber}-${view.question?.index}` : null;
  const stages = view.question?.musicStages ?? null;
  // Con la pregunta abierta, el Modo Musical controla el audio por tramos; después suena libre.
  const staged = !!stages && view.phase === 'question';
  const timer = view.timer;

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
    audioRef.current.volume = musicGain(getMusicVolume());
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => {
      setEnded(true);
      setAudioPlaying(false);
    };
    const onPlay = () => {
      setEnded(false);
      setAudioPlaying(true);
    };
    const onPause = () => setAudioPlaying(false);
    a.addEventListener('ended', onEnded);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('ended', onEnded);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicGain(volume);
  }, [volume]);

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
    replayRef.current = null;
    stageRef.current = null;
    setEnded(false);
  }, [clipKey, url]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!shouldPlay) {
      a.pause();
      return;
    }
    if (staged) return; // lo maneja el bucle de tramos
    a.play().then(
      () => setBlocked(false),
      () => setBlocked(true), // el navegador exige un clic antes de reproducir
    );
  }, [shouldPlay, clipKey, staged]);

  // Modo Musical: cada 100 ms decide si el fragmento debe sonar (y desde dónde) o callarse.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !staged || !shouldPlay || !stages || !timer?.endsAt) return;
    const endsAt = timer.endsAt;
    const durationMs = timer.durationMs;
    const tick = () => {
      const elapsed = durationMs - msUntil(endsAt);
      const current = musicStageAt(stages, elapsed);
      const stage = stages[current]!;
      const replaying = replayRef.current;
      if (replaying) {
        if (replaying.stage === current && a.currentTime < replaying.untilSec && !a.ended) return;
        replayRef.current = null;
      }
      const offsetSec = (elapsed - stage.startMs) / 1000;
      const limitSec = stage.playMs / 1000;
      // Al cambiar de tramo (solo o con «Siguiente tramo»), el fragmento vuelve a empezar desde el principio.
      if (stageRef.current !== current) {
        stageRef.current = current;
        if (!a.paused) a.pause();
        a.currentTime = 0;
      }
      const inPlay = offsetSec >= 0 && offsetSec < limitSec;
      // Se corta por la posición del propio fragmento, no por el reloj: así el tramo suena entero
      // (1 s es 1 s) aunque el audio haya tardado un poco en arrancar.
      if (!a.paused) {
        if (a.currentTime >= limitSec || offsetSec >= limitSec + 1.5) a.pause();
        else if (current === stages.length - 1 && Math.abs(a.currentTime - offsetSec) > 0.6) {
          a.currentTime = offsetSec; // en el fragmento largo, corrige si se desfasó (por ejemplo, tras cargar lento)
        }
        return;
      }
      // En pausa: arranca el tramo (o lo retoma tras una pausa) si todavía no sonó entero.
      if (!inPlay || a.ended || a.currentTime >= limitSec - 0.1) return;
      if (Number.isFinite(a.duration) && offsetSec >= a.duration - 0.25) return;
      a.currentTime = offsetSec < 0.4 ? 0 : offsetSec;
      a.play().then(
        () => setBlocked(false),
        () => setBlocked(true),
      );
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [staged, shouldPlay, stages, timer?.endsAt, timer?.durationMs]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const retry = () => {
    void audioRef.current?.play().then(() => setBlocked(false), () => setBlocked(true));
  };

  /** Vuelve a reproducir el fragmento desde el principio (en el Modo Musical, solo lo del tramo actual). */
  const replay = () => {
    const a = audioRef.current;
    if (!a || !shouldPlay) return;
    if (staged && stages && timer?.endsAt) {
      const current = musicStageAt(stages, timer.durationMs - msUntil(timer.endsAt));
      replayRef.current = { stage: current, untilSec: stages[current]!.playMs / 1000 };
    }
    a.currentTime = 0;
    retry();
  };

  return {
    active: !!url,
    staged,
    playing: staged ? shouldPlay && audioPlaying : shouldPlay && !blocked && !ended,
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
          {clip.muted
            ? '🔇 Sonido apagado (pulsa M)'
            : clip.playing
              ? '🎧 ¡Escuchen!'
              : clip.staged
                ? '🤔 ¿La reconocen?'
                : clip.ended
                  ? '🎧 Fragmento terminado'
                  : '🎧 Fragmento en pausa'}
        </span>
      </div>
      {clip.canReplay && (
        <button
          type="button"
          className="btn-secondary px-5 py-2 text-lg"
          onClick={clip.replay}
          title={clip.staged ? 'Repetir lo que va del tramo (R)' : 'Repetir el fragmento (R)'}
        >
          🔁 {clip.staged ? 'Repetir tramo' : 'Repetir'}
        </button>
      )}
    </div>
  );
}
