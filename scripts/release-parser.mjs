#!/usr/bin/env node
/**
 * Markstream parser release script — MAIN branch edition.
 *
 * Run from the repository root on the `main` branch:
 *
 *   node scripts/release-parser.mjs [--patch <version>] [--beta-suffix <s>]
 *       [--parser-only] [--skip-verify] [--dry-run]
 *
 * Release order (same parser fix on both branches):
 *   1. main:  stream-markdown-parser <patch>-beta.1  -> npm `next`
 *   2. 1.x:   stream-markdown-parser <patch>         -> npm `latest`
 *
 * The prerelease MUST exist before the final: semver orders 1.2.6-beta.1 < 1.2.6,
 * and `next` must never point at a version older than `latest`. Run this script
 * FIRST (main), then the 1.x branch script.
 *
 * This script only bumps the parser manifest. Downstream packages
 * (core / vue3 / react / octane / svelte / angular / vue2) are published by the
 * branch's own `release:family` chain (`--parser-only` disables that).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PARSER_DIR = path.join(ROOT, 'packages/markdown-parser')
const PACKAGE_NAME = 'stream-markdown-parser'
const EXPECTED_BRANCH = 'main'
const EXPECTED_DIST_TAG = 'next'

function run(cmd, args, cwd = ROOT, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `\`${cmd} ${args.join(' ')}\` failed (exit ${result.status}):\n${result.stderr?.trim() || result.stdout?.trim()}`,
    )
  }
  return result.stdout?.trim() ?? ''
}

function git(args, options) {
  return run('git', args, ROOT, options)
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'))
}

function parseArgs(argv) {
  const args = {
    patch: null,
    betaSuffix: 'beta.1',
    parserOnly: false,
    skipVerify: false,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--patch') {
      args.patch = argv[++i]
      if (!args.patch)
        throw new Error('--patch requires a value')
    }
    else if (arg === '--beta-suffix') {
      args.betaSuffix = argv[++i]
      if (!args.betaSuffix)
        throw new Error('--beta-suffix requires a value')
    }
    else if (arg === '--parser-only') {
      args.parserOnly = true
    }
    else if (arg === '--skip-verify') {
      args.skipVerify = true
    }
    else if (arg === '--dry-run') {
      args.dryRun = true
    }
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/release-parser.mjs [--patch <version>] [--beta-suffix <s>] [--parser-only] [--skip-verify] [--dry-run]

Release the parser on the ${EXPECTED_BRANCH} branch (prerelease -> ${EXPECTED_DIST_TAG}).
Run this on ${EXPECTED_BRANCH} FIRST; then run the 1.x edition on the 1.x branch.

Options:
  --patch <v>         Explicit patch baseline (default: npm latest + 1 patch)
  --beta-suffix <s>   Prerelease suffix, default beta.1
  --parser-only       Skip the downstream release:family chain
  --skip-verify       Skip the verify:parser-release gate
  --dry-run           Plan only: no bump, no publish, no push`)
      process.exit(0)
    }
    else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

function npmDistTags() {
  const out = run('npm', ['view', PACKAGE_NAME, 'dist-tags', '--json'], ROOT, { allowFailure: true })
  if (!out)
    return {}
  try {
    return JSON.parse(out)
  }
  catch {
    throw new Error(`Invalid npm dist-tags response for ${PACKAGE_NAME}`)
  }
}

function nextPatch(version) {
  const parsed = semver.parse(version)
  if (!parsed)
    throw new Error(`Invalid version: ${version}`)
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
}

function isPublished(version) {
  const result = spawnSync('npm', ['view', `${PACKAGE_NAME}@${version}`, 'version', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0)
    return false // npm 11 prints an error JSON object on E404 but exits 1
  const out = result.stdout.trim()
  return out !== '' && semver.valid(out.replaceAll('"', '')) !== null
}

function plan(args) {
  const distTags = npmDistTags()
  const latest = distTags.latest
  if (!latest)
    throw new Error(`npm has no "latest" tag for ${PACKAGE_NAME}`)

  const target = args.patch ?? nextPatch(latest)
  const beta = `${target}-${args.betaSuffix}`
  const base = semver.parse(beta)
  if (!base || `${base.major}.${base.minor}.${base.patch}` !== target)
    throw new Error(`Invalid beta suffix: ${beta} is not a prerelease of ${target}`)

  if (isPublished(beta))
    throw new Error(`${PACKAGE_NAME}@${beta} is already published on npm`)
  if (isPublished(target))
    throw new Error(`${PACKAGE_NAME}@${target} is already published on npm`)
  if (semver.lte(target, latest))
    throw new Error(`Target ${target} must be > npm latest ${latest}`)

  const localManifest = readJson(path.join(PARSER_DIR, 'package.json'))
  if (localManifest.name !== PACKAGE_NAME)
    throw new Error(`Unexpected parser manifest: ${localManifest.name}`)

  const current = localManifest.version
  if (!semver.lt(current, beta))
    throw new Error(`Local parser version ${current} must be lower than target ${beta}; pick a higher patch (--patch)`)

  return { latest, target, beta, current }
}

function log(...parts) {
  console.log(`[release-parser:${EXPECTED_BRANCH}]`, ...parts)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const p = plan(args)

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== EXPECTED_BRANCH)
    throw new Error(`This script must run on the ${EXPECTED_BRANCH} branch (current: ${branch}). The 1.x edition lives on the 1.x branch.`)

  log(`npm latest: ${p.latest}`)
  log(`plan: ${PACKAGE_NAME} ${p.current} -> ${p.beta} (npm tag: ${EXPECTED_DIST_TAG})`)
  if (!args.parserOnly)
    log('after parser: run release:family (core -> vue3 -> react -> octane -> svelte -> angular -> vue2)')
  else
    log('parser-only: downstream family chain skipped')

  if (args.dryRun) {
    log('dry-run: no verify, no bump, no publish')
    return
  }

  if (!args.skipVerify) {
    log('verify:parser-release (full gate)')
    run('pnpm', ['--workspace-root', 'run', 'verify:parser-release'], ROOT, { stdio: 'inherit' })
  }
  else {
    log('verify skipped (--skip-verify)')
  }

  log(`bumpp ${p.beta} in packages/markdown-parser`)
  run('pnpm', ['exec', 'bumpp', p.beta, '--commit', '--no-tag', '--no-push'], PARSER_DIR, { stdio: 'inherit' })

  const bumped = readJson(path.join(PARSER_DIR, 'package.json')).version
  if (bumped !== p.beta)
    throw new Error(`Version after bump is ${bumped}, expected ${p.beta}`)

  const distTag = run('node', ['scripts/resolve-dist-tag.mjs', PACKAGE_NAME, p.beta], ROOT)
  if (distTag !== EXPECTED_DIST_TAG)
    throw new Error(`[fail-closed] ${PACKAGE_NAME}@${p.beta} resolves to dist-tag "${distTag}", expected "${EXPECTED_DIST_TAG}`)

  log(`npm publish ${PACKAGE_NAME}@${p.beta} --tag ${EXPECTED_DIST_TAG}`)
  run('npm', ['publish', '--access', 'public', '--tag', EXPECTED_DIST_TAG], PARSER_DIR, { stdio: 'inherit' })

  log(`push git tag ${PACKAGE_NAME}@${p.beta}`)
  run('node', ['../scripts/tag-package.mjs', '--package-json', 'package.json', '--push'], PARSER_DIR, { stdio: 'inherit' })

  if (!args.parserOnly) {
    log('release:family — publish all downstream markstream packages')
    run('pnpm', ['run', 'release:family'], ROOT, { stdio: 'inherit' })
  }

  log(`done. Next: checkout 1.x and run the 1.x edition (final ${p.target} -> latest)`)
}

main()
