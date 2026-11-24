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
  const mouseClick = async (selector) => {
    const point = await hover(selector)
    contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
    contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
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
    const dir = process.env.YIKAN_SMOKE_SCREENSHOTS
    if (!dir) return
    fs.mkdirSync(dir, { recursive: true })
    await new Promise(resolve => setTimeout(resolve, 200))
    fs.writeFileSync(path.join(dir, `${name}.png`), (await contents.capturePage()).toPNG())
  }
  const chooseLanguage = async (locale) => {
    await wait('document.querySelector("[data-settings-body]")?.ariaBusy === "false"')
    await click(`[role=radio][value="${locale}"]`)
    await wait(`document.documentElement.lang === "${locale}" && document.querySelector('[role=radio][value="${locale}"]').ariaChecked === 'true'`)
  }
  const subscriptionMenu = '[aria-label="Manage subscriptions"]'
  const openSubscriptionMenu = async () => {
    await run(`document.querySelector(${JSON.stringify(subscriptionMenu)}).focus()`)
    await press('Enter')
    await wait('document.querySelector("[role=menu]")')
  }

  const focusWindow = async () => {
    // On macOS, focusing webContents alone can leave keyboard input in the launching app.
    if (process.platform === 'darwin') require('electron').app.focus({ steal: true })
    contents.getOwnerBrowserWindow().focus()
    contents.focus()
    await wait('document.hasFocus()')
  }
  const openThemes = async () => {
    await run('document.querySelector("#settings-theme").focus()')
    await press('Enter')
    await wait('document.activeElement.matches("[role=option]")')
  }
  const pickTheme = async (id, key) => {
    const option = `[role=option]:has([data-theme="${id}"])`
    if (key) {
      await press(key)
      await wait(`document.activeElement.matches(${JSON.stringify(option)})`)
    } else {
      await run(`document.querySelector(${JSON.stringify(option)}).focus()`)
    }
    await press('Enter')
    await wait(`document.documentElement.dataset.theme === "${id}" && !document.querySelector("[role=listbox]")`)
    await wait('document.querySelector("[data-settings-body]").ariaBusy === "false"')
    assert.ok(await run('document.activeElement.matches("#settings-theme")'))
  }
  const primaryToken = () => run('getComputedStyle(document.documentElement).getPropertyValue("--primary").trim()')
  const resolvedColor = (value) => run(`(() => {
    const probe = document.createElement('span')
    probe.style.color = ${JSON.stringify(value)}
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })()`)

  // Theme/language mutations must update both the UI and the persisted settings.
  await wait('document.querySelector("[data-tab=unread]")')
  await focusWindow()
  await click('[data-settings-trigger]')
  await wait('document.querySelector("[role=radio][value=light]")')
  await click('[role=radio][value=light]')
  await wait('!document.documentElement.classList.contains("dark")')
  await chooseLanguage('en-US')
  await snapshot('settings-light-en')
  const neutralPrimary = await primaryToken()
  let lightBlue
  contents.session.enableNetworkEmulation({ offline: true })
  try {
    assert.equal(await run('document.querySelector("#settings-theme").textContent.trim()'), 'Neutral')
    await openThemes()
    const catalog = await run(`Array.from(document.querySelectorAll('[role=option] [data-theme]'), swatch => swatch.dataset.theme)`)
    assert.deepEqual(catalog, [
      'neutral', 'stone', 'zinc', 'mauve', 'olive', 'mist', 'taupe',
      'amber', 'blue', 'cyan', 'emerald', 'fuchsia', 'green', 'indigo', 'lime', 'orange',
      'pink', 'purple', 'red', 'rose', 'sky', 'teal', 'violet', 'yellow',
    ])
    const blueSwatch = 'document.querySelector(\'[role=option] [data-theme="blue"]\')'
    const bluePreview = await run(`getComputedStyle(${blueSwatch}).getPropertyValue('--primary').trim()`)
    await pickTheme('blue', 'b')
    lightBlue = await primaryToken()
    assert.equal(lightBlue, bluePreview)
    assert.notEqual(lightBlue, neutralPrimary)
    await openThemes()
    await pickTheme('neutral')
    assert.equal(await primaryToken(), neutralPrimary)
    await openThemes()
    await pickTheme('blue', 'b')
    const settingsPath = path.join(process.env.YIKAN_SMOKE_USER_DATA, 'settings.json')
    assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).theme, 'blue')
    await snapshot('settings-theme-blue-light')
  } finally {
    contents.session.disableNetworkEmulation()
  }
  await wait('document.querySelector("[data-settings-body]").ariaBusy === "false"')
  await click('[role=radio][value=auto]')
  await wait('window.yikan.fetch("/settings/get", "appearance").then(value => value === "auto")')
  nativeTheme.themeSource = 'dark'
  await wait('document.documentElement.classList.contains("dark")')
  assert.equal(await run('document.documentElement.dataset.theme'), 'blue')
  assert.notEqual(await primaryToken(), lightBlue, 'System mode should apply the dark Blue tokens')
  nativeTheme.themeSource = 'light'
  await wait('!document.documentElement.classList.contains("dark")')
  assert.equal(await primaryToken(), lightBlue)
  await wait('document.querySelector("[data-settings-body]").ariaBusy === "false"')
  await click('[role=radio][value=dark]')
  await wait('document.documentElement.classList.contains("dark")')
  await chooseLanguage('zh-CN')
  assert.ok((await run('document.body.textContent')).includes('跟随系统'))
  await snapshot('settings-dark-zh')
  await openThemes()
  assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-slot=select-label]"), label => label.textContent)'), ['中性色', '彩色'])
  await snapshot('settings-theme-menu-zh')
  await press('Escape')
  await wait('!document.querySelector("[role=listbox]") && document.querySelector("[data-settings-body]")')

  // A reload reconstructs remote state from Query/IPC, including saved preferences.
  await Promise.all([new Promise(resolve => contents.once('did-finish-load', resolve)), run('location.reload()')])
  await wait('document.querySelector("[data-tab=unread]") && document.documentElement.lang === "zh-CN"')
  assert.equal(await run('document.documentElement.classList.contains("dark")'), true)
  assert.equal(await run('document.documentElement.dataset.theme'), 'blue')
  assert.ok((await run('document.body.textContent')).includes('未读'))
  await click('[data-settings-trigger]')
  await wait('document.querySelector(\'[role=radio][value="zh-CN"]\')?.ariaChecked === "true"')
  await focusWindow()
  await run('document.querySelector(\'[role=radio][value="zh-CN"]\').focus()')
  contents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
  await wait('document.documentElement.lang === "en-US" && document.activeElement.matches(\'[role=radio][value="en-US"][aria-checked=true]\')')
  contents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
  await click('[role=dialog] > button[aria-label=Close]')
  await wait('!document.querySelector("[role=dialog]")')
  await require('./settings-modal-smoke.cjs')(contents, { run, wait, click, press, snapshot })

  let fixtureCount = 52
  let failRss = false
  let failRecommendation = false
  let recommendationRequests = 0
  const rssRequests = []
  const recommendationQueueRequests = []
  const { promise: heldRecommendation, resolve: releaseRecommendation } = Promise.withResolvers()
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'application/rss+xml')
    if (request.url === '/home' || request.url === '/favicon.ico') {
      response.writeHead(404).end()
      return
    }
    if (request.url === '/invalid') { response.end('<html>Not a feed</html>'); return }
    if (request.url === '/held-recommendation') {
      void heldRecommendation.then(() => response.writeHead(503).end())
      return
    }
    if (request.url === '/empty') {
      response.setHeader('ETag', '"empty-fixture"')
      if (request.headers['if-none-match'] === '"empty-fixture"') {
        response.writeHead(304).end()
        return
      }
    }
    if (request.url === '/recommendation') {
      recommendationRequests += 1
      if (failRecommendation) {
        response.statusCode = 503
        response.end()
        return
      }
      response.end(`<rss version="2.0"><channel><title>Meituan fixture</title><item>
        <title>Engineering article</title><guid>engineering</guid>
        <link>https://example.com/engineering</link><description>Engineering notes.</description>
        </item></channel></rss>`)
      return
    }
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
    const items = Array.from({ length: request.url === '/empty' ? 0 : fixtureCount }, (_, index) => {
      const number = fixtureCount - index
      const published = new Date(Date.UTC(2026, 10, 17, 8, 0, number)).toUTCString()
      return `
      <item><title>Fixture article ${number}</title><link>https://example.com/article/${number}</link>
      <description><![CDATA[<p>Fixture content ${number}</p>${"<p>Reading position fixture.</p>".repeat(40)}<p><a href="/relative">Relative link</a></p>
      <img src="data:," onerror="window.__rssScriptRan = true"><script>window.__rssScriptRan = true</script>]]></description>
      <pubDate>${published}</pubDate></item>`
    }).join('')
    response.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture feed</title>
      <link>https://example.com</link><description>Smoke fixture</description>${items}</channel></rss>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const recommendedUrl = 'https://tech.meituan.com/rss.xml'
  const oldRecommendedUrl = 'https://tech.meituan.com/feed/'
  const heldRecommendationUrl = 'https://martinfowler.com/feed.atom'
  const nextRecommendationUrl = 'https://www.infoq.cn/feed.xml'
  const emptyFeedUrl = `${base}/empty`
  const networkFetch = globalThis.fetch
  globalThis.fetch = (url, options) => {
    if (['https://example.com/', 'https://example.com/favicon.ico'].includes(url)) {
      return Promise.resolve(new Response(null, { status: 404 }))
    }
    if ([heldRecommendationUrl, nextRecommendationUrl].includes(url)
      && !options?.headers?.has('if-none-match')) recommendationQueueRequests.push(url)
    if (url === heldRecommendationUrl) return networkFetch(`${base}/held-recommendation`, options)
    if (url === nextRecommendationUrl) return networkFetch(emptyFeedUrl, options)
    return networkFetch([recommendedUrl, oldRecommendedUrl].includes(url) ? `${base}/recommendation` : url, options)
  }
  try {
    await click('[aria-label="Subscribe to a feed"]')
    await wait('document.querySelector("#feed-url")')
    const halfOpacityRing = await resolvedColor('color-mix(in oklab, var(--focus-ring) 50%, transparent)')
    await press('?', true)
    assert.equal(await run('document.querySelectorAll("[role=dialog]").length'), 1, 'A subscription dialog blocks reader shortcuts')
    await focusWindow()
    await run('document.querySelector("#feed-url").focus()')
    await wait(`getComputedStyle(document.querySelector('#feed-url')).boxShadow.includes(${JSON.stringify(halfOpacityRing)})`)
    await input('#feed-url', `${base}/rss`)
    await run('document.querySelector("#feed-title").focus()')
    await wait('document.querySelector("#feed-title").value === "Fixture feed"')
    // Typing into a form must never activate the reader shortcuts.
    await run('document.querySelector("#feed-title").dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }))')
    await run('document.querySelector("form").requestSubmit()')
    await wait('!document.querySelector("[role=dialog]") && document.querySelectorAll("[data-list-item-id]").length === 50')
    await wait('document.body.textContent.includes("of 52")')
    assert.match(await run('document.querySelector("[data-article-open]").textContent'), /Fixture article 52/)
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
    const emphasis = await resolvedColor('var(--theme-emphasis)')
    await wait(`getComputedStyle(document.querySelector('[data-list-item-id]')).borderLeftColor === ${JSON.stringify(emphasis)}`)
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
    assert.equal(await run(`getComputedStyle(document.querySelector('${nextRow}')).borderLeftColor`), emphasis)
    await press('x')
    await wait(`document.querySelector('${nextRow} [role=checkbox][data-state=checked]')`)
    assert.equal(
      await run(`getComputedStyle(document.querySelector('${nextRow}')).backgroundColor`),
      await resolvedColor('var(--article-selected)'),
    )
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
    const articleViewport = 'document.querySelector("article").parentElement'
    const articleFocused = `document.activeElement === ${articleViewport}`
    assert.ok(await run(articleFocused), 'Opening an article should focus its scroll area')
    await wait(`window.yikan.fetch('/reader/get/article', ${firstId}).then(article => article.read === 1)`)
    assert.equal(await run('!!window.__rssScriptRan'), false, 'RSS markup must be sanitized')
    assert.equal(await run('document.querySelectorAll(".article-content script, .article-content [onerror]").length'), 0)
    const articleFont = 'getComputedStyle(document.querySelector(".article-content")).fontSize'
    const savedFont = 'window.yikan.fetch("/settings/get", "reader.fontSize")'
    const larger = `[aria-label="${en.reader.action.fontIncrease}"]`
    const smaller = `[aria-label="${en.reader.action.fontDecrease}"]`
    assert.equal(await run(articleFont), '14px')

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
    await press('+', true)
    assert.equal(await run('document.querySelectorAll("[role=dialog]").length'), 1)
    assert.equal(await run(articleFont), '14px')
    assert.equal((await run(`window.yikan.fetch('/reader/get/article', ${firstId})`)).starred, 1)
    await click('[role=radio][value=light]')
    await wait('!document.documentElement.classList.contains("dark")')
    await wait('document.querySelector("[data-settings-body]").ariaBusy === "false"')
    await focusWindow()
    await run('document.querySelector("[role=radio][value=light]").focus()')
    await wait('document.hasFocus() && document.activeElement.matches("[role=radio][value=light]")')
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
    await wait('document.documentElement.classList.contains("dark")')
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
    await snapshot('settings-over-article')
    await click('[role=dialog] > button[aria-label=Close]')
    await wait('!document.querySelector("[role=dialog]")')
    assert.equal(await run('window.__smokeArticle === document.querySelector("article")'), true)
    assert.equal(await run('window.__smokeArticle.parentElement.scrollTop === window.__smokeArticleScroll'), true)

    const paragraph = 'document.querySelectorAll(".article-content p")[15]'
    const paragraphOffset = `${paragraph}.getBoundingClientRect().top - window.__smokeArticle.parentElement.getBoundingClientRect().top`
    await run(`window.__smokeArticle.parentElement.scrollTop += (${paragraphOffset}) + 4`)
    const beforeResize = await run(paragraphOffset)
    await run(`(async () => {
      window.__fontWrites = 0
      window.__stopFontWrites = window.yikan.on('/settings/change', () => { window.__fontWrites += 1 })
      const button = document.querySelector(${JSON.stringify(larger)})
      button.click()
      await new Promise(requestAnimationFrame)
      button.click()
      button.click()
    })()`)
    await wait(`${articleFont} === "17px"`)
    assert.ok(Math.abs(await run(paragraphOffset) - beforeResize) < 8, 'Changing size should keep the paragraph in view')
    await wait(`${savedFont}.then(size => size === 17)`)
    await wait('window.__fontWrites > 0')
    assert.equal(await run('window.__fontWrites'), 1, 'Rapid adjustments should save only the final size')
    await run('window.__stopFontWrites()')
    await click(smaller)
    await wait(`${articleFont} === "16px"`)
    await press('+', true)
    await wait(`${articleFont} === "17px"`)
    await press('=')
    await wait(`${articleFont} === "18px" && document.querySelector('[aria-label="Article font size"] [role=status]').textContent === '18 px'`)
    await snapshot('article-font-size')
    for (let i = 0; i < 7; i += 1) await press('+', true)
    await wait(`${articleFont} === "24px" && document.querySelector(${JSON.stringify(larger)}).disabled`)
    assert.equal(await run(`document.querySelector(${JSON.stringify(smaller)}).disabled`), false)
    assert.ok(await run('parseFloat(getComputedStyle(document.querySelector("article h1")).fontSize) > 24'))
    for (let i = 0; i < 13; i += 1) await press('-')
    await wait(`${articleFont} === "12px" && document.querySelector(${JSON.stringify(smaller)}).disabled`)
    assert.equal(await run(`document.querySelector(${JSON.stringify(larger)}).disabled`), false)
    for (let i = 0; i < 6; i += 1) await press('=')
    await wait(`${articleFont} === "18px" && ${savedFont}.then(size => size === 18)`)
    await click('[aria-label="Mark as unread"]')
    await wait(`document.querySelector('[aria-label="Mark as read"]')`)
    await click('[aria-label="Back to list"]')
    await wait('document.querySelector("[data-list-item-id]")')
    assert.equal(await press('+', true), true, 'Font shortcuts should be inactive in the article list')
    await press('g'); await press('i')
    await wait('document.querySelectorAll("[data-list-item-id]").length === 50')
    const readingIds = await run('Array.from(document.querySelectorAll("[data-list-item-id]")).slice(0, 2).map(row => Number(row.dataset.listItemId))')
    const readingTitles = await run(`Promise.all(${JSON.stringify(readingIds)}.map(id => window.yikan.fetch('/reader/get/article', id).then(article => article.title)))`)
    await click(`[data-list-item-id="${readingIds[0]}"] button:last-child`)
    await wait(`document.querySelector('article h1')?.textContent === ${JSON.stringify(readingTitles[0])}`)
    assert.equal(await run(articleFont), '18px', 'Article size should carry over to the next article')
    await wait(`document.querySelector('[aria-label="Mark as unread"]')?.disabled === false`)
    await press('j')
    await wait(`document.querySelector('article h1')?.textContent === ${JSON.stringify(readingTitles[1])}`)
    assert.ok(await run(articleFocused), 'J should focus the new article')
    await wait(`document.querySelector('[aria-label="Mark as unread"]')?.disabled === false`)
    await press('k')
    await wait(`document.querySelector('article h1')?.textContent === ${JSON.stringify(readingTitles[0])}`)
    assert.ok(await run(articleFocused), 'K should focus the new article')
    await click('[aria-label="Back to list"]')
    await wait('document.querySelector("[data-list-item-id]")')
    await focusWindow()
    await wait('document.querySelector(\'[aria-label="Next page"]\')?.disabled === false')
    const position = await run(`(() => {
      const viewport = document.querySelector('.list-container')
      const rows = viewport.querySelectorAll('[data-list-item-id]')
      const row = rows[22]
      row.scrollIntoView({ block: 'center' })
      const offset = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      row.querySelector('[data-article-open]').focus({ preventScroll: true })
      return {
        id: Number(row.dataset.listItemId),
        nextId: Number(rows[23].dataset.listItemId),
        ids: Array.from(rows, item => Number(item.dataset.listItemId)),
        scrollTop: viewport.scrollTop,
        offset,
      }
    })()`)
    await wait(`${focusedIdExpression} === ${position.id}`)
    await press('o')
    await wait('document.querySelector(".article-content")')
    assert.ok(await run(articleFocused), 'O should focus the article scroll area')
    await wait(`window.yikan.fetch('/reader/get/article', ${position.id}).then(article => article.read === 1)`)
    await focusWindow()
    const articleScrollTop = `${articleViewport}.scrollTop`
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' })
    await wait(`${articleScrollTop} > 0`)
    assert.equal(
      await run(`getComputedStyle(${articleViewport}).outlineStyle`),
      'none',
      'Keyboard scrolling should keep the article outline hidden',
    )
    const scrolled = await run(articleScrollTop)
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Up' })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'Up' })
    await wait(`${articleScrollTop} < ${scrolled}`)
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'U' })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'U' })
    const keptRow = `[data-list-item-id="${position.id}"]`
    await wait(`document.querySelector('${keptRow}')?.classList.contains('text-muted-foreground')`)
    await wait('document.querySelector("[data-tab=unread] span")?.textContent === "49"')
    const returnedOffset = await run(`document.querySelector('${keptRow}').getBoundingClientRect().top
      - document.querySelector('.list-container').getBoundingClientRect().top`)
    assert.ok(Math.abs(returnedOffset - position.offset) <= 1, 'The read article should stay in its original row')
    assert.equal(await run('document.querySelector(".list-container").scrollTop'), position.scrollTop)
    const visibleIds = 'Array.from(document.querySelectorAll("[data-list-item-id]"), row => Number(row.dataset.listItemId))'
    assert.deepEqual(await run(visibleIds), position.ids)
    assert.equal(await run(focusedIdExpression), position.id)
    assert.equal(await run('getComputedStyle(document.activeElement).boxShadow'), 'none', 'Returning with U should use the active row indicator')
    await wait('document.querySelector(\'[aria-label="Next page"]\')?.disabled === false')
    await press('j')
    await wait(`${focusedIdExpression} === ${position.nextId}`)

    // Retained rows still count toward page offsets while browsing the unread list.
    await run('document.querySelector(".list-container > :last-child [data-article-open]").focus()')
    await press('j')
    await wait('document.body.textContent.includes("51–52 of 52") && document.activeElement === document.querySelector("[data-article-open]")')
    await wait('document.querySelector(\'[aria-label="Previous page"]\')?.disabled === false')
    await press('k')
    await wait(`${focusedIdExpression} === ${position.ids.at(-1)}`)
    assert.deepEqual(await run(visibleIds), position.ids)
    await click(refreshButton)
    await wait(`document.body.textContent.includes('1–49 of 49') && !document.querySelector('${keptRow}')`)
    await wait('document.querySelector(".list-container").parentElement.querySelector("[role=status]")?.textContent === "Synced 1 feed"')

    const [readBeforeSwitch] = await run(visibleIds)
    await run('document.querySelector("[data-article-open]").focus()')
    await press('o')
    await wait(`window.yikan.fetch('/reader/get/article', ${readBeforeSwitch}).then(article => article.read === 1)`)
    await press('u')
    const rowBeforeSwitch = `[data-list-item-id="${readBeforeSwitch}"]`
    await wait(`document.querySelector('${rowBeforeSwitch}')?.classList.contains('text-muted-foreground')`)
    await press('g'); await press('a')
    await wait('document.querySelector("[data-tab=all]").ariaPressed === "true"')
    await press('g'); await press('i')
    await wait(`document.body.textContent.includes('1–48 of 48') && !document.querySelector('${rowBeforeSwitch}')`)
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
    await wait(`window.yikan.fetch('/reader/get/articles', { tab: 'unread', page: 1, size: 50 }).then(result => result.count === 2)`)
    // Keep the sequence alive through a real background refresh and React renders.
    await press('*', true)
    fixtureCount = 53
    await run(`window.yikan.fetch('/reader/post/feed', { url: ${JSON.stringify(`${base}/rss`)}, title: 'Fixture feed' })`)
    await wait('document.body.textContent.includes("of 53")')
    await press('n')
    await wait('document.querySelectorAll("[data-list-item-id] [role=checkbox][data-state=checked]").length === 0')
    await press('?', true)
    await wait('document.querySelector("[role=dialog]")?.textContent.includes("Keyboard shortcuts")')
    assert.ok(await run('document.querySelector("[role=dialog]").textContent.includes("Increase font size while reading")'))
    await click('[role=dialog] button[aria-label=Close]')
    await wait('!document.querySelector("[role=dialog]")')

    await click('[aria-label="Next page"]')
    await wait('document.body.textContent.includes("51–53 of 53")')
    fixtureCount = 54
    const beforeRefresh = rssRequests.length
    await click(refreshButton)
    await wait('document.body.textContent.includes("51–54 of 54")')
    await wait('document.querySelector(".list-container").parentElement.querySelector("[role=status]")?.textContent === "Synced 1 feed"')
    assert.ok(rssRequests.slice(beforeRefresh).includes('"fixture-53"'), 'Manual refresh should fetch upstream using the saved validator')
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
    assert.match(await run('document.querySelector("[data-article-open]").textContent'), /Fixture article 55/)
    const refreshedOffset = await run(`document.querySelector('[data-list-item-id="${anchor.id}"]').getBoundingClientRect().top
      - document.querySelector('.list-container').getBoundingClientRect().top`)
    assert.ok(Math.abs(refreshedOffset - anchor.offset) <= 1, 'New articles should not shift the visible rows')

    await snapshot('reader-dark-en')
    const feedId = Number(await run('document.querySelector("[data-feed-id]").dataset.feedId'))
    const feedRow = `[data-feed-id="${feedId}"]`
    const feedButton = `${feedRow} > button`
    const menuButton = `${feedRow} [aria-haspopup="menu"]`
    const feedMenu = `[data-feed-menu="${feedId}"]`
    const markFeedReadButton = `${feedMenu} [role=menuitem]:first-child`
    const copyButton = `${feedMenu} [role=menuitem]:nth-child(2)`
    const unsubscribeButton = `${feedMenu} [role=menuitem]:last-child`
    const openFeedMenu = async () => {
      await run(`document.querySelector(${JSON.stringify(menuButton)}).focus()`)
      await press('Enter')
      await wait(`document.querySelector(${JSON.stringify(feedMenu)})`)
    }
    const rowElement = `document.querySelector(${JSON.stringify(feedRow)})`
    const feedElement = `document.querySelector(${JSON.stringify(feedButton)})`
    const menuElement = `document.querySelector(${JSON.stringify(menuButton)})`
    const rowBackground = `getComputedStyle(${rowElement}).backgroundColor`
    const actionsStyle = `getComputedStyle(${rowElement}.querySelector('[data-feed-actions]'))`
    const transparent = 'rgba(0, 0, 0, 0)'
    const currentBackground = await resolvedColor('var(--sidebar-current)')
    assert.equal(await run('getComputedStyle(document.querySelector("[data-tab][aria-pressed=true]")).backgroundColor'), currentBackground)

    // The compact menu shares the row highlight and needs no tooltip.
    await hover(feedButton)
    await wait(`${rowBackground} !== '${transparent}' && ${rowElement}.getAnimations().length === 0`)
    const highlight = await run(rowBackground)
    assert.notEqual(highlight, currentBackground, 'Hover and selection use distinct sidebar colors')
    await hoverWithoutTooltip(menuButton)
    assert.equal(await run(`${menuElement}.hasAttribute('title')`), false)
    assert.ok(await run(`!!${menuElement}.querySelector('.lucide-ellipsis')`))
    assert.equal(await run(rowBackground), highlight)
    assert.notEqual(await run(`getComputedStyle(${menuElement}).backgroundColor`), transparent)
    await hover('[data-tab=all]')
    await wait(`${rowBackground} === '${transparent}' && ${actionsStyle}.opacity === '0'`)

    const point = await hover(feedButton)
    contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
    contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
    await wait(`${feedElement}.getAttribute('aria-pressed') === 'true' && document.activeElement === ${feedElement}`)
    await hover('[data-tab=all]')
    assert.equal(await run(`${actionsStyle}.opacity`), '0', 'Mouse selection should not keep the actions visible')
    assert.equal(await run(`${actionsStyle}.pointerEvents`), 'none')
    await wait(`${rowBackground} === '${currentBackground}'`)
    assert.equal(await run(`getComputedStyle(${feedElement}.querySelector('svg')).color`), emphasis)
    await focusWindow()
    await wait(`document.activeElement === ${feedElement}`)
    tab()
    await wait(`document.activeElement.matches(${JSON.stringify(menuButton)}) && ${actionsStyle}.opacity === '1'`)
    tab(['shift'])
    await wait(`document.activeElement === ${feedElement} && ${actionsStyle}.opacity === '1'`)

    await openFeedMenu()
    assert.deepEqual(await run(`Array.from(document.querySelectorAll('${feedMenu} [role=menuitem]'), item => item.textContent.trim())`),
      [en.reader.action.markFeedRead, en.reader.action.copyFeedUrl, en.reader.action.unsubscribe])
    assert.equal(await run(`document.querySelectorAll('${feedMenu} [role=menuitem] > svg').length`), 3)
    await press('g'); await press('i')
    assert.equal(await run(`${feedElement}.ariaPressed`), 'true', 'An open menu blocks reader shortcuts')
    await snapshot('feed-actions-menu-dark-en')
    await run(`document.querySelector(${JSON.stringify(copyButton)}).focus()`)
    await press('Enter')
    await wait(`!document.querySelector('${feedMenu}') && ${rowElement}.querySelector('[data-feed-copied]')`)
    assert.equal(await require('electron').clipboard.readText(), `${base}/rss`)
    assert.ok(await run(`${menuElement}.querySelector('.lucide-check') && document.activeElement === ${menuElement}`))
    assert.equal(await run(`${menuElement}.matches(':focus-visible')`), true, 'Keyboard selection keeps the focus indicator')
    assert.equal(await run(`${menuElement}.textContent.trim()`), '', 'Copy success uses only the check icon')
    const menuWidth = await run(`${menuElement}.getBoundingClientRect().width`)
    await wait(`${menuElement}.querySelector('.lucide-ellipsis') && !${rowElement}.querySelector('[data-feed-copied]')`)
    assert.equal(await run(`${menuElement}.getBoundingClientRect().width`), menuWidth)

    await mouseClick(menuButton)
    await wait(`document.querySelector('${feedMenu}')`)
    await mouseClick(copyButton)
    await wait(`!document.querySelector('${feedMenu}') && ${rowElement}.querySelector('[data-feed-copied]')`)
    await wait(`document.activeElement === ${menuElement} && !${menuElement}.matches(':focus-visible')`)
    await wait(`getComputedStyle(${menuElement}).boxShadow === 'none'`)
    assert.equal(await run(`${menuElement}.textContent.trim()`), '')
    assert.equal(await run(`${menuElement}.getBoundingClientRect().width`), menuWidth)
    await snapshot('feed-address-copied-dark-en')
    await wait(`${menuElement}.querySelector('.lucide-ellipsis') && !${rowElement}.querySelector('[data-feed-copied]')`)
    await hover(menuButton)
    assert.equal(await run(`${menuElement}.matches(':focus-visible')`), false, 'The restored more icon stays free of a mouse focus ring')
    assert.equal(await run(`getComputedStyle(${menuElement}).boxShadow`), 'none')

    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(path.join(process.env.YIKAN_SMOKE_USER_DATA, 'yikan.db'), { timeout: 1000 })
    try {
      db.exec(`UPDATE articles SET read = 0 WHERE feedId = ${feedId}`)
      await click('[data-tab=unread]')
      await wait('document.querySelector("[data-tab=unread]").ariaPressed === "true"')
      await click(refreshButton)
      await wait('document.body.textContent.includes("1–50 of 55") && document.querySelector("[data-tab=unread] span")?.textContent === "55"')
      await openFeedMenu()
      db.exec(`CREATE TRIGGER reject_feed_read BEFORE UPDATE OF read ON articles
        WHEN OLD.feedId = ${feedId} BEGIN SELECT RAISE(ABORT, 'Test feed read failure'); END`)
      await click(markFeedReadButton)
      await wait(`document.querySelector('aside [role=alert]')?.textContent === ${JSON.stringify(en.reader.markFeedRead.error)}`)
      assert.equal(await run('window.yikan.fetch("/reader/get/articles/unread-count")'), 55)
      db.exec('DROP TRIGGER reject_feed_read')

      const openedId = await run('Number(document.querySelector("[data-list-item-id]").dataset.listItemId)')
      await click(`[data-list-item-id="${openedId}"] [data-article-open]`)
      await wait(`window.yikan.fetch('/reader/get/article', ${openedId}).then(article => article.read === 1)`)
      const openedTitle = await run('document.querySelector("article h1").textContent')
      const openedScroll = await run(`(() => {
        const viewport = document.querySelector('.article-content').closest('[tabindex="-1"]')
        viewport.scrollTop = 200
        return viewport.scrollTop
      })()`)
      await openFeedMenu()
      await click(markFeedReadButton)
      await wait('!document.querySelector("[data-feed-menu]") && !document.querySelector("[data-tab=unread] span")')
      assert.equal(await run('document.querySelector("article h1").textContent'), openedTitle)
      assert.equal(await run(`document.querySelector('.article-content').closest('[tabindex="-1"]').scrollTop`), openedScroll)
      assert.equal(await run('window.yikan.fetch("/reader/get/articles/unread-count")'), 0)
      assert.equal(await run('!!document.querySelector("[role=alertdialog], [role=dialog]")'), false)
      await openFeedMenu()
      assert.equal(await run(`document.querySelector('${markFeedReadButton}').ariaDisabled`), 'true')
      await press('Escape')
      await click('[aria-label="Back to list"]')
      await wait(`!document.querySelector('[data-list-item-id]') && document.body.textContent.includes(${JSON.stringify(en.reader.list.empty)})`)

      await click(feedButton)
      await wait('document.querySelectorAll("[data-list-item-id].text-muted-foreground").length === 50')
      fixtureCount = 56
      await click(refreshButton)
      await wait('document.body.textContent.includes("1–50 of 56") && document.querySelector("[data-tab=unread] span")?.textContent === "1"')
      assert.equal(await run('window.yikan.fetch("/reader/get/articles/unread-count")'), 1)
    } finally {
      db.close()
    }

    const articleBeforeUnsubscribe = await run(`window.yikan.fetch('/reader/get/article', ${firstId})`)
    const unreadBefore = await run('window.yikan.fetch("/reader/get/articles/unread-count")')
    const unsubscribeDb = new DatabaseSync(path.join(process.env.YIKAN_SMOKE_USER_DATA, 'yikan.db'), { timeout: 1000 })
    const leavingRow = `document.querySelector('[data-feed-leaving="${feedId}"]')`
    await openFeedMenu()
    try {
      unsubscribeDb.exec(`CREATE TRIGGER reject_unsubscribe BEFORE UPDATE OF subscribed ON feeds
        WHEN OLD.id = ${feedId} AND NEW.subscribed = 0
        BEGIN SELECT RAISE(ABORT, 'Test unsubscribe failure'); END`)
      await click(unsubscribeButton)
      await wait(`document.querySelector('aside [role=alert]')?.textContent === ${JSON.stringify(en.reader.unsubscribe.error)}`)
      assert.ok(await run(`${menuElement}.querySelector('.lucide-ellipsis') && !${leavingRow} && !${rowElement}.querySelector('.lucide-check')`))
      unsubscribeDb.exec('DROP TRIGGER reject_unsubscribe')

      await mouseClick(menuButton)
      await wait(`document.querySelector('${feedMenu}')`)
      unsubscribeDb.exec('BEGIN IMMEDIATE')
      try {
        await mouseClick(unsubscribeButton)
        await wait(`${menuElement}?.ariaBusy === 'true'`)
        assert.ok(await run(`${menuElement}.querySelector('.lucide-ellipsis') && ${menuElement}.disabled`))
        assert.equal(await run(`!!${rowElement}.querySelector('.lucide-check, .animate-spin')`), false)
      } finally {
        unsubscribeDb.exec('ROLLBACK')
      }
      await wait(`${rowElement}?.querySelector('.lucide-check') && !${rowElement}.matches(':hover')
        && ${actionsStyle}.opacity === '1' && getComputedStyle(${leavingRow}).opacity === '1'`)
    } finally {
      unsubscribeDb.close()
    }
    if (!await run('matchMedia("(prefers-reduced-motion: reduce)").matches')) {
      assert.equal(await run(`getComputedStyle(${leavingRow}).transitionDelay`), '0.15s')
      await wait(`${leavingRow}?.inert && getComputedStyle(${leavingRow}).opacity !== '1'`)
    }
    await wait('document.activeElement.matches("[data-tab=all]") && !document.querySelector("[data-feed-id]")')
    await wait('!document.querySelector("[data-tab=all]").matches(":focus-visible") && getComputedStyle(document.querySelector("[data-tab=all]")).boxShadow === "none"')
    await wait('document.querySelectorAll("[data-list-item-id]").length === 50')
    assert.equal(await run('!!document.querySelector("[role=alertdialog]")'), false)
    assert.deepEqual(await run('window.yikan.fetch("/reader/get/feed/all")'), [])
    assert.equal((await run('window.yikan.fetch("/reader/get/articles", { tab: "all", page: 1, size: 50 })')).count, 56)
    assert.deepEqual(await run(`window.yikan.fetch('/reader/get/article', ${firstId})`), articleBeforeUnsubscribe)
    assert.equal(articleBeforeUnsubscribe.feedTitle, 'Fixture feed')
    assert.equal(await run('window.yikan.fetch("/reader/get/articles/unread-count")'), unreadBefore)
    await openSubscriptionMenu()
    assert.equal(await run('document.querySelector("[role=menuitem]:last-child").getAttribute("aria-disabled")'), 'true')
    await press('Escape')
    await wait(`!document.querySelector('[role=menu]') && document.activeElement.matches(${JSON.stringify(subscriptionMenu)})`)

    // The catalog and icons are bundled. Live subscription state comes from the reader.
    const catalogButton = `[aria-label="${en.reader.recommendations.title}"]`
    const catalogHeader = '[data-feed-recommendations] [data-slot=dialog-header]'
    const recommendationRow = '[data-recommended-feed="meituan"]'
    const recommendationButton = `${recommendationRow} button`
    const recommendationAction = `document.querySelector(${JSON.stringify(recommendationButton)})`
    const buttonReady = (label) => `(() => {
      const button = ${recommendationAction}
      return button?.innerText.trim() === ${JSON.stringify(label)} && button.ariaDisabled === 'false'
    })()`
    contents.session.enableNetworkEmulation({ offline: true })
    try {
      await click(catalogButton)
      await wait('document.querySelectorAll("[data-recommended-feed]").length === 39')
      await wait(`Array.from(document.querySelectorAll('[data-recommended-feed]')).every(
        row => row.querySelector('img')?.naturalWidth > 0,
      )`)
      await wait(`(() => {
        const daily = document.querySelector('[data-recommended-feed=zhihuDaily] img')
        const morning = document.querySelector('[data-recommended-feed=zhihuMorning] img')
        return daily?.naturalWidth > 0 && daily.src === morning?.src
      })()`)
      const header = await run(`(() => {
        const header = document.querySelector(${JSON.stringify(catalogHeader)})
        const center = (element) => {
          const rect = element.getBoundingClientRect()
          return rect.top + rect.height / 2
        }
        return { height: header.offsetHeight, closeOffset: Math.abs(center(header) - center(header.querySelector('button'))) }
      })()`)
      assert.equal(header.height, 52)
      assert.ok(header.closeOffset <= 1, 'The close button should be centered in the header')
      await hover(catalogHeader)
      const firstRecommendation = await run(`(() => {
        const row = document.querySelector('[data-recommended-feed=w3cNews]')
        const title = row.querySelector('h4')
        const titleRect = title.getBoundingClientRect()
        const languageRect = title.nextElementSibling.getBoundingClientRect()
        const button = row.querySelector('button')
        const style = getComputedStyle(button)
        return {
          languageInline: languageRect.left >= titleRect.right && languageRect.bottom <= titleRect.bottom,
          border: style.borderTopWidth,
          shadow: style.boxShadow,
          plusColor: getComputedStyle(button.querySelector('.lucide-plus')).color,
        }
      })()`)
      assert.deepEqual(firstRecommendation, {
        languageInline: true,
        border: '1px',
        shadow: 'none',
        plusColor: await resolvedColor('var(--theme-emphasis)'),
      })
      const groups = await run(`Array.from(document.querySelectorAll('[data-feed-recommendations] section'), section => [
        section.querySelector('h3').textContent.trim(), section.querySelectorAll('[data-recommended-feed]').length,
      ])`)
      assert.deepEqual(groups, [
        [en.reader.recommendations.groups.webPlatformAndFrontend, 5],
        [en.reader.recommendations.groups.nodejs, 4],
        [en.reader.recommendations.groups.fullStackDevelopment, 2],
        [en.reader.recommendations.groups.softwareArchitecture, 4],
        [en.reader.recommendations.groups.highPerformanceSystems, 3],
        [en.reader.recommendations.groups.aiAndDataEngineering, 2],
        [en.reader.recommendations.groups.engineeringNewsAndEssays, 4],
        [en.reader.recommendations.groups.technology, 2],
        [en.reader.recommendations.groups.scienceAndHumanities, 5],
        [en.reader.recommendations.groups.zhihu, 3],
        [en.reader.recommendations.groups.douban, 5],
      ])
      assert.equal(recommendationRequests, 0)
      await snapshot('recommended-feeds-dark-en')
    } finally {
      contents.session.disableNetworkEmulation()
    }

    await run(`window.yikan.fetch('/reader/post/feed', ${JSON.stringify({ url: oldRecommendedUrl, title: 'Meituan Engineering' })})`)
    await wait(buttonReady(en.reader.recommendations.subscribed))
    const actionWidth = await run(`${recommendationAction}.offsetWidth`)
    await run(`${recommendationAction}.scrollIntoView({ block: 'center' })`)
    await hover(recommendationButton)
    await wait(buttonReady(en.reader.action.unsubscribe))
    await hover(catalogHeader)
    await wait(buttonReady(en.reader.recommendations.subscribed))
    const [meituan] = await run('window.yikan.fetch("/reader/get/feed/all")')
    const bundledIcon = fs.readFileSync(path.join(__dirname, '../src/ui/assets/feed-icons/meituan.png'), 'base64')
    assert.equal(meituan.icon, `data:image/png;base64,${bundledIcon}`, 'The legacy URL saves the bundled PNG')
    const meituanIcon = `document.querySelector('[data-feed-id="${meituan.id}"] img')`
    await wait(`${meituanIcon}?.naturalWidth > 0`)
    assert.equal(await run(`${meituanIcon}.getBoundingClientRect().width`), 16)
    const meituanTab = `{ tab: ${meituan.id}, page: 1, size: 50 }`
    const { data: [meituanArticle] } = await run(`window.yikan.fetch('/reader/get/articles', ${meituanTab})`)
    await run(`window.yikan.fetch('/reader/put/article/starred', { id: ${meituanArticle.id}, status: 1 })`)
    await focusWindow()
    await run('document.querySelector("[data-recommended-feed=byteByteGo] button").focus()')
    await wait('document.activeElement.matches("[data-recommended-feed=byteByteGo] button")')
    tab()
    await wait(`${recommendationAction}.matches(':focus-visible')`)
    await wait(buttonReady(en.reader.action.unsubscribe))
    await click(recommendationButton)
    await wait(buttonReady(en.reader.form.buttons.subscribe))
    assert.equal(await run(`${recommendationAction}.offsetWidth`), actionWidth)
    await wait(`!document.querySelector('[data-feed-id="${meituan.id}"]')`)

    failRecommendation = true
    await click(recommendationButton)
    await wait(`document.querySelector(${JSON.stringify(`${recommendationRow} [role=alert]`)})`)
    assert.deepEqual(await run('window.yikan.fetch("/reader/get/feed/all")'), [])
    failRecommendation = false
    await click(recommendationButton)
    await wait(buttonReady(en.reader.action.unsubscribe))
    assert.equal(await run(`${recommendationAction}.matches(':focus-visible')`), true)
    const [reactivated] = await run('window.yikan.fetch("/reader/get/feed/all")')
    assert.equal(reactivated.id, meituan.id, 'An older URL should resume the same subscription')
    assert.equal(reactivated.icon, meituan.icon)
    const { data: [retained], count } = await run(`window.yikan.fetch('/reader/get/articles', ${meituanTab})`)
    assert.equal(count, 1)
    assert.equal(retained.id, meituanArticle.id)
    assert.equal(retained.starred, 1)
    await click(recommendationButton)
    await wait(buttonReady(en.reader.form.buttons.subscribe))
    await press('Escape')
    await wait(`!document.querySelector('[data-feed-recommendations]') && document.activeElement.matches(${JSON.stringify(catalogButton)})`)

    const heldButton = '[data-recommended-feed="martinFowler"] button'
    const nextButton = '[data-recommended-feed="infoqChina"] button'
    const recommendationButtonsBusy = `[${JSON.stringify(heldButton)}, ${JSON.stringify(nextButton)}].every(selector => {
      const button = document.querySelector(selector)
      return button?.ariaBusy === 'true' && button.ariaDisabled === 'true'
        && button.querySelector('.lucide-loader-circle')
    })`
    await click(catalogButton)
    await wait(`document.querySelector(${JSON.stringify(heldButton)})?.ariaDisabled === 'false'`)
    await run(`(() => {
      const held = document.querySelector(${JSON.stringify(heldButton)})
      const next = document.querySelector(${JSON.stringify(nextButton)})
      held.click()
      next.click()
      next.click()
    })()`)
    await wait(recommendationButtonsBusy)
    await press('Escape')
    await wait('!document.querySelector("[data-feed-recommendations]")')
    await click(catalogButton)
    await wait(recommendationButtonsBusy)
    await click(nextButton)
    await press('Escape')
    await wait('!document.querySelector("[data-feed-recommendations]")')

    // The manual submission waits behind the two recommendations and saves an empty feed.
    await click('[aria-label="Subscribe to a feed"]')
    await wait('document.querySelector("#feed-url")')
    await input('#feed-url', emptyFeedUrl)
    await input('#feed-title', 'Empty feed')
    await run('document.querySelector("form").requestSubmit()')
    await wait('document.querySelector("button[type=submit]:disabled .lucide-loader-circle")')
    // Manual URL preflight can run while the subscription itself waits in the queue.
    assert.deepEqual(await run('window.yikan.fetch("/reader/get/feed/all")'), [])
    assert.deepEqual(recommendationQueueRequests, [heldRecommendationUrl], 'The first subscription holds the only slot')
    releaseRecommendation()
    await wait('!document.querySelector("[role=dialog]") && document.body.textContent.includes("Empty feed")')
    assert.deepEqual(recommendationQueueRequests, [heldRecommendationUrl, nextRecommendationUrl])
    const saved = await run('window.yikan.fetch("/reader/get/feed/all")')
    assert.deepEqual(saved.map(feed => feed.url), [nextRecommendationUrl, emptyFeedUrl])

    await click(catalogButton)
    await wait(`document.querySelector('[data-recommended-feed=martinFowler] [role=alert]')`)
    await hover(catalogHeader)
    await wait(`document.querySelector(${JSON.stringify(nextButton)})?.innerText.trim() === ${JSON.stringify(en.reader.recommendations.subscribed)}`)
    await click(nextButton)
    await wait(`document.querySelector(${JSON.stringify(nextButton)})?.innerText.trim() === ${JSON.stringify(en.reader.form.buttons.subscribe)}`)
    await press('Escape')
    await wait('!document.querySelector("[data-feed-recommendations]")')

    // Failed mutations keep user input available and do not add fake local data.
    await click('[aria-label="Subscribe to a feed"]')
    await wait('document.querySelector("#feed-url")')
    await input('#feed-url', `${base}/invalid`)
    await input('#feed-title', 'Invalid feed')
    await run('document.querySelector("form").requestSubmit()')
    await wait('document.querySelector("main [role=alert]") && !document.querySelector("button[type=submit]").disabled')
    assert.equal(await run('document.querySelector("#feed-title").value'), 'Invalid feed')
    assert.equal((await run('window.yikan.fetch("/reader/get/feed/all")')).length, 1)
    await click('[role=dialog] button[aria-label=Close]')
    await wait('!document.querySelector("[role=dialog]")')
    await require('./opml-smoke.cjs')({ run, wait, openSubscriptionMenu }, base)
    console.log('Renderer smoke passed: settings, recommendations, subscription queue and retention, reading position, feed refresh and mutation errors')
  } finally {
    releaseRecommendation()
    globalThis.fetch = networkFetch
    await new Promise(resolve => server.close(resolve))
  }
}
