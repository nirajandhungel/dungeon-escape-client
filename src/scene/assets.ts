/**
 * Procedural textures and shared materials. Everything is drawn at runtime on <canvas> — there are no
 * image files, so nothing can fail to load and nothing is licensed. One `Assets` object is created per
 * mounted scene and `dispose()`d on unmount (GPU memory is released explicitly).
 */
import {
  CanvasTexture, Color, MeshBasicMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, AdditiveBlending,
  type Material, type Texture,
} from 'three';

import { rng } from '../game/rng';
export { rng };

const canvas = (size: number) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
};

function grain(g: CanvasRenderingContext2D, size: number, rand: () => number, count: number, spread: number) {
  for (let i = 0; i < count; i++) {
    const l = rand() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${l},${l},${l},${rand() * spread})`;
    const s = 1 + rand() * 2;
    g.fillRect(rand() * size, rand() * size, s, s);
  }
}
function blotches(g: CanvasRenderingContext2D, size: number, rand: () => number, n: number, dark: boolean) {
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, r = 14 + rand() * 46;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const c = dark ? '0,0,0' : '255,255,255';
    grd.addColorStop(0, `rgba(${c},${0.06 + rand() * 0.1})`);
    grd.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function cracks(g: CanvasRenderingContext2D, size: number, rand: () => number, n: number) {
  g.strokeStyle = 'rgba(8,6,12,0.55)';
  g.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    let x = rand() * size, y = rand() * size;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rand() - 0.5) * 34; y += (rand() - 0.5) * 34; g.lineTo(x, y); }
    g.stroke();
  }
}

/** Flagstone: a bevelled slab with chips and cracks. Returns [colour map, bump map]. */
function flagstone(): [HTMLCanvasElement, HTMLCanvasElement] {
  const S = 256, rand = rng(11);
  const [c, g] = canvas(S);
  g.fillStyle = '#7d7a88'; g.fillRect(0, 0, S, S);
  blotches(g, S, rand, 14, true); blotches(g, S, rand, 10, false);
  grain(g, S, rand, 5200, 0.16);
  cracks(g, S, rand, 3);
  g.strokeStyle = 'rgba(10,8,16,0.6)'; g.lineWidth = 6; g.strokeRect(0, 0, S, S);   // mortar joint
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2; g.strokeRect(6, 6, S - 12, S - 12);  // chiselled edge

  const [b, bg] = canvas(S);
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, S, S);
  grain(bg, S, rand, 4000, 0.5);
  bg.strokeStyle = '#000'; bg.lineWidth = 9; bg.strokeRect(0, 0, S, S);
  return [c, b];
}

/** Masonry: three offset courses of blocks. */
function masonry(): [HTMLCanvasElement, HTMLCanvasElement] {
  const S = 256, rand = rng(23);
  const [c, g] = canvas(S);
  const [b, bg] = canvas(S);
  g.fillStyle = '#1a1722'; g.fillRect(0, 0, S, S);
  bg.fillStyle = '#000'; bg.fillRect(0, 0, S, S);
  const rows = 4, h = S / rows;
  for (let r = 0; r < rows; r++) {
    const bricks = r % 2 ? 3 : 2;
    const w = S / bricks;
    const off = r % 2 ? -w / 2 : 0;
    for (let i = -1; i <= bricks; i++) {
      const x = off + i * w + 3, y = r * h + 3;
      const shade = 96 + rand() * 38;
      g.fillStyle = `rgb(${shade + 8},${shade + 4},${shade + 20})`;
      g.fillRect(x, y, w - 6, h - 6);
      bg.fillStyle = `rgb(${130 + rand() * 60},${130 + rand() * 60},${130 + rand() * 60})`;
      bg.fillRect(x, y, w - 6, h - 6);
      g.fillStyle = 'rgba(255,255,255,0.09)'; g.fillRect(x, y, w - 6, 3);             // lit top edge
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h - 9, w - 6, 3);          // shadowed bottom edge
    }
  }
  blotches(g, S, rand, 16, true);
  grain(g, S, rand, 6000, 0.18);
  cracks(g, S, rand, 2);
  return [c, b];
}

function planks(): HTMLCanvasElement {
  const S = 128, rand = rng(5);
  const [c, g] = canvas(S);
  const n = 4, w = S / n;
  for (let i = 0; i < n; i++) {
    const l = 88 + rand() * 30;
    g.fillStyle = `rgb(${l + 34},${l + 8},${l - 28})`; g.fillRect(i * w, 0, w, S);
    g.strokeStyle = 'rgba(30,14,4,0.55)'; g.lineWidth = 1;
    for (let k = 0; k < 9; k++) { const x = i * w + rand() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rand() - 0.5) * 6, S); g.stroke(); }
    g.fillStyle = 'rgba(8,4,0,0.8)'; g.fillRect(i * w, 0, 2, S);
  }
  grain(g, S, rand, 900, 0.14);
  return c;
}

function radial(inner: string, size = 128): HTMLCanvasElement {
  const [c, g] = canvas(size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.35)')); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return c;
}

function swirl(): HTMLCanvasElement {
  const S = 256, [c, g] = canvas(S);
  const rand = rng(77);
  g.fillStyle = '#021a12'; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  for (let arm = 0; arm < 5; arm++) {
    g.save(); g.rotate((arm / 5) * Math.PI * 2);
    for (let i = 0; i < 90; i++) {
      const t = i / 90, r = 8 + t * 118, a = t * 2.6;
      g.fillStyle = `rgba(${90 + rand() * 80},255,${180 + rand() * 60},${0.85 * (1 - t)})`;
      g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 2 + (1 - t) * 7, 0, 7); g.fill();
    }
    g.restore();
  }
  return c;
}

const tex = (c: HTMLCanvasElement, repeat = false, srgb = true): CanvasTexture => {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
};

export interface Assets {
  glow: Texture; glowGold: Texture; glowGreen: Texture; glowRed: Texture; dust: Texture; swirl: Texture;
  floor: MeshStandardMaterial; wall: MeshStandardMaterial; wallCap: MeshStandardMaterial; stone: MeshStandardMaterial;
  wood: MeshStandardMaterial; darkWood: MeshStandardMaterial; iron: MeshStandardMaterial; gold: MeshStandardMaterial;
  cloth: MeshStandardMaterial; clothDark: MeshStandardMaterial; cape: MeshStandardMaterial; skin: MeshStandardMaterial;
  leather: MeshStandardMaterial; armor: MeshStandardMaterial; armorTrim: MeshStandardMaterial; crystal: MeshStandardMaterial;
  eye: MeshBasicMaterial; eyeRed: MeshBasicMaterial; flame: MeshBasicMaterial; flameCore: MeshBasicMaterial;
  rune: MeshStandardMaterial; spike: MeshStandardMaterial;
  dispose(): void;
}

export function createAssets(): Assets {
  const [floorC, floorB] = flagstone();
  const [wallC, wallB] = masonry();
  const owned: Array<{ dispose(): void }> = [];
  const T = <X extends { dispose(): void }>(x: X): X => { owned.push(x); return x; };

  const glow = T(tex(radial('rgba(255,170,90,0.9)')));
  const glowGold = T(tex(radial('rgba(255,215,120,0.95)')));
  const glowGreen = T(tex(radial('rgba(110,255,190,0.9)')));
  const glowRed = T(tex(radial('rgba(255,70,60,0.9)')));
  const dust = T(tex(radial('rgba(255,244,220,0.8)', 32)));
  const sw = T(tex(swirl()));
  const floorMap = T(tex(floorC, true)), floorBump = T(tex(floorB, true, false));
  const wallMap = T(tex(wallC, true)), wallBump = T(tex(wallB, true, false));
  const woodMap = T(tex(planks(), true));

  const M = (p: ConstructorParameters<typeof MeshStandardMaterial>[0]) => T(new MeshStandardMaterial(p));
  return {
    glow, glowGold, glowGreen, glowRed, dust, swirl: sw,
    floor: M({ map: floorMap, bumpMap: floorBump, bumpScale: 1.4, color: new Color('#a9a5b6'), roughness: 0.92, metalness: 0.02 }),
    wall: M({ map: wallMap, bumpMap: wallBump, bumpScale: 2.2, color: new Color('#b9b4c8'), roughness: 0.95, metalness: 0 }),
    wallCap: M({ map: floorMap, bumpMap: floorBump, bumpScale: 1, color: new Color('#8f8a9c'), roughness: 0.9 }),
    stone: M({ map: wallMap, bumpMap: wallBump, bumpScale: 1.6, color: new Color('#c8c3d6'), roughness: 0.9 }),
    wood: M({ map: woodMap, color: new Color('#e0c8a8'), roughness: 0.82 }),
    darkWood: M({ map: woodMap, color: new Color('#8a6a4c'), roughness: 0.88 }),
    iron: M({ color: '#2a2a33', roughness: 0.55, metalness: 0.85 }),
    gold: M({ color: '#d6a84f', roughness: 0.32, metalness: 0.95, emissive: '#4a3208', emissiveIntensity: 0.6 }),
    cloth: M({ color: '#33569a', roughness: 0.9 }),
    clothDark: M({ color: '#262448', roughness: 0.92 }),
    cape: M({ color: '#8a2a2a', roughness: 0.95 }),
    skin: M({ color: '#d6a67a', roughness: 0.7 }),
    leather: M({ color: '#4a2f1b', roughness: 0.8 }),
    armor: M({ color: '#3b3d4d', roughness: 0.42, metalness: 0.8 }),
    armorTrim: M({ color: '#7a1f2b', roughness: 0.5, metalness: 0.5 }),
    crystal: M({ color: '#7a6bff', emissive: '#5a48ff', emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }),
    rune: M({ color: '#ff4a3a', emissive: '#ff2a1a', emissiveIntensity: 1.8, roughness: 0.4 }),
    spike: M({ color: '#a7a9b8', roughness: 0.35, metalness: 0.9 }),
    eye: T(new MeshBasicMaterial({ color: '#fff2c4' })),
    eyeRed: T(new MeshBasicMaterial({ color: '#ff3a1c' })),
    flame: T(new MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false })),
    flameCore: T(new MeshBasicMaterial({ color: '#fff0a6', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false })),
    dispose: () => owned.forEach((o) => o.dispose()),
  };
}

export type { Material };
