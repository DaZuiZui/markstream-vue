#!/usr/bin/env node
// Release the markstream 2.0 stable family.
//
//   node scripts/release-2.0.0-stable.mjs             # dry-run: validate + print plan
//   node scripts/release-2.0.0-stable.mjs --apply     # bump versions, commit, tag, push
//   node scripts/release-2.0.0-stable.mjs --publish   # apply + full verify gate + npm publish + dist-tag cutover
//   node scripts/release-2.0.0-stable.mjs --publish --skip-verify
//
// Version matrix: every family package leaves the beta line and reuses the
// 2.0.0 major, except stream-markdown-parser which stays on its 1.x line as
// 1.2.8 (stable follow-up of 1.2.7-beta.1, which 2.0.0 beta coordinated on).
//
// Dist-tag cutover (handled automatically in --publish):
//   - each package's previous `latest` (the 1.x/0.x stable line) moves to `legacy`
//   - 2.0.0 becomes `latest`
// The npm `latest` tag must never silently jump majors; if the cutover step is
// skipped, `resolve-dist-tag` refuses with the exact `npm dist-tag add` commands.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PUBLISH = process.argv.includes('--publish')
const APPLY = process.argv.includes('--apply') || PUBLISH
const DRY = !APPLY
const SKIP_VERIFY = process.argv.includes('--skip-verify')

function run(cmd, args, opts = {}) {
  console.log(`[release] $ ${cmd} ${args.join(' ')}`)
  if (DRY && !opts.allowDry)
    return
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts })
}

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()
}

function fail(message) {
  console.error(`[release] ✗ ${message}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. Version matrix
// ---------------------------------------------------------------------------
const FAMILY = [
  { name: 'stream-markdown-parser', dir: 'packages/markdown-parser', version: '1.2.8' },
  { name: 'markstream-core', dir: 'packages/markstream-core', version: '2.0.0' },
  { name: 'markstream-vue', dir: '.', version: '2.0.0' },
  { name: 'markstream-react', dir: 'packages/markstream-react', version: '2.0.0' },
  { name: 'markstream-octane', dir: 'packages/markstream-octane', version: '2.0.0' },
  { name: 'markstream-svelte', dir: 'packages/markstream-svelte', version: '2.0.0' },
  { name: 'markstream-angular', dir: 'packages/markstream-angular', version: '2.0.0' },
  { name: 'markstream-vue2', dir: 'packages/markstream-vue2', version: '2.0.0' },
]

const PUBLISH_ORDER = [
  'stream-markdown-parser', // dependencies of core
  'markstream-core', // dependency of every adapter
  'markstream-vue',
  'markstream-react',
  'markstream-octane',
  'markstream-svelte',
  'markstream-angular',
  'markstream-vue2',
]

// ---------------------------------------------------------------------------
// 2. Preflight
// ---------------------------------------------------------------------------
if (PUBLISH && !APPLY)
  fail('--publish implies --apply; run without --publish for a dry-run.')

const branch = git(['branch', '--show-current'])
if (branch !== 'main')
  fail(`expected to run on main, current branch is ${branch}`)

const status = git(['status', '--porcelain'])
if (status)
  fail('working tree is not clean. Commit or stash changes first.')

await git(['fetch', 'origin'])
const head = git(['rev-parse', 'HEAD'])
const remote = git(['rev-parse', 'origin/main'])
if (head !== remote)
  fail(`local main (${head.slice(0, 9)}) is not in sync with origin/main (${remote.slice(0, 9)}). Pull first.`)

console.log('[release] preflight OK: main in sync, tree clean.')

// ---------------------------------------------------------------------------
// 3. Plan
// ---------------------------------------------------------------------------
const manifests = FAMILY.map((pkg) => {
  const jsonPath = path.join(ROOT, pkg.dir, 'package.json')
  if (!existsSync(jsonPath))
    fail(`missing manifest: ${jsonPath}`)
  const manifest = JSON.parse(readFileSync(jsonPath, 'utf8'))
  if (manifest.name !== pkg.name)
    fail(`${jsonPath} has name "${manifest.name}", expected "${pkg.name}"`)
  return { ...pkg, jsonPath, manifest }
})

for (const pkg of manifests)
  console.log(`[release] plan: ${pkg.name} ${pkg.manifest.version} → ${pkg.version}`)

if (DRY) {
  console.log('[release] dry-run complete. Re-run with --apply (bump) or --publish (bump + verify + npm publish + dist-tag cutover).')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 4. Bump versions
// ---------------------------------------------------------------------------
for (const pkg of manifests) {
  pkg.manifest.version = pkg.version
  writeFileSync(pkg.jsonPath, `${JSON.stringify(pkg.manifest, null, 2)}\n`)
  console.log(`[release] bumped ${pkg.name} → ${pkg.version}`)
}

run('pnpm', ['install', '--lockfile-only'])

// ---------------------------------------------------------------------------
// 5. Docs & changelog
// ---------------------------------------------------------------------------
run('pnpm', ['run', 'docs:llms:generate'])
run('pnpm', ['run', 'docs:sync-zh'])

const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
if (!changelog.startsWith('## [2.0.0]'))
  fail('CHANGELOG.md does not start with a "## [2.0.0]" entry. Add the release notes first (the 2.0.0 section is hand-written; see the beta.1–beta.3 sections for material).')

// Peer-dependency sanity after the version jump
run('pnpm', ['run', 'check:peer-deps'])

// ---------------------------------------------------------------------------
// 6. Commit + tags
// ---------------------------------------------------------------------------
// Idempotent: when the release commit already exists (e.g. a previous
// --apply run), the bump and docs regeneration produce no diff and the
// commit/tag steps are skipped instead of failing.
for (const pkg of manifests) {
  const current = JSON.parse(readFileSync(pkg.jsonPath, 'utf8')).version
  if (current !== pkg.version)
    fail(`${pkg.name} is still ${current}, expected ${pkg.version}. Version bump did not materialize.`)
  console.log(`[release] confirmed ${pkg.name}@${pkg.version}`)
}

run('git', ['add', 'package.json', 'pnpm-lock.yaml', 'packages', 'docs', 'CHANGELOG.md', 'README.md'])

let hasChanges = true
try {
  execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT, stdio: 'ignore' })
  hasChanges = false
}
catch {
  hasChanges = true
}

if (hasChanges) {
  run('git', ['commit', '-m', 'chore: release v2.0.0'])
}
else {
  console.log('[release] no staged changes — release commit already exists, skipping commit.')
}

run('pnpm', ['run', 'tag:parser:push'])
run('pnpm', ['run', 'tag:core:push'])
run('pnpm', ['run', 'tag:vue3:push'])
run('pnpm', ['run', 'tag:react:push'])
run('pnpm', ['run', 'tag:octane:push'])
run('pnpm', ['run', 'tag:svelte:push'])
run('pnpm', ['run', 'tag:angular:push'])
run('pnpm', ['run', 'tag:vue2:push'])

if (!PUBLISH) {
  console.log('[release] --apply complete: versions bumped, docs regenerated, release commit + tags pushed.')
  console.log('[release] Next: node scripts/release-2.0.0-stable.mjs --publish')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// 7. Verify gate
// ---------------------------------------------------------------------------
if (!SKIP_VERIFY) {
  console.log('[release] running release verify gate (lint, typecheck, full vitest, API smoke, packed smoke).')
  run('pnpm', ['run', 'release:verify'])
}

// ---------------------------------------------------------------------------
// 8. Publish + dist-tag cutover
// ---------------------------------------------------------------------------
// Cutover first: move each package's previous stable line to `legacy` so
// `latest` can advance to 2.0.0 without silently dropping the 1.x/0.x channel.
for (const pkg of manifests) {
  const distTags = JSON.parse(execFileSync('npm', ['view', pkg.name, 'dist-tags', '--json'], { encoding: 'utf8' }))
  const currentLatest = distTags.latest
  if (!currentLatest)
    continue
  const currentMajor = Number(currentLatest.split('.')[0])
  const targetMajor = Number(pkg.version.split('.')[0])
  if (targetMajor > currentMajor && distTags.legacy !== currentLatest) {
    console.log(`[release] cutover: ${pkg.name} legacy → ${currentLatest}`)
    run('npm', ['dist-tag', 'add', `${pkg.name}@${currentLatest}`, 'legacy'])
  }
  if (distTags['legacy-next'] !== currentLatest && distTags.next && distTags.next !== pkg.version) {
    console.log(`[release] cutover: ${pkg.name} legacy-next → ${distTags.next}`)
    run('npm', ['dist-tag', 'add', `${pkg.name}@${distTags.next}`, 'legacy-next'])
  }
}

for (const name of PUBLISH_ORDER) {
  const pkg = manifests.find(p => p.name === name)
  if (!pkg)
    fail(`publish target not in matrix: ${name}`)
  // Each publish command resolves its own dist-tag (2.0.0 → `latest`,
  // parser 1.2.8 → `latest`), verifies published deps, runs prepublishOnly
  // smoke checks, and creates/pushes the release tag atomically.
  run('pnpm', ['run', `publish:${name === 'stream-markdown-parser' ? 'parser' : name === 'markstream-vue' ? 'vue3' : name.replace('markstream-', '')}:current`])
}

console.log('[release] 2.0.0 family published.')
console.log('[release] Next:')
console.log('  pnpm run docs:build:ci && pnpm run size:check   # docs + bundle gates')
console.log('  gh release create 2.0.0 --title "markstream-vue 2.0.0" --notes-from-tag')
