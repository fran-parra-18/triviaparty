import type { GameSettings, HostView } from '@trivia/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { observeServerTime } from '../lib/clock';
import { errorText, getSocket, request } from '../lib/socket';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '../lib/storage';

interface StoredHost {
  code: string;
  hostToken: string;
}

export type HostStatus = 'connecting' | 'idle' | 'creating' | 'reclaiming' | 'active' | 'closed' | 'replaced';

/**
 * Sesión del anfitrión. El token se guarda en localStorage: si la pestaña se recarga o se
 * pierde la conexión, al reconectar se recupera el control de la sala con «host:reclaim».
 */
export function useHostSession() {
  const socket = getSocket();
  const [view, setView] = useState<HostView | null>(null);
  const [status, setStatus] = useState<HostStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const stored = useRef<StoredHost | null>(readJson<StoredHost>(STORAGE_KEYS.host));

  const reclaim = useCallback(async () => {
    const s = stored.current;
    if (!s) {
      setStatus((prev) => (prev === 'active' ? prev : 'idle'));
      return;
    }
    setStatus('reclaiming');
    const res = await request('host:reclaim', { code: s.code, hostToken: s.hostToken });
    if (res.ok) setStatus('active');
    else if (res.error === 'ROOM_NOT_FOUND' || res.error === 'INVALID_TOKEN' || res.error === 'INVALID_PAYLOAD') {
      stored.current = null;
      removeKey(STORAGE_KEYS.host);
      setView(null);
      setStatus('idle');
    } else {
      setError(errorText(res));
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    const onState = (v: HostView) => {
      observeServerTime(v.serverNow);
      setView(v);
    };
    const onClosed = ({ reason }: { reason: string }) => {
      stored.current = null;
      removeKey(STORAGE_KEYS.host);
      setClosedReason(reason);
      setStatus('closed');
    };
    const onReplaced = () => setStatus('replaced');
    const onConnect = () => void reclaim();
    socket.on('host:state', onState);
    socket.on('room:closed', onClosed);
    socket.on('session:replaced', onReplaced);
    socket.on('connect', onConnect);
    if (socket.connected) void reclaim();
    else socket.connect();
    return () => {
      socket.off('host:state', onState);
      socket.off('room:closed', onClosed);
      socket.off('session:replaced', onReplaced);
      socket.off('connect', onConnect);
    };
  }, [socket, reclaim]);

  const create = useCallback(async (settings?: Partial<GameSettings>) => {
    setStatus('creating');
    setError(null);
    setClosedReason(null);
    const res = await request('host:create', { settings });
    if (!res.ok) {
      setError(errorText(res));
      setStatus('idle');
      return false;
    }
    stored.current = { code: res.code, hostToken: res.hostToken };
    writeJson(STORAGE_KEYS.host, stored.current);
    setStatus('active');
    return true;
  }, []);

  /** Ejecuta una acción del anfitrión y muestra el error si falla. */
  const act = useCallback(async (event: Parameters<typeof request>[0], payload: object = {}) => {
    const res = await request(event, payload as never);
    // Pulsar «Siguiente» varias veces seguidas puede llegar tras el cambio de fase: no es un error real.
    if (!res.ok && !(event === 'host:next' && res.error === 'INVALID_STATE')) setError(errorText(res));
    return res.ok;
  }, []);

  const actions = {
    start: () => act('host:start'),
    next: () => act('host:next'),
    pause: () => act('host:pause'),
    resume: () => act('host:resume'),
    end: () => act('host:end'),
    playAgain: () => act('host:playAgain'),
    kick: (playerId: string) => act('host:kick', { playerId }),
    updateSettings: (settings: Partial<GameSettings>) => act('host:updateSettings', { settings }),
    close: async () => {
      const ok = await act('host:close');
      if (ok) {
        stored.current = null;
        removeKey(STORAGE_KEYS.host);
      }
      return ok;
    },
    forget: () => {
      stored.current = null;
      removeKey(STORAGE_KEYS.host);
      setView(null);
      setClosedReason(null);
      setStatus('idle');
    },
    reconnectHere: () => {
      setStatus('connecting');
      if (socket.connected) void reclaim();
      else socket.connect();
    },
  };

  return { view: status === 'active' ? view : null, status, error, clearError: () => setError(null), closedReason, create, actions };
}
