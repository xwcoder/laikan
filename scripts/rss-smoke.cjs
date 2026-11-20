const assert = require('node:assert/strict')
const http = require('node:http')

module.exports = async function rssSmoke(contents) {
  const { shell } = require('electron')
  const originalOpenExternal = shell.openExternal
  let version = 1
  let canServeOriginal = false
  let base
  const requests = []
  const atom = () => `<a:feed xmlns:a="http://www.w3.org/2005/Atom" xml:base="${base}/articles/">
    <a:title type="text">Atom feed</a:title>
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
      <a:content>Different ID, shared URL</a:content></a:entry>
  </a:feed>`
  const server = http.createServer((request, response) => {
    requests.push({ path: request.url, conditional: request.headers['if-none-match'] })
    if (request.url === '/full') {
      response.statusCode = canServeOriginal ? 302 : 503
      if (canServeOriginal) response.setHeader('Location', '/original/article.html')
      response.end()
      return
    }
    if (request.url === '/original/article.html') {
      response.setHeader('Content-Type', 'text/html; charset=UTF-8')
      response.end(`<html><head><title>Original article</title></head><body>
        <nav>Original site menu</nav><main><article><h1>Original article</h1>
        <p>${'原文样例。This paragraph makes the article distinguishable from its navigation. '.repeat(9)}</p>
        <p><img src="photo.jpg" alt="Original illustration"></p></article></main>
        <footer>Original site footer</footer></body></html>`)
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
  const ipc = (channel, value) => run(`window.emo.fetch(${JSON.stringify(channel)}, ${JSON.stringify(value)})`)
  const detail = id => ipc('/reader/get/article', id)
  const chooseArticle = async id => {
    const selector = JSON.stringify(`[data-list-item-id="${id}"] button:last-child`)
    await wait(`document.querySelector(${selector})`)
    await run(`document.querySelector(${selector}).click()`)
    await wait('document.querySelector(".article-content")')
  }
  const clickButton = (label) => run(`Array.from(document.querySelectorAll('button')).find(element =>
    (element.getAttribute('aria-label') || element.textContent.trim()) === ${JSON.stringify(label)}).click()`)
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
    await ipc('/reader/post/feed', { url: `${base}/atom`, title: 'Atom regression' })
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
    await clickButton('Load full article')
    await wait('document.querySelector(".article-content")?.textContent.includes("原文样例")')
    const loaded = await detail(secondId)
    assert.equal(loaded.contentSource, 'summary')
    assert.match(loaded.content, /Summary only/)
    assert.match(loaded.fullText.content, /原文样例/)
    assert.doesNotMatch(loaded.fullText.content, /Original site menu|Original site footer/)
    assert.ok(loaded.fullText.content.includes(`${base}/original/photo.jpg`))
    await clickButton('Show feed content')
    assert.equal(await run('document.querySelector(".article-content").textContent'), 'Summary only')
    await clickButton('Show full article')
    await clickButton('Back to list')
    await chooseArticle(secondId)
    assert.ok(await run('document.querySelector(".article-content").textContent.includes("原文样例")'))
    assert.equal(requests.filter(item => item.path === '/full').length, 2, 'Reopening reuses the stored full text')

    await ipc('/reader/post/feed', { url: `${base}/gbk`, title: 'GBK regression' })
    const gbk = (await ipc('/reader/get/feed/all')).find(item => item.url === `${base}/gbk`)
    assert.equal((await ipc('/reader/get/articles', { tab: gbk.id, page: 1, size: 50 })).data[0].title, '中文')
    assert.deepEqual(await ipc('/reader/post/feed', { url: `${base}/missing`, title: 'Bad HTTP' }), { error: 'http' })
    assert.equal((await ipc('/reader/get/feed/all')).some(item => item.url === `${base}/missing`), false)

    const opened = []
    shell.openExternal = async url => { opened.push(url) }
    await run(`['custom-app://action', 'javascript:alert(1)', 'file:///tmp/file', 'https://example.com/', 'mailto:hello@example.com']
      .forEach(url => window.emo.openExternal(url))`)
    const deadline = Date.now() + 2000
    while (opened.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.deepEqual(opened, ['https://example.com/', 'mailto:hello@example.com'])
    console.log('RSS integration passed: feed parsing, lightweight lists, normalized article styles, anchors, full text fallback and cache, GBK and URL validation')
  } finally {
    shell.openExternal = originalOpenExternal
    await new Promise(resolve => server.close(resolve))
  }
}
