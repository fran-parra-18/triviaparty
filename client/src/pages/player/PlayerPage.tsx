import { ROOM_CODE_LENGTH, type PlayerView } from '@trivia/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CountdownNumber, Podium, TimerBar, fireConfetti, useCountdownNumber } from '../../components/game';
import { Avatar, CategoryBadge, ConnectionBanner, Logo, OPTION_BG, OPTION_NAMES, OPTION_TEXT, OptionShape, Screen, SoundToggle, Spinner, Toast } from '../../components/ui';
import { usePlayerSession } from '../../hooks/usePlayerSession';
import { formatPoints, ordinal, useConnection, useCountUp, useOnChange } from '../../lib/hooks';
import { sounds, vibrate } from '../../lib/sound';
import { STORAGE_KEYS, readJson } from '../../lib/storage';

export function PlayerPage() {
  const params = useParams();
  const urlCode = params.code?.toUpperCase() ?? null;
  const session = usePlayerSession(urlCode);
  const conn = useConnection();
  const { view, status } = session;

  return (
    <Screen className="flex flex-col">
      <ConnectionBanner {...conn} />
      <Toast message={session.error} onClose={session.clearError} />
      {view ? (
        <PlayerGame view={view} onAnswer={session.answer} onLeave={session.leave} />
      ) : (
        <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-6 px-5 py-8">
          <Link to="/" aria-label="Inicio">
            <Logo size="md" />
          </Link>
          {(status === 'connecting' || status === 'rejoining' || status === 'active') && (
            <Spinner label={status === 'rejoining' ? 'Volviendo a tu partida…' : 'Conectando…'} />
          )}
          {(status === 'idle' || status === 'joining') && (
            <JoinForm initialCode={urlCode} busy={status === 'joining'} notice={session.message} onJoin={session.join} />
          )}
          {(status === 'kicked' || status === 'closed') && (
            <MessageCard text={session.message ?? 'La sala se cerró.'} action="Unirme a otra sala" onAction={session.reset} />
          )}
          {status === 'replaced' && (
            <MessageCard text={session.message ?? 'Tu sesión se abrió en otro lugar.'} action="Jugar en este dispositivo" onAction={session.reconnectHere} />
          )}
        </div>
      )}
    </Screen>
  );
}

function MessageCard({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <div className="glass w-full max-w-sm space-y-4 p-6 text-center">
      <p className="text-xl">{text}</p>
      <button type="button" className="btn-primary w-full" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

function JoinForm({
  initialCode,
  busy,
  notice,
  onJoin,
}: {
  initialCode: string | null;
  busy: boolean;
  notice: string | null;
  onJoin: (code: string, name: string) => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode ?? '');
  const [name, setName] = useState(() => readJson<string>(STORAGE_KEYS.lastName) ?? '');
  const [roomInfo, setRoomInfo] = useState<'unknown' | 'ok' | 'missing' | 'closed'>('unknown');
  const codeValid = code.length === ROOM_CODE_LENGTH;

  useEffect(() => {
    if (!codeValid) {
      setRoomInfo('unknown');
      return;
    }
    let cancelled = false;
    fetch(`/api/rooms/${code}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 404) return setRoomInfo('missing');
        const data = await r.json();
        setRoomInfo(data.acceptingPlayers ? 'ok' : 'closed');
      })
      .catch(() => !cancelled && setRoomInfo('unknown'));
    return () => {
      cancelled = true;
    };
  }, [code, codeValid]);

  return (
    <form
      className="glass flex w-full max-w-sm flex-col gap-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!codeValid || !name.trim()) return;
        const ok = await onJoin(code, name);
        if (ok && initialCode !== code) navigate(`/join/${code}`, { replace: true });
      }}
    >
      <h1 className="text-center text-3xl font-bold">Unirse a la partida</h1>
      {notice && <p className="rounded-xl bg-amber-400/20 px-3 py-2 text-center text-amber-100">{notice}</p>}
      <label className="flex flex-col gap-1">
        <span className="font-semibold text-white/80">Código de sala</span>
        <input
          className="input text-center font-display text-3xl uppercase tracking-[0.35em]"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          placeholder="ABC123"
          value={code}
          autoFocus={!initialCode}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH))}
          aria-invalid={roomInfo === 'missing'}
        />
        {roomInfo === 'missing' && <span className="text-sm text-rose-300">No existe ninguna sala con ese código.</span>}
        {roomInfo === 'closed' && <span className="text-sm text-amber-300">La partida ya empezó y no admite nuevos jugadores.</span>}
        {roomInfo === 'ok' && <span className="text-sm text-emerald-300">✓ Sala encontrada</span>}
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-semibold text-white/80">Tu nombre o apodo</span>
        <input
          className="input"
          maxLength={20}
          placeholder="Ej.: Lucía"
          value={name}
          autoFocus={!!initialCode}
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" className="btn-primary py-4 text-2xl" disabled={busy || !codeValid || !name.trim() || roomInfo === 'missing'}>
        {busy ? 'Entrando…' : '¡Entrar!'}
      </button>
    </form>
  );
}

function PlayerGame({
  view,
  onAnswer,
  onLeave,
}: {
  view: PlayerView;
  onAnswer: (index: number, choice: number) => Promise<boolean>;
  onLeave: () => Promise<void>;
}) {
  return (
    <div className="relative z-10 flex h-dvh flex-col">
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Avatar name={view.me.name} index={view.me.avatar} size={38} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold leading-tight">{view.me.name}</p>
          <p className="text-xs text-white/60">
            Sala {view.code}
            {!view.hostConnected && <span className="text-amber-300"> · anfitrión desconectado</span>}
          </p>
        </div>
        <div className="text-right">
          <ScoreBadge score={view.me.score} />
          {view.me.rank !== null && <p className="text-xs text-white/60">{ordinal(view.me.rank)} puesto</p>}
        </div>
        <SoundToggle className="px-2 py-1" />
      </header>

      <main className="flex min-h-0 flex-1 flex-col px-4 pb-4">
        {view.paused && view.phase !== 'lobby' && view.phase !== 'finished' ? (
          <Centered>
            <div className="text-6xl">⏸</div>
            <p className="font-display text-3xl font-bold">Partida en pausa</p>
            <p className="text-white/60">{view.hostConnected ? 'El anfitrión la reanudará enseguida.' : 'Esperando a que el anfitrión se reconecte…'}</p>
          </Centered>
        ) : (
          <PhaseView view={view} onAnswer={onAnswer} onLeave={onLeave} />
        )}
      </main>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const shown = useCountUp(score);
  return <p className="font-display text-xl font-bold tabular-nums">{formatPoints(shown)} pts</p>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 animate-fade-in flex-col items-center justify-center gap-4 text-center">{children}</div>;
}

function PhaseView({
  view,
  onAnswer,
  onLeave,
}: {
  view: PlayerView;
  onAnswer: (index: number, choice: number) => Promise<boolean>;
  onLeave: () => Promise<void>;
}) {
  switch (view.phase) {
    case 'lobby':
      return <LobbyWait view={view} onLeave={onLeave} />;
    case 'countdown':
      return <CountdownWait view={view} />;
    case 'question':
    case 'locked':
      return <AnswerPad view={view} onAnswer={onAnswer} />;
    case 'reveal':
    case 'leaderboard':
      return <ResultView view={view} />;
    case 'finished':
      return <FinalView view={view} />;
  }
}

function LobbyWait({ view, onLeave }: { view: PlayerView; onLeave: () => Promise<void> }) {
  return (
    <Centered>
      <div className="animate-pop-in">
        <Avatar name={view.me.name} index={view.me.avatar} size={96} />
      </div>
      <h1 className="text-4xl font-bold">¡Ya estás dentro!</h1>
      <p className="flex items-center gap-2 text-lg text-white/80">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Conectado como <strong>{view.me.name}</strong>
      </p>
      <p className="text-white/60">
        {view.gameNumber > 0 ? 'Esperando la siguiente partida…' : 'Mira la pantalla principal: el anfitrión iniciará la partida enseguida.'}
      </p>
      <p className="chip text-base">
        👥 {view.playerCount} {view.playerCount === 1 ? 'jugador' : 'jugadores'} en la sala
      </p>
      <div className="flex max-h-32 flex-wrap justify-center gap-2 overflow-hidden">
        {view.players.slice(0, 24).map((p) => (
          <span key={p.id} className={`chip ${p.connected ? '' : 'opacity-40'}`}>
            {p.name}
          </span>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 text-sm text-white/40 underline"
        onClick={() => {
          if (confirm('¿Salir de la sala?')) void onLeave();
        }}
      >
        Salir de la sala
      </button>
    </Centered>
  );
}

function CountdownWait({ view }: { view: PlayerView }) {
  const n = useCountdownNumber(view.countdownEndsAt);
  useOnChange(n === null ? null : String(n), () => vibrate(30));
  return (
    <Centered>
      <p className="font-display text-2xl text-white/70">
        Pregunta {(view.progress?.index ?? 0) + 1} de {view.progress?.total}
      </p>
      <p className="text-3xl font-bold">¡Prepárate!</p>
      <div className="flex h-40 items-center">
        <CountdownNumber endsAt={view.countdownEndsAt} size="text-[8rem]" />
      </div>
    </Centered>
  );
}

function AnswerPad({ view, onAnswer }: { view: PlayerView; onAnswer: (index: number, choice: number) => Promise<boolean> }) {
  const q = view.question!;
  const [pending, setPending] = useState<{ index: number; choice: number } | null>(null);
  const chosen = view.myAnswer?.choice ?? (pending?.index === q.index ? pending.choice : null);
  const confirmed = !!view.myAnswer;
  const locked = view.phase === 'locked';

  useEffect(() => setPending(null), [q.index]);

  if (chosen !== null || locked) {
    return (
      <Centered>
        {chosen !== null ? (
          <>
            <div className={`flex h-32 w-32 animate-pop-in items-center justify-center rounded-3xl ${OPTION_BG[chosen]} ${OPTION_TEXT[chosen]} shadow-2xl`}>
              <OptionShape index={chosen} className="h-16 w-16" />
            </div>
            <p className="font-display text-3xl font-bold" aria-live="polite">
              {confirmed ? '¡Respuesta registrada!' : 'Enviando…'}
            </p>
            <p className="max-w-xs text-lg text-white/80">«{q.options[chosen]}»</p>
            <p className="text-white/60">{locked ? 'Esperando a que se revele la respuesta…' : 'Espera a que respondan los demás.'}</p>
          </>
        ) : (
          <>
            <div className="text-6xl">⌛</div>
            <p className="font-display text-3xl font-bold">¡Se acabó el tiempo!</p>
            <p className="text-white/60">No llegaste a responder esta pregunta.</p>
          </>
        )}
      </Centered>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-lg font-bold text-brand-cyan">
          {q.index + 1}/{q.total}
        </span>
        <CategoryBadge category={q.category} />
      </div>
      <TimerBar timer={view.timer} />
      <p className={`font-display font-bold leading-snug ${q.text.length > 110 ? 'text-lg' : 'text-xl'}`}>{q.text}</p>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 min-[380px]:grid-cols-2">
        {q.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-3xl p-3 text-center shadow-lg transition active:scale-95 ${OPTION_BG[i]} ${OPTION_TEXT[i]}`}
            aria-label={`${OPTION_NAMES[i]}: ${opt}`}
            onClick={async () => {
              setPending({ index: q.index, choice: i });
              sounds.answer();
              vibrate(40);
              const ok = await onAnswer(q.index, i);
              if (!ok) setPending(null);
            }}
          >
            <OptionShape index={i} className="h-8 w-8 shrink-0" />
            <span className={`font-bold leading-tight ${opt.length > 30 ? 'text-base' : 'text-lg'}`}>{opt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultView({ view }: { view: PlayerView }) {
  const r = view.result;
  const q = view.question;
  useEffect(() => {
    if (!r || view.phase !== 'reveal') return;
    if (r.correct) {
      sounds.correct();
      vibrate([60, 40, 60]);
      fireConfetti(0.4);
    } else {
      sounds.wrong();
      vibrate(250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.progress?.index, view.phase === 'reveal']);

  if (!r || !q) {
    return (
      <Centered>
        <p className="font-display text-2xl">Mira la pantalla principal 👀</p>
      </Centered>
    );
  }

  return (
    <Centered>
      {r.correct ? (
        <div className="animate-pop-in space-y-2">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500 text-6xl shadow-2xl shadow-emerald-500/40">✓</div>
          <p className="font-display text-4xl font-bold text-emerald-300">¡Correcto!</p>
          <p className="font-display text-3xl font-bold">+{formatPoints(r.pointsEarned)}</p>
        </div>
      ) : (
        <div className="animate-shake space-y-2">
          <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-rose-500 text-6xl shadow-2xl shadow-rose-500/40">{r.answered ? '✗' : '⌛'}</div>
          <p className="font-display text-4xl font-bold text-rose-300">{r.answered ? 'Incorrecto' : 'Sin respuesta'}</p>
          <p className="text-lg text-white/70">0 puntos</p>
        </div>
      )}
      <div className={`flex w-full max-w-sm items-center gap-3 rounded-2xl px-4 py-3 ${OPTION_BG[r.correctIndex]} ${OPTION_TEXT[r.correctIndex]}`}>
        <OptionShape index={r.correctIndex} className="h-7 w-7 shrink-0" />
        <span className="text-left font-bold">{q.options[r.correctIndex]}</span>
      </div>
      <p className="max-w-sm text-white/75">{r.explanation}</p>
      {view.me.rank !== null && (
        <p className="chip text-lg">
          Vas {ordinal(view.me.rank)} de {view.playerCount}
          {view.me.streak > 1 && <span> · 🔥 racha de {view.me.streak}</span>}
        </p>
      )}
    </Centered>
  );
}

function FinalView({ view }: { view: PlayerView }) {
  const f = view.final;
  useEffect(() => {
    if (f && f.rank <= 3) fireConfetti(1);
  }, [f?.rank]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f) return null;
  const messages = ['¡Eres el campeón! 🏆', '¡Segundo puesto! 🥈', '¡Tercer puesto! 🥉'];
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
     <div className="m-auto flex w-full flex-col items-center gap-3 py-2 text-center">
      <p className="font-display text-xl text-white/70">Resultado final</p>
      <p className="font-display text-5xl font-bold">{ordinal(f.rank)}</p>
      <p className="text-2xl font-bold">{messages[f.rank - 1] ?? `de ${f.totalPlayers} jugadores`}</p>
      <p className="font-display text-3xl font-bold text-brand-cyan">{formatPoints(f.score)} puntos</p>
      {f.stats && (
        <div className="grid w-full max-w-sm grid-cols-3 gap-2">
          <Stat label="Aciertos" value={`${f.stats.correct}`} />
          <Stat label="Precisión" value={`${Math.round(f.stats.accuracy * 100)} %`} />
          <Stat label="Racha" value={`${f.stats.bestStreak}`} />
        </div>
      )}
      <Podium entries={f.podium} compact />
      <p className="text-sm text-white/50">Si el anfitrión inicia otra partida, entrarás automáticamente.</p>
     </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
    </div>
  );
}
