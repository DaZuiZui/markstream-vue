#!/usr/bin/env node
// Ensure a package's previous stable line is preserved on `legacy` before a
// new major takes `latest`. Uses the same plan as resolve-dist-tag.mjs, so
// this matches exactly what the dist-tag resolver would refuse.
//
// npm dist-tags propagate asynchronously: after `npm dist-tag add`, other
// registry edges may still serve the old tag set for a few seconds. The
// publish step reads tags right after this step, so wait until the alias is
// globally visible before returning.
//
// Usage: node scripts/preserve-legacy-tag.mjs <package-name> <version>
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { readPublishedDistTags, resolveDistTagPlan } from './resolve-dist-tag.mjs'

const [packageName, version] = process.argv.slice(2)
if (!packageName || !version)
  throw new Error('Usage: node scripts/preserve-legacy-tag.mjs <package-name> <version>')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForAlias(tag, aliasVersion) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const tags = readPublishedDistTags(packageName)
    if (tags[tag] === aliasVersion) {
      console.log(`[preserve-legacy-tag] ${packageName} ${tag}=${aliasVersion} visible after ${attempt + 1} poll(s).`)
      return true
    }
    await sleep(2000)
  }
  return false
}

async function main() {
  const plan = resolveDistTagPlan(version, readPublishedDistTags(packageName))
  if (plan.requiredAliases.length === 0) {
    console.log(`[preserve-legacy-tag] ${packageName}@${version} needs no legacy alias.`)
    return
  }

  for (const { tag, version: aliasVersion } of plan.requiredAliases) {
    console.log(`[preserve-legacy-tag] ${packageName}@${aliasVersion} → ${tag}`)
    const result = spawnSync('npm', ['dist-tag', 'add', `${packageName}@${aliasVersion}`, tag, '--registry=https://registry.npmjs.org/'], {
      stdio: 'inherit',
      env: process.env,
    })
    if (result.status !== 0)
      process.exit(result.status ?? 1)
    if (!(await waitForAlias(tag, aliasVersion)))
      throw new Error(`[preserve-legacy-tag] ${packageName} ${tag}=${aliasVersion} not visible on npm after polling.`)
  }
}

await main()
