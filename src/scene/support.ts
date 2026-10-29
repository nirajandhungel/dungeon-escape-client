/**
 * True when this browser can create a WebGL context. Kept in its own file so importing it never pulls three.js
 * into the main bundle. The probe context is created ONCE and released immediately: browsers cap live WebGL
 * contexts (~16) and evict the oldest, so probing on every render would eventually kill the real game canvas.
 */
let cached: boolean | undefined;
export function webglAvailable(): boolean {
  if (cached !== undefined) return cached;
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    cached = !!gl;
    (gl?.getExtension('WEBGL_lose_context') as { loseContext(): void } | null | undefined)?.loseContext();
  } catch { cached = false; }
  return cached;
}
