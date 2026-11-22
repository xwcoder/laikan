const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { DatabaseSync } = require('node:sqlite')

function withDatabase(filename, operation) {
  const database = new DatabaseSync(filename, { timeout: 1000 })
  try {
    operation(database)
  } finally {
    database.close()
  }
}

module.exports = async function dataDirectorySmoke(contents) {
  const { app, dialog } = require('electron')
  const { showOpenDialog } = dialog
  const { relaunch } = app
  const originalFetch = globalThis.fetch
  const run = code => contents.executeJavaScript(code)
  const ipc = (channel, value, revision) => (
    run(`window.laikan.fetch(${JSON.stringify(channel)}, ${JSON.stringify(value)}, ${JSON.stringify(revision)})`)
  )
  const wait = (expression) => run(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    const check = () => {
      if (${expression}) return resolve(true)
      if (Date.now() > deadline) return reject(new Error(${JSON.stringify(`Timed out: ${expression}`)}))
      setTimeout(check, 20)
    }
    check()
  })`)
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const getSettings = () => ipc('/settings/get')
  const getArticle = id => ipc('/reader/get/article', id)
  const database = directory => path.join(directory, 'laikan.db')
  const { dataPath: original, libraryRevision: revision } = await getSettings()
  const settingsFile = path.join(original, 'settings.json')
  const migrated = path.join(original, 'migrated-library')
  const existing = path.join(original, 'existing library 中文 # %')
  const invalid = path.join(original, 'invalid-library')
  const failed = path.join(original, 'failed-library')
  for (const directory of [migrated, existing, invalid, failed]) fs.mkdirSync(directory)
  fs.writeFileSync(database(invalid), 'not a database')

  const feedUrl = 'https://switch-library.test/rss'
  const articleBody = '<p>Reading position fixture.</p>'.repeat(45)
  const fixture = title => new Response(`<rss version="2.0"><channel><title>Switch fixture</title>
    <item><guid isPermaLink="false">switch-item</guid><title>${title}</title>
    <description><![CDATA[${articleBody}]]></description></item></channel></rss>`)
  let nextRefresh
  globalThis.fetch = async (url, options) => {
    if (url !== feedUrl) {
      return new Response(null, { status: options?.headers?.has('If-None-Match') ? 304 : 404 })
    }
    const held = nextRefresh
    if (!held) return fixture('Original article')
    nextRefresh = undefined
    held.started.resolve()
    await held.release.promise
    return fixture(held.title)
  }
  const refreshWhileSwitching = async (title, apply) => {
    const started = Promise.withResolvers()
    const release = Promise.withResolvers()
    nextRefresh = { started, release, title }
    const result = ipc('/reader/post/feed/refresh')
    try {
      await Promise.race([
        started.promise,
        result.then(() => assert.fail('Refresh finished before requesting the fixture')),
        delay(5000, undefined, { ref: false }).then(() => assert.fail('No pending fixture request')),
      ])
      await apply()
    } finally {
      release.resolve()
      await result
    }
  }

  const modal = 'document.querySelector("[data-settings-body]")'
  const applySelector = '[data-directory-action=apply]'
  const applyButton = `document.querySelector('${applySelector}')`
  const applyIcon = icon => `${applyButton}?.querySelector('svg.lucide-${icon}')`
  const applyLayout = () => run(`[getComputedStyle(${applyButton}).width, ${applyButton}.innerText.trim()]`)
  const selectDirectory = async (directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] })
    await click('[data-directory-action=browse]')
    await wait(`document.querySelector('input[aria-labelledby=path-title]').value === ${JSON.stringify(directory)}`)
  }
  const apply = async (directory) => {
    await wait(`${applyIcon('save')} && !${applyButton}.disabled`)
    const before = await applyLayout()
    await click(applySelector)
    if (directory) {
      await wait(`${modal}.ariaBusy === "false" && ${applyIcon('check')} && ${applyButton}.disabled`)
      assert.equal((await getSettings()).dataPath, directory)
      assert.equal(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).dataPath, directory)
      assert.equal(await run(`window.__switchModal === ${modal}`), true, 'The settings dialog stays open')
    } else {
      await wait(`${modal}.ariaBusy === "false" && ${modal}.querySelector('[role=alert]')
        && ${applyIcon('save')} && !${applyButton}.disabled`)
    }
    assert.deepEqual(await applyLayout(), before, 'Apply keeps its width and label across status changes')
  }

  // A regression must fail the test without launching a second app instance.
  app.relaunch = () => assert.fail('Applying a directory restarted Electron')
  try {
    await ipc('/reader/post/feed', { url: feedUrl, title: 'Switch fixture' })
    const feeds = await ipc('/reader/get/feed/all')
    const feed = feeds.find(item => item.url === feedUrl)
    const page = tab => ipc('/reader/get/articles', { tab, page: 1, size: 50 })
    const [fixtureArticle] = (await page(feed.id)).data
    const atom = feeds.find(item => item.title === 'Atom regression')
    const atomArticles = (await page(atom.id)).data
    const cachedArticle = await getArticle(atomArticles.find(item => item.externalId === 'urn:two').id)

    // Keep the same feed ID, URL and revision in both libraries so a stale refresh would match.
    withDatabase(database(original), db => {
      db.exec('PRAGMA journal_mode = WAL')
      db.prepare('VACUUM INTO ?').run(database(existing))
    })
    withDatabase(database(existing), db => {
      db.prepare('UPDATE feeds SET title = ? WHERE id = ?').run('Existing library fixture', feed.id)
      db.prepare('UPDATE articles SET title = ? WHERE id = ?').run('Existing library article', fixtureArticle.id)
    })
    await ipc('/reader/put/article/starred', { id: fixtureArticle.id, status: 1 })
    assert.ok(fs.existsSync(`${database(original)}-wal`), 'The source contains recent writes in the WAL')

    await click('[aria-label="Back to list"]')
    const feedButton = `[data-feed-id="${feed.id}"] > button`
    const articleButton = `[data-list-item-id="${fixtureArticle.id}"] [data-article-open]`
    await wait(`document.querySelector('${feedButton}')`)
    await click(feedButton)
    await wait(`document.querySelector('${articleButton}')`)
    await click(articleButton)
    await wait('document.querySelector("article h1")?.textContent === "Original article"')
    const scrollTop = await run(`(() => {
      window.__switchArticle = document.querySelector('article')
      const viewport = window.__switchArticle.parentElement
      viewport.scrollTop = 220
      return viewport.scrollTop
    })()`)
    assert.ok(scrollTop > 0, 'The fixture has a scrollable article')
    await click('[data-settings-trigger]')
    await wait(modal)
    await run(`window.__switchModal = ${modal}; true`)

    await refreshWhileSwitching('Saved after moving', async () => {
      await selectDirectory(migrated)
      await apply(migrated)
      assert.ok(!fs.existsSync(database(original)), 'Migration removes the old database')
      assert.ok(fs.existsSync(database(migrated)))
      assert.equal((await getSettings()).libraryRevision, revision)
      assert.equal(await run('window.__switchArticle === document.querySelector("article")'), true, 'The article stays mounted')
      assert.equal(await run('window.__switchArticle.parentElement.scrollTop'), scrollTop, 'The article keeps its scroll position')
    })
    assert.equal((await getArticle(fixtureArticle.id)).title, 'Saved after moving')
    assert.equal((await getArticle(fixtureArticle.id)).starred, 1)
    assert.deepEqual((await getArticle(cachedArticle.id)).fullText, cachedArticle.fullText)
    assert.equal((await ipc('/reader/get/feed/all')).find(item => item.id === atom.id).icon, atom.icon)

    await selectDirectory(invalid)
    await apply()
    assert.equal((await getSettings()).dataPath, migrated)
    assert.equal(fs.readFileSync(database(invalid), 'utf8'), 'not a database')

    const backup = `${settingsFile}.bak`
    fs.renameSync(settingsFile, backup)
    fs.mkdirSync(settingsFile)
    try {
      await selectDirectory(failed)
      await apply()
      assert.equal((await getSettings()).dataPath, migrated)
      assert.deepEqual(fs.readdirSync(failed), [], 'A failed settings write rolls back the migration')
    } finally {
      fs.rmdirSync(settingsFile)
      fs.renameSync(backup, settingsFile)
    }

    await refreshWhileSwitching('Stale response', async () => {
      await selectDirectory(existing)
      await apply(existing)
      await wait(`document.querySelector('[data-feed-id="${feed.id}"]')?.textContent.includes('Existing library fixture')
        && document.querySelector('[data-tab="unread"]').ariaPressed === 'true'
        && !document.querySelector('article')
        && document.querySelector('[data-list-item-id="${fixtureArticle.id}"]')?.textContent.includes('Existing library article')`)
      assert.equal((await getSettings()).libraryRevision, revision + 1)
    })
    assert.ok(fs.existsSync(database(migrated)), 'Opening an existing library leaves the earlier database intact')
    assert.equal((await getArticle(fixtureArticle.id)).title, 'Existing library article')
    await assert.rejects(
      ipc('/reader/put/article/starred', { id: fixtureArticle.id, status: 1 }, revision),
      /The reader library changed/,
    )
    assert.equal((await getArticle(fixtureArticle.id)).starred, 0)

    await click('[data-directory-action=restore]')
    await apply(original)
    assert.ok(!fs.existsSync(database(existing)), 'Restore default moves the library when the default directory is empty')
    assert.equal((await getArticle(fixtureArticle.id)).title, 'Existing library article')
    await selectDirectory(migrated)
    await apply(migrated)
    assert.equal((await getArticle(fixtureArticle.id)).title, 'Saved after moving')
    await click('[role=dialog] > button[aria-label=Close]')
    await wait(`!${modal}`)
    await click('[data-settings-trigger]')
    await wait(`${applyIcon('save')} && ${applyButton}.disabled`)
    console.log('Data directory smoke passed: live migration and restore, settings rollback, existing library and stale refresh isolation')
  } finally {
    app.relaunch = relaunch
    dialog.showOpenDialog = showOpenDialog
    globalThis.fetch = originalFetch
  }
}
