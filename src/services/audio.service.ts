/**
 * Procedural sound effects (Web Audio) — no asset files, no network.
 *
 * `attachAudio(bus)` is an EVENT CONSUMER: it subscribes to gameplay events and plays the matching
 * sound. The AudioContext is created lazily on the first call after a user gesture (browser autoplay
 * policy) and every call is a no-op when sound is switched off in settings.
 */
import type { GameBus } from './events.service';
import { getSettings } from '../store/settings.store';

let ctx: AudioContext | null = null;
const audio = () => {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
};

interface Tone { f: number; to?: number; d: number; type?: OscillatorType; v?: number; at?: number }
function tones(list: Tone[]) {
  const s = getSettings();
  if (!s.sound || s.volume <= 0) return;
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t0 = c.currentTime;
  for (const t of list) {
    const o = c.createOscillator();
    const g = c.createGain();
    const start = t0 + (t.at ?? 0);
    o.type = t.type ?? 'sine';
    o.frequency.setValueAtTime(t.f, start);
    if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.d);
    const peak = (t.v ?? 0.2) * s.volume;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.d);
    o.connect(g).connect(c.destination);
    o.start(start);
    o.stop(start + t.d + 0.05);
  }
}

export const sfx = {
  step:     () => tones([{ f: 90 + Math.random() * 30, to: 55, d: 0.08, type: 'triangle', v: 0.08 }]),
  key:      () => tones([{ f: 880, d: 0.18, v: 0.18 }, { f: 1318, d: 0.3, v: 0.16, at: 0.08 }, { f: 1760, d: 0.4, v: 0.1, at: 0.16 }]),
  hurt:     () => tones([{ f: 220, to: 70, d: 0.28, type: 'sawtooth', v: 0.22 }]),
  bump:     () => tones([{ f: 120, to: 60, d: 0.14, type: 'square', v: 0.12 }]),
  open:     () => tones([{ f: 110, to: 330, d: 0.7, type: 'sawtooth', v: 0.14 }, { f: 523, d: 0.5, v: 0.14, at: 0.25 }, { f: 784, d: 0.7, v: 0.14, at: 0.4 }]),
  wrong:    () => tones([{ f: 180, to: 110, d: 0.3, type: 'square', v: 0.14 }]),
  correct:  () => tones([{ f: 659, d: 0.15, v: 0.16 }, { f: 880, d: 0.15, v: 0.16, at: 0.1 }, { f: 1318, d: 0.5, v: 0.14, at: 0.2 }]),
  cleared:  () => tones([{ f: 523, d: 0.2, v: 0.16 }, { f: 659, d: 0.2, v: 0.16, at: 0.15 }, { f: 784, d: 0.2, v: 0.16, at: 0.3 }, { f: 1046, d: 0.7, v: 0.16, at: 0.45 }]),
  dead:     () => tones([{ f: 196, to: 49, d: 1.1, type: 'sawtooth', v: 0.2 }]),
  click:    () => tones([{ f: 440, d: 0.05, type: 'triangle', v: 0.08 }]),
};

/** Subscribe the sounds to the event bus; returns the cleanup function. */
export function attachAudio(bus: GameBus): () => void {
  const off = [
    bus.on('player:step', sfx.step),
    bus.on('key:collected', sfx.key),
    bus.on('player:damaged', (hp) => (hp > 0 ? sfx.hurt() : undefined)),
    bus.on('door:locked', sfx.bump),
    bus.on('door:unlocked', sfx.open),
    bus.on('level:cleared', sfx.cleared),
    bus.on('game:dead', sfx.dead),
  ];
  return () => off.forEach((f) => f());
}
