import { describe, it, expect } from 'vitest';
import { compile, baseConfig, type Bundler } from '../helpers/compile';
import { extractSwData } from '../helpers/extract-sw-data';

const testFlags = { swMetadataOnly: true, ignoreRuntime: true, noVersionDump: true };

describe.each(['webpack', 'rspack'] as const)('%s — rewrites', (bundler: Bundler) => {
  it('rewrites index.html to ./ with relative paths', async () => {
    const config = baseConfig({
      caches: 'all',
      externals: ['index.html'],
      excludes: ['main.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    // index.html should be rewritten to ./ (relative) or / (absolute)
    expect(data.externals).not.toContain('index.html');
    expect(data.externals.some((e: string) => e === './' || e === '')).toBe(true);
  });

  it('rewrites index.html to / with publicPath /', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        externals: ['index.html'],
        excludes: ['main.js'],
        version: '[hash]',
        publicPath: '/',
        __tests: testFlags,
      },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.externals).toContain('/');
    expect(data.externals).not.toContain('/index.html');
  });

  it('includes cacheMaps in sw.js output', async () => {
    const config = baseConfig({
      excludes: ['main.js'],
      version: '[hash]',
      cacheMaps: [
        {
          match: function(url) {
            if (url.pathname.indexOf('/api/') === 0) return;
            return new URL('/', location);
          },
          requestTypes: ['navigate'],
        },
      ],
      __tests: { ...testFlags, swMetadataOnly: false },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const sw = result.assets['sw.js'];
    expect(sw).toContain('cacheMaps');
    expect(sw).toContain('/api/');
  });

  it('includes appShell cacheMap in sw.js', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      appShell: '/app-shell.html',
      __tests: { ...testFlags, swMetadataOnly: false },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const sw = result.assets['sw.js'];
    expect(sw).toContain('/app-shell.html');
    expect(sw).toContain('navigate');
  });

  it('supports custom rewrite function', async () => {
    const config = baseConfig({
      caches: 'all',
      externals: ['test-asset.html'],
      version: '[hash]',
      rewrites(asset) {
        if (asset.endsWith('.html')) return '/rewritten';
        return asset;
      },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.externals).toContain('/rewritten');
    expect(data.externals).not.toContain('test-asset.html');
  });

  it('supports rewrites as static object map', async () => {
    const config = baseConfig({
      caches: 'all',
      externals: ['original.js'],
      version: '[hash]',
      rewrites: { 'original.js': 'mapped.js' },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.externals).toContain('./mapped.js');
    expect(data.externals).not.toContain('./original.js');
  });

  it('includes navigationPreload true in sw.js when explicitly set', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: { navigationPreload: true },
      __tests: { ...testFlags, swMetadataOnly: false },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const sw = result.assets['sw.js'];
    expect(sw).toContain('navigationPreload');
    // Should contain the boolean true (not a function)
    expect(sw).toMatch(/navigationPreload:\s*true/);
  });

  it('defaults navigationPreload to true when responseStrategy is network-first', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      responseStrategy: 'network-first',
      __tests: { ...testFlags, swMetadataOnly: false },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const sw = result.assets['sw.js'];
    expect(sw).toMatch(/navigationPreload:\s*true/);
  });

  it('serializes navigationPreload object with map and test functions', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: {
        navigationPreload: {
          map: function(url) { return url.toString(); },
          test: function(url) { return url.pathname.startsWith('/app'); },
        },
      },
      __tests: { ...testFlags, swMetadataOnly: false },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const sw = result.assets['sw.js'];
    expect(sw).toContain('navigationPreload');
    // Should contain the serialized functions
    expect(sw).toContain('/app');
    expect(sw).toContain('pathname');
  });
});
