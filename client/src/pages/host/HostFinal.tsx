import { PODIUM_REVEAL_MS, type HostView } from '@trivia/shared';
import { useEffect, useState } from 'react';
import { Leaderboard, Podium } from '../../components/game';
import { AwardCard } from '../../components/party';
import { categoryLabel } from '../../components/ui';
import { formatPoints } from '../../lib/hooks';
import type { HostActions } from './HostPage';

export function HostFinal({ view, actions }: { view: HostView; actions: HostActions }) {
  const final = view.final;
  const [tab, setTab] = useState<'podium' | 'stats' | 'questions'>('podium');
  // Los premios y destacados esperan a que el podio termine de revelarse, para no adelantar nada.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), PODIUM_REVEAL_MS);
    return () => clearTimeout(t);
  }, [view.gameNumber]);
  if (!final) return null;
  const { highlights } = final;
  const statsById = new Map(final.stats.map((s) => [s.playerId, s]));

  return (
    <main className="flex flex-1 flex-col gap-5 px-4 pb-5 md:px-8">
      <div className="text-center">
        <h1 className="animate-pop-in text-5xl font-bold md:text-6xl">🏆 ¡Fin de la partida!</h1>
        {final.endedEarly && <p className="mt-1 text-white/60">La partida terminó antes de tiempo.</p>}
      </div>

      <div className="flex justify-center gap-2" role="tablist">
        {(
          [
            ['podium', 'Podio'],
            ['stats', 'Estadísticas'],
            ['questions', 'Preguntas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`rounded-xl px-5 py-2 font-display text-lg font-semibold ${tab === key ? 'bg-white text-night-950' : 'bg-white/10 hover:bg-white/20'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1">
        {tab === 'podium' && (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col justify-end">
              {final.ranking.length > 0 ? <Podium entries={final.ranking.slice(0, 3)} suspense /> : <p className="text-center text-2xl">No hubo jugadores.</p>}
            </div>
            <div className={`glass space-y-3 p-5 text-lg transition-opacity duration-700 ${revealed ? 'opacity-100' : 'opacity-0'}`}>
              {revealed && final.awards.length > 0 && (
                <div className="space-y-2 pb-2">
                  <h2 className="text-2xl font-bold">🎖️ Premios de la noche</h2>
                  {final.awards.map((a, i) => (
                    <AwardCard key={a.kind} award={a} delayMs={i * 400} />
                  ))}
                </div>
              )}
              <h2 className="text-2xl font-bold">Destacados</h2>
              {highlights.fastestAnswer && (
                <p>
                  ⚡ Respuesta más rápida: <strong>{highlights.fastestAnswer.name}</strong> en {(highlights.fastestAnswer.ms / 1000).toFixed(2)} s
                </p>
              )}
              {highlights.bestStreak && (
                <p>
                  🔥 Mejor racha: <strong>{highlights.bestStreak.name}</strong>, {highlights.bestStreak.streak} aciertos seguidos
                </p>
              )}
              {highlights.hardestQuestion && (
                <p>
                  🧩 La más difícil: «{highlights.hardestQuestion.text}» ({Math.round(highlights.hardestQuestion.correctRate * 100)} % de aciertos)
                </p>
              )}
              {highlights.easiestQuestion && (
                <p>
                  ✅ La más fácil: «{highlights.easiestQuestion.text}» ({Math.round(highlights.easiestQuestion.correctRate * 100)} %)
                </p>
              )}
              {final.ranking.length > 3 && (
                <div className="pt-2">
                  <Leaderboard entries={final.ranking.slice(3)} max={7} compact />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'stats' && (
          <div className="glass overflow-x-auto p-4">
            <table className="w-full text-left text-lg">
              <thead className="text-white/60">
                <tr>
                  <th className="p-2">#</th>
                  <th className="p-2">Jugador</th>
                  <th className="p-2 text-right">Puntos</th>
                  <th className="p-2 text-right">Aciertos</th>
                  <th className="p-2 text-right">Precisión</th>
                  <th className="p-2 text-right">Tiempo medio</th>
                  <th className="p-2 text-right">Mejor racha</th>
                </tr>
              </thead>
              <tbody>
                {final.ranking.map((e) => {
                  const s = statsById.get(e.playerId);
                  return (
                    <tr key={e.playerId} className="border-t border-white/10">
                      <td className="p-2 font-bold">{e.rank}</td>
                      <td className="p-2 font-bold">{e.name}</td>
                      <td className="p-2 text-right tabular-nums">{formatPoints(e.score)}</td>
                      <td className="p-2 text-right tabular-nums">
                        {s?.correct ?? 0}/{final.questions.length}
                      </td>
                      <td className="p-2 text-right tabular-nums">{Math.round((s?.accuracy ?? 0) * 100)} %</td>
                      <td className="p-2 text-right tabular-nums">{s?.avgCorrectMs ? `${(s.avgCorrectMs / 1000).toFixed(1)} s` : '—'}</td>
                      <td className="p-2 text-right tabular-nums">{s?.bestStreak ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'questions' && (
          <ol className="glass max-h-[60dvh] space-y-2 overflow-y-auto p-4">
            {final.questions.map((q) => (
              <li key={q.index} className="flex items-center gap-4 rounded-xl bg-white/5 px-4 py-2">
                <span className="w-8 font-display text-xl font-bold text-white/60">{q.index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{q.text}</p>
                  <p className="text-sm text-white/60">
                    {categoryLabel(q.category)} · Respuesta: <strong className="text-emerald-300">{q.correctAnswer}</strong>
                  </p>
                </div>
                <span className="font-display text-2xl font-bold tabular-nums">{Math.round(q.correctRate * 100)} %</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {view.history.length > 1 && (
        <div className="glass p-4">
          <h2 className="mb-2 text-xl font-bold">Historial de la sesión</h2>
          <ul className="flex flex-wrap gap-3">
            {view.history.map((h) => (
              <li key={h.gameNumber} className="rounded-xl bg-white/5 px-4 py-2">
                <span className="font-bold">Partida {h.gameNumber}:</span> {h.podium.map((p, i) => `${['🥇', '🥈', '🥉'][i]} ${p.name}`).join('  ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="flex flex-wrap justify-center gap-3">
        <button type="button" className="btn-primary px-8 py-4 text-xl" onClick={() => void actions.playAgain()}>
          🔁 Jugar otra vez (mismos jugadores)
        </button>
        <button
          type="button"
          className="btn-secondary px-6 py-4"
          onClick={async () => {
            if (confirm('¿Cerrar esta sala? Los jugadores serán desconectados.')) {
              await actions.close();
              actions.forget();
            }
          }}
        >
          Cerrar sala
        </button>
      </footer>
    </main>
  );
}
