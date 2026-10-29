import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, type Points } from 'three';
import { rng } from './assets';
import { useScene } from './context';

const SPAN_X = 26, SPAN_Z = 20, TOP = 2.6;
const wrap = (v: number, span: number) => ((v % span) + span) % span;

/**
 * Floating dust motes: a fixed-size set (never grows). Each mote has a fixed world position that is wrapped into a window
 * around the hero, so the whole dungeon feels dusty while only ~100 particles ever exist. Static under reduced motion.
 */
export function Dust() {
  const { engine, assets, reduced, high } = useScene();
  const count = high ? 170 : 80;
  const ref = useRef<Points>(null!);
  const seed = useMemo(() => {
    const r = rng(engine.level.index * 7 + 2), a = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { a[i * 4] = r() * 1000; a[i * 4 + 1] = r() * TOP; a[i * 4 + 2] = r() * 1000; a[i * 4 + 3] = 0.15 + r() * 0.35; }
    return a;
  }, [count, engine.level.index]);
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  useLayoutEffect(() => { ref.current.geometry.setAttribute('position', new BufferAttribute(positions, 3)); }, [positions]);

  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime, p = engine.player;
    for (let i = 0; i < count; i++) {
      const sp = seed[i * 4 + 3]!;
      positions[i * 3] = p.x - SPAN_X / 2 + wrap(seed[i * 4]! + Math.sin(t * 0.3 * sp + i) * 0.35 - (p.x - SPAN_X / 2), SPAN_X);
      positions[i * 3 + 1] = wrap(seed[i * 4 + 1]! + t * sp * 0.25, TOP);
      positions[i * 3 + 2] = p.y - SPAN_Z / 2 + wrap(seed[i * 4 + 2]! + Math.cos(t * 0.27 * sp + i * 1.3) * 0.3 - (p.y - SPAN_Z / 2), SPAN_Z);
    }
    ref.current.geometry.attributes.position!.needsUpdate = true;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry />
      <pointsMaterial map={assets.dust} size={0.1} sizeAttenuation transparent opacity={0.45} depthWrite={false} blending={AdditiveBlending} color="#ffe2b8" />
    </points>
  );
}
