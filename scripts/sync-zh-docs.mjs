import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const enDir = path.join(root, 'docs', 'guide')
const zhDir = path.join(root, 'docs', 'zh', 'guide')

async function ensureDir(d) {
  try {
    await fs.mkdir(d, { recursive: true })
  }
  catch {
    // ignore
  }
}

function toZhFilename(file) {
  return file
}

async function main() {
  await ensureDir(zhDir)
  const files = await fs.readdir(enDir)
  const mdFiles = files.filter(f => f.endsWith('.md'))

  const created = []
  for (const f of mdFiles) {
    const enPath = path.join(enDir, f)
    const zhPath = path.join(zhDir, toZhFilename(f))
    // decide whether to create or refresh placeholder
    let shouldWrite = false
    try {
      await fs.access(zhPath)
      const cur = await fs.readFile(zhPath, 'utf8')
      if (/中文占位|自动生成占位/.test(cur)) {
        shouldWrite = true // refresh old placeholder with improved template
      }
      else {
        // translation exists; skip
        continue
      }
    }
    catch {
      // file doesn't exist -> create placeholder
      shouldWrite = true
    }

    if (!shouldWrite)
      continue
    const enContent = await fs.readFile(enPath, 'utf8')
    // eslint-disable-next-line regexp/no-super-linear-backtracking
    const titleMatch = enContent.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1].trim() : path.basename(f, '.md')

    // include a short excerpt to help translators
    // Use a robust, non-regex approach to extract a short excerpt from the
    // section content to avoid regexp backtracking issues flagged by eslint.
    const startIdx = titleMatch ? enContent.indexOf(titleMatch[0]) + titleMatch[0].length : 0
    const excerptRaw = enContent.slice(startIdx).trim().split('\n').slice(0, 6).join(' ')
    const excerpt = excerptRaw.substring(0, 300).trim()

    const placeholder = `# ${title}（中文占位）\n\n`
      + `> 原文节选（仅供翻译参考）：\n\n${
        excerpt ? `> ${excerpt.replace(/\n/g, '\n> ')}\n\n` : ''
      }## 说明\n\n此页面为中文占位，原文（English）：/guide/${f}。\n\n`
      + `- [ ] 翻译标题和正文\n`
      + `- [ ] 本地化示例中的代码注释\n`
      + `- [ ] 检查链接并改为 /zh/ 前缀（如有）\n`
      + `\n`
      + `如果你愿意贡献中文翻译，请参考翻译指南并提交 PR：/guide/translation\n\n`
      + `---\n\n`
      + `> 自动生成占位：将原文翻译并替换此文件的内容即可。\n`

    await fs.writeFile(zhPath, placeholder, 'utf8')
    created.push(zhPath)
  }

  if (created.length) {
    console.log('Created placeholders for missing zh docs:')
    created.forEach(f => console.log('  -', f))
  }
  else {
    console.log('All zh docs exist. Nothing to create.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
