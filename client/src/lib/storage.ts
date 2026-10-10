/** Acceso seguro a localStorage (puede fallar en modo privado o con el almacenamiento bloqueado). */
export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: la reconexión automática no estará disponible */
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nada */
  }
}

export const STORAGE_KEYS = {
  host: 'trivia.host.v1',
  player: 'trivia.player.v1',
  lastName: 'trivia.lastName.v1',
  muted: 'trivia.muted.v1',
  hostSettings: 'trivia.hostSettings.v1',
  joinBase: 'trivia.joinBase.v1',
} as const;
