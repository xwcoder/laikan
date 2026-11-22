const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process')
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'laikan-smoke-'))
  try {
    const env = { ...process.env, LAIKAN_SMOKE_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
    delete env.ELECTRON_RUN_AS_NODE
    const run = (phase, timeout) => {
      const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
        env: { ...env, LAIKAN_SMOKE_PHASE: phase },
        stdio: 'inherit',
        timeout,
      })
      if (result.error) throw result.error
      return result.status ?? 1
    }
    process.exitCode = run('initial', 75000) || run('restart', 20000)
  } finally {
    fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
} else {
  const { app } = require('electron')
  app.commandLine.appendSwitch('user-data-dir', process.env.LAIKAN_SMOKE_USER_DATA)
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
    // Opening and closing docked DevTools steals keyboard focus and resizes open menus.
    contents.openDevTools = () => {}
    contents.on('preload-error', (_, preloadPath, error) => fail(error))
    contents.on('did-fail-load', (_, code, message) => fail(new Error(`${code}: ${message}`)))
    contents.once('did-finish-load', async () => {
      try {
        if (process.env.LAIKAN_SMOKE_PHASE === 'restart') {
          const restored = await contents.executeJavaScript(`(async () => {
            const readerReady = () => document.querySelector('.list-container') && document.querySelector('[data-feed-id]')
            for (let i = 0; i < 250 && !readerReady(); i++) {
              await new Promise(resolve => setTimeout(resolve, 20))
            }
            if (!readerReady()) throw new Error('Reader did not finish loading after restart')
            const feeds = await window.laikan.fetch('/reader/get/feed/all')
            return {
              dataPath: await window.laikan.fetch('/settings/get', 'dataPath'),
              theme: await window.laikan.fetch('/settings/get', 'theme'),
              appliedTheme: document.documentElement.dataset.theme,
              dark: document.documentElement.classList.contains('dark'),
              savedIcon: feeds.find(feed => feed.title === 'Atom regression')?.icon?.startsWith('data:image/png;base64,'),
            }
          })()`)
          assert.deepEqual(restored, {
            dataPath: path.join(process.env.LAIKAN_SMOKE_USER_DATA, 'migrated-library'),
            theme: 'blue', appliedTheme: 'blue', dark: true, savedIcon: true,
          })
          console.log('Data directory, theme, appearance and stored feed icon restored after restarting Electron')
          app.exit(0)
          return
        }
        const result = await contents.executeJavaScript(`(async () => {
          for (let i = 0; i < 100 && !document.querySelector('#root')?.children.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 20))
          }
          if (!document.querySelector('#root')?.children.length) throw new Error('React did not render')
          const feeds = await window.laikan.fetch('/reader/get/feed/all')
          await window.laikan.fetch('/settings/set', { path: 'appearance', value: 'dark' })
          const appearance = await window.laikan.fetch('/settings/get', 'appearance')
          window.__smokeEvents = []
          window.__smokeListener = (...args) => window.__smokeEvents.push(args)
          window.__smokeUnsubscribe = window.laikan.on('/smoke/event', window.__smokeListener)
          return {
            title: document.title,
            feeds,
            appearance,
            theme: await window.laikan.fetch('/settings/get', 'theme'),
            onReturnsCleanup: typeof window.__smokeUnsubscribe === 'function',
            nodeIsolated: typeof require === 'undefined' && typeof process === 'undefined',
            tailwindLoaded: getComputedStyle(document.querySelector('.flex')).display === 'flex',
          }
        })()`)
        assert.equal(result.title, '来刊')
        assert.deepEqual(result.feeds, [])
        assert.equal(result.appearance, 'dark')
        assert.equal(result.theme, 'neutral')
        assert.equal(result.onReturnsCleanup, true)
        assert.equal(result.nodeIsolated, true)
        assert.equal(result.tailwindLoaded, true)
        assert.equal(window.webContents.getLastWebPreferences().contextIsolation, true)
        assert.equal(window.webContents.getLastWebPreferences().sandbox, true)
        assert.equal(app.getPath('userData'), process.env.LAIKAN_SMOKE_USER_DATA)
        assert.ok(fs.existsSync(path.join(process.env.LAIKAN_SMOKE_USER_DATA, 'laikan.db')))

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
        await require('./data-directory-smoke.cjs')(contents)
        console.log(`Smoke passed: Electron ${process.versions.electron}; React, Tailwind, SQLite, settings IPC, event subscription/removal and sandbox isolation`)
        app.exit(0)
      } catch (error) {
        fail(error)
      }
    })
  })

  const appDir = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..')
  if (path.extname(appDir) === '.asar') {
    // The generic Electron executable still reports development mode for this harness.
    Object.defineProperty(app, 'isPackaged', { value: true })
  }
  const metadata = require(path.join(appDir, 'package.json'))
  require(path.resolve(appDir, metadata.main))
}
