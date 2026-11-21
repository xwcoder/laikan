import { DatabaseClient } from '@/base/node/database'

const articleColumns = `
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  pubTime TEXT,
  createTime TEXT DEFAULT CURRENT_TIMESTAMP,
  feedId INTEGER REFERENCES feeds(id) ON DELETE CASCADE,
  author TEXT,
  identityKey TEXT NOT NULL,
  externalId TEXT,
  contentBase TEXT,
  contentSource TEXT,
  contentUrl TEXT,
  UNIQUE(feedId, identityKey)
`

async function migrateArticles(db: DatabaseClient) {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(articles)')
  if (!columns.length) {
    await db.exec(`CREATE TABLE articles (${articleColumns})`)
    return
  }
  if (columns.some((column) => column.name === 'identityKey')) {
    if (!columns.some((column) => column.name === 'contentSource')) {
      await db.exec('ALTER TABLE articles ADD COLUMN contentSource TEXT')
    }
    if (!columns.some((column) => column.name === 'contentUrl')) {
      await db.exec('ALTER TABLE articles ADD COLUMN contentUrl TEXT')
    }
    return
  }
  const author = columns.some((column) => column.name === 'author') ? 'author' : "''"
  // Rebuild the table to remove UNIQUE(url, feedId). Keep every row and its ID/state.
  await db.exec(`
    CREATE TABLE articles_migrating (${articleColumns});
    INSERT INTO articles_migrating
      (id, url, title, content, read, starred, pubTime, createTime, feedId, author, identityKey)
    SELECT id, url, title, content, coalesce(read, 0), coalesce(starred, 0), pubTime,
      createTime, feedId, ${author}, 'legacy:' || id
    FROM articles;
    DROP TABLE articles;
    ALTER TABLE articles_migrating RENAME TO articles;
  `)
}

export async function initReaderSchema(db: DatabaseClient) {
  await db.transaction(async () => {
    await db.exec(`CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, description TEXT, link TEXT,
      createTime TEXT DEFAULT CURRENT_TIMESTAMP, etag TEXT, lastModified TEXT,
      subscribed INTEGER NOT NULL DEFAULT 1, subscriptionRevision INTEGER NOT NULL DEFAULT 0
    )`)
    const columns = await db.all<{ name: string }>('PRAGMA table_info(feeds)')
    const feedColumns = {
      etag: 'TEXT',
      lastModified: 'TEXT',
      subscribed: 'INTEGER NOT NULL DEFAULT 1',
      subscriptionRevision: 'INTEGER NOT NULL DEFAULT 0',
    }
    for (const [name, definition] of Object.entries(feedColumns)) {
      if (!columns.some((column) => column.name === name)) {
        // eslint-disable-next-line no-await-in-loop -- Preserve ordered processing.
        await db.exec(`ALTER TABLE feeds ADD COLUMN ${name} ${definition}`)
      }
    }
    await migrateArticles(db)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS article_full_text (
        articleId INTEGER PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
        sourceUrl TEXT NOT NULL,
        content TEXT NOT NULL,
        contentBase TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS articles_feed_read ON articles(feedId, read);
      CREATE INDEX IF NOT EXISTS articles_read_time ON articles(read, createTime DESC, id DESC);
      CREATE INDEX IF NOT EXISTS articles_starred_time ON articles(starred, createTime DESC, id DESC);
    `)
  })
  // Enabling this after copying also preserves any pre-existing orphaned rows.
  await db.exec('PRAGMA foreign_keys = ON')
}
