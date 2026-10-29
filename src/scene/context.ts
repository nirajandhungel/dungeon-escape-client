import { createContext, useContext } from 'react';
import type { GameEngine } from '../game/engine';
import type { Assets } from './assets';

/** Everything a scene component needs. The engine is READ every frame; the scene never mutates game rules. */
export interface SceneCtx {
  engine: GameEngine;
  assets: Assets;
  reduced: boolean;   // reduced motion: no flicker, shake or drifting particles
  high: boolean;      // 'high' graphics: more particles, bigger shadow map
  cape: string;       // hero cape colour (a cosmetic reward unlocked on the server)
}
export const SceneContext = createContext<SceneCtx>(null as unknown as SceneCtx);
export const useScene = () => useContext(SceneContext);
