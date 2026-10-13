import { AWARD_INFO, SPECIAL_INFO, type Award, type SpecialKind } from '@trivia/shared';
import { Avatar } from './ui';

const SPECIAL_STYLE: Record<SpecialKind, string> = {
  relampago: 'from-sky-400 to-cyan-300 text-night-950',
  doble: 'from-emerald-400 to-lime-300 text-night-950',
  bomba: 'from-rose-500 to-orange-400 text-white',
  final: 'from-amber-300 to-yellow-200 text-night-950',
};

/** Anuncio grande de una pregunta especial (durante la cuenta regresiva). */
export function SpecialAnnouncement({ kind, compact = false }: { kind: SpecialKind; compact?: boolean }) {
  const info = SPECIAL_INFO[kind];
  return (
    <div
      className={`animate-pop-in rounded-3xl bg-gradient-to-br ${SPECIAL_STYLE[kind]} text-center shadow-2xl ${compact ? 'px-5 py-3' : 'px-10 py-6'}`}
      role="status"
    >
      <div className={compact ? 'text-4xl' : 'text-7xl'}>{info.emoji}</div>
      <p className={`font-display font-bold ${compact ? 'text-2xl' : 'text-5xl'}`}>{info.title}</p>
      <p className={`font-semibold opacity-80 ${compact ? 'text-sm' : 'text-2xl'}`}>{info.description}</p>
    </div>
  );
}

/** Etiqueta pequeña de pregunta especial, junto a la categoría. */
export function SpecialBadge({ kind }: { kind: SpecialKind }) {
  const info = SPECIAL_INFO[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${SPECIAL_STYLE[kind]} px-3 py-1 text-sm font-bold shadow`}>
      {info.emoji} {info.title}
    </span>
  );
}

/** Tarjeta de un premio gracioso del podio. */
export function AwardCard({ award, delayMs = 0, showName = true }: { award: Award; delayMs?: number; showName?: boolean }) {
  const info = AWARD_INFO[award.kind];
  return (
    <div className="animate-pop-in flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3" style={{ animationDelay: `${delayMs}ms` }}>
      <span className="text-4xl" aria-hidden>
        {info.emoji}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <p className="font-display text-lg font-bold leading-tight">{info.title}</p>
        <p className="text-sm text-white/70">{award.detail}</p>
      </div>
      {showName && (
        <div className="flex shrink-0 items-center gap-2">
          <Avatar name={award.name} index={award.avatar} size={32} />
          <span className="max-w-32 truncate font-bold">{award.name}</span>
        </div>
      )}
    </div>
  );
}
