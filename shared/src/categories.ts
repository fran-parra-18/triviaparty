export const CATEGORIES = [
  { id: 'historia', name: 'Historia', emoji: '🏛️' },
  { id: 'geografia', name: 'Geografía', emoji: '🌍' },
  { id: 'ciencia', name: 'Ciencia y naturaleza', emoji: '🔬' },
  { id: 'tecnologia', name: 'Tecnología e informática', emoji: '💻' },
  { id: 'cine', name: 'Cine y televisión', emoji: '🎬' },
  { id: 'musica', name: 'Música', emoji: '🎵' },
  { id: 'deportes', name: 'Deportes', emoji: '⚽' },
  { id: 'literatura', name: 'Literatura', emoji: '📚' },
  { id: 'arte', name: 'Arte y cultura', emoji: '🎨' },
  { id: 'gastronomia', name: 'Gastronomía', emoji: '🍽️' },
  { id: 'animales', name: 'Animales', emoji: '🐾' },
  { id: 'espacio', name: 'Espacio y astronomía', emoji: '🚀' },
  { id: 'inventos', name: 'Inventos y descubrimientos', emoji: '💡' },
  { id: 'cultura-general', name: 'Cultura general', emoji: '🧠' },
  { id: 'curiosidades', name: 'Datos curiosos del mundo', emoji: '🤯' },
  { id: 'records', name: 'Récords y hechos sorprendentes', emoji: '🏆' },
  { id: 'pistas-80s', name: 'Pistas musicales 80s', emoji: '🎧' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as unknown as readonly [CategoryId, ...CategoryId[]];

export function getCategory(id: string) {
  return CATEGORIES.find((c) => c.id === id);
}

export const DIFFICULTIES = ['facil', 'media', 'dificil'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  facil: 'Fácil',
  media: 'Media',
  dificil: 'Difícil',
};
