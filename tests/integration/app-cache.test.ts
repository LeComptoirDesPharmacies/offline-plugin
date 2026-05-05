import { describe, it, expect } from 'vitest';
import { compile, baseConfig, type Bundler } from '../helpers/compile';

const testFlags = { swMetadataOnly: true, ignoreRuntime: true, noVersionDump: true, appCacheEnabled: true };

describe.each(['webpack', 'rspack'] as const)('%s — AppCache', (bundler: Bundler) => {
  it('emits appcache manifest and html when AppCache is enabled', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      AppCache: {
        NETWORK: '*',
        directory: 'appcache/',
        caches: ['main'],
      },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    // Should emit files in the appcache/ directory
    const appcacheFiles = Object.keys(result.assets).filter(
      (k) => k.startsWith('appcache/')
    );
    expect(appcacheFiles.length).toBeGreaterThan(0);
    // Should have a manifest file
    const hasManifest = appcacheFiles.some((f) => f.endsWith('.appcache'));
    expect(hasManifest).toBe(true);
    // Should have an HTML file for the iframe
    const hasHtml = appcacheFiles.some((f) => f.endsWith('.html'));
    expect(hasHtml).toBe(true);
  });
});
