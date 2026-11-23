const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const updater = 'electron-updater'

function dependencyNames(graph, roots) {
  const locations = new Set(roots.map(name => `node_modules/${name}`))
  for (const location of locations) {
    for (const dependency of graph.get(location) ?? []) locations.add(dependency)
  }
  return new Set([...locations].map(location => `/${location}`.split('/node_modules/').at(-1)))
}

module.exports = function excludeMacUpdateDependencies({ electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin') return

  const { projectDir, platformSpecificBuildOptions } = packager
  const { dependencies, optionalDependencies, peerDependencies } = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
  const runtime = Object.keys({ ...dependencies, ...optionalDependencies, ...peerDependencies })
  const result = execFileSync('npm', ['query', '--package-lock-only', '--offline', '--loglevel=error', '*'], {
    cwd: projectDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  const graph = new Map(JSON.parse(result).map(({ location, to }) => [location, to]))
  const retained = dependencyNames(graph, runtime.filter(name => name !== updater))
  const exclusions = [...dependencyNames(graph, [updater])]
    // Keep shared dependencies even if the packager relocates them within node_modules.
    .filter(name => !retained.has(name))
    .map(name => `!**/node_modules/${name}{,/**/*}`)
  // An exclusion-only platform matcher makes electron-builder include the whole project.
  platformSpecificBuildOptions.files = [
    ...new Set([].concat(platformSpecificBuildOptions.files ?? [], 'package.json', exclusions)),
  ]
}
