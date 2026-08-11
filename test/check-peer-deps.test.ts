import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('check-peer-deps', () => {
  it('finds installed peers even when package.json is not exported', () => {
    const output = execFileSync(process.execPath, ['scripts/check-peer-deps.cjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    expect(output).toContain('OK   stream-diffs@')
    expect(output).toContain('OK   octane@')
    expect(output).toContain('Peer dependency check passed.')
  })
})
