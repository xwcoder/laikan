# macOS 更新签名

设定一次 GitHub Actions 的更新密钥后，推送版本标签就会构建、签名并发布更新。来刊的 macOS 应用继续使用 ad hoc 签名，Sparkle 使用嵌入应用的 Ed25519 公钥校验从 GitHub 下载的 ZIP。

在私有目录中用 Node.js 生成密钥，再用已登录的 GitHub CLI 写入仓库配置。PEM 文件包含私钥，请将它保存在安全的位置。

```sh
umask 077
node <<'NODE'
const { generateKeyPairSync } = require('node:crypto')
const { writeFileSync } = require('node:fs')

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' })
const publicBase64 = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
writeFileSync('laikan-update-key.pem', privatePem, { flag: 'wx', mode: 0o600 })
writeFileSync('laikan-update-key.pub', publicBase64, { flag: 'wx' })
NODE

gh variable set LAIKAN_UPDATE_PUBLIC_KEY --repo xwcoder/laikan < laikan-update-key.pub
gh secret set LAIKAN_UPDATE_PRIVATE_KEY --repo xwcoder/laikan < laikan-update-key.pem
```

后续发行版使用同一密钥。更换密钥后，用户需要手动安装带有新公钥的发行版。1.0.0 用户也需要手动安装首个带更新器的版本。
