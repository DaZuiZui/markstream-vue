#!/usr/bin/env node
// Prints the npm dist-tag arguments for shell expansion inside `pnpm release`:
//
//   pnpm publish --access public $(node ../../scripts/dist-tag.mjs)
//
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { resolvePublishedDistTag } from './resolve-dist-tag.mjs'

const packageJsonPath = process.argv[2] ?? 'package.json'
const { name, version } = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const distTag = resolvePublishedDistTag(name, version)

process.stdout.write(`--tag ${distTag}`)
