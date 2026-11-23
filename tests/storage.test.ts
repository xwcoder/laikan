import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { createDatabaseClient } from '../src/base/node/database'
import { openDatabase } from '../src/base/node/sqlite'
import { initReaderSchema } from '../src/services/reader/electron-main/schema'
import { createArticleRepository } from '../src/services/reader/electron-main/article-repository'
import { Article } from '../src/types/reader'

async function openTestDatabase(context: TestContext) {
  const workerPath = new URL('../src/base/node/sqlite-worker.ts', import.meta.url)
  const db = createDatabaseClient(await openDatabase(workerPath, ':memory:'))
  context.after(() => db.close())
  return db
}

async function setup(context: TestContext) {
  const db = await openTestDatabase(context)
  await initReaderSchema(db)
  await db.run("INSERT INTO feeds(id,url,title) VALUES (1,'https://example.com/feed','Feed')")
  return { db, articles: createArticleRepository(db) }
}

const article = (externalId: string, extra: Partial<Article> = {}): Article => ({
  title: externalId,
  url: '',
  content: '<p>Body</p>',
  externalId,
  feedId: 1,
  ...extra,
})

test('distinct IDs survive empty/shared URLs; edits retain the article ID, read and star state', async (context) => {
  const { db, articles } = await setup(context)
  await articles.upsert([article('one'), article('two')])
  assert.equal((await articles.find({ tab: 'all', page: 1, size: 50 })).count, 2)
  const first = await db.get<Article>("SELECT * FROM articles WHERE externalId = 'one'")
  await articles.markRead([first!.id!], 1)
  await articles.starred(first!.id!, 1)
  await articles.upsert(
    article('one', { title: 'Edited', url: 'https://example.com/new', content: 'New body' }),
  )
  const edited = await articles.getById(first!.id!)
  assert.equal(edited?.title, 'Edited')
  assert.equal(edited?.read, 1)
  assert.equal(edited?.starred, 1)
  await articles.upsert([
    article('three', { url: 'https://example.com/shared' }),
    article('four', { url: 'https://example.com/shared' }),
  ])
  assert.equal((await articles.find({ tab: 'all', page: 1, size: 50 })).count, 4)
})

test('article lists sort by publication or first import time before paginating', async (context) => {
  const { db, articles } = await setup(context)
  await db.run("INSERT INTO feeds(id,url,title) VALUES (2,'https://example.com/another-feed','Another feed')")
  await articles.upsert([
    article('newest-dated', { pubTime: '2026-11-19T02:00:00.001Z' }),
    article('tied-dated', { pubTime: '2026-11-19T02:00:00.000Z' }),
    article('undated'),
    article('older-published', { pubTime: '2026-11-12T02:00:00.000Z' }),
    article('invalid-date', { pubTime: 'invalid date', feedId: 2 }),
  ])
  await db.exec(`
    UPDATE articles SET createTime = '2026-11-19 02:00:00', starred = 1;
    UPDATE articles SET createTime = '2026-11-20 02:00:00', read = 1 WHERE externalId = 'older-published';
    UPDATE articles SET createTime = '2026-11-19 02:00:01', starred = 0 WHERE externalId = 'invalid-date';
  `)

  const [firstPage, secondPage, feed, unread, starred] = await Promise.all([
    articles.find({ tab: 'all', page: 1, size: 3 }),
    articles.find({ tab: 'all', page: 2, size: 3 }),
    articles.find({ tab: 1, page: 1, size: 50 }),
    articles.find({ tab: 'unread', page: 1, size: 50 }),
    articles.find({ tab: 'starred', page: 1, size: 50 }),
  ])
  assert.equal(firstPage.count, 5)
  assert.deepEqual(firstPage.rows.map(({ externalId }) => externalId), ['invalid-date', 'newest-dated', 'tied-dated'])
  assert.deepEqual(secondPage.rows.map(({ externalId }) => externalId), ['undated', 'older-published'])
  const firstFeedOrder = ['newest-dated', 'tied-dated', 'undated', 'older-published']
  assert.deepEqual(feed.rows.map(({ externalId }) => externalId), firstFeedOrder)
  assert.deepEqual(unread.rows.map(({ externalId }) => externalId), ['invalid-date', 'newest-dated', 'tied-dated', 'undated'])
  assert.deepEqual(starred.rows.map(({ externalId }) => externalId), firstFeedOrder)
})

test('legacy migration retains IDs/state and adopts the original row on first refresh', async (context) => {
  const db = await openTestDatabase(context)
  await db.exec(`
    CREATE TABLE feeds(id INTEGER PRIMARY KEY, url TEXT UNIQUE, title TEXT, description TEXT, link TEXT, createTime TEXT);
    CREATE TABLE articles(id INTEGER PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, read INTEGER, starred INTEGER, pubTime TEXT, createTime TEXT,
      feedId INTEGER, UNIQUE(url,feedId));
    INSERT INTO feeds(id,url,title) VALUES (1,'https://example.com/feed','Feed');
    INSERT INTO articles VALUES (7,'https://example.com/one','Old','Old body',1,1,
      'Tue, 31 Dec 2019 22:00:00 GMT','2020-01-01',1);
  `)
  await initReaderSchema(db)
  const articles = createArticleRepository(db)
  assert.equal((await db.get('SELECT subscribed FROM feeds WHERE id = 1'))?.subscribed, 1)
  assert.equal(await db.get('SELECT png FROM feed_icons WHERE feedId = 1'), undefined)
  const migrated = await articles.getById(7)
  assert.equal(migrated?.read, 1)
  assert.equal(migrated?.pubTime, '2019-12-31T22:00:00.000Z')
  await articles.upsert(article('stable-guid', {
    url: 'https://example.com/one', content: 'Summary', contentSource: 'summary',
  }))
  assert.equal((await articles.getById(7))?.content, 'Old body')
  await articles.upsert(article('stable-guid', { url: 'https://example.com/one', title: 'Updated' }))
  const updated = await articles.getById(7)
  assert.equal(updated?.externalId, 'stable-guid')
  assert.equal(updated?.identityKey, 'id:stable-guid')
  assert.equal(updated?.title, 'Updated')
  assert.equal(updated?.starred, 1)
  assert.equal(updated?.read, 1)
  await articles.upsert([article('without-url-1'), article('without-url-2')])
  await initReaderSchema(db)
  assert.equal((await articles.find({ tab: 'all', page: 1, size: 50 })).count, 3)
})

test('lower quality refreshes preserve the stored body and its base while same quality revisions update both', async (context) => {
  const { articles } = await setup(context)
  const original = article('one', {
    content: '<p>Original</p>', contentSource: 'full', contentBase: 'https://example.com/original/',
  })
  await articles.upsert(original)
  const { rows } = await articles.find({ tab: 'all', page: 1, size: 50 })
  const { id } = rows[0]
  assert.equal('content' in rows[0], false)
  await articles.upsert(article('one', {
    content: 'Summary', contentSource: 'summary', contentBase: 'https://example.com/summary/',
  }))
  await articles.upsert(article('one', { content: '', contentSource: 'empty', title: 'Updated title' }))
  const kept = await articles.getById(id!)
  assert.equal(kept?.title, 'Updated title')
  assert.equal(kept?.content, original.content)
  assert.equal(kept?.contentBase, original.contentBase)
  assert.equal(kept?.contentSource, 'full')
  await articles.upsert({ ...original, content: 'Revised', contentBase: 'https://example.com/revised/' })
  const revised = await articles.getById(id!)
  assert.equal(revised?.content, 'Revised')
  assert.equal(revised?.contentBase, 'https://example.com/revised/')
})

test('extracted full text is separate and only valid for the current source URL', async (context) => {
  const { articles } = await setup(context)
  const summary = article('one', {
    url: 'https://example.com/one', content: 'Feed summary', contentSource: 'summary',
  })
  await articles.upsert(summary)
  const { rows } = await articles.find({ tab: 'all', page: 1, size: 50 })
  const id = rows[0].id!
  const fullText = { content: 'Original page body', contentBase: 'https://example.com/original/' }
  assert.equal(await articles.saveFullText(id, summary.url, fullText), true)
  assert.deepEqual((await articles.getById(id))?.fullText, fullText)
  assert.equal((await articles.getById(id))?.content, 'Feed summary')
  await articles.upsert({ ...summary, url: 'https://example.com/changed' })
  assert.equal(await articles.saveFullText(id, summary.url, fullText), false)
  assert.equal((await articles.getById(id))?.fullText, undefined)
})

test('a failed batch rolls back every row and exposes the SQLite error', async (context) => {
  const { db, articles } = await setup(context)
  await db.exec(`CREATE TRIGGER reject_bad BEFORE INSERT ON articles WHEN NEW.title = 'Bad'
    BEGIN SELECT RAISE(ABORT,'Rejected article'); END`)
  await assert.rejects(
    articles.upsert([article('one'), article('two', { title: 'Bad' })]),
    /Rejected article/,
  )
  assert.equal((await articles.find({ tab: 'all', page: 1, size: 50 })).count, 0)
  await articles.upsert(article('recovered'))
  assert.equal((await articles.find({ tab: 'all', page: 1, size: 50 })).count, 1)
})

test('concurrent reads and writes cannot leak into a transaction that later rolls back', async (context) => {
  const { db } = await setup(context)
  let entered: () => void = () => undefined
  let release: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const failing = db.transaction(async () => {
    await db.run("UPDATE feeds SET title = 'Uncommitted' WHERE id = 1")
    entered()
    await gate
    throw new Error('Rollback requested')
  })
  const rejected = assert.rejects(failing, /Rollback requested/)
  await started
  let readFinished = false
  const read = db.get<{ title: string }>('SELECT title FROM feeds WHERE id=1').then((row) => {
    readFinished = true
    return row
  })
  const write = db.run("UPDATE feeds SET description='Committed separately' WHERE id=1")
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(readFinished, false)
  release()
  await rejected
  assert.equal((await read)?.title, 'Feed')
  await write
  assert.equal(
    (await db.get('SELECT description FROM feeds WHERE id=1'))?.description,
    'Committed separately',
  )
})

test('migration failure leaves the original table and rows intact', async (context) => {
  const db = await openTestDatabase(context)
  await db.exec(`
    CREATE TABLE articles(id INTEGER PRIMARY KEY,url TEXT,title TEXT,content TEXT,read INTEGER,
      starred INTEGER,pubTime TEXT,createTime TEXT,feedId INTEGER);
    INSERT INTO articles VALUES(1,'https://example.com/one',NULL,'Body',1,1,NULL,NULL,1);
  `)
  await assert.rejects(initReaderSchema(db), /NOT NULL/)
  const row = await db.get('SELECT * FROM articles WHERE id=1')
  assert.equal(row?.title, null)
  assert.equal(row?.read, 1)
  assert.equal(await db.get("SELECT name FROM sqlite_master WHERE name='articles_migrating'"), undefined)
})
