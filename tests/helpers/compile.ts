import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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

export function baseConfig(pluginOptions: any, options: {
  entry?: string;
  entries?: Record<string, string>;
  outputPublicPath?: string;
  outputSubdir?: string;
  devtool?: string;
} = {}) {
  const OfflinePlugin = require('../../lib/index.js');
  const fixturesPath = path.resolve(__dirname, 'fixtures');

  const entry = options.entries
    ? options.entries
    : { main: options.entry || './main.js' };

  return {
    mode: 'none' as const,
    context: fixturesPath,
    entry,
    output: {
      filename: '[name].js',
      ...(options.outputPublicPath ? { publicPath: options.outputPublicPath } : {}),
    },
    ...(options.devtool ? { devtool: options.devtool } : {}),
    plugins: [new OfflinePlugin(pluginOptions)],
    resolve: {
      extensions: ['.js'],
    },
  };
}
