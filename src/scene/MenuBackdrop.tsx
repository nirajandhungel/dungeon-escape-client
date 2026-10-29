import { useMemo } from 'react';
import GameScene from './GameScene';
import { GameEngine } from '../game/engine';
import { generateLevel } from '../game/levels';

/** The title-screen backdrop: the real level 1 scene, never updated (the hero idles), with a slowly swaying camera. */
export default function MenuBackdrop() {
  const engine = useMemo(() => new GameEngine(generateLevel(7, 0), () => {}), []);
  return <GameScene engine={engine} mode="backdrop" />;
}
