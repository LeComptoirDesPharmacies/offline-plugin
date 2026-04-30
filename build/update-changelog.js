// Renames the `### Unreleased` section in CHANGELOG.md to the version being
// released. Run automatically by `npm version` (see `scripts.version` in
// package.json), so it has access to the new version via the
// `npm_package_version` env var.
//
// Contributors only need to add their entries under `### Unreleased` — they
// never have to know the next version number.

const fs = require('fs');
const path = require('path');

const version = process.env.npm_package_version;
if (!version) {
  console.error('npm_package_version is not set; this script must be run by `npm version`.');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const changelogPath = path.resolve('CHANGELOG.md');
let content = fs.readFileSync(changelogPath, 'utf8');

// Capture the body between `### Unreleased` and the next `### ` heading
// (or end of file). The `*?` is lazy so it stops at the first match.
const re = /### Unreleased\n([\s\S]*?)(?=\n### |\n*$)/;
const match = content.match(re);
if (!match) {
  console.warn('No "### Unreleased" section in CHANGELOG.md — leaving file untouched.');
  process.exit(0);
}

const body = match[1].replace(/^\s+|\s+$/g, '');
const replacement = body
  ? `### Unreleased\n\n### ${version} (${date})\n\n${body}\n`
  : `### Unreleased\n\n### ${version} (${date})\n\n_No notable changes._\n`;

content = content.replace(re, replacement);
fs.writeFileSync(changelogPath, content);
console.log(`CHANGELOG.md: Unreleased -> ${version} (${date})`);
