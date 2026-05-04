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
    expect(bundle).toContain('setInterval');
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
});
