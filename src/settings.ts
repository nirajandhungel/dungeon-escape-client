/**
 * Player settings — a tiny external store (works with useSyncExternalStore, no library).
 * Every option here is wired to real behaviour:
 *   sound        → audio.ts gain
 *   reduceMotion → camera shake, flame flicker, dust and CSS animations (also follows the OS preference)
 *   graphics     → pixel ratio, shadow-map size and particle count of the 3D scene
 * Persisted in localStorage when available; the game works without it (private windows, blocked storage).
 */
import { useSyncExternalStore } from 'react';

export interface Settings {
  sound: boolean;
  volume: number;                  // 0..1
  reduceMotion: boolean;           // explicit opt-in; the OS preference is OR-ed in by useReducedMotion()
  graphics: 'balanced' | 'high';
}

const KEY = 'dungeon-escape.settings.v1';
const DEFAULTS: Settings = { sound: true, volume: 0.6, reduceMotion: false, graphics: 'high' };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof p.sound === 'boolean' ? p.sound : DEFAULTS.sound,
      volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : DEFAULTS.volume,
      reduceMotion: typeof p.reduceMotion === 'boolean' ? p.reduceMotion : DEFAULTS.reduceMotion,
      graphics: p.graphics === 'balanced' ? 'balanced' : 'high',
    };
  } catch { return DEFAULTS; }
}

let current = load();
const listeners = new Set<() => void>();

export const getSettings = () => current;
export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable: keep in memory */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useSettings = () => useSyncExternalStore(subscribe, getSettings, getSettings);

const osQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
/** True when the player asked for reduced motion in settings OR in their operating system. */
export function useReducedMotion(): boolean {
  const { reduceMotion } = useSettings();
  const os = useSyncExternalStore(
    (cb) => { osQuery?.addEventListener('change', cb); return () => osQuery?.removeEventListener('change', cb); },
    () => !!osQuery?.matches,
    () => false,
  );
  return reduceMotion || os;
}
