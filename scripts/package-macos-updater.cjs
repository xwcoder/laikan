const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { Arch } = require('electron-builder')

const sparkleVersion = '2.10.1'
const archiveName = `Sparkle-${sparkleVersion}.tar.xz`
const archiveHash = '1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27'
const appcastURL = 'https://github.com/xwcoder/laikan/releases/latest/download/appcast.xml'

function hasExpectedHash(file) {
  return fs.existsSync(file) && createHash('sha256').update(fs.readFileSync(file)).digest('hex') === archiveHash
}

function getArchive(cacheDir, workDir) {
  const archive = path.join(cacheDir, archiveName)
  if (hasExpectedHash(archive)) return archive

  const download = path.join(workDir, archiveName)
  const url = `https://github.com/sparkle-project/Sparkle/releases/download/${sparkleVersion}/${archiveName}`
  execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '2', '--output', download, url])
  if (!hasExpectedHash(download)) throw Error('Sparkle SDK checksum did not match the pinned release')
  fs.renameSync(download, archive)
  return archive
}

function trimSparkle(framework, architecture) {
  const version = fs.realpathSync(path.join(framework, 'Versions', 'Current'))
  // The native updater does not enable Sparkle's optional XPC services.
  for (const folder of ['Headers', 'PrivateHeaders', 'Modules', 'XPCServices']) {
    fs.rmSync(path.join(framework, folder), { recursive: true, force: true })
    fs.rmSync(path.join(version, folder), { recursive: true, force: true })
  }
  for (const filename of ['Sparkle', 'Autoupdate', 'Updater.app/Contents/MacOS/Updater']) {
    const binary = path.join(version, filename)
    const thin = `${binary}.thin`
    execFileSync('lipo', [binary, '-thin', architecture, '-output', thin])
    fs.chmodSync(thin, fs.statSync(binary).mode & 0o777)
    fs.renameSync(thin, binary)
  }
}

module.exports = function packageMacUpdater(context) {
  const publicKey = process.env.LAIKAN_UPDATE_PUBLIC_KEY
  if (context.electronPlatformName !== 'darwin' || !publicKey) return

  const key = Buffer.from(publicKey, 'base64')
  if (key.length !== 32 || key.toString('base64') !== publicKey) {
    throw Error('LAIKAN_UPDATE_PUBLIC_KEY must contain a base64 Ed25519 public key')
  }

  const architectures = { [Arch.arm64]: 'arm64', [Arch.x64]: 'x86_64' }
  const architecture = architectures[context.arch]
  if (!architecture) throw Error(`Unsupported Sparkle architecture: ${Arch[context.arch]}`)

  const { projectDir, appInfo } = context.packager
  const contents = path.join(context.appOutDir, `${appInfo.productFilename}.app`, 'Contents')
  const frameworks = path.join(contents, 'Frameworks')
  const resources = path.join(contents, 'Resources')
  const headers = path.resolve(path.dirname(process.execPath), '../include/node')
  if (!fs.existsSync(path.join(headers, 'node_api.h'))) throw Error(`Node-API headers not found in ${headers}`)

  const cacheDir = path.join(projectDir, 'out', 'sparkle')
  fs.mkdirSync(cacheDir, { recursive: true })
  const workDir = fs.mkdtempSync(path.join(cacheDir, 'extract-'))
  try {
    const archive = getArchive(cacheDir, workDir)
    execFileSync('tar', ['-xf', archive, '-C', workDir, 'Sparkle.framework', 'LICENSE'])
    execFileSync('xcrun', [
      'clang++', '-arch', architecture, '-fobjc-arc', '-bundle', '-Werror=protocol',
      '-undefined', 'dynamic_lookup', '-mmacosx-version-min=12.0', '-I', headers, '-F', workDir,
      '-framework', 'Foundation', '-framework', 'Sparkle', '-Wl,-rpath,@loader_path/../Frameworks',
      path.join(projectDir, 'scripts', 'macos-updater.mm'), '-o', path.join(resources, 'laikan-updater.node'),
    ], { stdio: 'inherit' })
    const sparkle = path.join(workDir, 'Sparkle.framework')
    trimSparkle(sparkle, architecture)
    execFileSync('ditto', [sparkle, path.join(frameworks, 'Sparkle.framework')])
    fs.copyFileSync(path.join(workDir, 'LICENSE'), path.join(resources, 'Sparkle-LICENSE.txt'))

    const plist = path.join(contents, 'Info.plist')
    execFileSync('plutil', ['-replace', 'SUFeedURL', '-string', appcastURL, plist])
    execFileSync('plutil', ['-replace', 'SUPublicEDKey', '-string', publicKey, plist])
    execFileSync('plutil', ['-replace', 'SUEnableAutomaticChecks', '-bool', 'NO', plist])
    execFileSync('plutil', ['-replace', 'SUAllowsAutomaticUpdates', '-bool', 'NO', plist])
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true })
  }
}
