import {
  AUDIO_MIN_SECONDS,
  CATEGORIES,
  CATEGORY_IDS,
  SCORING_PRESETS,
  TIME_OPTIONS,
  type CategoryId,
  type DifficultyMode,
  DIFFICULTY_LABELS,
  MUSIC_CATEGORY_IDS,
  MUSIC_STAGE_RULES,
  MUSIC_THINK_OPTIONS,
  musicTimeline,
  type GameSettings,
  type MusicSettings,
  type ScoringPreset,
} from '@trivia/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface Meta {
  totalQuestions: number;
  categories: { id: CategoryId; counts: { total: number; facil: number; media: number; dificil: number } }[];
  limits: { hardMaxPlayers: number };
}

const DIFFICULTY_OPTIONS: { value: DifficultyMode; label: string }[] = [
  { value: 'mixta', label: 'Mixta' },
  { value: 'facil', label: 'Fácil' },
  { value: 'media', label: 'Media' },
  { value: 'dificil', label: 'Difícil' },
  { value: 'progresiva', label: 'Progresiva' },
];

const SCORING_OPTIONS: { value: ScoringPreset; label: string; hint: string }[] = [
  { value: 'clasico', label: 'Clásico', hint: '1.000 + hasta 500 por rapidez' },
  { value: 'velocidad', label: 'Velocidad', hint: '500 + hasta 1.000 por rapidez' },
  { value: 'precision', label: 'Precisión', hint: '1.000 fijos, sin bonificación' },
  { value: 'dificultad', label: 'Por dificultad', hint: 'Clásico ×1 / ×1,5 / ×2' },
  { value: 'personalizado', label: 'Personalizado', hint: 'Tú eliges los valores' },
];

const DIFFICULTY_MODE_LABELS = { mixta: 'Dificultad mixta', progresiva: 'Dificultad progresiva', ...DIFFICULTY_LABELS };

const MUSIC_CATEGORIES = CATEGORIES.filter((c) => (MUSIC_CATEGORY_IDS as string[]).includes(c.id));

type GameMode = 'clasico' | 'fiesta' | 'musical';

const MODE_OPTIONS: { value: GameMode; title: string; hint: string }[] = [
  { value: 'clasico', title: '🎯 Clásico', hint: 'Todas las preguntas valen lo mismo.' },
  {
    value: 'fiesta',
    title: '🎉 Modo Fiesta',
    hint: 'Preguntas relámpago, dobles y bomba al azar, rachas, apuestas, un comodín 50/50 y la última vale el doble.',
  },
  { value: 'musical', title: '🎵 Modo Musical', hint: 'Adivina la canción: suena por tramos y cuanto antes la reconoces, más vale.' },
];

/** Resumen de una línea: «10 preguntas · 20 s · Todas las categorías · Dificultad mixta». */
export function settingsSummary(s: GameSettings): string {
  if (s.musicMode) {
    const m = s.music;
    const categories =
      m.categories.length === MUSIC_CATEGORY_IDS.length
        ? 'Todas las categorías musicales'
        : m.categories.length === 1
          ? (CATEGORIES.find((c) => c.id === m.categories[0])?.name ?? '1 categoría')
          : `${m.categories.length} categorías musicales`;
    return `🎵 Modo Musical · ${m.songCount} canciones · ${categories} · ${m.thinkSeconds} s para pensar`;
  }
  const categories =
    s.categories.length === CATEGORIES.length
      ? 'Todas las categorías'
      : s.categories.length === 1
        ? (CATEGORIES.find((c) => c.id === s.categories[0])?.name ?? '1 categoría')
        : `${s.categories.length} categorías`;
  const base = `${s.questionCount} preguntas · ${s.timePerQuestion} s · ${categories} · ${DIFFICULTY_MODE_LABELS[s.difficulty]}`;
  return s.partyMode ? `🎉 Modo Fiesta · ${base}` : base;
}

/**
 * Panel de configuración de la partida. Lo usan la pantalla principal y el celular del líder;
 * `onSave` envía los cambios al servidor y devuelve si se aceptaron.
 */
export function SettingsPanel({
  settings,
  playedGames,
  onSave,
  onClose,
}: {
  settings: GameSettings;
  playedGames: number;
  onSave: (settings: GameSettings) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<GameSettings>(settings);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta(null));
    dialogRef.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setMusic = <K extends keyof MusicSettings>(key: K, value: MusicSettings[K]) =>
    setDraft((d) => ({ ...d, music: { ...d.music, [key]: value } }));
  const mode: GameMode = draft.musicMode ? 'musical' : draft.partyMode ? 'fiesta' : 'clasico';
  const music = mode === 'musical';
  const setMode = (m: GameMode) => setDraft((d) => ({ ...d, partyMode: m === 'fiesta', musicMode: m === 'musical' }));

  const available = useMemo(() => {
    if (!meta) return null;
    return meta.categories
      .filter((c) => draft.categories.includes(c.id))
      .reduce((sum, c) => {
        const d = draft.difficulty;
        return sum + (d === 'facil' || d === 'media' || d === 'dificil' ? c.counts[d] : c.counts.total);
      }, 0);
  }, [meta, draft.categories, draft.difficulty]);

  const availableSongs = useMemo(() => {
    if (!meta) return null;
    return meta.categories.filter((c) => draft.music.categories.includes(c.id)).reduce((sum, c) => sum + c.counts.total, 0);
  }, [meta, draft.music.categories]);

  const toggleMusicCategory = (id: CategoryId) => {
    const has = draft.music.categories.includes(id);
    setMusic('categories', has ? draft.music.categories.filter((c) => c !== id) : [...draft.music.categories, id]);
  };
  const noCategories = music ? draft.music.categories.length === 0 : draft.categories.length === 0;

  const toggleCategory = (id: CategoryId) => {
    const has = draft.categories.includes(id);
    set('categories', has ? draft.categories.filter((c) => c !== id) : [...draft.categories, id]);
  };

  const applyPreset = (preset: 'rapida' | 'progresiva' | 'larga') => {
    if (preset === 'rapida') setDraft((d) => ({ ...d, questionCount: 10, timePerQuestion: 20, categories: [...CATEGORY_IDS], difficulty: 'mixta', randomOrder: true }));
    if (preset === 'progresiva') setDraft((d) => ({ ...d, questionCount: 15, difficulty: 'progresiva', randomOrder: true }));
    if (preset === 'larga') setDraft((d) => ({ ...d, questionCount: 30, timePerQuestion: 20, difficulty: 'mixta' }));
  };

  const save = async () => {
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) onClose();
  };

  const hardMax = meta?.limits.hardMaxPlayers ?? 100;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-night-950/80 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="glass flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden bg-night-900/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 id="settings-title" className="text-3xl font-bold">
            Configurar partida
          </h2>
          <button type="button" className="btn-secondary px-3 py-1" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <Field label="Modo de juego">
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modo de juego">
              {MODE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-label={`${o.title}: ${o.hint}`}
                  aria-checked={mode === o.value}
                  onClick={() => setMode(o.value)}
                  className={`rounded-2xl border-2 px-4 py-3 text-left transition ${
                    mode === o.value ? 'border-brand-cyan bg-brand-cyan/15' : 'border-white/10 bg-white/5 opacity-70 hover:opacity-100'
                  }`}
                >
                  <span className="block font-display text-lg font-bold">{o.title}</span>
                  <span className="block text-sm text-white/70">{o.hint}</span>
                </button>
              ))}
            </div>
          </Field>

          {music ? (
            <MusicFields
              music={draft.music}
              setMusic={setMusic}
              counts={meta ? Object.fromEntries(meta.categories.map((c) => [c.id, c.counts.total])) : null}
              availableSongs={availableSongs}
              playedGames={playedGames}
              onToggle={toggleMusicCategory}
            />
          ) : (
            <div className="space-y-6">
              <Field label="Modos rápidos">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary text-base" onClick={() => applyPreset('rapida')}>
                    ⚡ Partida rápida (10 al azar)
                  </button>
                  <button type="button" className="btn-secondary text-base" onClick={() => applyPreset('progresiva')}>
                    📈 Dificultad progresiva
                  </button>
                  <button type="button" className="btn-secondary text-base" onClick={() => applyPreset('larga')}>
                    🏁 Partida larga (30)
                  </button>
                </div>
              </Field>

              <div className="grid gap-6 md:grid-cols-2">
                <Field label={`Cantidad de preguntas: ${draft.questionCount}`}>
                  <input
                    type="range"
                    min={3}
                    max={50}
                    value={draft.questionCount}
                    onChange={(e) => set('questionCount', Number(e.target.value))}
                    className="w-full accent-brand-pink"
                    aria-label="Cantidad de preguntas"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[5, 10, 15, 20, 30, 50].map((n) => (
                      <Pill key={n} active={draft.questionCount === n} onClick={() => set('questionCount', n)}>
                        {n}
                      </Pill>
                    ))}
                  </div>
                </Field>

                <Field label="Tiempo por pregunta">
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tiempo por pregunta">
                    {TIME_OPTIONS.map((t) => (
                      <Pill key={t} active={draft.timePerQuestion === t} onClick={() => set('timePerQuestion', t)} role="radio">
                        {t} s
                      </Pill>
                    ))}
                  </div>
                  {draft.timePerQuestion < AUDIO_MIN_SECONDS && draft.categories.some((c) => c.startsWith('pistas-')) && (
                    <p className="mt-2 text-sm text-white/60">🎧 Las pistas musicales duran {AUDIO_MIN_SECONDS} s, lo que dura el fragmento.</p>
                  )}
                </Field>
              </div>

              <Field
                label={`Categorías (${draft.categories.length}/${CATEGORIES.length})`}
                extra={
                  <div className="flex gap-2">
                    <button type="button" className="text-sm text-brand-cyan underline" onClick={() => set('categories', [...CATEGORY_IDS])}>
                      Todas
                    </button>
                    <button type="button" className="text-sm text-brand-cyan underline" onClick={() => set('categories', [])}>
                      Ninguna
                    </button>
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {CATEGORIES.map((c) => {
                    const active = draft.categories.includes(c.id);
                    const count = meta?.categories.find((m) => m.id === c.id)?.counts.total;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${c.name}${count !== undefined ? `, ${count} preguntas` : ''}`}
                        disabled={count === 0}
                        title={count === 0 ? 'Aún no hay preguntas en esta categoría' : undefined}
                        onClick={() => toggleCategory(c.id)}
                        className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                          active && count !== 0 ? 'border-brand-cyan bg-brand-cyan/15' : 'border-white/10 bg-white/5 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <span className="text-xl" aria-hidden>
                          {c.emoji}
                        </span>
                        <span className="flex-1 leading-tight">{c.name}</span>
                        {count !== undefined && <span className="text-xs text-white/50">{count}</span>}
                      </button>
                    );
                  })}
                </div>
                {draft.categories.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-300">Elige al menos una categoría para poder guardar.</p>
                ) : (
                  <p className="mt-2 text-xs text-white/50">Pulsa una categoría para incluirla o excluirla.</p>
                )}
              </Field>

              <Field label="Dificultad">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Dificultad">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <Pill key={d.value} active={draft.difficulty === d.value} onClick={() => set('difficulty', d.value)} role="radio">
                      {d.label}
                    </Pill>
                  ))}
                </div>
                {available !== null && (
                  <p className={`mt-2 text-sm ${available < draft.questionCount ? 'text-amber-300' : 'text-white/60'}`}>
                    {available} preguntas disponibles con estos filtros
                    {available < draft.questionCount && ' — la partida tendrá menos preguntas de las elegidas'}
                    {playedGames > 0 && ' (las ya jugadas en esta sesión no se repiten)'}.
                  </p>
                )}
              </Field>

              <Field label="Sistema de puntuación">
                <div className="grid gap-2 md:grid-cols-5">
                  {SCORING_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={draft.scoring.preset === o.value}
                      onClick={() =>
                        set('scoring', o.value === 'personalizado' ? { ...draft.scoring, preset: o.value } : { preset: o.value, ...SCORING_PRESETS[o.value] })
                      }
                      className={`rounded-2xl border-2 p-3 text-left transition ${
                        draft.scoring.preset === o.value ? 'border-brand-pink bg-brand-pink/15' : 'border-white/10 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-display text-lg font-bold">{o.label}</div>
                      <div className="text-xs text-white/60">{o.hint}</div>
                    </button>
                  ))}
                </div>
                {draft.scoring.preset === 'personalizado' && (
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <NumberInput label="Puntos base" value={draft.scoring.basePoints} min={0} max={10000} step={100} onChange={(v) => set('scoring', { ...draft.scoring, basePoints: v })} />
                    <NumberInput label="Bonificación máxima por rapidez" value={draft.scoring.speedBonusMax} min={0} max={10000} step={100} onChange={(v) => set('scoring', { ...draft.scoring, speedBonusMax: v })} />
                    <Toggle label="Multiplicar por dificultad" checked={draft.scoring.difficultyMultiplier} onChange={(v) => set('scoring', { ...draft.scoring, difficultyMultiplier: v })} />
                  </div>
                )}
              </Field>

            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Participantes">
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="Mínimo" value={draft.minPlayers} min={1} max={draft.maxPlayers} onChange={(v) => set('minPlayers', v)} />
                <NumberInput label={`Máximo (hasta ${hardMax})`} value={draft.maxPlayers} min={Math.max(1, draft.minPlayers)} max={hardMax} onChange={(v) => set('maxPlayers', v)} />
              </div>
            </Field>
            <Field label="Opciones">
              <div className="space-y-2">
                <Toggle label="Permitir unirse con la partida empezada" checked={draft.allowLateJoin} onChange={(v) => set('allowLateJoin', v)} />
                <Toggle label="Mostrar resultados tras cada pregunta" checked={draft.showResultsAfterEach} onChange={(v) => set('showResultsAfterEach', v)} />
                {!music && <Toggle label="Preguntas en orden aleatorio" checked={draft.randomOrder} onChange={(v) => set('randomOrder', v)} />}
                <Toggle label="Avance automático (sin pulsar «Siguiente»)" checked={draft.autoAdvance} onChange={(v) => set('autoAdvance', v)} />
              </div>
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary px-8" onClick={save} disabled={saving || noCategories}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Configuración propia del Modo Musical: solo aparece al elegir ese modo. */
function MusicFields({
  music,
  setMusic,
  counts,
  availableSongs,
  playedGames,
  onToggle,
}: {
  music: MusicSettings;
  setMusic: <K extends keyof MusicSettings>(key: K, value: MusicSettings[K]) => void;
  counts: Record<string, number> | null;
  availableSongs: number | null;
  playedGames: number;
  onToggle: (id: CategoryId) => void;
}) {
  const timeline = musicTimeline(music.thinkSeconds);
  const total = timeline[timeline.length - 1]!.endMs / 1000;
  return (
    <div className="space-y-6 rounded-3xl border-2 border-brand-cyan/30 bg-brand-cyan/5 p-4">
      <div>
        <p className="font-display text-xl font-bold">🎵 Adivina la canción</p>
        <p className="mt-1 text-sm text-white/70">
          Cada canción suena por tramos, siempre desde el principio. Se puede responder en cualquier momento, una sola vez: cuanto antes,
          más vale. Fallar no resta puntos, pero ya no puedes volver a responder esa canción.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {MUSIC_STAGE_RULES.map((r, i) => (
            <div key={r.label} className="rounded-2xl bg-white/5 px-2 py-2">
              <div className="text-sm text-white/60">
                Tramo {i + 1} · {r.label}
              </div>
              <div className="font-display text-xl font-bold text-brand-cyan">{r.points.toLocaleString('es')}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Field label={`Cantidad de canciones: ${music.songCount}`}>
          <input
            type="range"
            min={3}
            max={50}
            value={music.songCount}
            onChange={(e) => setMusic('songCount', Number(e.target.value))}
            className="w-full accent-brand-pink"
            aria-label="Cantidad de canciones"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {[5, 10, 15, 20, 30].map((n) => (
              <Pill key={n} active={music.songCount === n} onClick={() => setMusic('songCount', n)}>
                {n}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Tiempo para pensar entre tramos">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tiempo para pensar entre tramos">
            {MUSIC_THINK_OPTIONS.map((t) => (
              <Pill key={t} active={music.thinkSeconds === t} onClick={() => setMusic('thinkSeconds', t)} role="radio">
                {t} s
              </Pill>
            ))}
          </div>
          <p className="mt-2 text-sm text-white/60">
            Silencio después de los 2 s y de los 5 s, para pensar antes del siguiente tramo. Cada canción dura como mucho {total} s.
          </p>
        </Field>
      </div>

      <Field
        label={`Categorías musicales (${music.categories.length}/${MUSIC_CATEGORIES.length})`}
        extra={
          <div className="flex gap-2">
            <button type="button" className="text-sm text-brand-cyan underline" onClick={() => setMusic('categories', [...MUSIC_CATEGORY_IDS])}>
              Todas
            </button>
            <button type="button" className="text-sm text-brand-cyan underline" onClick={() => setMusic('categories', [])}>
              Ninguna
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {MUSIC_CATEGORIES.map((c) => {
            const active = music.categories.includes(c.id);
            const count = counts?.[c.id];
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                aria-label={`${c.name}${count !== undefined ? `, ${count} canciones` : ''}`}
                onClick={() => onToggle(c.id)}
                className={`flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left text-sm font-semibold transition ${
                  active ? 'border-brand-cyan bg-brand-cyan/15' : 'border-white/10 bg-white/5 opacity-60 hover:opacity-100'
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {c.emoji}
                </span>
                <span className="flex-1 leading-tight first-letter:uppercase">{c.name.replace('Pistas musicales ', '')}</span>
                {count !== undefined && <span className="text-xs text-white/50">{count}</span>}
              </button>
            );
          })}
        </div>
        {music.categories.length === 0 ? (
          <p className="mt-2 text-sm text-amber-300">Elige al menos una categoría musical para poder guardar.</p>
        ) : (
          availableSongs !== null && (
            <p className={`mt-2 text-sm ${availableSongs < music.songCount ? 'text-amber-300' : 'text-white/60'}`}>
              {availableSongs} canciones disponibles
              {availableSongs < music.songCount && ' — la partida tendrá menos de las elegidas'}
              {playedGames > 0 && ' (las ya jugadas en esta sesión no se repiten)'}.
            </p>
          )
        )}
      </Field>
    </div>
  );
}

function Field({ label, children, extra }: { label: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <fieldset>
      <div className="mb-2 flex items-center justify-between">
        <legend className="font-display text-lg font-semibold text-white/90">{label}</legend>
        {extra}
      </div>
      {children}
    </fieldset>
  );
}

function Pill({ active, onClick, children, role }: { active: boolean; onClick: () => void; children: ReactNode; role?: string }) {
  return (
    <button
      type="button"
      role={role}
      aria-pressed={role ? undefined : active}
      aria-checked={role ? active : undefined}
      onClick={onClick}
      className={`rounded-xl border-2 px-4 py-2 font-bold transition ${active ? 'border-brand-pink bg-brand-pink/20' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
    >
      {children}
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2">
      <span>{label}</span>
      <input type="checkbox" className="h-5 w-5 accent-brand-pink" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-white/70">
      {label}
      <input
        type="number"
        className="input py-2 text-lg"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </label>
  );
}
