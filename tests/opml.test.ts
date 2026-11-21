import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseOpml, serializeOpml } from '../src/base/node/opml'

test('OPML import flattens nested outlines and reads valid subscriptions and their metadata', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
    <opml version="1.0"><body><outline text="Folder"><outline text="Nested">
      <outline title="频道 A &amp; B" xmlUrl="HTTPS://EXAMPLE.COM:443/feed" htmlUrl="https://example.com" description="Example"/>
      <outline text="From text" xmlUrl="https://example.com/atom"/>
      <outline xmlUrl="https://example.com/untitled"/>
      <outline text="Invalid" xmlUrl="file:///tmp/feed.xml"/>
    </outline></outline></body></opml>`
  const feeds = await parseOpml(Buffer.from(`\uFEFF${xml}`, 'utf16le'))
  assert.deepEqual(feeds, [
    {
      url: 'https://example.com/feed', title: '频道 A & B', link: 'https://example.com/', description: 'Example',
    },
    {
      url: 'https://example.com/atom', title: 'From text', link: undefined, description: undefined,
    },
    {
      url: 'https://example.com/untitled', title: 'https://example.com/untitled', link: undefined, description: undefined,
    },
  ])
})

test('OPML export escapes attributes and round-trips Unicode and multiline metadata', async () => {
  const feed = {
    url: 'https://example.com/feed?a=1&b=2',
    title: '新闻 & <"作者\'"> 🎧',
    description: 'Line one\nLine two\tend',
    link: 'https://example.com/',
  }
  const xml = serializeOpml([{ ...feed, items: [{ title: 'Article', url: '', content: '' }] }])
  assert.match(xml, /<opml version="2\.0">/)
  assert.match(xml, /xmlUrl="https:\/\/example\.com\/feed\?a=1&amp;b=2"/)
  assert.doesNotMatch(xml, /Article/)
  assert.deepEqual(await parseOpml(Buffer.from(xml)), [feed])
})

test('invalid OPML structure and malformed XML fail before any subscriptions can be returned', async () => {
  await assert.rejects(parseOpml(Buffer.from('<rss><body/></rss>')), { kind: 'format' })
  await assert.rejects(parseOpml(Buffer.from('<opml><head/></opml>')), { kind: 'format' })
  await assert.rejects(parseOpml(Buffer.from('<opml><body><outline xmlUrl="https://example.com/feed"/>')), { kind: 'xml' })
})
