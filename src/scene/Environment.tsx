/**
 * The dungeon itself: floor, walls, torches, props, door, key shrine, exit portal, traps.
 * Everything is built from procedural geometry. Per-frame animation only READS the engine.
 */
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, InstancedMesh, Matrix4, Vector3, ConeGeometry, TorusGeometry, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type PointLight, type SpriteMaterial } from 'three';
import { rng } from './assets';
import { useScene } from './context';
import { trapHeight, trapOffset } from '../game/engine';
import type { LevelData, Prop } from '../game/levels';

const WALL_FULL = 1.9;     // top of a wall at rest
const WALL_LOW = 0.45;     // top of a wall that is cut away in front of the hero
const WALL_BOX = 2.4;
const ease = (t: number) => t * t * (3 - 2 * t);

// ── Floor ──────────────────────────────────────────────────────────────────────────────────
function Floor() {
  const { engine, assets } = useScene();
  const level = engine.level;
  const ref = useRef<InstancedMesh>(null!);
  const count = useMemo(() => level.walls.flat().filter((w) => !w).length, [level]);
  useLayoutEffect(() => {
    const m = new Matrix4(), c = new Color(), r = rng(level.index * 91 + 3);
    let i = 0;
    for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) {
      if (level.walls[y]![x]) continue;
      m.makeRotationY(Math.floor(r() * 4) * (Math.PI / 2)).setPosition(x + 0.5, -0.15, y + 0.5);
      ref.current.setMatrixAt(i, m);
      const v = 0.78 + r() * 0.38;
      ref.current.setColorAt(i, c.setRGB(v, v * (0.96 + r() * 0.06), v * (1 + r() * 0.1)));
      i++;
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [level]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} receiveShadow>
      <boxGeometry args={[1, 0.3, 1]} />
      <primitive object={assets.floor} attach="material" />
    </instancedMesh>
  );
}

// ── Walls (with cut-away) and wall torches ─────────────────────────────────────────────────
interface WallsProps { torchFrac: MutableRefObject<number[]> }
function Walls({ torchFrac }: WallsProps) {
  const { engine, assets } = useScene();
  const level = engine.level;
  const walls = useRef<InstancedMesh>(null!);
  const caps = useRef<InstancedMesh>(null!);
  const torchRefs = useRef<Array<Group | null>>([]);
  const cells = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    level.walls.forEach((row, y) => row.forEach((w, x) => { if (w) out.push({ x, y }); }));
    return out;
  }, [level]);
  const tops = useRef<Float32Array>(new Float32Array(0));
  const torchWall = useMemo(() => level.torches.map((t) => cells.findIndex((c) => c.x === t.x && c.y === t.y)), [level, cells]);
  const scratch = useMemo(() => new Matrix4(), []);

  useLayoutEffect(() => {
    tops.current = new Float32Array(cells.length).fill(WALL_FULL);
    const c = new Color(), r = rng(level.index * 17 + 5);
    cells.forEach((cell, i) => {
      walls.current.setMatrixAt(i, scratch.makeTranslation(cell.x + 0.5, WALL_FULL - WALL_BOX / 2, cell.y + 0.5));
      caps.current.setMatrixAt(i, scratch.makeTranslation(cell.x + 0.5, WALL_FULL + 0.08, cell.y + 0.5));
      const v = 0.78 + r() * 0.3;
      walls.current.setColorAt(i, c.setRGB(v, v * (0.97 + r() * 0.05), v * (1.02 + r() * 0.06)));
    });
    for (const m of [walls.current, caps.current]) m.instanceMatrix.needsUpdate = true;
    if (walls.current.instanceColor) walls.current.instanceColor.needsUpdate = true;
    torchFrac.current = level.torches.map(() => 1);
  }, [cells, level, scratch, torchFrac]);

  useFrame((_, dt) => {
    const p = engine.player;
    const k = Math.min(1, dt * 9);
    let dirty = false;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]!;
      // A wall hides the hero when it is between the (south-looking) camera and the hero: just south of them.
      const dy = c.y + 0.5 - p.y;
      const occluding = dy > 0.2 && dy < 2.4 && Math.abs(c.x + 0.5 - p.x) < 2.4;
      const target = occluding ? WALL_LOW : WALL_FULL;
      const cur = tops.current[i]!;
      if (Math.abs(cur - target) < 0.002) continue;
      const next = cur + (target - cur) * k;
      tops.current[i] = next;
      walls.current.setMatrixAt(i, scratch.makeTranslation(c.x + 0.5, next - WALL_BOX / 2, c.y + 0.5));
      caps.current.setMatrixAt(i, scratch.makeTranslation(c.x + 0.5, next + 0.08, c.y + 0.5));
      dirty = true;
    }
    if (dirty) { walls.current.instanceMatrix.needsUpdate = true; caps.current.instanceMatrix.needsUpdate = true; }
    // Torches ride down with their wall and dim as it sinks.
    level.torches.forEach((_, i) => {
      const w = torchWall[i]!;
      const top = w >= 0 ? tops.current[w]! : WALL_FULL;
      torchFrac.current[i] = (top - WALL_LOW) / (WALL_FULL - WALL_LOW);
      const g = torchRefs.current[i];
      if (g) g.position.y = 1.3 - (WALL_FULL - top);
    });
  });

  return (
    <>
      <instancedMesh ref={walls} args={[undefined, undefined, cells.length]} castShadow receiveShadow>
        <boxGeometry args={[1, WALL_BOX, 1]} />
        <primitive object={assets.wall} attach="material" />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, cells.length]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.16, 1.1]} />
        <primitive object={assets.wallCap} attach="material" />
      </instancedMesh>
      {level.torches.map((t, i) => (
        <group key={`${t.x},${t.y}`} ref={(g) => { torchRefs.current[i] = g; }} position={[t.x + 0.5, 1.3, t.y + 1.04]}>
          <mesh position={[0, -0.12, -0.02]} material={assets.iron}><boxGeometry args={[0.1, 0.34, 0.06]} /></mesh>
          <mesh position={[0, 0.0, 0.05]} rotation={[0.25, 0, 0]} material={assets.darkWood}><cylinderGeometry args={[0.035, 0.045, 0.34, 6]} /></mesh>
          <Flame y={0.2} z={0.09} scale={0.7} seed={i * 3.1} />
        </group>
      ))}
    </>
  );
}

// ── Flames (shared by torches and braziers) ────────────────────────────────────────────────
function Flame({ y = 0, z = 0, scale = 1, seed = 0 }: { y?: number; z?: number; scale?: number; seed?: number }) {
  const { assets, reduced } = useScene();
  const body = useRef<Mesh>(null!);
  const core = useRef<Mesh>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const f = reduced ? 1 : 1 + Math.sin(t * 17) * 0.1 + Math.sin(t * 29.3) * 0.06;
    body.current.scale.set(1 / f * 0.9 + 0.1, f, 1 / f * 0.9 + 0.1);
    core.current.scale.set(1, f * 1.05, 1);
  });
  return (
    <group position={[0, y, z]} scale={scale}>
      <mesh ref={body} position={[0, 0.13, 0]} material={assets.flame}><coneGeometry args={[0.12, 0.34, 7]} /></mesh>
      <mesh ref={core} position={[0, 0.08, 0]} material={assets.flameCore}><coneGeometry args={[0.06, 0.2, 6]} /></mesh>
      <sprite position={[0, 0.14, 0.02]} scale={[1.15, 1.15, 1]}>
        <spriteMaterial map={assets.glow} blending={AdditiveBlending} depthWrite={false} transparent opacity={0.65} />
      </sprite>
    </group>
  );
}

// ── Light pool: a fixed number of real point lights that follow the hero ───────────────────
// Levels are long, so the 6 lights are re-assigned to the flame sources nearest the hero. A light never jumps: it fades
// out at its old source and fades in at the new one, and the total light count stays constant (no shader recompiles).
const POOL = 6;
interface Src { x: number; y: number; z: number; torch: number }
function FlameLights({ torchFrac }: { torchFrac: MutableRefObject<number[]> }) {
  const { engine, reduced } = useScene();
  const level = engine.level;
  const lights = useRef<Array<PointLight | null>>([]);
  const sources = useMemo<Src[]>(() => [
    ...level.props.filter((p) => p.kind === 'brazier').map((p) => ({ x: p.x + 0.5, y: 1.0, z: p.y + 0.5, torch: -1 })),
    ...level.torches.map((t, i) => ({ x: t.x + 0.5, y: 1.45, z: t.y + 1.3, torch: i })),
  ], [level]);
  const state = useRef(Array.from({ length: POOL }, () => ({ src: -1, k: 0 })));

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, p = engine.player;
    const nearest = sources.map((s, i) => ({ i, d: (s.x - p.x) ** 2 + (s.z - p.y) ** 2 })).sort((a, b) => a.d - b.d).slice(0, POOL).map((n) => n.i);
    const wanted = new Set(nearest);
    const held = new Set(state.current.filter((s) => s.src >= 0).map((s) => s.src));
    for (let i = 0; i < POOL; i++) {
      const st = state.current[i]!, l = lights.current[i];
      if (!l) continue;
      const keep = st.src >= 0 && wanted.has(st.src);
      st.k += ((keep ? 1 : 0) - st.k) * Math.min(1, dt * 4);
      if (!keep && st.k < 0.03) {                       // faded out: take over the nearest source nobody holds
        const free = nearest.find((n) => !held.has(n));
        if (st.src >= 0) held.delete(st.src);
        st.src = free ?? -1;
        if (free !== undefined) { held.add(free); const s = sources[free]!; l.position.set(s.x, s.y, s.z); }
      }
      const src = st.src >= 0 ? sources[st.src] : undefined;
      if (!src) { l.intensity = 0; continue; }
      const frac = src.torch >= 0 ? 0.3 + 0.7 * (torchFrac.current[src.torch] ?? 1) : 1;
      const flick = reduced ? 1 : 1 + Math.sin(t * 13 + i * 2.1) * 0.07 + Math.sin(t * 31 + i) * 0.05;
      l.intensity = 20 * flick * frac * st.k;
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <pointLight key={i} ref={(l) => { lights.current[i] = l; }} color="#ff9a48" distance={11} decay={1.7} position={[0, -20, 0]} intensity={0} />
      ))}
    </>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────────────────
function PropMesh({ p, seed }: { p: Prop; seed: number }) {
  const { assets } = useScene();
  const r = useMemo(() => rng(seed), [seed]);
  const rot = useMemo(() => r() * Math.PI * 2, [r]);
  const broken = useMemo(() => r() < 0.5, [r]);
  const at: [number, number, number] = [p.x + 0.5, 0, p.y + 0.5];
  switch (p.kind) {
    case 'barrel':
      return (
        <group position={at} rotation-y={rot}>
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow material={assets.darkWood}><cylinderGeometry args={[0.27, 0.23, 0.6, 10]} /></mesh>
          <mesh position={[0, 0.16, 0]} material={assets.iron}><cylinderGeometry args={[0.262, 0.245, 0.04, 10]} /></mesh>
          <mesh position={[0, 0.46, 0]} material={assets.iron}><cylinderGeometry args={[0.272, 0.262, 0.04, 10]} /></mesh>
          <mesh position={[0, 0.605, 0]} material={assets.wood}><cylinderGeometry args={[0.22, 0.22, 0.02, 10]} /></mesh>
        </group>
      );
    case 'crate':
      return (
        <group position={at} rotation-y={rot * 0.15}>
          <mesh position={[0, 0.3, 0]} castShadow receiveShadow material={assets.wood}><boxGeometry args={[0.62, 0.6, 0.62]} /></mesh>
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.3, 0.3, 0]} material={assets.darkWood}><boxGeometry args={[0.05, 0.62, 0.64]} /></mesh>
              <mesh position={[0, 0.3, s * 0.3]} material={assets.darkWood}><boxGeometry args={[0.64, 0.62, 0.05]} /></mesh>
            </group>
          ))}
          <mesh position={[0.1, 0.66, -0.05]} rotation-y={0.4} castShadow material={assets.wood}><boxGeometry args={[0.34, 0.14, 0.34]} /></mesh>
        </group>
      );
    case 'pillar':
      return (
        <group position={at}>
          <mesh position={[0, 0.1, 0]} castShadow receiveShadow material={assets.stone}><boxGeometry args={[0.82, 0.2, 0.82]} /></mesh>
          <mesh position={[0, broken ? 0.7 : 1.1, 0]} castShadow receiveShadow material={assets.stone}><cylinderGeometry args={[0.29, 0.33, broken ? 1.0 : 1.8, 10]} /></mesh>
          {!broken && <mesh position={[0, 2.05, 0]} castShadow material={assets.stone}><boxGeometry args={[0.8, 0.2, 0.8]} /></mesh>}
          {broken && <mesh position={[0.1, 1.22, 0.02]} rotation={[0.4, 0.6, 0.2]} castShadow material={assets.stone}><dodecahedronGeometry args={[0.24, 0]} /></mesh>}
          <mesh position={[0, 0.5, 0]} material={assets.iron}><cylinderGeometry args={[0.335, 0.335, 0.04, 10]} /></mesh>
        </group>
      );
    case 'statue':
      return (
        <group position={at} rotation-y={rot}>
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow material={assets.stone}><boxGeometry args={[0.72, 0.4, 0.72]} /></mesh>
          <mesh position={[0, 0.78, 0]} rotation={[0.08, 0, 0.1]} castShadow material={assets.stone}><cylinderGeometry args={[0.17, 0.24, 0.74, 8]} /></mesh>
          <mesh position={[0, 1.2, 0]} rotation={[0, 0, 0.1]} castShadow material={assets.stone}><boxGeometry args={[0.5, 0.12, 0.2]} /></mesh>
          <mesh position={[0.34, 0.1, 0.38]} castShadow material={assets.stone}><sphereGeometry args={[0.13, 8, 6]} /></mesh>
          <mesh position={[-0.12, 0.43, 0.3]} rotation={[0.5, 0.4, 0.3]} castShadow material={assets.stone}><dodecahedronGeometry args={[0.1, 0]} /></mesh>
        </group>
      );
    case 'brazier':
      return (
        <group position={at}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[Math.cos((i / 3) * 6.283) * 0.16, 0.28, Math.sin((i / 3) * 6.283) * 0.16]}
              rotation={[Math.sin((i / 3) * 6.283) * 0.3, 0, -Math.cos((i / 3) * 6.283) * 0.3]} castShadow material={assets.iron}>
              <cylinderGeometry args={[0.025, 0.03, 0.56, 5]} />
            </mesh>
          ))}
          <mesh position={[0, 0.6, 0]} castShadow material={assets.iron}><cylinderGeometry args={[0.3, 0.17, 0.2, 10, 1, true]} /></mesh>
          <mesh position={[0, 0.55, 0]} material={assets.iron}><cylinderGeometry args={[0.17, 0.17, 0.02, 10]} /></mesh>
          <mesh position={[0, 0.63, 0]} material={assets.rune}><cylinderGeometry args={[0.27, 0.27, 0.02, 10]} /></mesh>
          <Flame y={0.62} scale={1.7} seed={p.x * 1.7 + p.y} />
        </group>
      );
  }
}

// ── Rubble and chains: cheap instanced dressing so walls and floors do not look bare ───────
function Rubble() {
  const { engine, assets } = useScene();
  const level = engine.level;
  const ref = useRef<InstancedMesh>(null!);
  const spots = useMemo(() => {
    const r = rng(level.index * 53 + 9), out: { x: number; z: number; s: number; ry: number }[] = [];
    const near = (x: number, y: number, p: { x: number; y: number }) => Math.abs(x - p.x) <= 1 && Math.abs(y - p.y) <= 1;
    for (let y = 1; y < level.height - 1; y++) for (let x = 1; x < level.width - 1; x++) {
      if (level.solid[y]![x] || level.traps.some((t) => t.x === x && t.y === y)) continue;
      if ([level.start, level.exit, ...level.keys, ...level.doors].some((p) => near(x, y, p))) continue;
      const wallAdj = level.solid[y - 1]![x] || level.solid[y + 1]![x] || level.solid[y]![x - 1] || level.solid[y]![x + 1];
      if (wallAdj && r() < 0.22) for (let k = 0; k < 2; k++) out.push({ x: x + 0.15 + r() * 0.7, z: y + 0.15 + r() * 0.7, s: 0.05 + r() * 0.09, ry: r() * 6 });
    }
    return out;
  }, [level]);
  useLayoutEffect(() => {
    const m = new Matrix4(), v = new Vector3();
    spots.forEach((s, i) => ref.current.setMatrixAt(i, m.makeRotationY(s.ry).scale(v.set(s.s, s.s * 0.7, s.s)).setPosition(s.x, s.s * 0.4, s.z)));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <primitive object={assets.stone} attach="material" />
    </instancedMesh>
  );
}

function Chains() {
  const { engine, assets } = useScene();
  const level = engine.level;
  const ref = useRef<InstancedMesh>(null!);
  const LINKS = 7;
  const link = useMemo(() => new TorusGeometry(0.035, 0.012, 5, 8), []);
  useLayoutEffect(() => () => link.dispose(), [link]);
  const strands = useMemo(() => {
    const r = rng(level.index * 29 + 1), cand: { x: number; y: number }[] = [];
    for (let y = 0; y < level.height - 1; y++) for (let x = 1; x < level.width - 1; x++)
      if (level.walls[y]![x] && !level.walls[y + 1]![x] && level.rows[y + 1]![x] !== 'D') cand.push({ x, y });
    return Array.from({ length: Math.min(4, cand.length) }, () => { const c = cand.splice(Math.floor(r() * cand.length), 1)[0]!; return { x: c.x + 0.25 + r() * 0.5, y: c.y + 1.03 }; });
  }, [level]);
  useLayoutEffect(() => {
    const m = new Matrix4(), q = new Matrix4();
    strands.forEach((s, si) => { for (let i = 0; i < LINKS; i++) {
      m.makeRotationY(i % 2 ? Math.PI / 2 : 0);
      q.makeTranslation(s.x, WALL_FULL - 0.12 - i * 0.07, s.y);
      ref.current.setMatrixAt(si * LINKS + i, q.multiply(m));
    } });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [strands]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, strands.length * LINKS]} castShadow>
      <primitive object={link} attach="geometry" />
      <primitive object={assets.iron} attach="material" />
    </instancedMesh>
  );
}

// ── Key shrine ─────────────────────────────────────────────────────────────────────────────
function Shrine({ index }: { index: number }) {
  const { engine, assets, reduced } = useScene();
  const key = engine.level.keys[index]!;
  const keyRef = useRef<Group>(null!);
  const crystals = useRef<Array<Mesh | null>>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const there = !engine.keyTaken[index];
    keyRef.current.visible = there;
    if (there) {
      keyRef.current.rotation.y = reduced ? 0.6 : t * 1.4;
      keyRef.current.position.y = 0.95 + (reduced ? 0 : Math.sin(t * 2) * 0.06);
    }
    crystals.current.forEach((c, i) => { if (c) c.scale.setScalar(there ? 1 + (reduced ? 0 : Math.sin(t * 2 + i) * 0.08) : 0.55); });
  });
  return (
    <group position={[key.x + 0.5, 0, key.y + 0.5]}>
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow material={assets.stone}><cylinderGeometry args={[0.46, 0.5, 0.12, 10]} /></mesh>
      <mesh position={[0, 0.34, 0]} receiveShadow castShadow material={assets.stone}><cylinderGeometry args={[0.24, 0.32, 0.44, 8]} /></mesh>
      <mesh position={[0, 0.58, 0]} castShadow material={assets.gold}><cylinderGeometry args={[0.31, 0.27, 0.06, 10]} /></mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(m) => { crystals.current[i] = m; }} position={[Math.cos((i / 4) * 6.283 + 0.4) * 0.42, 0.26, Math.sin((i / 4) * 6.283 + 0.4) * 0.42]}
          rotation={[0.2 * (i - 1.5), i, 0.15]} material={assets.crystal}>
          <octahedronGeometry args={[0.09, 0]} />
        </mesh>
      ))}
      <group ref={keyRef} position={[0, 0.95, 0]}>
        <mesh position={[0, 0.1, 0]} material={assets.gold}><torusGeometry args={[0.1, 0.03, 8, 14]} /></mesh>
        <mesh position={[0, -0.12, 0]} material={assets.gold}><boxGeometry args={[0.045, 0.34, 0.045]} /></mesh>
        <mesh position={[0.06, -0.2, 0]} material={assets.gold}><boxGeometry args={[0.1, 0.045, 0.045]} /></mesh>
        <mesh position={[0.06, -0.1, 0]} material={assets.gold}><boxGeometry args={[0.1, 0.045, 0.045]} /></mesh>
        <sprite scale={[1.7, 1.7, 1]}><spriteMaterial map={assets.glowGold} blending={AdditiveBlending} depthWrite={false} transparent opacity={0.85} /></sprite>
      </group>
    </group>
  );
}

// ── Sealed door ────────────────────────────────────────────────────────────────────────────
function Door({ index }: { index: number }) {
  const { engine, assets, reduced } = useScene();
  const door = engine.level.doors[index]!;
  const open = useRef(engine.doorOpen[index] ? 1 : 0);
  const left = useRef<Group>(null!);
  const right = useRef<Group>(null!);
  const lock = useRef<Group>(null!);
  const ring = useRef<Mesh>(null!);
  const ringMat = useRef<MeshStandardMaterial>(null!);
  const sigil = useRef<Group>(null!);
  const sigilMat = useRef<MeshBasicMaterial>(null!);
  const glowMat = useRef<SpriteMaterial>(null!);
  const tint = useMemo(() => new Color(), []);
  const arch = useMemo(() => new TorusGeometry(0.5, 0.045, 6, 18, Math.PI), []);
  useLayoutEffect(() => () => arch.dispose(), [arch]);
  useFrame(({ clock }, dt) => {
    const isOpen = engine.doorOpen[index]!, hasKey = engine.keyTaken[index]!;
    const want = isOpen ? 1 : 0;
    open.current += Math.sign(want - open.current) * Math.min(Math.abs(want - open.current), dt / 1.2);
    const e = ease(open.current);
    left.current.rotation.y = e * 1.75;
    right.current.rotation.y = -e * 1.75;
    const t = clock.elapsedTime;
    const m = ringMat.current;
    if (isOpen) { m.color.set('#4fae83'); m.emissive.set('#2fe0a0'); m.emissiveIntensity = 1.6 * (1 - e); lock.current.scale.setScalar(Math.max(0.001, 1 - e * 1.4)); }
    else if (hasKey) { m.color.set('#f5cf73'); m.emissive.set('#ffb23a'); m.emissiveIntensity = reduced ? 2.2 : 1.8 + Math.sin(t * 5) * 0.8; }
    else { m.color.set('#d94a4a'); m.emissive.set('#ff2a1a'); m.emissiveIntensity = reduced ? 1.6 : 1.3 + Math.sin(t * 2.4) * 0.5; }
    ring.current.rotation.z = reduced ? 0 : t * 0.4;
    // Readability beacon: the door's state is also shown on the floor and as a glow, because the camera sees the door side-on.
    const pulse = reduced ? 1 : 0.75 + Math.sin(t * (hasKey && !isOpen ? 4.5 : 2.2)) * 0.25;
    const fade = isOpen ? Math.max(0, 1 - e * 1.2) : 1;
    tint.set(isOpen ? '#2fe0a0' : hasKey ? '#ffb23a' : '#ff3a2a');
    sigilMat.current.color.copy(tint); sigilMat.current.opacity = 0.85 * pulse * fade;
    glowMat.current.color.copy(tint); glowMat.current.opacity = 0.55 * pulse * fade;
    sigil.current.rotation.y = reduced ? 0 : t * 0.25;
  });
  return (
    <group position={[door.x + 0.5, 0, door.y + 0.5]}>
      {/* lintel closing the gap above the door and a gilded arch */}
      <mesh position={[0, 1.62, 0]} castShadow receiveShadow material={assets.wall}><boxGeometry args={[1, 0.6, 1]} /></mesh>
      <mesh position={[0, 1.93, 0]} castShadow material={assets.wallCap}><boxGeometry args={[1.1, 0.16, 1.1]} /></mesh>
      <mesh position={[0, 1.3, 0]} rotation={[0, Math.PI / 2, 0]} material={assets.gold} geometry={arch} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.65, s * 0.5]} castShadow material={assets.stone}><boxGeometry args={[0.34, 1.3, 0.1]} /></mesh>
      ))}
      {/* leaves hinged at the jambs */}
      {[{ ref: left, z: -0.45, dir: 1 }, { ref: right, z: 0.45, dir: -1 }].map(({ ref: r, z, dir }) => (
        <group key={z} ref={r} position={[0, 0, z]}>
          <mesh position={[0, 0.66, dir * 0.23]} castShadow receiveShadow material={assets.darkWood}><boxGeometry args={[0.1, 1.3, 0.46]} /></mesh>
          {[0.28, 0.66, 1.04].map((y) => (
            <mesh key={y} position={[-0.06, y, dir * 0.23]} material={assets.iron}><boxGeometry args={[0.03, 0.09, 0.46]} /></mesh>
          ))}
          <mesh position={[-0.07, 0.66, dir * 0.4]} material={assets.gold}><sphereGeometry args={[0.035, 8, 6]} /></mesh>
        </group>
      ))}
      {/* floor sigil + beacon: readable from the camera even though the door itself is seen edge-on */}
      <group position={[-0.5, 0.035, 0]}>
        <group ref={sigil}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.7, 0.78, 40]} /><meshBasicMaterial ref={sigilMat} transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} /></mesh>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} position={[Math.cos((i / 8) * 6.283) * 0.58, 0, Math.sin((i / 8) * 6.283) * 0.58]} rotation={[-Math.PI / 2, 0, -(i / 8) * 6.283]}>
              <planeGeometry args={[0.16, 0.035]} /><meshBasicMaterial color="#fff" transparent opacity={0.45} depthWrite={false} blending={AdditiveBlending} />
            </mesh>
          ))}
        </group>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.38, 0.4, 32]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.22} depthWrite={false} blending={AdditiveBlending} side={DoubleSide} /></mesh>
      </group>
      <sprite position={[-0.2, 0.9, 0]} scale={[2.6, 2.6, 1]}><spriteMaterial ref={glowMat} map={assets.dust} transparent depthWrite={false} blending={AdditiveBlending} /></sprite>
      {/* the lock: padlock inside a runed ring on the player's side */}
      <group ref={lock} position={[-0.12, 0.7, 0]}>
        <mesh ref={ring} rotation={[0, -Math.PI / 2, 0]}>
          <torusGeometry args={[0.2, 0.035, 8, 22]} />
          <meshStandardMaterial ref={ringMat} color="#d94a4a" emissive="#ff2a1a" emissiveIntensity={1.4} roughness={0.4} />
        </mesh>
        <mesh position={[-0.02, -0.02, 0]} material={assets.gold} castShadow><boxGeometry args={[0.07, 0.17, 0.15]} /></mesh>
        <mesh position={[-0.02, 0.1, 0]} rotation={[0, -Math.PI / 2, 0]} material={assets.gold}><torusGeometry args={[0.05, 0.015, 6, 10, Math.PI]} /></mesh>
        <mesh position={[-0.065, -0.02, 0]} material={assets.iron}><boxGeometry args={[0.01, 0.05, 0.015]} /></mesh>
      </group>
    </group>
  );
}

// ── Exit portal ────────────────────────────────────────────────────────────────────────────
function Portal() {
  const { engine, assets, reduced } = useScene();
  const { exit } = engine.level;
  const act = useRef(engine.allOpen ? 1 : 0);
  const disc = useRef<Mesh>(null!);
  const runeRing = useRef<Mesh>(null!);
  const glow = useRef<Mesh>(null!);
  useMemo(() => { assets.swirl.center.set(0.5, 0.5); }, [assets]);
  useFrame(({ clock }, dt) => {
    const want = engine.allOpen ? 1 : 0;
    act.current += Math.sign(want - act.current) * Math.min(Math.abs(want - act.current), dt / 1.5);
    const a = ease(act.current), t = clock.elapsedTime;
    assets.swirl.rotation = reduced ? 0 : -t * 0.9;
    (disc.current.material as { opacity: number }).opacity = 0.12 + 0.88 * a;
    (runeRing.current.material as MeshStandardMaterial).emissiveIntensity = 0.15 + 1.9 * a;
    (glow.current.material as { opacity: number }).opacity = 0.05 + 0.5 * a;
  });
  return (
    <group position={[exit.x + 0.5, 0, exit.y + 0.5]}>
      <mesh ref={runeRing} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[0.36, 0.5, 28]} />
        <meshStandardMaterial color="#1d3d31" emissive="#2fe0a0" emissiveIntensity={0.15} side={DoubleSide} roughness={0.5} />
      </mesh>
      <group position={[0.4, 0.82, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh material={assets.stone} castShadow><torusGeometry args={[0.62, 0.1, 8, 24]} /></mesh>
        <mesh ref={disc}><circleGeometry args={[0.58, 28]} /><meshBasicMaterial map={assets.swirl} transparent opacity={0.12} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} /></mesh>
        <mesh ref={glow} position={[0, 0, 0.02]}><circleGeometry args={[1.0, 24]} /><meshBasicMaterial map={assets.glowGreen} transparent opacity={0.05} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} /></mesh>
      </group>
    </group>
  );
}

// ── Spike traps ────────────────────────────────────────────────────────────────────────────
function Traps() {
  const { engine, assets } = useScene();
  const level = engine.level;
  const spikes = useRef<Array<Group | null>>([]);
  const plates = useRef<Array<MeshStandardMaterial | null>>([]);
  const geo = useMemo(() => new ConeGeometry(0.055, 0.5, 6).translate(0, 0.25, 0), []);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  const grid = useMemo(() => [[0, 0], [-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]] as const, []);
  useFrame(() => {
    level.traps.forEach((_, i) => {
      const h = trapHeight(engine.time, trapOffset(i));
      const g = spikes.current[i];
      if (g) g.scale.y = Math.max(0.03, h);
      const m = plates.current[i];
      if (m) m.emissiveIntensity = h > 0 && h < 0.7 ? 1.4 : h >= 0.7 ? 0.5 : 0.1;
    });
  });
  return (
    <>
      {level.traps.map((t, i) => (
        <group key={`${t.x},${t.y}`} position={[t.x + 0.5, 0, t.y + 0.5]}>
          <mesh position={[0, 0.015, 0]} receiveShadow>
            <boxGeometry args={[0.94, 0.03, 0.94]} />
            <meshStandardMaterial ref={(m) => { plates.current[i] = m; }} color="#25232d" emissive="#ff2a1a" emissiveIntensity={0.1} roughness={0.5} metalness={0.7} />
          </mesh>
          <group ref={(g) => { spikes.current[i] = g; }}>
            {grid.map(([x, z], k) => <mesh key={k} geometry={geo} material={assets.spike} position={[x, 0.03, z]} castShadow />)}
          </group>
        </group>
      ))}
    </>
  );
}

// ── Objective beacon: ONE light that glides to whatever the player should do next ──────────
function Beacon() {
  const { engine, reduced } = useScene();
  const light = useRef<PointLight>(null!);
  const pos = useRef(new Vector3(engine.level.start.x + 0.5, 1, engine.level.start.y + 0.5));
  const goal = useMemo(() => new Vector3(), []);
  const col = useMemo(() => new Color('#ffd27a'), []);
  const want = useMemo(() => new Color(), []);
  useFrame(({ clock }, dt) => {
    const { level } = engine, n = engine.nextDoor;
    if (n < 0) { goal.set(level.exit.x + 0.1, 1.0, level.exit.y + 0.5); want.set('#5fffc0'); }          // portal
    else if (!engine.keyTaken[n]) { const k = level.keys[n]!; goal.set(k.x + 0.5, 1.2, k.y + 0.5); want.set('#ffd27a'); }   // key
    else { const d = level.doors[n]!; goal.set(d.x - 0.2, 1.1, d.y + 0.5); want.set('#ffb23a'); }       // door
    const k = 1 - Math.exp(-2.5 * dt);
    pos.current.lerp(goal, k); col.lerp(want, k);
    light.current.position.copy(pos.current);
    light.current.color.copy(col);
    light.current.intensity = 9 + (reduced ? 0 : Math.sin(clock.elapsedTime * 3) * 1.5);
  });
  return <pointLight ref={light} distance={7.5} decay={1.6} intensity={9} />;
}

// ── Composition ────────────────────────────────────────────────────────────────────────────
export default function Environment() {
  const { engine } = useScene();
  const level: LevelData = engine.level;
  const torchFrac = useRef<number[]>([]);
  return (
    <>
      <Floor />
      <Walls torchFrac={torchFrac} />
      <FlameLights torchFrac={torchFrac} />
      {level.props.map((p, i) => <PropMesh key={`${p.x},${p.y}`} p={p} seed={level.index * 1000 + i} />)}
      <Rubble />
      <Chains />
      {level.keys.map((_, i) => <Shrine key={`k${i}`} index={i} />)}
      {level.doors.map((_, i) => <Door key={`d${i}`} index={i} />)}
      <Portal />
      <Beacon />
      <Traps />
    </>
  );
}
