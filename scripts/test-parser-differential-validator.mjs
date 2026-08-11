#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const validatorPath = fileURLToPath(new URL('./validate-parser-differential.mjs', import.meta.url))
const planArgs = [validatorPath, '--print-plan', '--fixture=math-crlf-unicode', '--seed=62601']

function run(args, env = process.env) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env,
  })
}

const firstPlan = run(planArgs)
const secondPlan = run(planArgs)
assert.equal(firstPlan.status, 0, firstPlan.stderr)
assert.equal(secondPlan.status, 0, secondPlan.stderr)
assert.equal(firstPlan.stdout, secondPlan.stdout, 'fixed seed produced different action plans')

const validationArgs = [validatorPath, '--fixture=math-crlf-unicode', '--seed=62601']
const firstValidation = run(validationArgs)
const secondValidation = run(validationArgs)
assert.equal(firstValidation.status, 0, firstValidation.stderr)
assert.equal(secondValidation.status, 0, secondValidation.stderr)
assert.equal(firstValidation.stdout, secondValidation.stdout, 'fixed seed produced different validation output')

const divergence = run(
  validationArgs,
  {
    ...process.env,
    MARKSTREAM_PARSER_DIFFERENTIAL_INJECT_DIVERGENCE: '1',
  },
)
const diagnostic = `${divergence.stdout}\n${divergence.stderr}`
assert.notEqual(divergence.status, 0, 'injected divergence unexpectedly passed')
for (const expected of [
  'seed: 62601',
  'fixture: math-crlf-unicode',
  'commit index:',
  'options:',
  'original fixture:',
  'action trace:',
  'replay:',
]) {
  assert.match(diagnostic, new RegExp(expected), `missing failure diagnostic: ${expected}`)
}

console.log('[parser-differential-self-test] Determinism and divergence diagnostics passed.')
