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

  it('relative paths rewrite with basePath when SW is in subdirectory', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      relativePaths: true,
      ServiceWorker: { output: 'offline/sw.js' },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    expect(result.assets['offline/sw.js']).toBeDefined();

    const data = extractSwData(result.assets['offline/sw.js']);
    // basePath should be ../ since SW is one level deep
    const allPrefixed = data.assets.main.every(
      (a: string) => a.startsWith('../') || a.startsWith('./')
    );
    expect(allPrefixed).toBe(true);
    // At least one asset should use ../ to go up
    const hasParentRef = data.assets.main.some((a: string) => a.startsWith('../'));
    expect(hasParentRef).toBe(true);
  });

  it('relativePaths takes precedence over plugin-level publicPath (no error)', async () => {
    // When both publicPath and relativePaths:true are set in plugin options,
    // the plugin clears publicPath (line 185-186 in apply()) and proceeds without error.
    // The conflict-error guard at line 198 is unreachable because line 185 always
    // clears this.publicPath before line 189 can set it from compiler options.
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      publicPath: '/dist/',
      relativePaths: true,
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    // No error — publicPath is silently cleared in favour of relativePaths
    expect(result.errors).toHaveLength(0);
    // Assets should use relative paths (not prefixed with /dist/)
    const data = extractSwData(result.assets['sw.js']);
    const allRelative = data.assets.main.every((a: string) => !a.startsWith('/dist/'));
    expect(allRelative).toBe(true);
  });

  it('throws when ServiceWorker.output is an absolute path', async () => {
    expect(() => {
      baseConfig({
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { output: '/absolute/sw.js' },
        __tests: testFlags,
      });
    }).toThrow('relative path');
  });

  it('preserves absolute URL externals when publicPath is set', async () => {
    const config = baseConfig(
      {
        caches: { main: ['https://cdn.example.com/lib.js', ':rest:'] },
        externals: ['https://cdn.example.com/lib.js'],
        version: '[hash]',
        __tests: testFlags,
      },
      { outputPublicPath: '/dist/' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.externals).toContain('https://cdn.example.com/lib.js');
    // Must NOT be prefixed with publicPath
    const wrongPrefix = data.externals.some(
      (e: string) => e.startsWith('/dist/https://')
    );
    expect(wrongPrefix).toBe(false);
  });
});
