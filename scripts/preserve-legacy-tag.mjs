#!/usr/bin/env node
// Ensure a package's previous stable line is preserved on `legacy` before a
// new major takes `latest`. Uses the same plan as resolve-dist-tag.mjs, so
// this matches exactly what the dist-tag resolver would refuse.
//
// Usage: node scripts/preserve-legacy-tag.mjs <package-name> <version>
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { resolveDistTagPlan, readPublishedDistTags } from './resolve-dist-tag.mjs'

const [packageName, version] = process.argv.slice(2)
if (!packageName || !version)
  throw new Error('Usage: node scripts/preserve-legacy-tag.mjs <package-name> <version>')

const plan = resolveDistTagPlan(version, readPublishedDistTags(packageName))
for (const { tag, version: aliasVersion } of plan.requiredAliases) {
  console.log(`[preserve-legacy-tag] ${packageName}@${aliasVersion} → ${tag}`)
  const result = spawnSync('npm', ['dist-tag', 'add', `${packageName}@${aliasVersion}`, tag, '--registry=https://registry.npmjs.org/'], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0)
    process.exit(result.status ?? 1)
}

if (plan.requiredAliases.length === 0)
  console.log(`[preserve-legacy-tag] ${packageName}@${version} needs no legacy alias.`)