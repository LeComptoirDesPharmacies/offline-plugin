# Design : Tests d'intégration dual webpack/rspack

## Contexte

Le plugin offline-plugin a été rendu compatible rspack (branche `feature/rspack-compatibility`), mais aucun test ne valide cette compatibilité. Un bug a été découvert en production : `compilation.getAsset().source` est `undefined` dans rspack pour les assets issus d'un child compiler, alors que webpack peuple toujours cette propriété.

Les tests existants (41 cas dans `tests/fixtures/`) utilisent un mécanisme de snapshot artisanal (comparaison byte-for-byte de `__output/` vs `__expected/`) et ne tournent qu'avec webpack. Ce mécanisme est incompatible avec un test dual-bundler car les outputs diffèrent entre webpack et rspack.

## Responsabilités du plugin à tester

1. **Émission du SW** — `sw.js` est émis avec les données `__wpo` correctes (assets, hashes, strategy, version, externals, etc.)
2. **Child compilation** — l'entry du SW (par défaut ou custom) est compilée et son source est concaténée dans `sw.js`
3. **Injection du runtime** — quand l'app importe `offline-plugin/runtime`, elle obtient le vrai runtime (avec `navigator.serviceWorker.register`) et non le stub
4. **Résolution des assets** — respect des patterns include/exclude, externals, caches main/additional/optional, regexp
5. **Résolution des chemins** — publicPath, relativePaths, output path du SW (inside/outside dist)
6. **Rewrites** — URL rewrites, cacheMaps, appShell, navigateFallbackURL

AppCache est explicitement hors scope : supprimé de tous les navigateurs ciblés (ES2022 baseline).

## Approche

**Matrice de compilation paramétrique** avec vitest et `describe.each(['webpack', 'rspack'])`. Chaque test :

1. Crée une config inline
2. Compile avec le bundler réel via un helper
3. Lit les fichiers émis **depuis le disque** (pas via l'API `compilation`)
4. Fait des assertions sémantiques sur le contenu

Aucun snapshot. Les tests ne vérifient que ce qui relève du plugin.

## Structure des fichiers

```
tests/
  helpers/
    compile.ts          # abstraction compilation → fichiers sur disque
    extract-sw-data.ts  # extrait __wpo via node:vm
  integration/
    sw-emission.test.ts        # sw.js émis, contenu __wpo correct
    sw-entry.test.ts           # child compilation (entry default + custom)
    runtime-loader.test.ts     # runtime injecté dans le bundle
    assets-resolution.test.ts  # include/exclude/externals/regexp
    paths.test.ts              # publicPath/relativePaths/output combinations
    rewrites.test.ts           # URL rewrites, cacheMaps, appShell
  vitest.config.ts
```

## Helper de compilation

```ts
type Bundler = 'webpack' | 'rspack';

interface CompileResult {
  assets: Record<string, string>;  // filename → contenu texte (lu depuis le disque)
  errors: string[];
  warnings: string[];
}

async function compile(bundler: Bundler, config: object): Promise<CompileResult>;
```

Le helper :
- Importe dynamiquement `webpack` ou `@rspack/core`
- Crée un tmpdir pour l'output
- Appelle `compiler.run()` (API publique commune aux deux bundlers)
- Lit tous les fichiers résultants depuis le disque avec `fs`
- Appelle `compiler.close()` pour le cleanup
- Normalise errors/warnings en strings

Aucun accès aux internals de `compilation` dans le helper. Le seul couplage bundler est `require(bundler)(config)` + `compiler.run()`.

## Extraction des données SW

```ts
function extractSwData(swSource: string): object {
  const vm = require('node:vm');
  const context = {};
  vm.runInNewContext(swSource, context);
  return context.__wpo;
}
```

Exécute le `sw.js` dans un contexte isolé via `node:vm`. Fonctionne quelle que soit la forme exacte de la déclaration.

## Couverture des tests

### sw-emission.test.ts

| Cas | Assertion sur `__wpo` |
|-----|----------------------|
| basic | `assets.main` contient les fichiers du build (hors excludes), `externals` listés |
| version hash | `version` correspond au hash calculé |
| responseStrategy cache-first | `responseStrategy === 'cache-first'` |
| responseStrategy network-first | `responseStrategy === 'network-first'` |
| updateStrategy all | `strategy === 'all'` |
| custom cache name | `name === 'webpack-offline:custom-cache-name'` |
| prefetchRequest | `prefetchRequest.credentials === 'include'` |
| pluginVersion | `pluginVersion` présent quand configuré |

### sw-entry.test.ts

| Cas | Assertion |
|-----|-----------|
| entry par défaut (empty-entry.js) | `sw.js` émis sans erreur, contient `__wpo` |
| entry custom | `sw.js` contient le code de l'entry ET les données `__wpo` |
| entry inexistant | compilation échoue avec erreur explicite |

### runtime-loader.test.ts

| Cas | Assertion sur le bundle principal |
|-----|----------------------------------|
| avec runtime importé | contient `navigator.serviceWorker.register` |
| avec runtime importé | ne contient PAS le warning stub |
| autoUpdate activé | contient `setInterval` |
| scope configuré | contient la valeur du scope dans le register |

### assets-resolution.test.ts

| Cas | Assertion sur `__wpo` |
|-----|----------------------|
| excludes `['main.js']` | `assets.main` ne contient pas `main.js` |
| excludes glob `['**/*.map']` | ne contient aucun `.map` |
| externals | `externals` contient les URLs déclarées |
| caches regexp `/\.js$/` | `assets.main` ne contient que les `.js` |
| caches `:rest:` | contient tous les assets non-listés ailleurs |
| cross-origin externals | URL absolues présentes |

### paths.test.ts

| Cas | Assertions |
|-----|-----------|
| output `sw.js` par défaut | asset `sw.js` à la racine du output |
| output `offline/sw.js` | asset dans sous-dossier |
| output `../sw.js` (outside) | asset émis au-dessus du output.path |
| publicPath `/dist/` | URLs dans `__wpo` préfixées par `/dist/` |
| relativePaths: true | URLs dans `__wpo` sont relatives |
| publicPath override sur ServiceWorker | `location` du SW utilise le publicPath custom |

### rewrites.test.ts

| Cas | Assertion |
|-----|-----------|
| index.html → `/` | `assets.main` contient `./` ou `/` au lieu de `index.html` |
| rewrite function custom | les assets passent par la fonction |
| cacheMaps | `sw.js` contient les cacheMaps sérialisées |
| appShell | `sw.js` contient le cacheMap appShell |
| navigateFallbackURL | présent dans `sw.js` |

## Mapping tests existants → nouveaux

37 des 41 cas existants sont couverts. 4 sont supprimés :
- `app-cache-disabled`, `app-cache-disabled-by-default`, `sw-disabled` : testent AppCache (hors scope)
- `sw-minify-minimize` : teste le minimizer du bundler, pas le plugin

1 cas ajouté : child compilation avec entry inexistant (test défensif).

## Configuration

### devDependencies ajoutées

- `@rspack/core` ^1.7.0
- `vitest` ^3.0.0
- `typescript` ^5.0.0

### devDependencies supprimées

- `dir-compare`, `diff`, `chalk`, `cli-highlight`, `del`, `mocha` (outillage snapshot)

### Scripts

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### Fichiers supprimés

Le dossier `tests/fixtures/` entier (run.js, compare.js, config.js, cases/) est supprimé une fois la migration terminée. Le dossier `tests/browser/` et `tests/run-browser-tests.js` sont hors scope (tests browser existants non concernés).

### vitest.config.ts

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './tests',
    testTimeout: 30000,
  }
});
```

Un `tsconfig.json` minimal pour les tests. Le code source du plugin reste en babel/ES5.
