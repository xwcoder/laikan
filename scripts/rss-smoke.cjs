const assert = require('node:assert/strict')
const http = require('node:http')

module.exports = async function rssSmoke(contents) {
  const { shell } = require('electron')
  const originalOpenExternal = shell.openExternal
  let version = 1
  let base
  const requests = []
  const atom = () => `<a:feed xmlns:a="http://www.w3.org/2005/Atom" xml:base="${base}/articles/">
    <a:title type="text">Atom feed</a:title>
    <a:entry><a:id>urn:one</a:id><a:title>One v${version}</a:title>
      <a:content type="text">Use &lt;b&gt;literal tags&lt;/b&gt;</a:content></a:entry>
    <a:entry><a:id>urn:two</a:id><a:title>Two</a:title><a:summary>Summary only</a:summary></a:entry>
    <a:entry><a:id>urn:three</a:id><a:title>Three</a:title>
      <a:link rel="self" href="three.atom"/><a:link rel="alternate" href="shared"/>
      <a:content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Full body<img src="pic.png"/></p></div></a:content></a:entry>
    <a:entry><a:id>urn:four</a:id><a:title>Four</a:title><a:link href="shared"/>
      <a:content>Different ID, shared URL</a:content></a:entry>
  </a:feed>`
  const server = http.createServer((request, response) => {
    if (request.url === '/gbk') {
      response.setHeader('Content-Type', 'text/xml; charset=gbk')
      response.end(Buffer.concat([
        Buffer.from('<?xml version="1.0" encoding="GBK"?><rss version="2.0"><channel><title>Feed</title><item><guid>gbk-one</guid><title>'),
        Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
        Buffer.from('</title><description>Encoded body</description></item></channel></rss>'),
      ]))
      return
    }
    requests.push({ path: request.url, conditional: request.headers['if-none-match'] })
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
  try {
    const preview = await ipc('/reader/get/feed/preflight', `${base}/atom`)
    assert.equal(preview.title, 'Atom feed')
    await ipc('/reader/post/feed', { url: `${base}/atom`, title: 'Atom regression' })
    const feed = (await ipc('/reader/get/feed/all')).find(item => item.url === `${base}/atom`)
    assert.equal(feed.etag, '"atom-1"')
    const page = await ipc('/reader/get/articles', { tab: feed.id, page: 1, size: 50 })
    assert.equal(page.count, 4, 'Distinct IDs survive blank and shared links')
    assert.equal(requests.filter(item => item.path === '/atom' && !item.conditional).length, 1, 'Preflight is reused for import')
    const first = page.data.find(item => item.externalId === 'urn:one')
    const third = page.data.find(item => item.externalId === 'urn:three')
    assert.equal(first.url, '')
    assert.ok(first.content.includes('Use &lt;b&gt;literal tags&lt;/b&gt;'))
    assert.match(third.content, new RegExp(`${base}/articles/pic.png`))
    assert.equal(third.url, `${base}/articles/shared`)
    await ipc('/reader/put/article/read', { ids: [first.id], status: 1 })
    await ipc('/reader/put/article/starred', { id: first.id, status: 1 })
    version = 2
    await ipc('/reader/post/feed', { url: `${base}/atom`, title: 'Atom regression' })
    const updated = await ipc('/reader/get/article', first.id)
    assert.equal(updated.title, 'One v2')
    assert.equal(updated.read, 1)
    assert.equal(updated.starred, 1)
    assert.equal((await ipc('/reader/get/articles', { tab: feed.id, page: 1, size: 50 })).count, 4)

    await wait(`document.querySelector('[data-feed-id="${feed.id}"] > button')`)
    await run(`document.querySelector('[data-feed-id="${feed.id}"] > button').click()`)
    await wait(`document.querySelector('[data-list-item-id="${first.id}"] button:last-child')`)
    await run(`document.querySelector('[data-list-item-id="${first.id}"] button:last-child').click()`)
    await wait('document.querySelector(".article-content")')
    assert.equal(await run('document.querySelector(".article-content").textContent'), 'Use <b>literal tags</b>')
    assert.equal(await run('!!document.querySelector(".article-content b")'), false)
    assert.equal(await run('getComputedStyle(document.querySelector(".article-content").firstElementChild).whiteSpace'), 'pre-wrap')
    assert.equal(await run(`document.querySelector('[aria-label="Open in browser"]').disabled`), true)

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
    console.log('RSS integration passed: Atom namespaces/content, GUID identity, relative URLs, state-preserving updates, GBK, cache reuse, HTTP errors and main-process URL validation')
  } finally {
    shell.openExternal = originalOpenExternal
    await new Promise(resolve => server.close(resolve))
  }
}
