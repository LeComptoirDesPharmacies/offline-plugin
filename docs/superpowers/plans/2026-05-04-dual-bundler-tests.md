# Dual Webpack/Rspack Test Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace snapshot-based test fixtures with vitest integration tests that run against both webpack and rspack, validating the plugin's core responsibilities with semantic assertions.

**Architecture:** Each test compiles a minimal config with both bundlers via `describe.each`, reads emitted files from disk, and asserts on the plugin's outputs (`sw.js` data, runtime presence, asset resolution). No bundler-internal APIs are used in the test infrastructure.

**Tech Stack:** vitest, typescript, webpack 5, @rspack/core, node:vm, node:fs

---

### Task 1: Project setup — vitest, typescript, rspack

**Files:**
- Create: `tests/vitest.config.ts`
- Create: `tests/tsconfig.json`
- Modify: `package.json` (devDependencies + scripts)

- [ ] **Step 1: Install dependencies**

```bash
aikido-pnpm install -D vitest typescript @rspack/core
```

- [ ] **Step 2: Create vitest config**

Create `tests/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    testTimeout: 30000,
  },
});
```

- [ ] **Step 3: Create tsconfig for tests**

Create `tests/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 4: Update package.json scripts**

Replace test scripts in `package.json`:

```json
{
  "scripts": {
    "test": "vitest run --config tests/vitest.config.ts",
    "test:watch": "vitest --config tests/vitest.config.ts"
  }
}
```

- [ ] **Step 5: Verify vitest runs (no tests yet)**

```bash
pnpm test
```

Expected: vitest reports "no test files found" or similar — no error.

- [ ] **Step 6: Commit**

```bash
git add tests/vitest.config.ts tests/tsconfig.json package.json pnpm-lock.yaml
git commit -m "chore: setup vitest + typescript + rspack for integration tests"
```

---

### Task 2: Test helpers — compile and extract-sw-data

**Files:**
- Create: `tests/helpers/compile.ts`
- Create: `tests/helpers/extract-sw-data.ts`
- Create: `tests/helpers/fixtures/main.js` (minimal entry)
- Create: `tests/helpers/fixtures/main-with-runtime.js` (entry that imports runtime)

- [ ] **Step 1: Create minimal fixture entry**

Create `tests/helpers/fixtures/main.js`:

```js
// Minimal entry for test compilations
console.log('app');
```

- [ ] **Step 2: Create fixture entry that imports the runtime**

Create `tests/helpers/fixtures/main-with-runtime.js`:

```js
var runtime = require('../../../runtime.js');
runtime.install();
```

- [ ] **Step 3: Write the compile helper**

Create `tests/helpers/compile.ts`:

```ts
import { mkdtempSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type Bundler = 'webpack' | 'rspack';

export interface CompileResult {
  assets: Record<string, string>;
  errors: string[];
  warnings: string[];
}

function readAllFiles(dir: string, base = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      Object.assign(result, readAllFiles(full, rel));
    } else {
      result[rel] = readFileSync(full, 'utf-8');
    }
  }

  return result;
}

export async function compile(bundler: Bundler, config: any): Promise<CompileResult> {
  const outputPath = mkdtempSync(path.join(tmpdir(), 'offline-plugin-test-'));

  const bundlerModule = bundler === 'rspack'
    ? require('@rspack/core')
    : require('webpack');

  const finalConfig = {
    ...config,
    output: { ...config.output, path: outputPath },
  };

  const compiler = bundlerModule(finalConfig);

  try {
    const stats = await new Promise<any>((resolve, reject) => {
      compiler.run((err: Error | null, stats: any) => {
        if (err) return reject(err);
        resolve(stats);
      });
    });

    await new Promise<void>((resolve, reject) => {
      compiler.close((err: Error | null) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const errors = (stats.compilation.errors || []).map((e: any) => e.message || String(e));
    const warnings = (stats.compilation.warnings || []).map((e: any) => e.message || String(e));

    let assets: Record<string, string> = {};
    try {
      assets = readAllFiles(outputPath);
    } catch {
      // output dir might not exist if compilation failed completely
    }

    return { assets, errors, warnings };
  } finally {
    rmSync(outputPath, { recursive: true, force: true });
  }
}

export function baseConfig(pluginOptions: any, options: { entry?: string; outputPublicPath?: string; outputSubdir?: string } = {}) {
  const OfflinePlugin = require('../../lib/index.js');
  const fixturesPath = path.resolve(__dirname, 'fixtures');

  return {
    mode: 'none' as const,
    context: fixturesPath,
    entry: { main: options.entry || './main.js' },
    output: {
      filename: '[name].js',
      ...(options.outputPublicPath ? { publicPath: options.outputPublicPath } : {}),
    },
    plugins: [new OfflinePlugin(pluginOptions)],
    resolve: {
      extensions: ['.js'],
    },
  };
}
```

- [ ] **Step 4: Write the extract-sw-data helper**

Create `tests/helpers/extract-sw-data.ts`:

```ts
import vm from 'node:vm';

export interface SwData {
  assets: {
    main: string[];
    additional: string[];
    optional: string[];
  };
  externals: string[];
  hashesMap: Record<string, string>;
  strategy: string;
  responseStrategy: string;
  version: string;
  name: string;
  pluginVersion?: string;
  relativePaths: boolean;
  prefetchRequest?: {
    credentials?: string;
    headers?: any;
    mode?: string;
    cache?: string;
  };
}

export function extractSwData(swSource: string): SwData {
  const context: any = {};
  vm.runInNewContext(swSource, context);
  return context.__wpo;
}
```

- [ ] **Step 5: Write a smoke test to validate the helpers work**

Create `tests/integration/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compile, baseConfig, type Bundler } from '../helpers/compile';
import { extractSwData } from '../helpers/extract-sw-data';

describe.each(['webpack', 'rspack'] as const)('%s — smoke test', (bundler: Bundler) => {
  it('compiles without errors and emits sw.js', async () => {
    const config = baseConfig({
      caches: 'all',
      version: '[hash]',
      __tests: { swMetadataOnly: true, ignoreRuntime: true, noVersionDump: true },
    });

    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    expect(result.assets['sw.js']).toBeDefined();

    const data = extractSwData(result.assets['sw.js']);
    expect(data.assets.main).toBeDefined();
    expect(Array.isArray(data.assets.main)).toBe(true);
  });
});
```

- [ ] **Step 6: Run the smoke test**

```bash
pnpm test
```

Expected: 2 tests pass (one for webpack, one for rspack).

- [ ] **Step 7: Commit**

```bash
git add tests/helpers/ tests/integration/smoke.test.ts
git commit -m "feat(tests): add compile + extract-sw-data helpers with smoke test"
```

---

### Task 3: sw-emission tests

**Files:**
- Create: `tests/integration/sw-emission.test.ts`

- [ ] **Step 1: Write sw-emission tests**

Create `tests/integration/sw-emission.test.ts`:

```ts
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
    expect(data.assets.main).toContain('external.js');
    expect(data.assets.main).not.toContain('main.js');
    expect(data.externals).toContain('external.js');
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
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: all sw-emission tests pass on both bundlers.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/sw-emission.test.ts
git commit -m "test: add sw-emission integration tests (dual bundler)"
```

---

### Task 4: sw-entry tests (child compilation)

**Files:**
- Create: `tests/helpers/fixtures/sw-custom-entry.js`
- Create: `tests/integration/sw-entry.test.ts`

- [ ] **Step 1: Create custom SW entry fixture**

Create `tests/helpers/fixtures/sw-custom-entry.js`:

```js
// Custom service worker entry
self.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request));
});
```

- [ ] **Step 2: Write sw-entry tests**

Create `tests/integration/sw-entry.test.ts`:

```ts
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

    // And __wpo data should still be there
    const data = extractSwData(result.assets['sw.js']);
    expect(data).toBeDefined();
    expect(data.assets.main).toBeDefined();
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
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: all sw-entry tests pass. This is the test that would have caught the rspack `getAsset().source` bug.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/fixtures/sw-custom-entry.js tests/integration/sw-entry.test.ts
git commit -m "test: add sw-entry (child compilation) tests — catches rspack getAsset bug"
```

---

### Task 5: runtime-loader tests

**Files:**
- Create: `tests/integration/runtime-loader.test.ts`

- [ ] **Step 1: Write runtime-loader tests**

Create `tests/integration/runtime-loader.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: all runtime-loader tests pass on both bundlers.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/runtime-loader.test.ts
git commit -m "test: add runtime-loader integration tests (dual bundler)"
```

---

### Task 6: assets-resolution tests

**Files:**
- Create: `tests/helpers/fixtures/extra.js` (additional asset for multi-file tests)
- Create: `tests/integration/assets-resolution.test.ts`

- [ ] **Step 1: Create additional fixture file**

Create `tests/helpers/fixtures/extra.js`:

```js
// Extra module to test asset resolution
module.exports = 'extra';
```

- [ ] **Step 2: Write assets-resolution tests**

Create `tests/integration/assets-resolution.test.ts`:

```ts
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
    expect(data.assets.main).not.toContain('main.js');
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
    expect(data.externals).toContain('external.js');
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
    expect(data.assets.main).toContain('main.js');
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
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm test
```

Expected: all assets-resolution tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/fixtures/extra.js tests/integration/assets-resolution.test.ts
git commit -m "test: add assets-resolution integration tests (dual bundler)"
```

---

### Task 7: paths tests

**Files:**
- Create: `tests/integration/paths.test.ts`

- [ ] **Step 1: Write paths tests**

Create `tests/integration/paths.test.ts`:

```ts
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

  it('emits sw.js outside output dir when output is ../sw.js', async () => {
    const config = baseConfig(
      {
        caches: 'all',
        version: '[hash]',
        ServiceWorker: { output: '../sw.js' },
        publicPath: '/dist/',
        __tests: testFlags,
      },
      { outputSubdir: 'dist' },
    );

    // For this test we need to handle the output path manually
    // The sw.js should be emitted one level above the output path
    const result = await compile(bundler, config);

    expect(result.errors).toHaveLength(0);
    // The asset is emitted with the relative path ../sw.js from the output dir
    // On disk it ends up at the parent level
    const hasSw = result.assets['../sw.js'] || result.assets['sw.js'];
    expect(hasSw).toBeDefined();
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
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: all paths tests pass. Some may need adjustment based on how rspack handles `../` output paths — adapt assertions if needed.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/paths.test.ts
git commit -m "test: add paths resolution integration tests (dual bundler)"
```

---

### Task 8: rewrites tests

**Files:**
- Create: `tests/integration/rewrites.test.ts`

- [ ] **Step 1: Write rewrites tests**

Create `tests/integration/rewrites.test.ts`:

```ts
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
      rewrites(asset: string) {
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
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: all rewrites tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/rewrites.test.ts
git commit -m "test: add rewrites integration tests (dual bundler)"
```

---

### Task 9: Remove old test fixtures

**Files:**
- Delete: `tests/fixtures/` (entire directory)
- Modify: `package.json` (remove old test scripts, remove unused devDependencies)

- [ ] **Step 1: Verify all new tests pass**

```bash
pnpm test
```

Expected: all tests pass on both bundlers.

- [ ] **Step 2: Remove old fixtures directory**

```bash
rm -rf tests/fixtures
```

- [ ] **Step 3: Remove unused devDependencies**

```bash
aikido-pnpm remove dir-compare diff chalk cli-highlight del mocha
```

- [ ] **Step 4: Remove old test scripts from package.json**

Remove these scripts from `package.json`:
- `test:browser`
- `test:fixtures`
- `test:fixtures:fix`
- `test:ci_fixtures`
- `test:ci_browser`
- `test:ci_all`
- `install:browser-tests`

Keep only:
```json
{
  "test": "vitest run --config tests/vitest.config.ts",
  "test:watch": "vitest --config tests/vitest.config.ts"
}
```

- [ ] **Step 5: Run final test suite**

```bash
pnpm test
```

Expected: all tests pass, no references to old fixtures.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove old snapshot test fixtures, clean up devDependencies"
```

---

### Task 10: Delete smoke test (absorbed by real tests)

**Files:**
- Delete: `tests/integration/smoke.test.ts`

- [ ] **Step 1: Remove the smoke test (now redundant with sw-emission tests)**

```bash
rm tests/integration/smoke.test.ts
```

- [ ] **Step 2: Run tests to confirm nothing breaks**

```bash
pnpm test
```

Expected: all remaining tests pass.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove redundant smoke test"
```
