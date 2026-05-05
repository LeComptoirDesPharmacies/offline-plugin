import { describe, it, expect } from 'vitest';
import { compile, baseConfig, type Bundler } from '../helpers/compile';
import { extractSwData } from '../helpers/extract-sw-data';

const testFlags = { swMetadataOnly: true, ignoreRuntime: true, noVersionDump: true };

describe.each(['webpack', 'rspack'] as const)('%s — sw emission', (bundler: Bundler) => {
  it('emits sw.js with correct assets (excludes respected)', async () => {
    const config = baseConfig({
      caches: { main: ['external.js', ':rest:'] },
      externals: ['external.js'],
      excludes: ['main.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.assets.main).toContain('./external.js');
    expect(data.assets.main).not.toContain('main.js');
    expect(data.externals).toContain('./external.js');
  });

  it('uses version hash', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.version).toMatch(/^[a-f0-9]+$/);
  });

  it('respects responseStrategy cache-first', async () => {
    const config = baseConfig({
      caches: 'all',
      responseStrategy: 'cache-first',
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.responseStrategy).toBe('cache-first');
  });

  it('respects responseStrategy network-first', async () => {
    const config = baseConfig({
      caches: 'all',
      responseStrategy: 'network-first',
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.responseStrategy).toBe('network-first');
  });

  it('respects updateStrategy all', async () => {
    const config = baseConfig({
      caches: 'all',
      updateStrategy: 'all',
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.strategy).toBe('all');
  });

  it('uses custom cache name', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: { cacheName: 'my-custom-cache' },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.name).toBe('webpack-offline:my-custom-cache');
  });

  it('includes prefetchRequest when custom credentials', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: { prefetchRequest: { credentials: 'include' } },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.prefetchRequest).toBeDefined();
    expect(data.prefetchRequest!.credentials).toBe('include');
  });

  it('includes pluginVersion when noVersionDump is false', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      __tests: { ...testFlags, noVersionDump: false },
    });

    const result = await compile(bundler, config);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.pluginVersion).toBeDefined();
    expect(data.pluginVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('hashesMap maps sha1 hashes to asset paths', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        __tests: testFlags,
      },
      { entries: { main: './main.js', extra: './extra.js' } },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const hashes = Object.keys(data.hashesMap);
    // Should have multiple entries (one per asset)
    expect(hashes.length).toBeGreaterThanOrEqual(2);

    // Every key should be a hex hash
    for (const hash of hashes) {
      expect(hash).toMatch(/^[a-f0-9]+$/);
    }

    // Every value should be an asset path present in main/additional/optional
    const allAssets = [
      ...data.assets.main,
      ...data.assets.additional,
      ...data.assets.optional,
    ];
    for (const assetPath of Object.values(data.hashesMap)) {
      expect(allAssets).toContain(assetPath);
    }
  });

  it('throws when responseStrategy is invalid', async () => {
    expect(() => {
      baseConfig({
        caches: 'all',
        version: '[hash]',
        responseStrategy: 'invalid-strategy',
        __tests: testFlags,
      });
    }).toThrow('responseStrategy');
  });

  it('supports version as a function', async () => {
    const config = baseConfig({
      caches: 'all',
      version(plugin: any) {
        return 'custom-v-' + plugin.hash.slice(0, 6);
      },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.version).toMatch(/^custom-v-[a-f0-9]{6}$/);
  });

  it('produces identical version hash for identical builds', async () => {
    const makeConfig = () => baseConfig({
      caches: 'all',
      version: '[hash]',
      __tests: testFlags,
    });

    const result1 = await compile(bundler, makeConfig());
    const result2 = await compile(bundler, makeConfig());

    expect(result1.errors).toHaveLength(0);
    expect(result2.errors).toHaveLength(0);

    const data1 = extractSwData(result1.assets['sw.js']);
    const data2 = extractSwData(result2.assets['sw.js']);

    expect(data1.version).toBe(data2.version);
    expect(data1.hashesMap).toEqual(data2.hashesMap);
  });

  it('defaults to updateStrategy changed', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.strategy).toBe('changed');
  });

  it('uses date string when version is null', async () => {
    const config = baseConfig({
      caches: 'all',
      version: null,
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.version).toBeDefined();
    expect(data.version.length).toBeGreaterThan(0);
    // Should NOT be a hex hash
    expect(data.version).not.toMatch(/^[a-f0-9]+$/);
  });
});
