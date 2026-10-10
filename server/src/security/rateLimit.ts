/**
 * Limitador de frecuencia "token bucket" en memoria, indexado por clave (socket, IP...).
 * capacity = ráfaga máxima; refillPerSecond = ritmo sostenido permitido.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();
  private lastSweep = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  /** Consume `cost` fichas. Devuelve false si la clave superó su límite. */
  take(key: string, cost = 1): boolean {
    const now = Date.now();
    this.maybeSweep(now);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, updated: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = (now - bucket.updated) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
      bucket.updated = now;
    }
    if (bucket.tokens < cost) return false;
    bucket.tokens -= cost;
    return true;
  }

  delete(key: string) {
    this.buckets.delete(key);
  }

  get size() {
    return this.buckets.size;
  }

  /** Elimina cubos ya llenos para que el mapa no crezca indefinidamente. */
  private maybeSweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const fullAfterMs = (this.capacity / this.refillPerSecond) * 1000;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.updated > fullAfterMs) this.buckets.delete(key);
    }
  }
}
