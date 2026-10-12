import type { HostView } from '@trivia/shared';
import { useState } from 'react';
import { QrCode } from '../../components/game';
import { SettingsPanel, settingsSummary } from '../../components/SettingsPanel';
import { Avatar } from '../../components/ui';
import { useJoinBase } from '../../lib/joinUrl';
import type { HostActions } from './HostPage';

export function HostLobby({ view, actions }: { view: HostView; actions: HostActions }) {
  const join = useJoinBase();
  const [showSettings, setShowSettings] = useState(false);
  const [starting, setStarting] = useState(false);
  const joinUrl = `${join.base}/join/${view.code}`;
  const displayHost = join.base.replace(/^https?:\/\//, '');
  const connected = view.players.filter((p) => p.connected).length;
  const s = view.settings;

  return (
    <main className="flex flex-1 flex-col gap-5 px-4 pb-5 md:px-8">
      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className="glass flex flex-col items-center justify-center gap-3 p-5 text-center animate-pop-in" aria-label="Cómo unirse">
          <h1 className="text-3xl font-bold xl:text-4xl">¡Únete desde tu celular!</h1>
          <QrCode value={joinUrl} size={260} />
          <div className="space-y-1">
            <p className="text-lg text-white/70">o abre en el navegador</p>
            <p className="break-all font-display text-2xl font-bold text-brand-cyan md:text-3xl">{displayHost}/join</p>
            <p className="text-lg text-white/70">e introduce el código</p>
            <p className="font-display text-5xl font-bold tracking-[0.25em] xl:text-7xl" aria-label={`Código ${view.code.split('').join(' ')}`}>
              {view.code}
            </p>
          </div>
          {join.onlyLocalhost && !join.loading && (
            <p className="rounded-xl bg-amber-400/20 px-4 py-2 text-sm text-amber-100">
              ⚠ No se detectó la IP de la red local: los celulares no podrán abrir «localhost». Abre esta pantalla con la IP
              de la PC o configura PUBLIC_URL.
            </p>
          )}
          {join.candidates.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-white/60">
              ¿El QR no funciona? Dirección:
              <select
                className="rounded-lg border border-white/20 bg-night-800 px-2 py-1 text-white"
                value={join.base}
                onChange={(e) => join.select(e.target.value)}
              >
                {join.candidates.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="glass flex min-h-0 flex-col p-6" aria-label="Jugadores en la sala">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-3xl font-bold">Jugadores</h2>
              <p className="text-sm text-white/50">Toca 👑 para elegir un líder que maneje la partida desde su celular.</p>
            </div>
            <span className="font-display text-2xl text-white/70" aria-live="polite">
              {connected} {connected === 1 ? 'conectado' : 'conectados'}
              <span className="text-base"> · máx. {s.maxPlayers}</span>
            </span>
          </div>
          {view.players.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-white/60">
              <div className="text-6xl animate-float">📱</div>
              <p className="text-2xl">Esperando jugadores…</p>
            </div>
          ) : (
            <ul className="flex flex-wrap content-start gap-3 overflow-y-auto">
              {view.players.map((p) => (
                <li
                  key={p.id}
                  className={`group flex animate-pop-in items-center gap-2 rounded-full py-1.5 pl-1.5 pr-2 ${p.connected ? 'bg-white/15' : 'bg-white/5 opacity-50'}`}
                >
                  <Avatar name={p.name} index={p.avatar} size={48} />
                  <span className="max-w-[14rem] truncate text-2xl font-bold">
                    {p.isLeader && <span title="Líder: controla la partida desde su celular">👑 </span>}
                    {p.name}
                  </span>
                  <span
                    className={`h-3 w-3 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-white/30'}`}
                    title={p.connected ? 'Conectado' : 'Desconectado'}
                    aria-label={p.connected ? 'conectado' : 'desconectado'}
                  />
                  <button
                    type="button"
                    className={`rounded-full px-1.5 text-lg transition hover:bg-amber-400/30 ${p.isLeader ? 'opacity-100' : 'opacity-40 hover:opacity-100 focus:opacity-100'}`}
                    aria-pressed={p.isLeader}
                    aria-label={p.isLeader ? `Quitar a ${p.name} como líder` : `Hacer líder a ${p.name}`}
                    title={p.isLeader ? 'Quitar líder' : 'Hacer líder: podrá avanzar la partida desde su celular'}
                    onClick={() => void actions.setLeader(p.isLeader ? null : p.id)}
                  >
                    👑
                  </button>
                  <button
                    type="button"
                    className="ml-1 rounded-full px-2 text-white/40 opacity-0 transition hover:bg-rose-500/30 hover:text-white focus:opacity-100 group-hover:opacity-100"
                    aria-label={`Expulsar a ${p.name}`}
                    title="Expulsar"
                    onClick={() => {
                      if (confirm(`¿Expulsar a ${p.name} de la sala?`)) void actions.kick(p.id);
                    }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="glass flex flex-col items-stretch gap-4 p-4 md:flex-row md:items-center md:p-5">
        <button type="button" className="btn-secondary" onClick={() => setShowSettings(true)}>
          ⚙️ Configurar partida
        </button>
        <p className="flex-1 text-center text-lg text-white/75 md:text-left">
          {settingsSummary(s)}
          {view.history.length > 0 && <span className="text-white/50"> · Partida n.º {view.history.length + 1}</span>}
        </p>
        {!view.minPlayersMet && (
          <span className="text-center text-amber-200">Mínimo {s.minPlayers} jugadores para empezar</span>
        )}
        <button
          type="button"
          className="btn-primary px-10 py-4 text-2xl"
          disabled={!view.minPlayersMet || starting}
          onClick={async () => {
            setStarting(true);
            await actions.start();
            setStarting(false);
          }}
        >
          {starting ? 'Preparando…' : '▶ Comenzar'}
        </button>
      </footer>

      {showSettings && (
        <SettingsPanel
          settings={view.settings}
          playedGames={view.history.length}
          onSave={actions.updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </main>
  );
}
