import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPublishedDistTags, resolveDistTag, resolveDistTagPlan, resolvePublishedDistTag } from '../scripts/resolve-dist-tag.mjs'

describe('release dist-tag routing', () => {
  it.each([
    ['2.0.0', { latest: '1.0.9' }, 'latest'],
    ['1.0.10', { latest: '2.0.0' }, 'legacy'],
    ['1.0.10', { latest: '1.0.9' }, 'latest'],
    ['2.0.0-beta.1', { latest: '1.0.9', next: '1.1.2-beta.2' }, 'next'],
    ['1.1.3-beta.1', { latest: '1.0.9', next: '2.0.0-beta.1' }, 'legacy-next'],
    ['1.1.3-beta.1', { latest: '2.0.0' }, 'legacy-next'],
    ['1.1.3-beta.1', { latest: '1.0.9', next: '1.1.2-beta.2' }, 'next'],
    ['1.1.3+build.1', { latest: '1.0.9' }, 'latest'],
    ['1.0.0', {}, 'latest'],
    ['1.0.0-beta.1', {}, 'next'],
  ])('routes %s against %j to %s', (version, distTags, expected) => {
    expect(resolveDistTag(version, distTags)).toBe(expected)
  })

  it('fails closed for malformed published versions', () => {
    expect(() => resolveDistTag('1.0.0', { latest: 'not-semver' })).toThrow('Invalid npm latest version')
    expect(() => resolveDistTag('1.0.0-beta.1', { next: 'not-semver' })).toThrow('Invalid npm next version')
  })

  it.each([
    '01.2.3',
    '1.02.3',
    '1.2.3-beta..1',
    '1.2.3-beta_1',
    '9007199254740992.0.0',
    '1.2.3 ',
    '1.2.3\n',
  ])('rejects invalid candidate SemVer %s', (version) => {
    expect(() => resolveDistTag(version)).toThrow('Invalid candidate version')
  })

  it('rejects non-canonical published SemVer', () => {
    expect(() => resolveDistTag('2.0.0', { latest: '1.2.3 ' })).toThrow('Invalid npm latest version')
    expect(() => resolveDistTag('2.0.0-beta.1', { next: '1.2.3\n' })).toThrow('Invalid npm next version')
  })

  it('requires the old channels to be preserved before a major cutover', () => {
    expect(resolveDistTagPlan('2.0.0-beta.1', {
      latest: '1.0.9',
      next: '1.1.2-beta.2',
    })).toEqual({
      publishTag: 'next',
      requiredAliases: [{ tag: 'legacy-next', version: '1.1.2-beta.2' }],
    })
    expect(resolveDistTagPlan('2.0.0', {
      latest: '1.0.9',
    })).toEqual({
      publishTag: 'latest',
      requiredAliases: [{ tag: 'legacy', version: '1.0.9' }],
    })
    expect(resolveDistTagPlan('2.0.0', {
      'latest': '1.0.9',
      'legacy': '1.0.9',
      'next': '2.0.0-beta.1',
      'legacy-next': '1.1.2-beta.2',
    })).toEqual({
      publishTag: 'latest',
      requiredAliases: [],
    })
  })

  it('fails with the exact migration command when a cutover alias is missing', () => {
    const run = () => ({
      status: 0,
      stdout: JSON.stringify({ latest: '1.0.9', next: '1.1.2-beta.2' }),
      stderr: '',
    })
    expect(() => resolvePublishedDistTag('markstream-vue', '2.0.0-beta.1', run))
      .toThrow('npm dist-tag add markstream-vue@1.1.2-beta.2 legacy-next')
  })

  it('treats an npm 404 as the first package release', () => {
    const run = () => ({ status: 1, stderr: 'npm error code E404' })
    expect(readPublishedDistTags('new-package', run)).toEqual({})
  })

  it('fails closed when the registry cannot be read', () => {
    const run = () => ({ status: 1, stderr: 'network timeout' })
    expect(() => readPublishedDistTags('markstream-vue', run)).toThrow('Unable to read npm dist-tags')
  })

  it('uses the shared resolver in every stable publish path', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release-stable.yml'), 'utf8')
    const releaseCli = readFileSync(resolve(process.cwd(), 'scripts/dist-tag.mjs'), 'utf8')
    const publishCurrent = readFileSync(resolve(process.cwd(), 'scripts/publish-current-package.mjs'), 'utf8')

    expect(workflow).toContain('DIST_TAG="$(node scripts/resolve-dist-tag.mjs')
    expect(releaseCli).toContain('from \'./resolve-dist-tag.mjs\'')
    expect(publishCurrent).toContain('from \'./resolve-dist-tag.mjs\'')
  })
})
