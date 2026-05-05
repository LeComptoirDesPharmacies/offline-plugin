import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { compile, baseConfig, type Bundler } from '../helpers/compile';
import { extractSwData } from '../helpers/extract-sw-data';

const testFlags = { swMetadataOnly: false, ignoreRuntime: true, noVersionDump: true };

describe.each(['webpack', 'rspack'] as const)('%s — sw entry (child compilation)', (bundler: Bundler) => {
  it('compiles default entry and emits sw.js with __wpo data', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      __tests: { swMetadataOnly: true, ignoreRuntime: true, noVersionDump: true },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    expect(result.assets['sw.js']).toBeDefined();

    const data = extractSwData(result.assets['sw.js']);
    expect(data).toBeDefined();
    expect(data.assets).toBeDefined();
  });

  it('compiles custom entry and concatenates its source into sw.js', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: {
        entry: path.resolve(__dirname, '../helpers/fixtures/sw-custom-entry.js'),
      },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    expect(result.assets['sw.js']).toBeDefined();

    // The custom entry code should be present in sw.js
    expect(result.assets['sw.js']).toContain('event.respondWith');

    // __wpo data should still be present
    expect(result.assets['sw.js']).toContain('__wpo');

    // Extract just the var __wpo = {...}; portion to verify structure
    const match = result.assets['sw.js'].match(/var __wpo\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    const wpoData = JSON.parse(match![1]);
    expect(wpoData.assets).toBeDefined();
    expect(wpoData.assets.main).toBeDefined();
  });

  it('reports error when entry file does not exist', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: {
        entry: path.resolve(__dirname, '../helpers/fixtures/nonexistent.js'),
      },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('removes intermediate __offline_serviceworker.js from output', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: {
        entry: path.resolve(__dirname, '../helpers/fixtures/sw-custom-entry.js'),
      },
      __tests: testFlags,
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    // The intermediate asset should not be in final output
    const intermediateKeys = Object.keys(result.assets).filter(
      (k) => k.includes('__offline_')
    );
    expect(intermediateKeys).toHaveLength(0);
  });

  it('emits only __wpo data when entry is false', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      ServiceWorker: { entry: false },
      __tests: { swMetadataOnly: false, ignoreRuntime: true, noVersionDump: true },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    const sw = result.assets['sw.js'];
    expect(sw).toBeDefined();

    // Should contain the __wpo data block
    expect(sw).toContain('__wpo');

    // Should NOT contain the SW template code (WebpackServiceWorker function)
    expect(sw).not.toContain('WebpackServiceWorker');
    expect(sw).not.toContain('addEventListener');
  });
});
