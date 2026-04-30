var OfflinePlugin = require(__ROOT__);
var path = require('path');

var deepExtend = require('deep-extend');
var DefinePlugin = require('webpack/lib/DefinePlugin');
var compare = require('./compare');

module.exports = function(OfflinePluginOptions, testFlags) {
  testFlags = testFlags || {};
  delete testFlags.minimumWebpackMajorVersion;

  var testDir = process.cwd();
  var outputPath = path.join(testDir, '__output');

  OfflinePluginOptions.__tests = deepExtend({
    swMetadataOnly: true,
    ignoreRuntime: true,
    noVersionDump: true,
    appCacheEnabled: true,
    pluginVersion: '999.999.999'
  }, testFlags);

  return {
    bail: true,
    mode: 'none',
    experiments: {
      syncWebAssembly: true
    },
    entry: {
      main: 'main.js'
    },

    output: {
      path: outputPath,
      filename: '[name].js',
    },

    plugins: [
      new OfflinePlugin(OfflinePluginOptions),
      new DefinePlugin({
        RUNTIME_PATH: JSON.stringify(path.join(__ROOT__, 'runtime'))
      }),
    ],

    resolve: {
      modules: [
        path.join(testDir),
        'node_modules'
      ],
      extensions: ['.js', '.wasm']
    }
  };
};