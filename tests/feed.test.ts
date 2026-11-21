import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseString } from '../src/base/node/feed'
import { httpUrl, externalUrl, normalizeSrcset } from '../src/base/common/url'

const atom = (entries: string, attrs = '') => `<feed xmlns="http://www.w3.org/2005/Atom" ${attrs}>
  <title type="html">A &amp;amp; B</title><subtitle>Example</subtitle>
  <author><name>Feed Author</name></author>${entries}</feed>`
const entry = (fields: string, id = 'urn:article:1') => `<entry><id>${id}</id>
  <title type="text">Article</title><updated>2026-11-19T10:00:00+08:00</updated>${fields}</entry>`
const rss = (items: string) => `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Feed</title>
  <link>https://example.com/</link><description>Demo</description>${items}</channel></rss>`

test('Atom text, HTML, XHTML and summary retain their content semantics', async () => {
  const feed = await parseString(
    atom(
      [
        entry('<content>Plain body</content>'),
        entry('<content type="text">Use &lt;b&gt;literal tags&lt;/b&gt;</content>', 'urn:2'),
        entry('<content type="html">&lt;p&gt;HTML body&lt;/p&gt;</content>', 'urn:3'),
        entry(
          '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>XHTML<br/>body</p></div></content>',
          'urn:4',
        ),
        entry('<summary type="html">&lt;p&gt;Summary body&lt;/p&gt;</summary>', 'urn:5'),
        entry('<content src="https://example.com/body"/><summary>External body summary</summary>', 'urn:6'),
      ].join(''),
    ),
    'https://example.com/feed.xml',
  )
  assert.equal(feed?.title, 'A & B')
  const articles = feed!.items!
  assert.match(articles[0].content, /<div data-feed-text[^>]*>Plain body<\/div>/)
  assert.match(articles[1].content, /Use &lt;b&gt;literal tags&lt;\/b&gt;/)
  assert.equal(articles[2].content, '<p>HTML body</p>')
  assert.match(articles[3].content, /<p>XHTML<br>body<\/p>/)
  assert.equal(articles[4].content, '<p>Summary body</p>')
  assert.match(articles[5].content, /External body summary/)
  assert.equal(articles[5].contentUrl, 'https://example.com/body')
  assert.equal(articles[5].contentSource, 'summary')
  assert.equal(articles[0].author, 'Feed Author')
  assert.equal(articles[0].pubTime, '2026-11-19T02:00:00.000Z')
})

test('Atom alternate links, xml:base, image srcset and nested bases resolve consistently', async () => {
  const feed = await parseString(
    atom(
      entry(`<link rel="self" href="one.atom"/>
    <link rel="enclosure" href="one.mp3"/><link rel="alternate" type="text/html" href="posts/one"/>
    <content type="xhtml" xml:base="articles/"><div xmlns="http://www.w3.org/1999/xhtml">
      <img src="one.png" srcset="one.png 1x, two.png 2x"/>
      <div xml:base="nested/"><a href="next">Next</a></div>
    </div></content>`),
      'xml:base="https://example.com/blog/"',
    ),
    'https://other.example/feed',
  )
  const article = feed!.items![0]
  assert.equal(article.url, 'https://example.com/blog/posts/one')
  assert.match(article.content, /src="https:\/\/example.com\/blog\/articles\/one.png"/)
  assert.match(article.content, /https:\/\/example.com\/blog\/articles\/two.png 2x/)
  assert.match(article.content, /href="https:\/\/example.com\/blog\/articles\/nested\/next"/)
})

test('namespace prefixes do not change Atom or RSS 1.0 parsing', async () => {
  const atomFeed = await parseString(`<a:feed xmlns:a="http://www.w3.org/2005/Atom">
    <a:title type="text">Prefixed</a:title><a:entry><a:id>urn:one</a:id><a:title>One</a:title>
    <a:content>Body</a:content></a:entry></a:feed>`)
  assert.equal(atomFeed?.title, 'Prefixed')
  assert.match(atomFeed!.items![0].content, />Body<\/div>/)
  const rdf = await parseString(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns="http://purl.org/rss/1.0/"><channel><title>RDF feed</title></channel>
    <item rdf:about="https://example.com/one"><title>One</title><description>Body</description></item></rdf:RDF>`)
  assert.equal(rdf?.items?.[0].externalId, 'https://example.com/one')
  assert.equal(rdf?.items?.[0].url, 'https://example.com/one')
})

test('feed icons use relative XML bases and prefer Atom icon over logo', async () => {
  const base = 'https://example.com/feed.xml'
  const rssFeed = await parseString(rss('<image xml:base="assets/"><url>rss.png</url></image>'), base)
  assert.equal(rssFeed?.iconUrl, 'https://example.com/assets/rss.png')
  const atomFeed = await parseString(atom('<logo>/logo.png</logo><icon>atom.png</icon>'), base)
  assert.equal(atomFeed?.iconUrl, 'https://example.com/atom.png')
  const unsafeIcon = await parseString(atom('<icon>file:///icon.png</icon><logo>/logo.png</logo>'), base)
  assert.equal(unsafeIcon?.iconUrl, 'https://example.com/logo.png')
  const rdfFeed = await parseString(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns="http://purl.org/rss/1.0/"><channel><title>RDF feed</title></channel>
    <image><url>/rdf.png</url></image></rdf:RDF>`, base)
  assert.equal(rdfFeed?.iconUrl, 'https://example.com/rdf.png')
})

test('RSS full content, attribute-bearing values and DC metadata are preserved', async () => {
  const feed = await parseString(
    rss(`<item><guid isPermaLink="false">one</guid><title xml:lang="zh">中文</title>
    <description>Summary</description><content:encoded xml:base="https://example.com/assets/">
    <![CDATA[<p>Full body<img src="pic.png"></p>]]></content:encoded>
    <dc:creator>Author</dc:creator><dc:date>2026-11-19T02:00:00Z</dc:date></item>`),
  )
  const article = feed!.items![0]
  assert.equal(article.title, '中文')
  assert.equal(article.externalId, 'one')
  assert.equal(article.url, '')
  assert.match(article.content, /Full body<img src="https:\/\/example.com\/assets\/pic.png">/)
  assert.equal(article.author, 'Author')
  assert.equal(article.pubTime, '2026-11-19T02:00:00.000Z')
})

test('GUID-only and ID-only items have stable, distinct identities without fake browse URLs', async () => {
  const feed = await parseString(
    rss(`<item><guid isPermaLink="false">one</guid><title>One</title></item>
    <item><guid isPermaLink="false">two</guid><title>Two</title></item>`),
  )
  assert.deepEqual(
    feed!.items!.map((article) => article.identityKey),
    ['id:one', 'id:two'],
  )
  assert.deepEqual(
    feed!.items!.map((article) => article.url),
    ['', ''],
  )
  const fallback = await parseString(rss('<item><title>No ID</title><description>Body</description></item>'))
  assert.match(fallback!.items![0].identityKey!, /^hash:/)
})

test('URL policy removes external protocols while preserving web/mail links and srcset', () => {
  assert.equal(httpUrl('file:///tmp/document'), undefined)
  assert.equal(externalUrl('custom-app://action'), undefined)
  assert.equal(externalUrl('javascript:alert(1)'), undefined)
  assert.equal(externalUrl('mailto:hello@example.com'), 'mailto:hello@example.com')
  assert.equal(httpUrl('/one', 'https://example.com/feed'), 'https://example.com/one')
  assert.equal(
    normalizeSrcset('one.png, two.png', 'https://example.com/'),
    'https://example.com/one.png, https://example.com/two.png',
  )
  assert.equal(
    normalizeSrcset('one.png 1x,two.png 2x', 'https://example.com/'),
    'https://example.com/one.png 1x, https://example.com/two.png 2x',
  )
  assert.equal(
    normalizeSrcset('data:image/png;base64,YQ== 1x, two.png 2x', 'https://example.com/'),
    'data:image/png;base64,YQ== 1x, https://example.com/two.png 2x',
  )
})

test('malformed XML and excessive nesting fail explicitly', async () => {
  await assert.rejects(parseString('<rss>'), { kind: 'xml' })
  await assert.rejects(parseString(`<rss>${'<div>'.repeat(130)}${'</div>'.repeat(130)}</rss>`), {
    kind: 'limit',
  })
  assert.equal(await parseString('<html><body>Not a feed</body></html>'), null)
})

test('an over-limit HTML body falls back per entry while other entries still import', async () => {
  const deep = `<content type="html"><![CDATA[${'<div>'.repeat(140)}body${'</div>'.repeat(140)}]]></content>`
  const entries = [
    entry(`${deep}<summary>Readable summary</summary>`),
    entry(deep, 'urn:deep-without-summary'),
    entry('<content>Healthy article</content>', 'urn:healthy'),
  ]
  const items = (await parseString(atom(entries.join(''))))!.items!
  assert.deepEqual(items.map((item) => item.contentSource), ['summary', 'empty', 'full'])
  assert.match(items[0].content, /Readable summary/)
  assert.equal(items[1].content, '')
  assert.match(items[2].content, /Healthy article/)
})

test('body selection uses readable text or media and accepts MIME parameters', async () => {
  const items = (await parseString(atom([
    entry('<content type="text">  </content><summary>Text fallback</summary>'),
    entry('<content type="html">&lt;p&gt;&amp;nbsp;&lt;/p&gt;</content><summary>HTML fallback</summary>', 'urn:blank'),
    entry('<content type="text/html; charset=UTF-8">&lt;p&gt;Full HTML&lt;/p&gt;</content>', 'urn:mime'),
    entry('<content type="text/markdown"># Text</content>', 'urn:text'),
    entry('<content type="html">&lt;img src="https://example.com/photo.png"&gt;</content>', 'urn:image'),
  ].join(''))))!.items!
  assert.deepEqual(items.map((item) => item.contentSource), ['summary', 'summary', 'full', 'full', 'full'])
  assert.match(items[0].content, /Text fallback/)
  assert.match(items[1].content, /HTML fallback/)
  assert.equal(items[2].content, '<p>Full HTML</p>')
  assert.match(items[3].content, /# Text/)
  assert.match(items[4].content, /<img\b/)
})

test('RSS fields use namespace URIs and preserve images and local fragments', async () => {
  const items = (await parseString(rss(`
    <item xmlns:x="urn:other" xmlns:c="http://purl.org/rss/1.0/modules/content/">
      <title>Local anchors</title><x:encoded>Foreign content</x:encoded>
      <c:encoded xml:base="https://example.com/assets/"><![CDATA[
        <a href="#section">Jump</a><h2 id="section">Full body</h2><img data-src="photo.png" data-srcset="large.png 2x">
      ]]></c:encoded>
    </item>
    <item><title>Photo enclosure</title><enclosure url="/attachment.jpg" type="image/jpeg"/></item>
    <item xmlns:m="http://search.yahoo.com/mrss/"><title>Media photo</title><m:group>
      <m:content url="/media.png" medium="image"/><m:thumbnail url="/thumbnail.png"/>
    </m:group></item>
  `), 'https://example.com/feed.xml'))!.items!
  assert.deepEqual(items.map((item) => item.contentSource), ['full', 'media', 'media'])
  assert.match(items[0].content, /href="#section"/)
  assert.match(items[0].content, /src="https:\/\/example.com\/assets\/photo.png"/)
  assert.match(items[0].content, /srcset="https:\/\/example.com\/assets\/large.png 2x"/)
  assert.doesNotMatch(items[0].content, /Foreign content|data-src/)
  assert.match(items[1].content, /src="https:\/\/example.com\/attachment.jpg"/)
  assert.match(items[2].content, /src="https:\/\/example.com\/media.png"/)
})

test('cooperative XML chunks preserve Unicode pairs and plain-text whitespace', async () => {
  const prefix = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Feed</title><entry><id>urn:large</id><title>One</title><content>'
  const body = `${'x'.repeat(65535 - prefix.length)}😀\n  Indented line`
  const feed = await parseString(`${prefix}${body}</content></entry></feed>`)
  assert.ok(feed!.items![0].content.includes('😀\n  Indented line'))
})

test('foreign namespace extensions cannot shadow Atom content or alternate links', async () => {
  const actualEntry = entry(`<m:content xmlns:m="urn:media">Wrong body</m:content>
    <m:link xmlns:m="urn:media" href="https://example.com/wrong"/>
    <content>Actual body</content><link href="https://example.com/correct"/>`)
  const foreignEntry = '<m:entry xmlns:m="urn:media"><m:title>Not an Atom entry</m:title></m:entry>'
  const feed = await parseString(atom([actualEntry, foreignEntry].join('')))
  assert.equal(feed!.items!.length, 1)
  assert.match(feed!.items![0].content, /Actual body/)
  assert.equal(feed!.items![0].url, 'https://example.com/correct')
})
