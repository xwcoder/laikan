const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')

module.exports = async function rssSmoke(contents) {
  const { app, shell } = require('electron')
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(path.join(app.getPath('userData'), 'laikan.db'), { timeout: 1000 })
  const getIcon = (id) => db.prepare('SELECT png, checkedAt FROM feed_icons WHERE feedId = ?').get(id)
  const originalOpenExternal = shell.openExternal
  let version = 1
  let canServeOriginal = false
  let canServeSiteIcon = false
  let releaseIcon
  const iconGate = new Promise(resolve => { releaseIcon = resolve })
  const png = fs.readFileSync(path.join(__dirname, '../src/ui/assets/feed-icons/douban.png'))
  // One 32×32 PNG entry in a favicon container.
  const icoHeader = Buffer.from([0, 0, 1, 0, 1, 0, 32, 32, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 22, 0, 0, 0])
  icoHeader.writeUInt32LE(png.length, 14)
  const favicon = Buffer.concat([icoHeader, png])
  let base
  const requests = []
  const atom = () => `<a:feed xmlns:a="http://www.w3.org/2005/Atom" xml:base="${base}/articles/">
    <a:title type="text">Atom feed</a:title>
    <a:link rel="alternate" href="/home"/><a:icon>/feed-icon-${version}.svg</a:icon>
    <a:entry><a:id>urn:one</a:id><a:title>One v${version}</a:title>
      <a:content type="text">Use &lt;b&gt;literal tags&lt;/b&gt;</a:content></a:entry>
    <a:entry><a:id>urn:two</a:id><a:title>Two</a:title><a:link href="${base}/full"/>
      <a:summary>Summary only</a:summary></a:entry>
    <a:entry><a:id>urn:three</a:id><a:title>Three</a:title>
      <a:link rel="self" href="three.atom"/><a:link rel="alternate" href="shared"/>
      <a:content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Full body<img data-src="pic.png"/></p>
        <p><a href="#end">Jump to the end</a></p>
        <center><p align="right"><font color="#111111" size="7" style="font-weight:700;font-style:italic">Styled text</font></p></center>
        <table bgcolor="#ffff00" width="5000"><tr><td colspan="2">Table cell</td></tr></table>
        ${'<p>Paragraph to exercise anchor navigation</p>'.repeat(40)}<h2 id="end">Last section</h2>
      </div></a:content></a:entry>
    <a:entry><a:id>urn:four</a:id><a:title>Four</a:title><a:link href="shared"/>
      <a:content type="application/xhtml+xml" src="/article.xhtml"/><a:summary>Different ID, shared URL</a:summary></a:entry>
  </a:feed>`
  const server = http.createServer(async (request, response) => {
    requests.push({ path: request.url, conditional: request.headers['if-none-match'] })
    if (request.url === '/feed-icon-1.svg') {
      await iconGate
      response.writeHead(404).end()
      return
    }
    if (request.url === '/feed-icon-2.svg') {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48"><rect width="96" height="48" fill="red"/></svg>',
      )
      return
    }
    if (request.url === '/home') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end(
        '<base href="/icons/"><link rel="shortcut icon" href="site.ico">',
      )
      return
    }
    if (request.url === '/icons/site.ico' && canServeSiteIcon) {
      response.writeHead(200, { 'Content-Type': 'image/x-icon' }).end(favicon)
      return
    }
    if (request.url === '/icons/site.ico' || request.url === '/favicon.ico' || request.url === '/') {
      response.writeHead(404).end()
      return
    }
    if (request.url === '/full') {
      response.statusCode = canServeOriginal ? 302 : 503
      if (canServeOriginal) response.setHeader('Location', '/original/article.html')
      response.end()
      return
    }
    if (request.url === '/original/article.html') {
      const originalTitle = Buffer.from([0xd4, 0xad, 0xce, 0xc4, 0xd1, 0xf9, 0xc0, 0xfd])
      response.setHeader('Content-Type', 'text/html')
      response.end(Buffer.concat([
        Buffer.from(`<html><head><meta charset="gbk"><base href="media/"><title>Original article</title>
          <script src="/extraction-probe/script.js"></script></head><body><nav>Original site menu
          <iframe src="/extraction-probe/frame.html"></iframe>
          <img src="/extraction-probe/nav.png"></nav><main><article><h1>Original article</h1><p>`),
        originalTitle,
        Buffer.from(` ${'This paragraph makes the article distinguishable from its navigation. '.repeat(9)}</p>
          <p><img src="photo.jpg" alt="Original illustration"></p></article></main>
          <footer>Original site footer</footer></body></html>`),
      ]))
      return
    }
    if (request.url === '/article.xhtml') {
      response.writeHead(200, { 'Content-Type': 'application/xhtml+xml' }).end(
        '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Direct article</title></head>'
        + '<body><p>Short direct body.</p><p><a href="a-link">Relative link</a></p></body></html>',
      )
      return
    }
    if (request.url.startsWith('/extraction-probe/')) {
      response.writeHead(404).end()
      return
    }
    if (request.url === '/gbk') {
      response.setHeader('Content-Type', 'text/xml; charset=gbk')
      response.end(Buffer.concat([
        Buffer.from('<?xml version="1.0" encoding="GBK"?><rss version="2.0"><channel><title>Feed</title><item><guid>gbk-one</guid><title>'),
        Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
        Buffer.from('</title><description>Encoded body</description></item></channel></rss>'),
      ]))
      return
    }
    if (request.url === '/missing') response.statusCode = 404
    response.setHeader('Content-Type', 'application/atom+xml')
    response.setHeader('ETag', `"atom-${version}"`)
    if (request.headers['if-none-match'] === `"atom-${version}"`) {
      response.statusCode = 304
      response.end()
    } else response.end(atom())
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  const run = code => contents.executeJavaScript(code)
  const wait = expression => run(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    const poll = () => {
      if (${expression}) return resolve(true)
      if (Date.now() > deadline) return reject(new Error(${JSON.stringify(`Timed out: ${expression}`)}))
      setTimeout(poll, 20)
    }
    poll()
  })`)
  const ipc = (channel, value) => run(`window.laikan.fetch(${JSON.stringify(channel)}, ${JSON.stringify(value)})`)
  const detail = id => ipc('/reader/get/article', id)
  const chooseArticle = async id => {
    const selector = JSON.stringify(`[data-list-item-id="${id}"] button:last-child`)
    await wait(`document.querySelector(${selector})`)
    await run(`document.querySelector(${selector}).click()`)
    await wait('document.querySelector(".article-content")')
  }
  const clickButton = (label) => run(`Array.from(document.querySelectorAll('button')).find(element =>
    (element.getAttribute('aria-label') || element.textContent.trim()) === ${JSON.stringify(label)}).click()`)
  const press = (key, repeat = false) => run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: ${JSON.stringify(key)}, repeat: ${repeat}, bubbles: true, cancelable: true
  }))`)
  try {
    const preview = await ipc('/reader/get/feed/preflight', `${base}/atom`)
    assert.equal(preview.title, 'Atom feed')
    await ipc('/reader/post/feed', { url: `${base}/atom`, title: 'Atom regression' })
    const feed = (await ipc('/reader/get/feed/all')).find(item => item.url === `${base}/atom`)
    assert.equal(feed.etag, '"atom-1"')
    const page = await ipc('/reader/get/articles', { tab: feed.id, page: 1, size: 50 })
    assert.equal(page.count, 4, 'Distinct IDs survive blank and shared links')
    assert.equal(requests.filter(item => item.path === '/atom' && !item.conditional).length, 1, 'Preflight is reused for import')
    assert.ok(page.data.every(item => !Object.hasOwn(item, 'content')), 'List responses omit full bodies')
    const feedRow = `[data-feed-id="${feed.id}"]`
    const feedIcon = `document.querySelector('${feedRow} img')`
    await wait(`document.querySelector('${feedRow} .lucide-rss')`)
    assert.equal(feed.icon, undefined, 'Subscription and articles are available while the icon request is pending')
    releaseIcon()
    const retryDeadline = Date.now() + 5_000
    while (!getIcon(feed.id)?.checkedAt && Date.now() < retryDeadline) await delay(20)
    assert.ok(getIcon(feed.id).checkedAt, 'An unsuccessful download is recorded for retry')
    const iconRequests = (url) => requests.filter(item => item.path === url).length
    assert.equal(iconRequests('/feed-icon-1.svg'), 1)
    assert.equal(iconRequests('/icons/site.ico'), 1)

    canServeSiteIcon = true
    await ipc('/reader/post/feed', { url: feed.url, title: feed.title })
    await delay(100)
    assert.equal(iconRequests('/feed-icon-1.svg'), 1, 'A recent failure delays background retries')
    await ipc('/reader/post/feed/refresh')
    assert.ok(requests.some(item => item.path === '/atom' && item.conditional === '"atom-1"'))
    await wait(`${feedIcon}?.naturalWidth === 32`)
    const fallback = getIcon(feed.id).png
    assert.ok(fallback instanceof Uint8Array, 'The site ICO is converted to a PNG BLOB after a manual 304 refresh')

    const idOf = externalId => page.data.find(item => item.externalId === externalId).id
    const first = await detail(idOf('urn:one'))
    const third = await detail(idOf('urn:three'))
    assert.equal(first.url, '')
    assert.ok(first.content.includes('Use &lt;b&gt;literal tags&lt;/b&gt;'))
    assert.match(third.content, new RegExp(`${base}/articles/pic.png`))
    assert.equal(third.url, `${base}/articles/shared`)
    await ipc('/reader/put/article/read', { ids: [first.id], status: 1 })
    await ipc('/reader/put/article/starred', { id: first.id, status: 1 })
    version = 2
    await ipc('/reader/post/feed/refresh')
    await wait(`${feedIcon}?.naturalWidth === 64 && ${feedIcon}.naturalHeight === 32`)
    const stored = getIcon(feed.id).png
    assert.notDeepEqual(stored, fallback, 'A new declared icon replaces the previous copy')
    assert.equal(iconRequests('/home'), 2, 'A valid declared icon takes precedence over the site')
    const updated = await detail(first.id)
    assert.equal(updated.title, 'One v2')
    assert.equal(updated.read, 1)
    assert.equal(updated.starred, 1)
    assert.equal((await ipc('/reader/get/articles', { tab: feed.id, page: 1, size: 50 })).count, 4)

    await wait(`document.querySelector('[data-feed-id="${feed.id}"] > button')`)
    await run(`document.querySelector('[data-feed-id="${feed.id}"] > button').click()`)
    await chooseArticle(first.id)
    assert.equal(await run('document.querySelector(".article-content").textContent'), 'Use <b>literal tags</b>')
    assert.equal(await run('!!document.querySelector(".article-content b")'), false)
    assert.equal(await run('getComputedStyle(document.querySelector(".article-content").firstElementChild).whiteSpace'), 'pre-wrap')
    assert.equal(await run(`document.querySelector('[aria-label="Open in browser"]').disabled`), true)

    await clickButton('Back to list')
    await chooseArticle(third.id)
    const presentation = await run(`(() => {
      const article = document.querySelector('.article-content')
      const styled = article.querySelector('em strong')
      const table = article.querySelector('.article-table-scroll')
      const plain = article.querySelector('p')
      return {
        legacyTagsAndAttrs: article.querySelectorAll('font, center, [style], [align], [bgcolor], [face]').length,
        equalFontSize: getComputedStyle(styled).fontSize === getComputedStyle(plain).fontSize,
        equalColor: getComputedStyle(styled).color === getComputedStyle(plain).color,
        tableScroll: getComputedStyle(table).overflowX,
        span: table.querySelector('td').colSpan,
        media: article.querySelector('img').getAttribute('src'),
      }
    })()`)
    assert.deepEqual(presentation, {
      legacyTagsAndAttrs: 0, equalFontSize: true, equalColor: true,
      tableScroll: 'auto', span: 2, media: `${base}/articles/pic.png`,
    })
    await run(`document.querySelector('.article-content a').click()`)
    assert.ok(await run(`document.querySelector('article').parentElement.scrollTop > 0`), 'Article anchor scrolls the reader')

    await clickButton('Back to list')
    const secondId = idOf('urn:two')
    await chooseArticle(secondId)
    assert.equal(requests.filter(item => item.path === '/full').length, 0, 'Opening the summary does not request the original')
    await clickButton('Load full article')
    await wait('document.querySelector("article [role=status]")?.textContent.includes("load the full article")')
    assert.equal(await run('document.querySelector(".article-content").textContent'), 'Summary only')
    canServeOriginal = true
    await press('f')
    await wait('document.querySelector(".article-content")?.textContent.includes("原文样例")')
    const loaded = await detail(secondId)
    assert.equal(loaded.contentSource, 'summary')
    assert.match(loaded.content, /Summary only/)
    assert.match(loaded.fullText.content, /原文样例/)
    assert.doesNotMatch(loaded.fullText.content, /Original site menu|Original site footer/)
    assert.equal(loaded.fullText.contentBase, `${base}/original/article.html`)
    assert.ok(loaded.fullText.content.includes(`${base}/original/media/photo.jpg`))
    assert.equal(requests.some(item => item.path.startsWith('/extraction-probe/')), false)
    await press('f', true)
    assert.ok(await run('document.querySelector(".article-content").textContent.includes("原文样例")'), 'Holding f does not toggle content')
    await press('f')
    await wait('document.querySelector(".article-content").textContent === "Summary only"')
    await press('f')
    await wait('document.querySelector(".article-content").textContent.includes("原文样例")')
    await clickButton('Show feed content')
    assert.equal(await run('document.querySelector(".article-content").textContent'), 'Summary only')
    await clickButton('Show full article')
    await clickButton('Back to list')
    assert.equal(await press('f'), true, 'Full-text shortcut is inactive in the article list')
    await chooseArticle(secondId)
    assert.ok(await run('document.querySelector(".article-content").textContent.includes("原文样例")'))
    assert.equal(requests.filter(item => item.path === '/full').length, 2, 'Reopening reuses the stored full text')

    const direct = await ipc('/reader/post/article/full-text', idOf('urn:four'))
    assert.match(direct.content, /Short direct body/)
    assert.ok(direct.content.includes(`${base}/a-link`))

    await ipc('/reader/post/feed', { url: `${base}/gbk`, title: 'GBK regression' })
    const gbk = (await ipc('/reader/get/feed/all')).find(item => item.url === `${base}/gbk`)
    assert.equal((await ipc('/reader/get/articles', { tab: gbk.id, page: 1, size: 50 })).data[0].title, '中文')
    assert.deepEqual(await ipc('/reader/post/feed', { url: `${base}/missing`, title: 'Bad HTTP' }), { error: 'http' })
    assert.equal((await ipc('/reader/get/feed/all')).some(item => item.url === `${base}/missing`), false)

    const opened = []
    shell.openExternal = async url => { opened.push(url) }
    await run(`['custom-app://action', 'javascript:alert(1)', 'file:///tmp/file', 'https://example.com/', 'mailto:hello@example.com']
      .forEach(url => window.laikan.openExternal(url))`)
    const deadline = Date.now() + 2000
    while (opened.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepEqual(opened, ['https://example.com/', 'mailto:hello@example.com'])
    const { lastInsertRowid: legacyId } = db.prepare('INSERT INTO feeds (url, title) VALUES (?, ?)')
      .run(`${base}/legacy`, 'Legacy feed')
    await ipc('/reader/post/feed/refresh')
    await wait(`document.querySelector('[data-feed-id="${legacyId}"] .lucide-rss')`)
    assert.equal(getIcon(legacyId), undefined, 'Refreshing a legacy feed does not create an icon record')
    await ipc('/reader/delete/feed', legacyId)
    console.log('Feed icon smoke passed: fallback, retry on 304, SVG and ICO decoding, PNG persistence and legacy compatibility')
    console.log('RSS integration passed: feed parsing, lightweight lists, normalized article styles, anchors, full text fallback and cache, GBK and URL validation')
  } finally {
    releaseIcon()
    shell.openExternal = originalOpenExternal
    db.close()
    await new Promise(resolve => server.close(resolve))
  }
}
