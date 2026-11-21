export type Tab = 'unread' | 'starred' | 'all'

export type ArticleListItem = {
  id?: number
  title: string
  url: string
  externalId?: string
  pubTime?: string
  author?: string
  starred?: 0 | 1
  read?: 0 | 1
  feedId?: number
  feedTitle?: string | null
}

export type ArticleContentSource = 'full' | 'summary' | 'media' | 'empty'

export type Article = ArticleListItem & {
  content: string
  identityKey?: string
  contentBase?: string | null
  contentSource?: ArticleContentSource | null
  contentUrl?: string | null
}

export type ArticleFullText = { content: string, contentBase: string }

export type ArticleDetail = Article & {
  fullText?: ArticleFullText
  feedLink?: string | null
  feedUrl?: string | null
}

export type ArticlePage = { count: number, data: ArticleListItem[] }
export type ArticleFilter = { tab: Tab | number, page: number, size: number, retainedUnreadIds?: number[] }

export type Feed = {
  id?: number
  url: string
  title: string
  description?: string
  link?: string
  unreadCount?: number
  items?: Article[]
  createTime?: string
  etag?: string
  lastModified?: string
}

export type FeedRefreshResult = { succeeded: number, failed: number }

export type FeedTransferAction = 'import' | 'export'

export type FeedTransferResult =
  | { status: 'canceled' | 'imported' | 'exported' | 'noValidFeeds' | 'noNewFeeds' | 'noFeeds' }
  | { error: 'readFile' | 'writeFile' | 'invalidOpml' | 'encoding' | 'limit' }
