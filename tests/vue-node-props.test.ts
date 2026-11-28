import { describe, expect, it } from 'vitest';
import * as VueAdapter from '@opsorama/vue';

/** Vue gives a missing Boolean prop the value `false` unless its default is `undefined`. */
describe('Vue node components', () => {
  it('leave every optional Boolean node field unset when it is not given', () => {
    const components = Object.entries(VueAdapter as Record<string, unknown>)
      .map(([name, value]) => [name, (value as { props?: Record<string, unknown> } | null)?.props] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] => typeof entry[1] === 'object' && entry[1] !== null && 'selectable' in entry[1]);
    expect(components.length).toBeGreaterThan(5);
    for (const [name, props] of components) {
      // A bare `selectable: false` would keep a node with an entityId out of clicks, so selection by entityId would break.
      expect(props.selectable, name).toEqual({ type: Boolean, default: undefined });
    }
  });
});
