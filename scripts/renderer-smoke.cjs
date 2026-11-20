const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

// Exercise the production renderer through its UI and real IPC/SQLite boundary.
// The local RSS fixture keeps this regression test deterministic and offline.
module.exports = async function rendererSmoke(contents, nativeTheme) {
  const en = require('../src/i18n/en-US.json')
  const zh = require('../src/i18n/zh-CN.json')
  const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, entry]) => (
    typeof entry === 'object' ? keys(entry, `${prefix}${key}.`) : [`${prefix}${key}`]
  ))
  assert.deepEqual(keys(en).sort(), keys(zh).sort(), 'Language files must have matching keys')

  const run = async (code) => {
    try { return await contents.executeJavaScript(code) }
    catch (error) {
      const state = await contents.executeJavaScript('document.body.innerText').catch(() => 'Renderer unavailable')
      await snapshot('failure')
      throw new Error(`${error.message}\nRenderer operation: ${code}\nUI state: ${state}`)
    }
  }
  const wait = (expression) => run(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    const check = async () => {
      try {
        const value = await (${expression})
        if (value) return resolve(true)
        if (Date.now() > deadline) return reject(new Error(${JSON.stringify(`Timed out: ${expression}`)}))
        setTimeout(check, 20)
      } catch (error) { reject(error) }
    }
    check()
  })`)
  const click = (selector) => run(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element || element.disabled) throw new Error(${JSON.stringify(`Missing or disabled: ${selector}`)})
    element.click()
  })()`)
  const hover = async (selector) => {
    const element = `document.querySelector(${JSON.stringify(selector)})`
    const point = await run(`(() => {
      const { x, y, width, height } = ${element}.getBoundingClientRect()
      return { x: Math.floor(x + width / 2), y: Math.floor(y + height / 2) }
    })()`)
    contents.sendInputEvent({ type: 'mouseMove', ...point })
    await wait(`${element}.matches(':hover')`)
    return point
  }
  const hoverWithoutTooltip = async (selector) => {
    await hover(selector)
    await new Promise(resolve => setTimeout(resolve, 450))
    assert.equal(await run('!!document.querySelector("[role=tooltip]")'), false, `Unexpected tooltip for ${selector}`)
  }
  const input = (selector, value) => run(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  const press = (key, shiftKey = false) => run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: ${JSON.stringify(key)}, shiftKey: ${shiftKey}, bubbles: true, cancelable: true
  }))`)
  const tab = (modifiers = []) => {
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab', modifiers })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab', modifiers })
  }
  const snapshot = async (name) => {
    const dir = process.env.EMO_SMOKE_SCREENSHOTS
    if (!dir) return
    fs.mkdirSync(dir, { recursive: true })
    await new Promise(resolve => setTimeout(resolve, 200))
    fs.writeFileSync(path.join(dir, `${name}.png`), (await contents.capturePage()).toPNG())
  }

  // Theme/language mutations must update both the UI and the persisted settings.
  await wait('document.querySelector("[data-tab=unread]")')
  await click('[data-settings-trigger]')
  await wait('document.querySelector("[role=radio][value=light]")')
  await click('[role=radio][value=light]')
  await wait('!document.documentElement.classList.contains("dark")')
  await wait('!document.querySelector("[role=radio][value=en-US]").disabled')
  await click('[role=radio][value=en-US]')
  await wait('document.documentElement.lang === "en-US"')
  await snapshot('settings-light-en')
  await wait('!document.querySelector("[role=radio][value=auto]").disabled')
  await click('[role=radio][value=auto]')
  await wait('window.emo.fetch("/settings/get", "appearance").then(value => value === "auto")')
  nativeTheme.themeSource = 'dark'
  await wait('document.documentElement.classList.contains("dark")')
  nativeTheme.themeSource = 'light'
  await wait('!document.documentElement.classList.contains("dark")')
  await wait('!document.querySelector("[role=radio][value=dark]").disabled')
  await click('[role=radio][value=dark]')
  await wait('document.documentElement.classList.contains("dark")')
  await wait('!document.querySelector("[role=radio][value=zh-CN]").disabled')
  await click('[role=radio][value=zh-CN]')
  await wait('document.documentElement.lang === "zh-CN" && document.body.textContent.includes("跟随系统")')
  await snapshot('settings-dark-zh')

  // A reload reconstructs remote state from Query/IPC, including saved preferences.
  await Promise.all([new Promise(resolve => contents.once('did-finish-load', resolve)), run('location.reload()')])
  await wait('document.querySelector("[data-tab=unread]") && document.documentElement.lang === "zh-CN"')
  assert.equal(await run('document.documentElement.classList.contains("dark")'), true)
  assert.ok((await run('document.body.textContent')).includes('未读'))
  await click('[data-settings-trigger]')
  await wait('document.querySelector("[role=radio][value=en-US]")')
  await click('[role=radio][value=en-US]')
  await wait('document.documentElement.lang === "en-US"')
  await click('[role=dialog] > button[aria-label=Close]')
  await wait('!document.querySelector("[role=dialog]")')
  await require('./settings-modal-smoke.cjs')(contents, { run, wait, click, press, snapshot })

  let fixtureCount = 52
  let failRss = false
  const rssRequests = []
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/rss+xml')
    if (request.url === '/invalid') { response.end('<html>Not a feed</html>'); return }
    if (request.url === '/rss') {
      const validator = request.headers['if-none-match']
      rssRequests.push(validator)
      const etag = `"fixture-${fixtureCount}"`
      response.setHeader('ETag', etag)
      if (failRss || validator === etag) {
        response.statusCode = failRss ? 503 : 304
        response.end()
        return
      }
    }
    const items = Array.from({ length: request.url === '/empty' ? 0 : fixtureCount }, (_, index) => `
      <item><title>Fixture article ${index + 1}</title><link>https://example.com/article/${index + 1}</link>
      <description><![CDATA[<p>Fixture content ${index + 1}</p>${"<p>Reading position fixture.</p>".repeat(40)}<p><a href="/relative">Relative link</a></p>
      <img src="data:," onerror="window.__rssScriptRan = true"><script>window.__rssScriptRan = true</script>]]></description>
      <pubDate>Tue, 17 Nov 2026 08:00:00 GMT</pubDate></item>`).join('')
    response.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture feed</title>
      <link>https://example.com</link><description>Smoke fixture</description>${items}</channel></rss>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await click('[aria-label="Subscribe to a feed"]')
    await wait('document.querySelector("#feed-url")')
    await press('?', true)
    assert.equal(await run('document.querySelectorAll("[role=dialog]").length'), 1, 'A subscription dialog blocks reader shortcuts')
    contents.focus()
    await wait('document.hasFocus()')
    await run('document.querySelector("#feed-url").focus()')
    await input('#feed-url', `${base}/rss`)
    await run('document.querySelector("#feed-title").focus()')
    await wait('document.querySelector("#feed-title").value === "Fixture feed"')
    // Typing into a form must never activate the reader shortcuts.
    await run('document.querySelector("#feed-title").dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }))')
    await run('document.querySelector("form").requestSubmit()')
    await wait('!document.querySelector("[role=dialog]") && document.querySelectorAll("[data-list-item-id]").length === 50')
    await wait('document.body.textContent.includes("of 52")')
    await press('x')
    await wait('document.querySelectorAll("[data-list-item-id] [role=checkbox][data-state=checked]").length === 1')
    await press('x')
    await wait('document.querySelectorAll("[data-list-item-id] [role=checkbox][data-state=checked]").length === 0')

    // Check both an uncached page request and returning to pages already in the cache.
    for (let pass = 0; pass < 2; pass += 1) {
      await click('[aria-label="Next page"]')
      await wait('document.querySelectorAll("[data-list-item-id]").length === 2 && document.body.textContent.includes("51–52")')
      await click('[aria-label="Previous page"]')
      await wait('document.querySelectorAll("[data-list-item-id]").length === 50')
    }
    const firstId = Number(await run('document.querySelector("[data-list-item-id]").dataset.listItemId'))
    const refreshButton = `[aria-label="${en.reader.action.refresh}"]`
    const starButton = `[data-list-item-id="${firstId}"] [aria-label="${en.reader.action.star}"]`
    const [focusedId, nextId] = await run(`Array.from(document.querySelectorAll('[data-list-item-id]'))
      .slice(1, 3).map(row => Number(row.dataset.listItemId))`)
    const focusedRow = `[data-list-item-id="${focusedId}"]`
    const nextRow = `[data-list-item-id="${nextId}"]`
    const focusedIdExpression = 'Number(document.activeElement.closest("[data-list-item-id]")?.dataset.listItemId)'
    // A focused row control takes precedence over the previously active article.
    await run(`(() => {
      const checkbox = document.querySelector('${focusedRow} [role=checkbox]')
      checkbox.focus()
      checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
    })()`)
    await wait(`document.querySelector('${focusedRow} [aria-label="Remove star"]')?.disabled === false`)
    assert.ok(await run(`!!document.querySelector('${starButton}')`), 'The first article must not be starred')
    await run(`document.querySelector('${focusedRow} [aria-label="Remove star"]').focus()`)
    tab()
    await wait(`document.activeElement.matches('${focusedRow} [data-article-open]')`)
    assert.notEqual(await run('getComputedStyle(document.activeElement).boxShadow'), 'none', 'Tab should show the title focus ring')
    await press('j')
    await wait(`${focusedIdExpression} === ${nextId} && document.activeElement.hasAttribute('data-article-open')`)
    assert.equal(await run('getComputedStyle(document.activeElement).boxShadow'), 'none', 'J/K should use the active row indicator')
    await press('x')
    await wait(`document.querySelector('${nextRow} [role=checkbox][data-state=checked]')`)
    await press('k')
    await wait(`${focusedIdExpression} === ${focusedId}`)
    await press('s')
    await wait(`document.querySelector('${focusedRow} [aria-label="Add star"]')?.disabled === false`)
    await press('*', true); await press('n')
    await wait('!document.querySelector("[data-list-item-id] [role=checkbox][data-state=checked]")')
    const lastOnPage = await run(`(() => {
      const row = document.querySelector('.list-container [data-list-item-id]:last-child')
      row.querySelector('[data-article-open]').focus()
      return Number(row.dataset.listItemId)
    })()`)
    await press('j')
    await wait('document.body.textContent.includes("51–52 of 52") && document.activeElement === document.querySelector("[data-article-open]")')
    await press('k')
    await wait(`${focusedIdExpression} === ${lastOnPage}`)
    await run('document.querySelector("[data-article-open]").focus()')
    await wait(`document.querySelector(${JSON.stringify(refreshButton)})?.disabled === false`)
    await hoverWithoutTooltip(refreshButton)
    await hoverWithoutTooltip(starButton)
    assert.equal(await run('!!document.querySelector("[data-list-item-id] button[title], [data-list-item-id] button [title]")'), false)
    await click(starButton)
    await wait(`document.querySelector('[data-list-item-id="${firstId}"] [aria-label="Remove star"]')`)
    await click('[data-tab=starred]')
    await wait('document.querySelectorAll("[data-list-item-id]").length === 1')
    await click(`[data-list-item-id="${firstId}"] button:last-child`)
    await wait('document.querySelector(".article-content")')
    await wait(`window.emo.fetch('/reader/get/article', ${firstId}).then(article => article.read === 1)`)
    assert.equal(await run('!!window.__rssScriptRan'), false, 'RSS markup must be sanitized')
    assert.equal(await run('document.querySelectorAll(".article-content script, .article-content [onerror]").length'), 0)
    assert.equal(await run('getComputedStyle(document.querySelector(".article-content")).fontSize'), '14px')

    // The reading view and its scroll position survive modal interaction and setting writes.
    await run(`(() => {
      window.__smokeArticle = document.querySelector('article')
      window.__smokeArticle.parentElement.scrollTop = 240
      window.__smokeArticleScroll = window.__smokeArticle.parentElement.scrollTop
    })()`)
    assert.ok(await run('window.__smokeArticleScroll > 0'))
    await click('[data-settings-trigger]')
    await wait('document.querySelector("[data-settings-body]")')
    await press('u'); await press('s'); await press('?', true)
    assert.equal(await run('document.querySelectorAll("[role=dialog]").length'), 1)
    assert.equal((await run(`window.emo.fetch('/reader/get/article', ${firstId})`)).starred, 1)
    await click('[role=radio][value=light]')
    await wait('!document.documentElement.classList.contains("dark")')
    await wait('!document.querySelector("[role=radio][value=dark]").disabled')
    await click('[role=radio][value=dark]')
    await wait('document.documentElement.classList.contains("dark")')
    await snapshot('settings-over-article')
    await click('[role=dialog] > button[aria-label=Close]')
    await wait('!document.querySelector("[role=dialog]")')
    assert.equal(await run('window.__smokeArticle === document.querySelector("article")'), true)
    assert.equal(await run('window.__smokeArticle.parentElement.scrollTop === window.__smokeArticleScroll'), true)

    await click('[aria-label="Larger"]')
    await wait('getComputedStyle(document.querySelector(".article-content")).fontSize === "15px"')
    await click('[aria-label="Smaller"]')
    await wait('getComputedStyle(document.querySelector(".article-content")).fontSize === "14px"')
    await click('[aria-label="Mark as unread"]')
    await wait(`document.querySelector('[aria-label="Mark as read"]')`)
    await click('[aria-label="Back to list"]')
    await wait('document.querySelector("[data-list-item-id]")')
    await press('g'); await press('i')
    await wait('document.querySelectorAll("[data-list-item-id]").length === 50')
    const readingIds = await run('Array.from(document.querySelectorAll("[data-list-item-id]")).slice(0, 2).map(row => Number(row.dataset.listItemId))')
    const readingTitles = await run(`Promise.all(${JSON.stringify(readingIds)}.map(id => window.emo.fetch('/reader/get/article', id).then(article => article.title)))`)
    await click(`[data-list-item-id="${readingIds[0]}"] button:last-child`)
    await wait(`document.querySelector('article h1')?.textContent === ${JSON.stringify(readingTitles[0])}`)
    await wait(`document.querySelector('[aria-label="Mark as unread"]')?.disabled === false`)
    await press('j')
    await wait(`document.querySelector('article h1')?.textContent === ${JSON.stringify(readingTitles[1])}`)
    await wait(`document.querySelector('[aria-label="Mark as unread"]')?.disabled === false`)
    await press('k')
    await wait(`document.querySelector('article h1')?.textContent === ${JSON.stringify(readingTitles[0])}`)
    await click('[aria-label="Back to list"]')
    await wait('document.querySelector("[data-list-item-id]")')
    const position = await run(`(() => {
      const viewport = document.querySelector('.list-container')
      const rows = viewport.querySelectorAll('[data-list-item-id]')
      const row = rows[22]
      row.scrollIntoView({ block: 'center' })
      const button = row.querySelector('[data-article-open]')
      const offset = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      button.focus({ preventScroll: true })
      button.click()
      return { id: Number(row.dataset.listItemId), nextId: Number(rows[23].dataset.listItemId), offset }
    })()`)
    await wait('document.querySelector(".article-content")')
    await wait(`window.emo.fetch('/reader/get/article', ${position.id}).then(article => article.read === 1)`)
    await click('[aria-label="Back to list"]')
    await wait(`document.querySelector('.list-container') && !document.querySelector('[data-list-item-id="${position.id}"]')`)
    const returnedOffset = await run(`document.querySelector('[data-list-item-id="${position.nextId}"]').getBoundingClientRect().top
      - document.querySelector('.list-container').getBoundingClientRect().top`)
    assert.ok(Math.abs(returnedOffset - position.offset) <= 1, 'The next unread article should occupy the opened row’s position')
    assert.equal(await run(focusedIdExpression), position.nextId)
    await press('g'); await press('a')
    await wait('document.querySelector("[data-tab=all]").getAttribute("aria-pressed") === "true"')
    await wait('document.querySelectorAll("[data-list-item-id]").length === 50')
    await press('*', true); await press('a')
    await wait('document.querySelectorAll("[data-list-item-id] [role=checkbox][data-state=checked]").length === 50')
    await run(`(() => {
      window.__smokeList = document.querySelector('.list-container')
      window.__smokeList.scrollTop = 300
      window.__smokeListScroll = window.__smokeList.scrollTop
    })()`)
    await click('[data-settings-trigger]')
    await wait('document.querySelector("[data-settings-body]")')
    await press('x')
    await press('Escape')
    await wait('!document.querySelector("[role=dialog]")')
    assert.equal(await run('window.__smokeList === document.querySelector(".list-container")'), true)
    assert.equal(await run('window.__smokeList.scrollTop === window.__smokeListScroll'), true)
    assert.equal(await run('document.querySelectorAll("[data-list-item-id] [role=checkbox][data-state=checked]").length'), 50)
    await press('I', true)
    await wait(`window.emo.fetch('/reader/get/articles', { tab: 'unread', page: 1, size: 50 }).then(result => result.count === 2)`)
    // Keep the sequence alive through a real background refresh and React renders.
    await press('*', true)
    fixtureCount = 53
    await run(`window.emo.fetch('/reader/post/feed', { url: ${JSON.stringify(`${base}/rss`)}, title: 'Fixture feed' })`)
    await wait('document.body.textContent.includes("of 53")')
    await press('n')
    await wait('document.querySelectorAll("[data-list-item-id] [role=checkbox][data-state=checked]").length === 0')
    await press('?', true)
    await wait('document.querySelector("[role=dialog]")?.textContent.includes("Keyboard shortcuts")')
    await click('[role=dialog] button[aria-label=Close]')
    await wait('!document.querySelector("[role=dialog]")')

    await click('[aria-label="Next page"]')
    await wait('document.body.textContent.includes("51–53 of 53")')
    fixtureCount = 54
    const beforeRefresh = rssRequests.length
    await click(refreshButton)
    await wait('document.querySelector(".list-container").parentElement.querySelector("[role=status]")?.textContent === "Synced 1 feed"')
    assert.ok(rssRequests.slice(beforeRefresh).includes('"fixture-53"'), 'Manual refresh should fetch upstream using the saved validator')
    assert.ok(await run('document.body.textContent.includes("51–54 of 54")'), 'Refresh should keep the current page')
    failRss = true
    await click(refreshButton)
    await wait('document.body.textContent.includes("0 synced, 1 failed")')
    assert.ok(await run('document.body.textContent.includes("51–54 of 54")'), 'A failed refresh should keep the current page and cached articles')
    failRss = false
    await click('[aria-label="Previous page"]')
    await wait('document.body.textContent.includes("1–50 of 54")')
    const anchor = await run(`(() => {
      const viewport = document.querySelector('.list-container')
      viewport.scrollTop = 333
      const top = viewport.getBoundingClientRect().top
      const row = Array.from(viewport.querySelectorAll('[data-list-item-id]')).find(item => item.getBoundingClientRect().bottom > top)
      return { id: Number(row.dataset.listItemId), offset: row.getBoundingClientRect().top - top }
    })()`)
    fixtureCount = 55
    await click(refreshButton)
    await wait('document.body.textContent.includes("1–50 of 55")')
    const refreshedOffset = await run(`document.querySelector('[data-list-item-id="${anchor.id}"]').getBoundingClientRect().top
      - document.querySelector('.list-container').getBoundingClientRect().top`)
    assert.ok(Math.abs(refreshedOffset - anchor.offset) <= 1, 'New articles should not shift the visible rows')

    await snapshot('reader-dark-en')
    const feedId = Number(await run('document.querySelector("[data-feed-id]").dataset.feedId'))
    const feedRow = `[data-feed-id="${feedId}"]`
    const feedButton = `${feedRow} > button`
    const copyButton = `${feedRow} [aria-label="${en.reader.action.copy.title}"]`
    const deleteButton = `${feedRow} [aria-label="${en.reader.action.delete}"]`
    const rowElement = `document.querySelector(${JSON.stringify(feedRow)})`
    const feedElement = `document.querySelector(${JSON.stringify(feedButton)})`
    const rowBackground = `getComputedStyle(${rowElement}).backgroundColor`
    const actionsStyle = `getComputedStyle(${rowElement}.querySelector('[data-feed-actions]'))`
    const transparent = 'rgba(0, 0, 0, 0)'

    // Real mouse movement must preserve the row highlight across both action buttons.
    await hover(feedButton)
    await wait(`${rowBackground} !== '${transparent}' && ${rowElement}.getAnimations().length === 0`)
    const highlight = await run(rowBackground)
    for (const selector of [copyButton, deleteButton]) {
      await hoverWithoutTooltip(selector)
      assert.equal(await run(rowBackground), highlight)
      assert.notEqual(await run(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).backgroundColor`), transparent)
    }
    await hover('[data-tab=all]')
    await wait(`${rowBackground} === '${transparent}' && ${actionsStyle}.opacity === '0'`)

    const point = await hover(feedButton)
    contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
    contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
    await wait(`${feedElement}.getAttribute('aria-pressed') === 'true' && document.activeElement === ${feedElement}`)
    await hover('[data-tab=all]')
    assert.equal(await run(`${actionsStyle}.opacity`), '0', 'Mouse selection should not keep the actions visible')
    assert.equal(await run(`${actionsStyle}.pointerEvents`), 'none')
    await wait(`${rowBackground} === '${highlight}'`)
    contents.focus()
    await wait(`document.hasFocus() && document.activeElement === ${feedElement}`)
    tab()
    await wait(`document.activeElement.matches(${JSON.stringify(copyButton)}) && ${actionsStyle}.opacity === '1'`)
    tab(['shift'])
    await wait(`document.activeElement === ${feedElement} && ${actionsStyle}.opacity === '0'`)

    await hover(feedButton)
    await click(deleteButton)
    await wait('document.activeElement.textContent === "Cancel" && document.activeElement.closest("[role=alertdialog]")')
    assert.match(await run('document.querySelector("[role=alertdialog]").textContent'), /Fixture feed.*including starred articles/)
    assert.equal((await run('window.emo.fetch("/reader/get/feed/all")')).length, 1)
    await press('g'); await press('a'); await press('?', true)
    assert.equal(await run('!!document.querySelector("[role=dialog]")'), false)
    assert.equal(await run(`document.querySelector(${JSON.stringify(feedButton)}).getAttribute('aria-pressed')`), 'true')
    await press('Escape')
    await wait(`!document.querySelector('[role=alertdialog]') && document.activeElement.matches(${JSON.stringify(deleteButton)})`)
    assert.equal((await run(`window.emo.fetch('/reader/get/article', ${firstId})`)).starred, 1)

    await click(deleteButton)
    await wait('document.querySelector("[role=alertdialog] button:last-child")')
    await click('[role=alertdialog] button:last-child')
    await wait('!document.querySelector("[role=alertdialog]") && document.activeElement.matches("[data-tab=all]")')
    await wait('document.querySelectorAll("[data-feed-id]").length === 0 && document.querySelectorAll("[data-list-item-id]").length === 0')
    assert.deepEqual(await run('window.emo.fetch("/reader/get/feed/all")'), [])
    assert.equal((await run('window.emo.fetch("/reader/get/articles", { tab: "all", page: 1, size: 50 })')).count, 0)

    // Empty feeds still appear after a successful subscription without relying on a crawler push.
    await click('[aria-label="Subscribe to a feed"]')
    await wait('document.querySelector("#feed-url")')
    await input('#feed-url', `${base}/empty`)
    await input('#feed-title', 'Empty feed')
    await run('document.querySelector("form").requestSubmit()')
    await wait('!document.querySelector("[role=dialog]") && document.body.textContent.includes("Empty feed")')

    // Failed mutations keep user input available and do not add fake local data.
    await click('[aria-label="Subscribe to a feed"]')
    await wait('document.querySelector("#feed-url")')
    await input('#feed-url', `${base}/invalid`)
    await input('#feed-title', 'Invalid feed')
    await run('document.querySelector("form").requestSubmit()')
    await wait('document.querySelector("main [role=alert]") && !document.querySelector("button[type=submit]").disabled')
    assert.equal(await run('document.querySelector("#feed-title").value'), 'Invalid feed')
    assert.equal((await run('window.emo.fetch("/reader/get/feed/all")')).length, 1)
    await click('[role=dialog] button[aria-label=Close]')
    console.log('Renderer smoke passed: settings, subscriptions, focused shortcuts, reading position, feed refresh, confirmed deletion and mutation errors')
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}
