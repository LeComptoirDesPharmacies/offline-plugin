import { describe, it, expect } from 'vitest';
import { compile, baseConfig, type Bundler } from '../helpers/compile';
import { extractSwData } from '../helpers/extract-sw-data';

const testFlags = { swMetadataOnly: true, ignoreRuntime: true, noVersionDump: true };

describe.each(['webpack', 'rspack'] as const)('%s — assets resolution', (bundler: Bundler) => {
  it('excludes assets matching excludes globs', async () => {
    const config = baseConfig({
      caches: 'all',
      excludes: ['main.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const hasMain = data.assets.main.some((a: string) => a.includes('main.js'));
    expect(hasMain).toBe(false);
  });

  it('excludes assets matching glob patterns', async () => {
    const config = baseConfig({
      caches: 'all',
      excludes: ['**/*.map'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const hasMap = data.assets.main.some((a: string) => a.endsWith('.map'));
    expect(hasMap).toBe(false);
  });

  it('includes externals in the externals list', async () => {
    const config = baseConfig({
      caches: { main: ['external.js', ':rest:'] },
      externals: ['external.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    // Plugin rewrites add ./ prefix
    expect(data.externals).toContain('./external.js');
  });

  it('filters caches with regexp', async () => {
    const config = baseConfig({
      caches: { main: [/\.js$/] },
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const allJs = data.assets.main.every((a: string) => a.endsWith('.js'));
    expect(allJs).toBe(true);
    expect(data.assets.main.length).toBeGreaterThan(0);
  });

  it(':rest: captures unlisted assets', async () => {
    const config = baseConfig({
      caches: { main: [':rest:'] },
      excludes: [],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.assets.main.length).toBeGreaterThan(0);
    // main.js should be in :rest: since nothing else claims it
    const hasMain = data.assets.main.some((a: string) => a.includes('main.js'));
    expect(hasMain).toBe(true);
  });

  it('handles cross-origin externals (absolute URLs)', async () => {
    const config = baseConfig({
      caches: { main: ['https://cdn.example.com/lib.js', ':rest:'] },
      externals: ['https://cdn.example.com/lib.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.externals).toContain('https://cdn.example.com/lib.js');
    expect(data.assets.main).toContain('https://cdn.example.com/lib.js');
  });

  it('distributes assets to additional section', async () => {
    const config = baseConfig({
      caches: {
        main: ['main.js'],
        additional: [':externals:'],
      },
      externals: ['external.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.assets.main).toHaveLength(1);
    expect(data.assets.main[0]).toContain('main.js');
    expect(data.assets.additional.length).toBeGreaterThan(0);
    expect(data.assets.additional.some((a: string) => a.includes('external.js'))).toBe(true);
  });

  it('distributes assets to optional section', async () => {
    const config = baseConfig({
      caches: {
        main: ['main.js'],
        additional: [],
        optional: ['external.js'],
      },
      externals: ['external.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.assets.optional).toContain('./external.js');
    expect(data.assets.main).not.toContain('./external.js');
  });

  it(':externals: distributes remaining externals to a section', async () => {
    const config = baseConfig({
      caches: {
        main: [':rest:'],
        additional: [':externals:'],
      },
      externals: ['https://cdn.example.com/lib.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    expect(data.assets.additional).toContain('https://cdn.example.com/lib.js');
    expect(data.assets.main).not.toContain('https://cdn.example.com/lib.js');
  });

  it('filters caches with string glob pattern', async () => {
    const config = baseConfig({
      caches: { main: ['*.js'] },
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const allJs = data.assets.main.every((a: string) => a.endsWith('.js'));
    expect(allJs).toBe(true);
    expect(data.assets.main.length).toBeGreaterThan(0);
  });

  it('an asset appears in only one cache section', async () => {
    const config = baseConfig({
      caches: {
        main: ['main.js'],
        additional: [':rest:'],
        optional: [':externals:'],
      },
      externals: ['https://cdn.example.com/lib.js'],
      version: '[hash]',
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);

    const all = [
      ...data.assets.main,
      ...data.assets.additional,
      ...data.assets.optional,
    ];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });
});
