const fs = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')
const process = require('node:process')

const repoRoot = process.cwd()
const packageJsonPaths = [
  path.join(repoRoot, 'package.json'),
  ...fs.readdirSync(path.join(repoRoot, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(repoRoot, 'packages', entry.name, 'package.json'))
    .filter(file => fs.existsSync(file)),
]

let hasError = false

for (const packageJsonPath of packageJsonPaths) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const peerDependencies = pkg.peerDependencies || {}
  const peerDependenciesMeta = pkg.peerDependenciesMeta || {}
  const peerNames = Object.keys(peerDependencies)

  if (peerNames.length === 0)
    continue

  const packageDir = path.dirname(packageJsonPath)
  const requireFromPackage = createRequire(path.join(packageDir, 'package.json'))

  console.log(`\n${pkg.name}`)

  for (const peerName of peerNames) {
    const isOptional = !!peerDependenciesMeta[peerName]?.optional

    try {
      const resolvedPackageJson = requireFromPackage.resolve.paths(peerName)
        ?.map(searchPath => path.join(searchPath, peerName, 'package.json'))
        .find(candidate => fs.existsSync(candidate))
      if (!resolvedPackageJson)
        throw new Error(`Unable to resolve ${peerName}`)
      const installedPackageJson = JSON.parse(fs.readFileSync(resolvedPackageJson, 'utf8'))
      console.log(`  OK   ${peerName}@${installedPackageJson.version}${isOptional ? ' (optional)' : ''}`)
    }
    catch {
      if (isOptional) {
        console.log(`  MISS ${peerName} (optional)`)
        continue
      }

      hasError = true
      console.error(`  FAIL ${peerName} is required but not installed`)
    }
  }
}

if (hasError) {
  console.error('\nPeer dependency check failed.')
  process.exit(1)
}

console.log('\nPeer dependency check passed.')
