import type { PlayerView } from '@trivia/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { observeServerTime } from '../lib/clock';
import { errorText, getSocket, request } from '../lib/socket';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '../lib/storage';

interface StoredPlayer {
  code: string;
  token: string;
  name: string;
}

export type PlayerStatus = 'connecting' | 'idle' | 'joining' | 'rejoining' | 'active' | 'kicked' | 'closed' | 'replaced';

/**
 * Sesión del participante. El token secreto se guarda en el dispositivo; si se corta la conexión
 * o se recarga la página, se reincorpora con «player:rejoin» y conserva su puntuación.
 */
export function usePlayerSession(urlCode: string | null) {
  const socket = getSocket();
  const [view, setView] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const stored = useRef<StoredPlayer | null>(readJson<StoredPlayer>(STORAGE_KEYS.player));

  // Si el QR apunta a otra sala distinta de la guardada, la sesión anterior no se usa.
  if (urlCode && stored.current && stored.current.code !== urlCode) stored.current = null;

  const forget = useCallback(() => {
    stored.current = null;
    removeKey(STORAGE_KEYS.player);
  }, []);

  const rejoin = useCallback(async () => {
    const s = stored.current;
    if (!s) {
      setStatus((prev) => (prev === 'active' ? prev : 'idle'));
      return;
    }
    setStatus('rejoining');
    const res = await request('player:rejoin', { code: s.code, token: s.token });
    if (res.ok) {
      setStatus('active');
      return;
    }
    if (['ROOM_NOT_FOUND', 'INVALID_TOKEN', 'INVALID_PAYLOAD', 'ROOM_CLOSED'].includes(res.error)) {
      forget();
      setView(null);
      setMessage(res.error === 'ROOM_NOT_FOUND' ? 'La sala anterior ya no existe.' : null);
    } else setError(errorText(res));
    setStatus('idle');
  }, [forget]);

  useEffect(() => {
    const onState = (v: PlayerView) => {
      observeServerTime(v.serverNow);
      setView(v);
    };
    const onKicked = ({ reason }: { reason: string }) => {
      forget();
      setMessage(reason);
      setStatus('kicked');
    };
    const onClosed = ({ reason }: { reason: string }) => {
      forget();
      setMessage(reason);
      setStatus('closed');
    };
    const onReplaced = ({ reason }: { reason: string }) => {
      setMessage(reason);
      setStatus('replaced');
    };
    const onConnect = () => void rejoin();
    socket.on('player:state', onState);
    socket.on('player:kicked', onKicked);
    socket.on('room:closed', onClosed);
    socket.on('session:replaced', onReplaced);
    socket.on('connect', onConnect);
    if (socket.connected) void rejoin();
    else socket.connect();
    return () => {
      socket.off('player:state', onState);
      socket.off('player:kicked', onKicked);
      socket.off('room:closed', onClosed);
      socket.off('session:replaced', onReplaced);
      socket.off('connect', onConnect);
    };
  }, [socket, rejoin, forget]);

  const join = useCallback(async (code: string, name: string) => {
    setStatus('joining');
    setError(null);
    setMessage(null);
    const res = await request('player:join', { code, name });
    if (!res.ok) {
      setError(errorText(res));
      setStatus('idle');
      return false;
    }
    stored.current = { code: res.code, token: res.token, name: res.name };
    writeJson(STORAGE_KEYS.player, stored.current);
    writeJson(STORAGE_KEYS.lastName, res.name);
    setStatus('active');
    return true;
  }, []);

  const answer = useCallback(async (questionIndex: number, choice: number) => {
    const res = await request('player:answer', { questionIndex, choice });
    if (!res.ok) setError(errorText(res));
    return res.ok;
  }, []);

  const leave = useCallback(async () => {
    await request('player:leave', {});
    forget();
    setView(null);
    setStatus('idle');
  }, [forget]);

  const reset = useCallback(() => {
    forget();
    setView(null);
    setMessage(null);
    setStatus('idle');
  }, [forget]);

  return {
    view: status === 'active' ? view : null,
    status,
    error,
    clearError: () => setError(null),
    message,
    storedCode: stored.current?.code ?? null,
    join,
    answer,
    leave,
    reset,
    reconnectHere: () => {
      setStatus('connecting');
      if (socket.connected) void rejoin();
      else socket.connect();
    },
  };
}
