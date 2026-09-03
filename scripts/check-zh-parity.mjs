import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const checks = [
  {
    label: 'guide',
    enDir: path.join(root, 'docs', 'guide'),
    zhDir: path.join(root, 'docs', 'zh', 'guide'),
    failOnMissing: true,
  },
  {
    label: 'components',
    enDir: path.join(root, 'docs', 'components'),
    zhDir: path.join(root, 'docs', 'zh', 'components'),
    failOnMissing: true,
  },
  {
    label: 'frameworks',
    enDir: path.join(root, 'docs', 'frameworks'),
    zhDir: path.join(root, 'docs', 'zh', 'frameworks'),
    failOnMissing: false,
  },
  {
    label: 'use-cases',
    enDir: path.join(root, 'docs', 'use-cases'),
    zhDir: path.join(root, 'docs', 'zh', 'use-cases'),
    failOnMissing: false,
  },
  {
    label: 'compare',
    enDir: path.join(root, 'docs', 'compare'),
    zhDir: path.join(root, 'docs', 'zh', 'compare'),
    failOnMissing: false,
  },
]

async function listMarkdownFiles(dir, prefix = '') {
  const files = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name
    const absolutePath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(absolutePath, relativePath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.md'))
      files.push(relativePath.replace(/\\/g, '/'))
  }

  return files
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  }
  catch {
    return false
  }
}

async function missingZhFiles(check) {
  const enFiles = await listMarkdownFiles(check.enDir)
  const missing = []

  for (const file of enFiles) {
    if (!await fileExists(path.join(check.zhDir, file)))
      missing.push(file)
  }

  return missing
}

async function main() {
  const failures = []
  const warnings = []

  for (const check of checks) {
    const missing = await missingZhFiles(check)
    if (missing.length === 0)
      continue

    const message = `${check.label}: missing zh translations for ${missing.join(', ')}`
    if (check.failOnMissing)
      failures.push(message)
    else
      warnings.push(message)
  }

  for (const warning of warnings)
    console.warn(`[zh-parity] warning: ${warning}`)

  if (failures.length > 0) {
    console.error('Missing required zh translations:')
    failures.forEach(failure => console.error(` - ${failure}`))
    console.error('\nHint: run `pnpm docs:sync-zh` to create placeholders.')
    process.exit(1)
  }

  console.log('Required zh docs parity checks passed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
