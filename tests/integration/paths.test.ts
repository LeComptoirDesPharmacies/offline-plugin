import { describe, it, expect } from 'vitest';
import { compile, baseConfig, type Bundler } from '../helpers/compile';
import { extractSwData } from '../helpers/extract-sw-data';

const testFlags = { swMetadataOnly: true, ignoreRuntime: true, noVersionDump: true };

describe.each(['webpack', 'rspack'] as const)('%s — paths resolution', (bundler: Bundler) => {
  it('emits sw.js at default location (root)', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    expect(result.assets['sw.js']).toBeDefined();
  });

  it('emits sw.js in a subdirectory when output is configured', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: { output: 'offline/sw.js' },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    expect(result.assets['offline/sw.js']).toBeDefined();
  });

  it('prefixes asset URLs with publicPath', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        __tests: testFlags,
      },
      { outputPublicPath: '/dist/' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const hasPrefix = data.assets.main.every((a: string) => a.startsWith('/dist/'));
    expect(hasPrefix).toBe(true);
  });

  it('uses relative paths when relativePaths is true', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      relativePaths: true,
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const allRelative = data.assets.main.every((a: string) => !a.startsWith('/'));
    expect(allRelative).toBe(true);
  });

  it('uses ServiceWorker.publicPath override for SW location in runtime', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { publicPath: '/custom/sw.js' },
        __tests: { ...testFlags, ignoreRuntime: false },
      },
      { entry: './main-with-runtime.js', outputPublicPath: '/dist/' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).toContain('/custom/sw.js');
  });
});
