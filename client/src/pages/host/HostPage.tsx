import { DEFAULT_SETTINGS, type GameSettings, type HostView } from '@trivia/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackgroundBlobs, ConnectionBanner, FullscreenToggle, Logo, Screen, SoundToggle, Spinner, Toast, useFullscreen } from '../../components/ui';
import { useHostSession } from '../../hooks/useHostSession';
import { useConnection, useOnChange } from '../../lib/hooks';
import { setMuted, sounds, useMuted } from '../../lib/sound';
import { STORAGE_KEYS, readJson, writeJson } from '../../lib/storage';
import { HostFinal } from './HostFinal';
import { HostLobby } from './HostLobby';
import { HostPlay } from './HostPlay';

export type HostActions = ReturnType<typeof useHostSession>['actions'];

export function HostPage() {
  const session = useHostSession();
  const conn = useConnection();
  const { view, status } = session;

  return (
    <Screen>
      <BackgroundBlobs />
      <ConnectionBanner {...conn} />
      <Toast message={session.error} onClose={session.clearError} />
      {view ? (
        <HostGame view={view} actions={session.actions} />
      ) : (
        <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-8 px-6 text-center">
          <Logo size="xl" />
          {(status === 'connecting' || status === 'reclaiming' || status === 'creating' || status === 'active') && (
            <Spinner label={status === 'reclaiming' ? 'Recuperando tu sala…' : status === 'creating' ? 'Creando sala…' : 'Conectando…'} />
          )}
          {status === 'idle' && <CreateRoom onCreate={session.create} />}
          {status === 'closed' && (
            <div className="glass max-w-lg space-y-4 p-8">
              <p className="text-xl">{session.closedReason ?? 'La sala se cerró.'}</p>
              <button type="button" className="btn-primary" onClick={session.actions.forget}>
                Crear una sala nueva
              </button>
            </div>
          )}
          {status === 'replaced' && (
            <div className="glass max-w-lg space-y-4 p-8">
              <p className="text-xl">Esta sala se abrió como anfitrión en otra pestaña o dispositivo.</p>
              <button type="button" className="btn-primary" onClick={session.actions.reconnectHere}>
                Tomar el control aquí
              </button>
            </div>
          )}
          <Link to="/" className="text-white/50 hover:text-white">
            ← Volver al inicio
          </Link>
        </main>
      )}
    </Screen>
  );
}

function CreateRoom({ onCreate }: { onCreate: (s?: Partial<GameSettings>) => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="glass flex max-w-xl flex-col items-center gap-5 p-8 md:p-10">
      <p className="text-xl text-white/80">
        Esta pantalla será la principal: muéstrala en el televisor o proyector. Los jugadores se unirán con su celular.
      </p>
      <button
        type="button"
        className="btn-primary px-10 py-5 text-2xl"
        disabled={busy}
        autoFocus
        onClick={async () => {
          setBusy(true);
          const saved = readJson<Partial<GameSettings>>(STORAGE_KEYS.hostSettings);
          await onCreate({ ...DEFAULT_SETTINGS, ...saved });
          setBusy(false);
        }}
      >
        🎉 Crear sala
      </button>
    </div>
  );
}

function HostGame({ view, actions }: { view: HostView; actions: HostActions }) {
  const [muted] = useMuted();
  const { toggle: toggleFullscreen } = useFullscreen();

  // Recuerda la configuración para la próxima sala, la cambie el anfitrión o el líder desde su celular.
  const settingsJson = JSON.stringify(view.settings);
  useEffect(() => writeJson(STORAGE_KEYS.hostSettings, JSON.parse(settingsJson)), [settingsJson]);

  // Sonidos al cambiar de fase.
  useOnChange(`${view.gameNumber}:${view.phase}:${view.progress?.index ?? -1}`, () => {
    if (view.phase === 'question') sounds.go();
    else if (view.phase === 'locked') sounds.timeUp();
    else if (view.phase === 'reveal') sounds.reveal();
    // En 'finished' la fanfarria la toca el podio al revelar al campeón.
  });
  useOnChange(view.phase === 'lobby' ? String(view.players.length) : null, () => sounds.join());

  // Atajos de teclado del anfitrión.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea, [role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'f') toggleFullscreen();
      else if (key === 'm') setMuted(!muted);
      else if (key === 'p' && view.phase !== 'lobby' && view.phase !== 'finished') {
        void (view.paused ? actions.resume() : actions.pause());
      } else if ((key === ' ' || key === 'enter') && !['lobby', 'finished'].includes(view.phase)) {
        if (target.tagName === 'BUTTON') return; // el botón enfocado ya recibe el Enter/Espacio
        e.preventDefault();
        void actions.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.phase, view.paused, muted, actions, toggleFullscreen]);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Logo size="sm" />
        <div className="flex items-center gap-2 md:gap-3">
          <span className="chip text-base" title="Código de la sala">
            Código <strong className="font-display text-lg tracking-widest">{view.code}</strong>
          </span>
          <span className="chip text-base" title="Jugadores conectados">
            👥 {view.players.filter((p) => p.connected).length}
            {view.players.some((p) => !p.connected) && <span className="text-white/50">/{view.players.length}</span>}
          </span>
          {view.players.length > 0 && (
            <label className="chip hidden gap-1 text-base md:inline-flex" title="El líder controla la partida desde su celular">
              <span aria-hidden>👑</span>
              <span className="sr-only">Líder de la partida</span>
              <select
                className="max-w-[9rem] bg-transparent font-semibold text-white outline-none [&>option]:bg-night-800"
                value={view.leaderId ?? ''}
                onChange={(e) => void actions.setLeader(e.target.value || null)}
              >
                <option value="">Sin líder</option>
                {view.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <SoundToggle />
          <FullscreenToggle />
        </div>
      </header>
      {view.notice && (
        <div role="status" className="mx-4 mb-2 rounded-2xl bg-amber-400/90 px-4 py-2 text-center font-bold text-night-950 md:mx-8">
          {view.notice}
        </div>
      )}
      {view.phase === 'lobby' && <HostLobby view={view} actions={actions} />}
      {view.phase === 'finished' && <HostFinal view={view} actions={actions} />}
      {view.phase !== 'lobby' && view.phase !== 'finished' && <HostPlay view={view} actions={actions} />}
    </div>
  );
}
