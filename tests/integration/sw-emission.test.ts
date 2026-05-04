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
});
