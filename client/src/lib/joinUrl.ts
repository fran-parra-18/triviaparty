import { useEffect, useState } from 'react';
import { STORAGE_KEYS, readJson, writeJson } from './storage';

export interface NetworkInfo {
  publicUrl: string | null;
  lanAddresses: string[];
  serverPort: number;
  mode: string;
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export function isLocalhost(hostname = window.location.hostname) {
  return LOCAL_HOSTS.includes(hostname);
}

/**
 * Dirección base que se codifica en el QR:
 *  1. PUBLIC_URL del servidor (despliegue en Internet), si está configurada.
 *  2. Si la pantalla se abrió con «localhost», se sustituye por la IP de la red local
 *     (un teléfono no puede abrir el «localhost» de la PC). Se mantiene el puerto actual,
 *     que en desarrollo es el de Vite y en producción el del servidor.
 *  3. Si no, el mismo origen con el que se abrió la pantalla.
 */
export function computeCandidates(info: NetworkInfo | null): string[] {
  const { protocol, port, origin } = window.location;
  const out: string[] = [];
  if (info?.publicUrl) out.push(info.publicUrl);
  if (isLocalhost()) {
    for (const ip of info?.lanAddresses ?? []) out.push(`${protocol}//${ip}${port ? `:${port}` : ''}`);
  } else out.push(origin);
  if (!out.includes(origin)) out.push(origin);
  return [...new Set(out)];
}

export function useJoinBase() {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [choice, setChoice] = useState<string | null>(() => readJson<string>(STORAGE_KEYS.joinBase));
  useEffect(() => {
    let cancelled = false;
    fetch('/api/network')
      .then((r) => r.json())
      .then((data: NetworkInfo) => !cancelled && setInfo(data))
      .catch(() => !cancelled && setInfo({ publicUrl: null, lanAddresses: [], serverPort: 0, mode: 'unknown' }));
    return () => {
      cancelled = true;
    };
  }, []);
  const candidates = computeCandidates(info);
  const base = choice && candidates.includes(choice) ? choice : (candidates[0] ?? window.location.origin);
  const select = (value: string) => {
    setChoice(value);
    writeJson(STORAGE_KEYS.joinBase, value);
  };
  const onlyLocalhost = isLocalhost(new URL(base).hostname);
  return { base, candidates, select, info, onlyLocalhost, loading: info === null };
}
