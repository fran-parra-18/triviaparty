import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, readJson, writeJson } from './storage';

/**
 * Efectos de sonido sintetizados con Web Audio (sin archivos externos).
 * El navegador solo permite sonido tras una interacción; `unlockAudio` se llama en el primer clic.
 */
let ctx: AudioContext | null = null;
let muted = readJson<boolean>(STORAGE_KEYS.muted) ?? false;
const listeners = new Set<() => void>();

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function unlockAudio() {
  audio();
}

export function setMuted(value: boolean) {
  muted = value;
  writeJson(STORAGE_KEYS.muted, value);
  listeners.forEach((l) => l());
}

export function useMuted(): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => muted,
  );
  return [value, setMuted];
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.15, endFreq?: number) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export const sounds = {
  tick: () => tone(880, 0, 0.08, 'square', 0.05),
  urgentTick: () => tone(1320, 0, 0.1, 'square', 0.08),
  countdown: () => tone(523, 0, 0.18, 'triangle', 0.18),
  go: () => {
    tone(784, 0, 0.12, 'triangle', 0.18);
    tone(1046, 0.1, 0.3, 'triangle', 0.18);
  },
  answer: () => tone(660, 0, 0.12, 'sine', 0.2, 990),
  join: () => {
    tone(587, 0, 0.1, 'sine', 0.12);
    tone(880, 0.08, 0.15, 'sine', 0.12);
  },
  timeUp: () => tone(440, 0, 0.5, 'sawtooth', 0.08, 220),
  reveal: () => {
    tone(392, 0, 0.12, 'triangle', 0.15);
    tone(523, 0.1, 0.12, 'triangle', 0.15);
    tone(659, 0.2, 0.25, 'triangle', 0.15);
  },
  correct: () => {
    tone(659, 0, 0.12, 'triangle', 0.2);
    tone(880, 0.1, 0.12, 'triangle', 0.2);
    tone(1318, 0.2, 0.35, 'triangle', 0.18);
  },
  wrong: () => {
    tone(300, 0, 0.25, 'sawtooth', 0.1, 200);
    tone(200, 0.2, 0.35, 'sawtooth', 0.1, 120);
  },
  fanfare: () => {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i * 0.14, i === 5 ? 0.7 : 0.16, 'triangle', 0.18));
  },
};

export function vibrate(pattern: number | number[]) {
  try {
    if (!muted) navigator.vibrate?.(pattern);
  } catch {
    /* no disponible */
  }
}
