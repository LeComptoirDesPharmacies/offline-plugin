import { describe, it, expect } from 'vitest';
import { compile, baseConfig, type Bundler } from '../helpers/compile';

const testFlags = { swMetadataOnly: true, ignoreRuntime: false, noVersionDump: true };

describe.each(['webpack', 'rspack'] as const)('%s — runtime loader', (bundler: Bundler) => {
  it('injects real runtime (not the stub) when runtime is imported', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);

    const bundle = result.assets['main.js'];
    expect(bundle).toBeDefined();

    // Real runtime registers the service worker
    expect(bundle).toContain('serviceWorker');
    expect(bundle).toContain('register');

    // Stub warning should NOT be present
    expect(bundle).not.toContain('runtime was installed without');
  });

  it('includes setInterval when autoUpdate is enabled', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        autoUpdate: 5000,
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);

    const bundle = result.assets['main.js'];
    expect(bundle).toMatch(/setInterval\(\w+,\s*5000\)/);
  });

  it('includes configured scope in register call', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { scope: '/my-app/' },
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);

    const bundle = result.assets['main.js'];
    expect(bundle).toContain('/my-app/');
  });

  it('uses default interval (3600000) when autoUpdate is true', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        autoUpdate: true,
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).toMatch(/setInterval\(\w+,\s*3600000\)/);
  });

  it('does not emit setInterval when autoUpdate is false', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        autoUpdate: false,
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).not.toContain('setInterval');
  });

  it('does not emit setInterval when autoUpdate is 0', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        autoUpdate: 0,
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).not.toContain('setInterval');
  });

  it('emits setInterval with exact custom interval value', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        autoUpdate: 120000,
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).toMatch(/setInterval\(\w+,\s*120000\)/);
  });

  it('injects SW lifecycle event handlers when events is true', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { events: true },
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).toContain('onUpdateReady');
    expect(bundle).toContain('onInstalled');
    expect(bundle).toContain('onupdatefound');
  });

  it('does not inject lifecycle handlers when events is false', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { events: false },
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).not.toContain('onUpdateReady');
    expect(bundle).not.toContain('onupdatefound');
  });

  it('includes updateViaCache in register when set to non-default', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { updateViaCache: 'none' },
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).toContain('updateViaCache');
    expect(bundle).toContain('none');
  });

  it('omits updateViaCache from register when set to imports (default)', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { updateViaCache: 'imports' },
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).not.toContain('updateViaCache');
  });

  it('removes HTTPS protocol check when forceInstall is true', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { forceInstall: true },
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    // With forceInstall, only checks 'serviceWorker' in navigator
    // Should NOT contain the https protocol check
    expect(bundle).not.toContain('https:');
  });

  it('includes HTTPS protocol check when forceInstall is false', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { forceInstall: false },
        __tests: testFlags,
      },
      { entry: './main-with-runtime.js' },
    );

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const bundle = result.assets['main.js'];
    expect(bundle).toContain('https:');
  });
});
