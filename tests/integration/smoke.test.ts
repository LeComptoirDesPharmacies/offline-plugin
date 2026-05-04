import { describe, it, expect } from 'vitest';
import { compile, baseConfig, type Bundler } from '../helpers/compile';
import { extractSwData } from '../helpers/extract-sw-data';

describe.each(['webpack', 'rspack'] as const)('%s — smoke test', (bundler: Bundler) => {
  it('compiles without errors and emits sw.js', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      __tests: { swMetadataOnly: true, ignoreRuntime: true, noVersionDump: true },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    expect(result.assets['sw.js']).toBeDefined();

    const data = extractSwData(result.assets['sw.js']);
    expect(data.assets.main).toBeDefined();
    expect(Array.isArray(data.assets.main)).toBe(true);
  });
});
