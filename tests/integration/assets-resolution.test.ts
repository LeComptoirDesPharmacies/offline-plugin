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
    const config = baseConfig(
      {
        caches: 'all',
        excludes: ['**/*.map'],
        version: '[hash]',
        __tests: testFlags,
      },
      { entries: { main: './main.js', extra: './extra.js' }, devtool: 'source-map' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    // .map files should be excluded
    const hasMap = data.assets.main.some((a: string) => a.endsWith('.map'));
    expect(hasMap).toBe(false);
    // But .js files should still be present
    const jsFiles = data.assets.main.filter((a: string) => a.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThanOrEqual(2);
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
    const config = baseConfig(
      {
        caches: { main: [/\.js$/] },
        excludes: [],
        version: '[hash]',
        __tests: testFlags,
      },
      { entries: { main: './main.js', extra: './extra.js' }, devtool: 'source-map' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const allJs = data.assets.main.every((a: string) => a.endsWith('.js'));
    expect(allJs).toBe(true);
    // Should have captured multiple JS files
    expect(data.assets.main.length).toBeGreaterThanOrEqual(2);
  });

  it(':rest: captures unlisted assets', async () => {
    const config = baseConfig(
      {
        caches: { main: ['main.js'], additional: [':rest:'] },
        excludes: [],
        version: '[hash]',
        safeToUseOptionalCaches: true,
        __tests: testFlags,
      },
      { entries: { main: './main.js', extra: './extra.js' } },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    // main.js is explicitly in main
    const hasMainInMain = data.assets.main.some((a: string) => a.includes('main.js'));
    expect(hasMainInMain).toBe(true);
    // extra.js should be captured by :rest: in additional
    const hasExtraInAdditional = data.assets.additional.some((a: string) => a.includes('extra.js'));
    expect(hasExtraInAdditional).toBe(true);
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
    const config = baseConfig(
      {
        caches: {
          main: ['main.js'],
          additional: [':rest:'],
        },
        excludes: [],
        version: '[hash]',
        safeToUseOptionalCaches: true,
        __tests: testFlags,
      },
      { entries: { main: './main.js', extra: './extra.js' } },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    // main.js claimed by main section
    expect(data.assets.main).toHaveLength(1);
    expect(data.assets.main[0]).toContain('main.js');
    // extra.js should be in additional via :rest:
    expect(data.assets.additional.length).toBeGreaterThan(0);
    expect(data.assets.additional.some((a: string) => a.includes('extra.js'))).toBe(true);
  });

  it('distributes assets to optional section', async () => {
    const config = baseConfig(
      {
        caches: {
          main: ['main.js'],
          additional: [],
          optional: [':rest:'],
        },
        excludes: [],
        version: '[hash]',
        safeToUseOptionalCaches: true,
        __tests: testFlags,
      },
      { entries: { main: './main.js', extra: './extra.js' } },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    // extra.js should end up in optional via :rest:
    const hasExtra = data.assets.optional.some((a: string) => a.includes('extra.js'));
    expect(hasExtra).toBe(true);
    // main.js should NOT be in optional
    const hasMainInOptional = data.assets.optional.some((a: string) => a.includes('main.js'));
    expect(hasMainInOptional).toBe(false);
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
    const config = baseConfig(
      {
        caches: { main: ['*.js'] },
        excludes: [],
        version: '[hash]',
        __tests: testFlags,
      },
      { entries: { main: './main.js', extra: './extra.js' }, devtool: 'source-map' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);
    const allJs = data.assets.main.every((a: string) => a.endsWith('.js'));
    expect(allJs).toBe(true);
    // Should have captured multiple JS files but no .map files
    expect(data.assets.main.length).toBeGreaterThanOrEqual(2);
  });

  it('an asset appears in only one cache section', async () => {
    const config = baseConfig(
      {
        caches: {
          main: ['main.js'],
          additional: [':rest:'],
          optional: [':externals:'],
        },
        excludes: [],
        externals: ['https://cdn.example.com/lib.js'],
        version: '[hash]',
        safeToUseOptionalCaches: true,
        __tests: testFlags,
      },
      { entries: { main: './main.js', extra: './extra.js' }, devtool: 'source-map' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const data = extractSwData(result.assets['sw.js']);

    const all = [
      ...data.assets.main,
      ...data.assets.additional,
      ...data.assets.optional,
    ];
    // Should have a meaningful number of assets across sections
    expect(all.length).toBeGreaterThanOrEqual(4);
    // No duplicates
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });
});
