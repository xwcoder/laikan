const { execFileSync } = require('node:child_process')
const { createPrivateKey, createPublicKey, sign } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { name, productName, version } = require('../package.json')

const privateKey = createPrivateKey(process.env.YIKAN_UPDATE_PRIVATE_KEY ?? '')
if (privateKey.asymmetricKeyType !== 'ed25519') throw Error('The Mac update key must be Ed25519')
const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
if (publicKey !== process.env.YIKAN_UPDATE_PUBLIC_KEY) throw Error('The Mac update signing keys do not match')

const output = process.argv[2] ?? 'release'
const plist = path.join(output, 'mac-arm64', `${productName}.app`, 'Contents', 'Info.plist')
const readPlist = key => execFileSync('plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' }).trim()
if (readPlist('SUPublicEDKey') !== publicKey) throw Error('The built Mac app has a different update public key')
const buildVersion = readPlist('CFBundleVersion')
const minimumVersion = readPlist('LSMinimumSystemVersion')
const filename = `${name}-${version}-mac-arm64.zip`
const archive = fs.readFileSync(path.join(output, filename))
const signature = sign(null, archive, privateKey).toString('base64')
const url = `https://github.com/xwcoder/yikan/releases/download/${encodeURIComponent(`v${version}`)}/${encodeURIComponent(filename)}`

fs.writeFileSync(path.join(output, 'appcast.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Yikan</title>
    <item>
      <title>Yikan ${version}</title>
      <sparkle:version>${buildVersion}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${minimumVersion}</sparkle:minimumSystemVersion>
      <enclosure url="${url}" length="${archive.length}" sparkle:edSignature="${signature}" type="application/octet-stream" />
    </item>
  </channel>
</rss>
`)
