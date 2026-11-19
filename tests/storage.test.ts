import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import sqlite3 from 'sqlite3'
import { createDatabaseClient } from '../src/base/node/database'
import { initReaderSchema } from '../src/services/reader/electron-main/schema'
import { createArticleRepository } from '../src/services/reader/electron-main/article-repository'
import { Article } from '../src/types/reader'

async function setup(context: TestContext) {
  const db = createDatabaseClient(new sqlite3.Database(':memory:'))
  context.after(() => db.close())
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

test('legacy migration retains IDs/state and adopts the original row on first refresh', async (context) => {
  const db = createDatabaseClient(new sqlite3.Database(':memory:'))
  context.after(() => db.close())
  await db.exec(`
    CREATE TABLE feeds(id INTEGER PRIMARY KEY, url TEXT UNIQUE, title TEXT, description TEXT, link TEXT, createTime TEXT);
    CREATE TABLE articles(id INTEGER PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, read INTEGER, starred INTEGER, pubTime TEXT, createTime TEXT,
      feedId INTEGER, UNIQUE(url,feedId));
    INSERT INTO feeds(id,url,title) VALUES (1,'https://example.com/feed','Feed');
    INSERT INTO articles VALUES (7,'https://example.com/one','Old','Old body',1,1,NULL,'2020-01-01',1);
  `)
  await initReaderSchema(db)
  const articles = createArticleRepository(db)
  assert.equal((await articles.getById(7))?.read, 1)
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
  const db = createDatabaseClient(new sqlite3.Database(':memory:'))
  context.after(() => db.close())
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
