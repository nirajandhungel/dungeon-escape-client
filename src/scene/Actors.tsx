/**
 * The hero and the guards. Pure presentation: position, facing and "is moving" come from the engine;
 * the walk cycle, bob and blink are visual only and cannot influence the rules.
 */
import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Group, type PointLight } from 'three';
import { useScene } from './context';
import { INVINCIBLE_S, PLAYER_SPEED } from '../game/engine';

/** Shortest-path angle smoothing so the hero turns the short way round. */
const dampAngle = (cur: number, target: number, k: number) => {
  let d = (target - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
};

export function Hero() {
  const { engine, assets, reduced } = useScene();
  const root = useRef<Group>(null!);
  const body = useRef<Group>(null!);
  const legL = useRef<Group>(null!), legR = useRef<Group>(null!);
  const armL = useRef<Group>(null!), armR = useRef<Group>(null!);
  const cape = useRef<Group>(null!);
  const lantern = useRef<PointLight>(null!);
  const phase = useRef(0);
  const { cape: capeColor } = useScene();
  useEffect(() => { assets.cape.color.set(capeColor); }, [assets, capeColor]);

  useFrame(({ clock }, dt) => {
    const p = engine.player;
    root.current.position.set(p.x, 0, p.y);
    root.current.rotation.y = dampAngle(root.current.rotation.y, p.yaw, dt * 16);
    const move = Math.min(1, p.speed / PLAYER_SPEED);
    phase.current += dt * (4 + move * 7);
    const sw = Math.sin(phase.current) * 0.85 * move;
    legL.current.rotation.x = sw; legR.current.rotation.x = -sw;
    armL.current.rotation.x = -sw * 0.8; armR.current.rotation.x = sw * 0.55 - 0.25;
    const t = clock.elapsedTime;
    body.current.position.y = Math.abs(Math.sin(phase.current)) * 0.05 * move + (move < 0.05 ? Math.sin(t * 2.2) * 0.008 : 0);
    body.current.rotation.z = Math.sin(phase.current) * 0.04 * move;
    cape.current.rotation.x = 0.12 + move * 0.35 + (reduced ? 0 : Math.sin(t * 3) * 0.03);
    // Blink while invulnerable after a hit; steady when reduced motion is requested.
    const hurt = engine.time - engine.lastDamageAt < INVINCIBLE_S;
    root.current.visible = !hurt || reduced || Math.sin(t * 45) > -0.2;
    lantern.current.intensity = 9 + (reduced ? 0 : Math.sin(t * 7) * 0.8);
  });

  return (
    <group ref={root} scale={1.18}>
      <group ref={body}>
        {/* legs: pivot at the hip */}
        {([[-0.075, legL], [0.075, legR]] as const).map(([x, ref]) => (
          <group key={x} ref={ref} position={[x, 0.36, 0]}>
            <mesh position={[0, -0.14, 0]} castShadow material={assets.clothDark}><boxGeometry args={[0.1, 0.28, 0.12]} /></mesh>
            <mesh position={[0, -0.31, 0.025]} castShadow material={assets.leather}><boxGeometry args={[0.115, 0.1, 0.19]} /></mesh>
          </group>
        ))}
        {/* tunic, belt, buckle */}
        <mesh position={[0, 0.52, 0]} castShadow material={assets.cloth}><cylinderGeometry args={[0.135, 0.17, 0.36, 8]} /></mesh>
        <mesh position={[0, 0.39, 0]} material={assets.leather}><cylinderGeometry args={[0.175, 0.175, 0.045, 8]} /></mesh>
        <mesh position={[0, 0.39, 0.172]} material={assets.gold}><boxGeometry args={[0.05, 0.05, 0.015]} /></mesh>
        {/* shoulders + cape */}
        <mesh position={[0, 0.69, 0]} castShadow material={assets.cape}><boxGeometry args={[0.4, 0.07, 0.2]} /></mesh>
        <group ref={cape} position={[0, 0.68, -0.1]}>
          <mesh position={[0, -0.22, -0.02]} castShadow material={assets.cape}><boxGeometry args={[0.3, 0.46, 0.03]} /></mesh>
        </group>
        {/* arms; the right hand carries the sword */}
        <group ref={armL} position={[-0.23, 0.66, 0]}>
          <mesh position={[0, -0.14, 0]} castShadow material={assets.cloth}><boxGeometry args={[0.075, 0.28, 0.085]} /></mesh>
          <mesh position={[0, -0.3, 0]} material={assets.skin}><sphereGeometry args={[0.05, 6, 5]} /></mesh>
        </group>
        <group ref={armR} position={[0.23, 0.66, 0]}>
          <mesh position={[0, -0.14, 0]} castShadow material={assets.cloth}><boxGeometry args={[0.075, 0.28, 0.085]} /></mesh>
          <mesh position={[0, -0.3, 0]} material={assets.skin}><sphereGeometry args={[0.05, 6, 5]} /></mesh>
          <group position={[0, -0.3, 0.03]} rotation={[-1.2, 0, 0]}>
            <mesh position={[0, 0.2, 0]} castShadow material={assets.spike}><boxGeometry args={[0.03, 0.36, 0.012]} /></mesh>
            <mesh position={[0, 0.02, 0]} material={assets.gold}><boxGeometry args={[0.12, 0.025, 0.035]} /></mesh>
            <mesh position={[0, -0.04, 0]} material={assets.leather}><cylinderGeometry args={[0.014, 0.014, 0.08, 5]} /></mesh>
          </group>
        </group>
        {/* head, hood and eyes: the eyes show which way the hero faces */}
        <mesh position={[0, 0.8, 0]} castShadow material={assets.skin}><sphereGeometry args={[0.115, 10, 8]} /></mesh>
        <mesh position={[0, 0.83, -0.015]} rotation={[-0.1, 0, 0]} castShadow material={assets.clothDark}>
          <sphereGeometry args={[0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        </mesh>
        <mesh position={[0, 0.7, -0.13]} rotation={[-2.2, 0, 0]} castShadow material={assets.clothDark}><coneGeometry args={[0.09, 0.2, 6]} /></mesh>
        <mesh position={[-0.04, 0.8, 0.105]} material={assets.eye}><boxGeometry args={[0.025, 0.03, 0.01]} /></mesh>
        <mesh position={[0.04, 0.8, 0.105]} material={assets.eye}><boxGeometry args={[0.025, 0.03, 0.01]} /></mesh>
      </group>
      <pointLight ref={lantern} position={[0, 1.15, 0.25]} color="#ffc983" distance={6.5} decay={1.7} intensity={9} />
    </group>
  );
}

export function Guards() {
  const { engine } = useScene();
  return <>{engine.guards.map((_, i) => <Guard key={i} index={i} />)}</>;
}

function Guard({ index }: { index: number }) {
  const { engine, assets, reduced } = useScene();
  const root = useRef<Group>(null!);
  const body = useRef<Group>(null!);
  const legL = useRef<Group>(null!), legR = useRef<Group>(null!);
  const axe = useRef<Group>(null!);
  const phase = useRef(index * 1.7);
  useFrame(({ clock }, dt) => {
    const g = engine.guards[index]!;
    root.current.position.set(g.x, 0, g.y);
    root.current.rotation.y = dampAngle(root.current.rotation.y, g.yaw, dt * 8);
    if (engine.phase === 'PLAYING') phase.current += dt * 6;
    const sw = Math.sin(phase.current) * 0.7;
    legL.current.rotation.x = sw; legR.current.rotation.x = -sw;
    body.current.position.y = Math.abs(Math.sin(phase.current)) * 0.035;
    axe.current.rotation.x = -0.6 + (reduced ? 0 : Math.sin(clock.elapsedTime * 3 + index) * 0.08);
  });
  return (
    <group ref={root} scale={1.12}>
      <group ref={body}>
        {([[-0.09, legL], [0.09, legR]] as const).map(([x, ref]) => (
          <group key={x} ref={ref} position={[x, 0.34, 0]}>
            <mesh position={[0, -0.16, 0]} castShadow material={assets.armor}><boxGeometry args={[0.13, 0.32, 0.15]} /></mesh>
          </group>
        ))}
        <mesh position={[0, 0.53, 0]} castShadow material={assets.armor}><boxGeometry args={[0.36, 0.4, 0.24]} /></mesh>
        <mesh position={[0, 0.5, 0.125]} material={assets.armorTrim}><boxGeometry args={[0.18, 0.28, 0.02]} /></mesh>
        {[-1, 1].map((s) => <mesh key={s} position={[s * 0.24, 0.7, 0]} castShadow material={assets.armorTrim}><sphereGeometry args={[0.11, 8, 6]} /></mesh>)}
        <mesh position={[0, 0.83, 0]} castShadow material={assets.armor}><boxGeometry args={[0.22, 0.2, 0.22]} /></mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.13, 0.97, 0]} rotation={[0, 0, -s * 0.7]} castShadow material={assets.gold}><coneGeometry args={[0.035, 0.2, 5]} /></mesh>
        ))}
        <mesh position={[-0.05, 0.84, 0.112]} material={assets.eyeRed}><boxGeometry args={[0.05, 0.025, 0.01]} /></mesh>
        <mesh position={[0.05, 0.84, 0.112]} material={assets.eyeRed}><boxGeometry args={[0.05, 0.025, 0.01]} /></mesh>
        <sprite position={[0, 0.84, 0.16]} scale={[0.45, 0.45, 1]}>
          <spriteMaterial map={assets.glowRed} blending={AdditiveBlending} depthWrite={false} transparent opacity={0.55} />
        </sprite>
        {/* two-handed axe */}
        <group ref={axe} position={[0.26, 0.5, 0.1]}>
          <mesh position={[0, 0.1, 0.1]} rotation={[0.9, 0, 0]} castShadow material={assets.darkWood}><cylinderGeometry args={[0.02, 0.02, 0.62, 5]} /></mesh>
          <mesh position={[0.06, 0.3, 0.26]} rotation={[0.9, 0, 0]} castShadow material={assets.spike}><boxGeometry args={[0.16, 0.14, 0.03]} /></mesh>
        </group>
      </group>
    </group>
  );
}
