# Releasing

`@lcdp/offline-plugin` is published to npm by GitHub Actions
(`.github/workflows/ci-publish.yml`). There are two flows.

## Prerelease (automatic on push to `bugfix/**` / `feature/**`)

Every push to a branch matching `bugfix/**` or `feature/**` builds, runs the
fixture tests, and publishes a prerelease to npm under the `dev` dist-tag. The
version string is derived as `<base>-<sanitized-branch>.<run-number>` — for
example, a push on `bugfix/5` while `package.json` is at `5.1.7` and the run
number is `42` produces `5.1.7-bugfix-5.42`.

Consumers who want to test the in-progress branch can install with:

```bash
npm install @lcdp/offline-plugin@dev
# or pin to the exact version
npm install @lcdp/offline-plugin@5.1.7-bugfix-5.42
```

PRs targeting `master` only run build + tests; nothing is published.

## Stable release (manual)

Stable releases are cut from `master` via a manual workflow trigger.

### Pre-flight

1. Make sure `master` is in the state you want to release (all PRs merged).
2. Verify `CHANGELOG.md` has the right entries under `### Unreleased`. The
   release workflow automatically renames that heading to the version being
   cut and dates it — contributors never have to know the next version
   number. See [Changelog conventions](#changelog-conventions) below.

### Trigger the release

1. Go to **Actions → CI / Publish → Run workflow** in the GitHub UI.
2. Leave the branch field on `master` (only used to pick which version of
   the workflow file to run; the job always checks out `master` regardless).
3. Fill in the **Version bump** input. Accepted values:
   - `patch` / `minor` / `major` / `prerelease` (semver keywords)
   - An explicit version: `6.0.0`, `6.0.0-rc.1`, `6.1.0-beta.0`, …
4. Optionally tick **Dry run** to validate the workflow without pushing or
   publishing — useful when changing the workflow itself.
5. Click **Run workflow**.

### What happens

The job runs `npm version <input>` on `master`, which bumps `package.json`
and creates a git tag in one atomic operation. It then `git push --follow-tags
origin master` (commit + tag together) and `npm publish` to the appropriate
dist-tag:

- Version contains `-` (e.g. `6.0.0-rc.1`) → published with `dev` tag.
- Otherwise (e.g. `6.0.0`) → published with `latest` tag.

After the run, `master` has a new `Release X.Y.Z` commit and a `vX.Y.Z` tag,
and the package is live on npm.

## Changelog conventions

`CHANGELOG.md` always has a `### Unreleased` section at the top. PRs add new
entries under it without specifying a version:

```markdown
### Unreleased

* Fix #42: foo no longer crashes on bar
* Add new option `baz`
```

When the release workflow runs `npm version`, the `version` lifecycle hook
(`scripts.version` in `package.json`) executes `build/update-changelog.js`,
which:

1. Finds the `### Unreleased` body
2. Renames it to `### X.Y.Z (YYYY-MM-DD)` (where `X.Y.Z` is the new version)
3. Inserts a fresh empty `### Unreleased` placeholder above
4. Stages the modified `CHANGELOG.md`

`npm version` then bundles both the bumped `package.json` and the rewritten
`CHANGELOG.md` into the same `Release X.Y.Z` commit, and tags it `vX.Y.Z`.

If `### Unreleased` is empty when the workflow runs, the new section gets
"_No notable changes._" as a placeholder body — fine for a release with
nothing to document.

## Required setup

### npm Trusted Publisher (OIDC)

The workflow uses npm Trusted Publishers (no `NPM_TOKEN` required). Configure
once in npmjs.com → package settings → **Publishing access**:

- Provider: GitHub Actions
- Organization: `LeComptoirDesPharmacies`
- Repository: `offline-plugin`
- Workflow filename: `ci-publish.yml`
- Environment: *(leave empty)*

npm only allows **one** Trusted Publisher per package, so both the prerelease
and the stable release flows must live in the same workflow file.

### GitHub branch protection

The release flow pushes a commit to `master`. If `master` is protected, add
`github-actions[bot]` to the bypass list, or relax the rule for that actor.
Otherwise the `git push` step fails.

### Repository workflow permissions

The release flow needs write access to push the bump commit and tag:
**Settings → Actions → General → Workflow permissions** must be set to
"Read and write permissions".

## Troubleshooting

- **`npm publish` returns 404** — almost always a Trusted Publisher misconfig
  (workflow filename mismatch, organization typo, or environment set when it
  shouldn't be). Re-check the npm UI.
- **`git push` fails with "protected branch"** — see "GitHub branch protection"
  above.
- **Prerelease never publishes** — check the npm version on the runner. OIDC
  Trusted Publishing requires `npm` ≥ 11.5.1. If the bundled npm is older,
  add a `npm install -g npm@latest` step before publishing.
- **Tag was created locally but push failed** — the bump commit + tag exist
  only on the runner and disappear when the runner shuts down. Just re-run
  the workflow.
