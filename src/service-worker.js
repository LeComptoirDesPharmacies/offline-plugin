import path from 'path';
import {
  pathToBase, isAbsoluteURL,
  isAbsolutePath, functionToString
} from './misc/utils';

export default class ServiceWorker {
  constructor(options) {
    if (isAbsolutePath(options.output)) {
      throw new Error(
        'OfflinePlugin: ServiceWorker.output option must be a relative path, ' +
        'but an absolute path was passed'
      );
    }

    this.output = options.output.replace(/^\.\/+/, '');
    this.publicPath = options.publicPath;

    this.basePath = null;
    this.location = null;
    this.pathRewrite = null;

    // Tool specific properties
    this.entry = options.entry;
    this.scope = options.scope ? options.scope + '' : void 0;
    this.events = !!options.events;
    this.prefetchRequest = this.validatePrefetch(options.prefetchRequest);
    this.updateViaCache = (options.updateViaCache || '') + '';
    this.navigationPreload = options.navigationPreload;
    this.forceInstall = !!options.forceInstall;

    let cacheNameQualifier = '';

    if (options.cacheName) {
      cacheNameQualifier = ':' + options.cacheName;
    }

    this.ENTRY_NAME = 'serviceworker';
    this.CACHE_NAME = 'webpack-offline' + cacheNameQualifier;
    this.SW_DATA_VAR = '__wpo';
  }

  // The asset name produced by the child compilation, ending in `.js` so the
  // host webpack/rspack minifier picks it up like any other JS asset.
  getEntryAssetName(plugin) {
    return plugin.entryPrefix + this.ENTRY_NAME + '.js';
  }

  addEntry(plugin, compilation, compiler) {
    if (!this.entry) return Promise.resolve();

    const name = plugin.entryPrefix + this.ENTRY_NAME;
    const childCompiler = compilation.createChildCompiler(name, {
      filename: this.getEntryAssetName(plugin)
    });

    const data = JSON.stringify({
      data_var_name: this.SW_DATA_VAR,
      cacheMaps: plugin.cacheMaps,
      navigationPreload: this.stringifyNavigationPreload(this.navigationPreload, plugin)
    });

    const swLoaderPath = path.join(__dirname, 'misc/sw-loader.js');
    const loader = '!!' + swLoaderPath + '?json=' + escape(data);
    const entry = loader + '!' + this.entry;

    childCompiler.context = compiler.context;
    const { EntryPlugin } = compiler.webpack;
    new EntryPlugin(compiler.context, entry, name).apply(childCompiler);

    return new Promise((resolve, reject) => {
      childCompiler.runAsChild((err, entries, childCompilation) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  apply(plugin, compilation, compiler) {
    let source = this.getDataTemplate(plugin.caches, plugin);

    if (this.entry) {
      const filename = this.getEntryAssetName(plugin);
      const asset = compilation.getAsset(filename);

      if (!asset) {
        compilation.errors.push(
          new Error('OfflinePlugin: ServiceWorker entry is not found in output assets')
        );

        return;
      }

      if (!plugin.__tests.swMetadataOnly) {
        // Use compilation.assets[filename] directly: in rspack, getAsset().source
        // is undefined for child compilation assets (the asset object exists but
        // its .source property is not populated). compilation.assets[filename] is
        // the actual Source instance and works in both webpack and rspack.
        const entrySource = compilation.assets[filename] || asset.source;
        source += '\n\n' + entrySource.source();
      }

      compilation.deleteAsset(filename);
    }

    const { RawSource } = compiler.webpack.sources;
    compilation.emitAsset(this.output, new RawSource(source));
  }

  getDataTemplate(data, plugin) {
    const rewriteFunction = this.pathRewrite;

    const cache = (key) => {
      return (data[key] || []).map(rewriteFunction);
    };

    const hashesMap = Object.keys(plugin.hashesMap)
      .reduce((result, hash) => {
        const asset = plugin.hashesMap[hash];

        result[hash] = rewriteFunction(asset);
        return result;
      }, {});

    const externals = plugin.externals.map(rewriteFunction);

    let pluginVersion;

    if (plugin.pluginVersion && !plugin.__tests.noVersionDump) {
      pluginVersion = plugin.pluginVersion;
    }

    return `
      var ${ this.SW_DATA_VAR } = ${ JSON.stringify({
        assets: {
          main: cache('main'),
          additional: cache('additional'),
          optional: cache('optional')
        },

        externals: externals,

        hashesMap: hashesMap,

        strategy: plugin.strategy,
        responseStrategy: plugin.responseStrategy,
        version: plugin.version,
        name: this.CACHE_NAME,
        pluginVersion: pluginVersion,
        relativePaths: plugin.relativePaths,

        prefetchRequest: this.prefetchRequest,

        // These aren't added
        alwaysRevalidate: plugin.alwaysRevalidate,
        preferOnline: plugin.preferOnline,
        ignoreSearch: plugin.ignoreSearch,
      }) };
    `.trim();
  }

  getConfig(plugin) {
    return {
      location: this.location,
      scope: this.scope,
      updateViaCache: this.updateViaCache,
      events: this.events,
      force: this.forceInstall
    };
  }

  validatePrefetch(request) {
    if (!request) {
      return void 0;
    }

    if (
      request.credentials === 'same-origin' &&
      request.headers === void 0 &&
      request.mode === 'cors' &&
      request.cache === void 0
    ) {
      return void 0;
    }

    return {
      credentials: request.credentials,
      headers: request.headers,
      mode: request.mode,
      cache: request.cache
    };
  }

  stringifyNavigationPreload(navigationPreload, plugin) {
    let result;

    if (typeof navigationPreload === 'object') {
      result = navigationPreload = `{
        map: ${functionToString(navigationPreload.map)},
        test: ${functionToString(navigationPreload.test)}
      }`;
    } else {
      if (typeof navigationPreload !== 'boolean') {
        if (plugin.responseStrategy === 'network-first') {
          navigationPreload = true;
        } else {
          navigationPreload = false;
        }
      }

      result = JSON.stringify(navigationPreload);
    }

    return result;
  }
}
