import { useEffect, useRef, useState } from 'react';
import { getSocket } from './socket';
import { msUntil } from './clock';

/** Milisegundos restantes hasta `endsAt` (reloj del servidor), actualizados cada fotograma. */
export function useRemaining(endsAt: number | null | undefined, frozenMs?: number): number {
  const [remaining, setRemaining] = useState(() => (endsAt ? msUntil(endsAt) : (frozenMs ?? 0)));
  useEffect(() => {
    if (!endsAt) {
      setRemaining(frozenMs ?? 0);
      return;
    }
    let raf = 0;
    const loop = () => {
      const r = msUntil(endsAt);
      setRemaining(r);
      if (r > 0) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [endsAt, frozenMs]);
  return remaining;
}

/** Estado de la conexión del socket. */
export function useConnection() {
  const socket = getSocket();
  const [connected, setConnected] = useState(socket.connected);
  const [everConnected, setEverConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => {
      setConnected(true);
      setEverConnected(true);
    };
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    socket.io.on('reconnect_attempt', off);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
      socket.io.off('reconnect_attempt', off);
    };
  }, [socket]);
  return { connected, everConnected };
}

/** Anima un número desde su valor anterior hasta el nuevo. */
export function useCountUp(value: number, durationMs = 900): number {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    if (initial === value) return;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(initial + (value - initial) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value, durationMs]);
  return display;
}

/** Ejecuta `fn` cuando cambia la clave (por ejemplo, fase + número de pregunta), no en cada render. */
export function useOnChange(key: string | null, fn: () => void) {
  const prev = useRef<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (key !== null && key !== prev.current) {
      const isFirst = prev.current === null;
      prev.current = key;
      if (!isFirst) fnRef.current();
    } else if (key === null) prev.current = null;
  }, [key]);
}

export function formatPoints(n: number): string {
  return n.toLocaleString('es');
}

export function ordinal(n: number): string {
  return `${n}.º`;
}
