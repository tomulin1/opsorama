import { describe, expect, it } from 'vitest';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { compileScript, parse } from 'vue/compiler-sfc';
import { createSceneStore } from '@opsorama/core';
import { DEFAULT_CONTRACT, contractNodes } from '../examples/object-contract-data';

const SOURCE = 'examples/vue-sfc/ParcelContract.vue', OUTPUT = 'examples/vue-sfc/ParcelContract.compiled.ts';

describe('Vue single-file component example', () => {
  it('compiles and registers the same parcel scene as the React and JavaScript examples', async () => {
    const { descriptor, errors } = parse(await readFile(SOURCE, 'utf8'), { filename: SOURCE });
    expect(errors).toEqual([]);
    const script = compileScript(descriptor, { id: 'parcel-contract', inlineTemplate: true });
    await writeFile(OUTPUT, script.content);
    try {
      const component = (await import(/* @vite-ignore */ `../${OUTPUT}`)).default as Component;
      const store = createSceneStore(), settings = { ...DEFAULT_CONTRACT, override: true, state: 'warning' as const, spot: 1 as const };
      // Server rendering runs setup (so nodes register) without mounting a WebGL renderer.
      const html = await renderToString(createSSRApp({ render: () => h(component, { store, settings }) }));
      expect(html).toContain('height:380px');
      // Vue passes every declared prop, so compare the data the nodes carry.
      const data = (nodes: readonly object[]) => JSON.parse(JSON.stringify(nodes));
      expect(data(store.getSnapshot().nodes)).toEqual(data(contractNodes(settings)));
      store.dispose();
    } finally { await rm(OUTPUT, { force: true }); }
  });
});
