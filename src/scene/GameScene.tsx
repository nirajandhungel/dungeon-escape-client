/**
 * GameScene — the React Three Fiber canvas.
 *
 *  • GameLoop   calls engine.update() once per rendered frame (single loop, no extra timers).
 *  • Lighting   cool moonlight + violet hemisphere ambience, warm flame/lantern point lights.
 *  • CameraRig  elevated three-quarter perspective, follows the hero, framing adapts to the viewport.
 *  • Backdrop   the same scene without a player loop, used behind the title screen.
 *
 * R3F does not forward outer React context into <Canvas>, so the SceneContext provider lives inside it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MathUtils, Object3D, PerspectiveCamera, Vector3, type DirectionalLight } from 'three';
import { createAssets } from './assets';
import { SceneContext } from './context';
import Environment from './Environment';
import { Hero, Guards } from './Actors';
import { Dust } from './Effects';
import type { GameEngine } from '../game/engine';
import type { InputController } from '../game/input';
import { useReducedMotion, useSettings } from '../settings';

export const FOV = 38;
const ELEVATION = (57 * Math.PI) / 180;
const AZIMUTH_X = -0.16;   // slight sideways offset → three-quarter view instead of a flat top-down one

function GameLoop({ engine, input }: { engine: GameEngine; input: InputController }) {
  // Negative priority → runs before every other frame callback, so all visuals read this frame's state.
  useFrame((_, dt) => engine.update(Math.min(dt, 0.05), input.vector()), -10);
  return null;
}

function Lighting({ engine, high }: { engine: GameEngine; high: boolean }) {
  const moon = useRef<DirectionalLight>(null!);
  const target = useMemo(() => new Object3D(), []);
  // Levels are long: the shadow-casting light travels with the hero so one modest shadow map always covers what is on screen.
  useFrame(() => {
    const p = engine.player;
    target.position.set(p.x, 0, p.y);
    moon.current.position.set(p.x - 7, 16, p.y + 6);
  });
  return (
    <>
      <color attach="background" args={['#05060a']} />
      <fogExp2 attach="fog" args={['#07080d', 0.028]} />
      <hemisphereLight args={['#7a84b8', '#2a1d35', 0.8]} />
      <primitive object={target} />
      <directionalLight
        ref={moon} target={target} color="#aebcf0" intensity={0.8} castShadow
        shadow-mapSize={high ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-17} shadow-camera-right={17} shadow-camera-top={13} shadow-camera-bottom={-13}
        shadow-camera-near={1} shadow-camera-far={45} shadow-bias={-0.0005} shadow-normalBias={0.04}
      />
    </>
  );
}

function CameraRig({ engine, mode }: { engine: GameEngine; mode: 'play' | 'backdrop' }) {
  const { camera, size } = useThree();
  const reduced = useReducedMotion();
  const state = useRef({ x: engine.player.x, z: engine.player.y, dist: 14, shake: 0, lastHurt: -Infinity });
  const v = useMemo(() => new Vector3(), []);

  useFrame(({ clock }, dt) => {
    const cam = camera as PerspectiveCamera;
    const s = state.current;
    const { level } = engine;
    const aspect = size.width / Math.max(1, size.height);
    const fov = mode === 'backdrop' ? 46 : FOV;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const tan = Math.tan(MathUtils.degToRad(fov / 2));

    // How many tiles should fit across the screen: wide on landscape monitors, narrower on phones.
    const wantWide = aspect >= 1.2 ? 15.5 : aspect >= 0.8 ? 12 : 8.5;
    // Distance needed to fit the wanted width OR a minimum ground depth (ultra-wide screens would otherwise be too close).
    const MIN_DEPTH = 10.5;
    const targetDist = MathUtils.clamp(Math.max(wantWide / 2 / (tan * aspect), (MIN_DEPTH * Math.sin(ELEVATION)) / (2 * tan)), 9, 24);
    s.dist += (targetDist - s.dist) * Math.min(1, dt * 4);

    if (mode === 'backdrop') {
      const a = Math.sin(clock.elapsedTime * 0.12) * 0.55;
      v.set(5.2, 0.5, 7);
      cam.position.set(v.x + Math.sin(a) * 9.5, 6.4, v.z + Math.cos(a) * 9.5 + 1);
      cam.lookAt(v);
      return;
    }

    const halfW = (s.dist * tan * aspect) * 0.98;
    const halfD = (s.dist * tan) / Math.sin(ELEVATION) * 0.92;
    const clampAxis = (val: number, half: number, total: number) => (total <= half * 2 - 1 ? total / 2 : MathUtils.clamp(val, half - 0.6, total - half + 0.6));
    const p = engine.player;
    const k = 1 - Math.exp(-(reduced ? 14 : 5.5) * dt);
    s.x += (clampAxis(p.x, halfW, level.width) - s.x) * k;
    s.z += (clampAxis(p.y + 0.8, halfD, level.height) - s.z) * k;

    if (engine.lastDamageAt > s.lastHurt) { s.lastHurt = engine.lastDamageAt; if (!reduced) s.shake = 0.14; }
    s.shake = Math.max(0, s.shake - dt * 0.5);
    const sh = s.shake * (reduced ? 0 : 1);
    const d = s.dist;
    cam.position.set(
      s.x + AZIMUTH_X * d * Math.cos(ELEVATION) + (Math.random() - 0.5) * sh,
      Math.sin(ELEVATION) * d + (Math.random() - 0.5) * sh,
      s.z + Math.cos(ELEVATION) * d,
    );
    cam.lookAt(s.x, 0.2, s.z);
  });
  return null;
}

interface Props {
  engine: GameEngine;
  input?: InputController;
  mode?: 'play' | 'backdrop';
  cape?: string;
  onContextLost?: () => void;
}

export default function GameScene({ engine, input, mode = 'play', cape = '#8a2a2a', onContextLost }: Props) {
  const [assets] = useState(createAssets);
  useEffect(() => () => assets.dispose(), [assets]);
  const reduced = useReducedMotion();
  const { graphics } = useSettings();
  const high = graphics === 'high';
  const ctx = useMemo(() => ({ engine, assets, reduced, high, cape }), [engine, assets, reduced, high, cape]);

  return (
    <Canvas
      shadows
      dpr={high ? [1, 2] : [1, 1.25]}
      camera={{ fov: FOV, near: 0.1, far: 90, position: [11, 12, 20] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 1.15;
        // R3F deliberately calls forceContextLoss() when the canvas unmounts (e.g. "restart run"); that is not a failure.
        // Only a loss while the canvas is still on the page — the browser evicting it — is reported.
        gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (gl.domElement.isConnected) onContextLost?.(); });
      }}
      style={{ position: 'absolute', inset: 0 }}
      aria-hidden="true"
    >
      <SceneContext.Provider value={ctx}>
        {input && <GameLoop engine={engine} input={input} />}
        <Lighting engine={engine} high={high} />
        {/* keyed by level so a level change rebuilds geometry cleanly and releases the old GPU resources */}
        <group key={`${engine.level.index}-${mode}`}>
          <Environment />
          <Hero />
          <Guards />
          <Dust />
        </group>
        <CameraRig engine={engine} mode={mode} />
      </SceneContext.Provider>
    </Canvas>
  );
}
