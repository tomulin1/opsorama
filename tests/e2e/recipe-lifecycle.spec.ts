import { expect, test, type Page } from '@playwright/test';

/**
 * C4 measurements: live WebGL resources, draw calls and remount behavior of the domain scenes,
 * counted from the page's WebGL calls so the application needs no measuring code. They run on
 * this machine's WebGL backend through the dev server: resource counts are exact, frame rates are
 * not a performance claim, and none is asserted.
 */
declare global { interface Window { __gl: GlProbe; } }
interface GlCounters { buffers: number; textures: number; programs: number; vaos: number; framebuffers: number; draws: number; lost: boolean; }
interface GlProbe { contexts: GlCounters[]; frames: number; }

const instrument = () => {
  const probe: GlProbe = { contexts: [], frames: 0 };
  window.__gl = probe;
  const tick = () => { probe.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const original = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, options?: unknown) => unknown, seen = new WeakSet<object>();
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
    const gl = original.call(this, type, options) as (WebGL2RenderingContext & Record<string, unknown>) | null;
    if (!gl || !type.startsWith('webgl') || seen.has(gl)) return gl;
    seen.add(gl);
    const counters: GlCounters = { buffers: 0, textures: 0, programs: 0, vaos: 0, framebuffers: 0, draws: 0, lost: false };
    probe.contexts.push(counters);
    this.addEventListener('webglcontextlost', () => { counters.lost = true; });
    const wrap = (name: string, effect: (result: unknown) => void) => {
      const method = gl[name] as ((...args: unknown[]) => unknown) | undefined;
      if (method) gl[name] = (...args: unknown[]) => { const result = method.apply(gl, args); effect(result); return result; };
    };
    const pairs: [string, string, keyof GlCounters][] = [['createBuffer', 'deleteBuffer', 'buffers'], ['createTexture', 'deleteTexture', 'textures'], ['createProgram', 'deleteProgram', 'programs'], ['createVertexArray', 'deleteVertexArray', 'vaos'], ['createFramebuffer', 'deleteFramebuffer', 'framebuffers']];
    for (const [create, remove, key] of pairs) { wrap(create, () => { (counters[key] as number)++; }); wrap(remove, () => { (counters[key] as number)--; }); }
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) wrap(name, () => { counters.draws++; });
    return gl;
  };
};

const lastContext = (page: Page) => page.evaluate(() => window.__gl.contexts.at(-1) ?? null);
/** Frames and draws over a settled window. */
async function sample(page: Page, seconds = 3) {
  await page.waitForTimeout(2500);
  const read = () => page.evaluate(() => ({ frames: window.__gl.frames, draws: window.__gl.contexts.at(-1)?.draws ?? 0 }));
  const before = await read();
  await page.waitForTimeout(seconds * 1000);
  const after = await read(), frames = after.frames - before.frames;
  return { framesPerSecond: Math.round(frames / seconds), drawsPerFrame: frames ? Math.round((after.draws - before.draws) / frames) : 0 };
}

test('domain scenes: live WebGL resources and draw calls', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(instrument);
  const results: Record<string, unknown> = {};
  for (const scene of ['ecommerce', 'office', 'restaurant', 'farm', 'aquatics', 'datacenter']) {
    await page.goto(`/examples/${scene}`);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
    const timing = await sample(page), counters = await lastContext(page);
    expect(counters, scene).not.toBeNull();
    results[scene] = { ...timing, buffers: counters!.buffers, textures: counters!.textures, programs: counters!.programs };
  }
  console.log(`SCENES ${JSON.stringify(results)}`);
});

test('e-commerce: repeated unmount and mount leaves nothing behind', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(instrument);
  const session = await page.context().newCDPSession(page);
  await session.send('HeapProfiler.enable');
  const heap = async () => { await session.send('HeapProfiler.collectGarbage'); await session.send('HeapProfiler.collectGarbage'); return Math.round((await session.send('Runtime.getHeapUsage')).usedSize / 1048576 * 10) / 10; };
  await page.goto('/examples/ecommerce');
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  const cycles: { cycle: number; mountedBuffers: number; mountedTextures: number; mountedPrograms: number; afterBuffers: number; afterTextures: number; afterPrograms: number; lost: boolean; unmountedHeapMb: number }[] = [];
  for (let cycle = 1; cycle <= 8; cycle++) {
    const mounted = await lastContext(page);
    await page.getByRole('button', { name: 'Unmount scene', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.waitForTimeout(300);
    const released = await lastContext(page), unmountedHeap = await heap();
    await page.getByRole('button', { name: 'Mount scene', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.waitForTimeout(1200);
    cycles.push({ cycle, mountedBuffers: mounted!.buffers, mountedTextures: mounted!.textures, mountedPrograms: mounted!.programs, afterBuffers: released!.buffers, afterTextures: released!.textures, afterPrograms: released!.programs, lost: released!.lost, unmountedHeapMb: unmountedHeap });
  }
  const contexts = await page.evaluate(() => window.__gl.contexts.map(({ draws, lost }) => ({ draws, lost })));
  console.log(`LIFECYCLE contexts=${JSON.stringify(contexts)} ${JSON.stringify(cycles)}`);
  expect(errors).toEqual([]);
  // Only the mounted scene keeps a context; React strict mode mounts twice in development, so the count itself is not asserted.
  expect(contexts.filter(context => !context.lost)).toHaveLength(1);
  expect(new Set(cycles.map(cycle => `${cycle.mountedBuffers}/${cycle.mountedTextures}/${cycle.mountedPrograms}`)).size).toBe(1);
  for (const cycle of cycles) { expect(cycle.afterBuffers).toBe(0); expect(cycle.lost).toBe(true); }
  expect(cycles.at(-1)!.unmountedHeapMb / cycles[0].unmountedHeapMb).toBeLessThan(1.25);
});
