const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process')
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'emo-smoke-'))
  try {
    const env = { ...process.env, EMO_SMOKE_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
    delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
      env,
      stdio: 'inherit',
      timeout: 75000,
    })
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } finally {
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
} else {
  const { app } = require('electron')
  app.setPath('userData', process.env.EMO_SMOKE_USER_DATA)
  app.commandLine.appendSwitch('disable-gpu')
  if (process.env.CI && process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox')
  }

  const fail = (error) => {
    console.error(error)
    app.exit(1)
  }
  process.on('uncaughtException', fail)
  process.on('unhandledRejection', fail)
  setTimeout(() => fail(new Error('Application smoke test timed out')), 65000).unref()

  app.on('browser-window-created', (_, window) => {
    const contents = window.webContents
    // Run renderer updates even when the test window is in the background.
    contents.setBackgroundThrottling(false)
    // Unpackaged builds open docked DevTools, which would shrink the test viewport.
    contents.on('devtools-opened', () => contents.closeDevTools())
    contents.on('preload-error', (_, preloadPath, error) => fail(error))
    contents.on('did-fail-load', (_, code, message) => fail(new Error(`${code}: ${message}`)))
    contents.once('did-finish-load', async () => {
      try {
        const result = await contents.executeJavaScript(`(async () => {
          for (let i = 0; i < 100 && !document.querySelector('#root')?.children.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 20))
          }
          if (!document.querySelector('#root')?.children.length) throw new Error('React did not render')
          const feeds = await window.emo.fetch('/reader/get/feed/all')
          await window.emo.fetch('/settings/set', { path: 'appearance', value: 'dark' })
          const appearance = await window.emo.fetch('/settings/get', 'appearance')
          window.__smokeEvents = []
          window.__smokeListener = (...args) => window.__smokeEvents.push(args)
          window.__smokeUnsubscribe = window.emo.on('/smoke/event', window.__smokeListener)
          return {
            feeds,
            appearance,
            onReturnsCleanup: typeof window.__smokeUnsubscribe === 'function',
            nodeIsolated: typeof require === 'undefined' && typeof process === 'undefined',
            tailwindLoaded: getComputedStyle(document.querySelector('.flex')).display === 'flex',
          }
        })()`)
        assert.deepEqual(result.feeds, [])
        assert.equal(result.appearance, 'dark')
        assert.equal(result.onReturnsCleanup, true)
        assert.equal(result.nodeIsolated, true)
        assert.equal(result.tailwindLoaded, true)
        assert.equal(window.webContents.getLastWebPreferences().contextIsolation, true)
        assert.equal(window.webContents.getLastWebPreferences().sandbox, true)
        assert.ok(fs.existsSync(path.join(process.env.EMO_SMOKE_USER_DATA, 'emo.db')))

        contents.send('/smoke/event', { ok: true })
        const received = await contents.executeJavaScript(`new Promise((resolve, reject) => {
          const deadline = Date.now() + 2000
          const check = () => {
            if (window.__smokeEvents.length) return resolve(window.__smokeEvents)
            if (Date.now() > deadline) return reject(new Error('IPC event was not delivered'))
            setTimeout(check, 10)
          }
          check()
        })`)
        assert.deepEqual(received, [[{ ok: true }]])
        assert.equal(await contents.executeJavaScript('window.__smokeUnsubscribe()'), undefined)
        contents.send('/smoke/event', { ok: false })
        await new Promise(resolve => setTimeout(resolve, 100))
        assert.equal(await contents.executeJavaScript('window.__smokeEvents.length'), 1)
        await require('./renderer-smoke.cjs')(contents, require('electron').nativeTheme)
        await require('./rss-smoke.cjs')(contents)
        console.log(`Smoke passed: Electron ${process.versions.electron}; React, Tailwind, SQLite, settings IPC, event subscription/removal and sandbox isolation`)
        app.exit(0)
      } catch (error) {
        fail(error)
      }
    })
  })

  const appDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..')
  const metadata = require(path.join(appDir, 'package.json'))
  require(path.resolve(appDir, metadata.main))
}
