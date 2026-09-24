const path = require('path');
const fs = require('fs');

const modules = [
  'async-waituntil.js'
];

module.exports = function() {};
module.exports.pitch = function pitch(remainingRequest, precedingRequest, data) {
  this.cacheable && this.cacheable();

  const callback = this.async();
  const templatePath = path.join(__dirname, 'sw-template.js');
  const params = JSON.parse(new URLSearchParams(this.query.slice(1)).get('json'));

  const request = JSON.stringify(this.utils.contextify(this.context || this.rootContext, remainingRequest));
  const source = 'module.exports = require(' + request + ')';

  const loaders = (params.loaders || []).map((loader) => {
    const loaderPath = path.join(__dirname, '../loaders', loader + '.js');
    const loaderRequest = JSON.stringify(this.utils.contextify(this.context || this.rootContext, '!!' + loaderPath))

    this.addDependency(loaderPath);

    return `${ JSON.stringify(loader) }: require(${ loaderRequest })`;
  });

  const cacheMaps = (params.cacheMaps || []).map((map) => {
    return `{
      match: ${map.match},
      to: ${map.to},
      requestTypes: ${JSON.stringify(map.requestTypes)},
    }`;
  });

  this.addDependency(templatePath);

  let loadersCode = '{}';

  if (loaders.length) {
    loadersCode = `{
      ${loaders.join(',\n')}
    }`;
  }

  let cacheMapsCode = '[]';

  if (cacheMaps.length) {
    cacheMapsCode = `[
      ${cacheMaps.join(',\n')}
    ]`;
  }

  const navigationPreloadCode = params.navigationPreload;

  const helpersCode = [
    ', {',
      `loaders: ${loadersCode},`,
      `cacheMaps: ${cacheMapsCode},`,
      `navigationPreload: ${navigationPreloadCode},`,
    '}',
  ];

  Promise.all([
    ...modules.map(mod => readFile(path.join(__dirname, mod))),
    readFile(templatePath).then(template => {
      template = `
        ${ template }
        WebpackServiceWorker(${ params.data_var_name }${ helpersCode.join('\n') });
        ${ source }
      `;

      return template;
    }),
  ]).then(all => {
    callback(null, all.join(';'));
  }).catch(err => callback(err));
};

function readFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, 'utf-8', function(err, file) {
      if (err) {
        reject(err);
        return;
      }

      resolve(file);
    });
  });
}