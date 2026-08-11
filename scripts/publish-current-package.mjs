#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveDistTag, resolvePublishedDistTag } from './resolve-dist-tag.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

// Workspace packages that may appear as `workspace:*` ranges in subpackage
// manifests. npm publish does not resolve the workspace protocol, so the
// ranges are temporarily materialized to the exact local version before
// publishing and restored afterwards.
const workspaceDeps = [
  { name: 'markstream-core', packageJson: 'packages/markstream-core/package.json' },
  { name: 'stream-markdown-parser', packageJson: 'packages/markdown-parser/package.json' },
]

function parseArgs(argv) {
  const args = {
    packageJson: 'package.json',
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const current = argv[i]
    if (current === '--package-json') {
      args.packageJson = argv[++i]
    }
    else if (current === '--dry-run') {
      args.dryRun = true
    }
    else if (current === '--help' || current === '-h') {
      console.log('Usage: node scripts/publish-current-package.mjs --package-json <path> [--dry-run]')
      process.exit(0)
    }
    else {
      throw new Error(`Unknown argument: ${current}`)
    }
  }

  return args
}

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.status !== 0)
    process.exit(result.status ?? 1)
}

function packageVersionExists(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result.status === 0 && result.stdout.trim() === version
}

function gitCommit(ref) {
  const result = spawnSync('git', ['rev-parse', `${ref}^{}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result.status === 0 ? result.stdout.trim() : null
}

function assertPublishedTagAtHead(packageJson) {
  const tagName = `${packageJson.name}@${packageJson.version}`
  const headCommit = gitCommit('HEAD')
  const tagCommit = gitCommit(tagName)

  if (!headCommit)
    throw new Error('[publish-current] Unable to resolve current HEAD.')
  if (!tagCommit)
    throw new Error(`[publish-current] ${packageJson.name}@${packageJson.version} already exists on npm, but release tag ${tagName} is missing. Refusing to create a tag for an already-published version.`)
  if (tagCommit !== headCommit)
    throw new Error(`[publish-current] ${packageJson.name}@${packageJson.version} already exists on npm, but release tag ${tagName} points to ${tagCommit}; current HEAD is ${headCommit}. Refusing to retag an already-published version.`)

  console.log(`[publish-current] Release tag already exists at current HEAD: ${tagName}`)
}

// Rewrites `workspace:*` dependency ranges in the given manifest to the exact
// local workspace versions so `npm publish` produces a standalone tarball.
// Returns the original file content (or null when nothing changed) so callers
// can restore the manifest afterwards.
function materializeWorkspaceDeps(packageJsonPath) {
  const original = readFileSync(packageJsonPath, 'utf8')
  const pkg = JSON.parse(original)
  let changed = false

  for (const dep of workspaceDeps) {
    const range = pkg.dependencies?.[dep.name]
    if (range !== 'workspace:*' && range !== 'workspace:^')
      continue
    const depPackageJson = JSON.parse(readFileSync(path.resolve(repoRoot, dep.packageJson), 'utf8'))
    pkg.dependencies[dep.name] = depPackageJson.version
    changed = true
  }

  if (!changed)
    return null
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`)
  return original
}

const args = parseArgs(process.argv.slice(2))
const packageJsonPath = path.resolve(repoRoot, args.packageJson)
const packageDir = path.dirname(packageJsonPath)
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const dryRunPublishArgs = args.dryRun ? ['--dry-run', '--ignore-scripts'] : []
const pnpmDryRunPublishArgs = args.dryRun ? [...dryRunPublishArgs, '--no-git-checks'] : []
const distTag = args.dryRun
  ? resolveDistTag(packageJson.version)
  : resolvePublishedDistTag(packageJson.name, packageJson.version)
const distTagArgs = ['--tag', distTag]

console.log(`[publish-current] ${packageJson.name}@${packageJson.version} (${distTagArgs.join(' ')})`)
run('pnpm', ['-C', packageDir, 'run', 'build'])
run('npm', ['config', 'get', 'registry'], packageDir)
const published = !args.dryRun && packageVersionExists(packageJson.name, packageJson.version)

// npm publish does not resolve the workspace protocol; materialize the ranges
// in memory for subpackage publishes and restore the manifest afterwards.
const originalManifest = !args.dryRun && !published && packageDir !== repoRoot
  ? materializeWorkspaceDeps(packageJsonPath)
  : null

try {
  if (published) {
    console.log(`[publish-current] ${packageJson.name}@${packageJson.version} already exists on npm; skipping publish.`)
    assertPublishedTagAtHead(packageJson)
  }
  else {
    if (!args.dryRun)
      run('npm', ['whoami'], packageDir)
    if (packageDir === repoRoot)
      run('pnpm', ['publish', '--access', 'public', ...distTagArgs, ...pnpmDryRunPublishArgs], packageDir)
    else
      run('npm', ['publish', '--access', 'public', ...distTagArgs, ...dryRunPublishArgs], packageDir)
    run('node', ['scripts/tag-package.mjs', '--package-json', path.relative(repoRoot, packageJsonPath), ...(args.dryRun ? ['--dry-run', '--allow-dirty'] : ['--push'])])
  }
}
finally {
  if (originalManifest !== null) {
    writeFileSync(packageJsonPath, originalManifest)
    console.log('[publish-current] Restored workspace:* dependency ranges.')
  }
}
