export type RecommendedFeed = {
  id: string
  title: string
  url: string
  language: 'en' | 'zh-CN' | 'zh-TW'
  icon: string
}

export const recommendedGroups: readonly { id: string; feeds: readonly RecommendedFeed[] }[] = [
  {
    id: 'development',
    feeds: [
      {
        id: 'martinFowler',
        title: 'Martin Fowler',
        url: 'https://martinfowler.com/feed.atom',
        language: 'en',
        icon: 'martin-fowler',
      },
      {
        id: 'byteByteGo',
        title: 'ByteByteGo',
        url: 'https://blog.bytebytego.com/feed',
        language: 'en',
        icon: 'bytebytego',
      },
      {
        id: 'meituan',
        title: '美团技术团队',
        url: 'https://tech.meituan.com/rss.xml',
        language: 'zh-CN',
        icon: 'meituan',
      },
      {
        id: 'simonWillison',
        title: 'Simon Willison',
        url: 'https://simonwillison.net/atom/entries/',
        language: 'en',
        icon: 'simon-willison',
      },
      {
        id: 'tonsky',
        title: 'tonsky.me',
        url: 'https://tonsky.me/atom.xml',
        language: 'en',
        icon: 'tonsky',
      },
      {
        id: 'webDevBlog',
        title: 'web.dev Blog',
        url: 'https://web.dev/static/blog/feed.xml',
        language: 'en',
        icon: 'web-dev',
      },
      {
        id: 'webDevArticles',
        title: 'web.dev Articles',
        url: 'https://web.dev/articles/feed.xml',
        language: 'en',
        icon: 'web-dev',
      },
      {
        id: 'chrome',
        title: 'Google Chrome',
        url: 'https://blog.google/products-and-platforms/products/chrome/rss/',
        language: 'en',
        icon: 'chrome',
      },
      {
        id: 'infoqChina',
        title: 'InfoQ 中文站',
        url: 'https://www.infoq.cn/feed.xml',
        language: 'zh-CN',
        icon: 'infoq',
      },
      {
        id: 'infoqEnglish',
        title: 'InfoQ',
        url: 'https://feed.infoq.com/',
        language: 'en',
        icon: 'infoq',
      },
      {
        id: 'infoqArchitecture',
        title: 'InfoQ · Architecture & Design',
        url: 'https://feed.infoq.com/architecture-design/',
        language: 'en',
        icon: 'infoq',
      },
      {
        id: 'infoqAi',
        title: 'InfoQ · AI, ML & Data Engineering',
        url: 'https://feed.infoq.com/ai-ml-data-eng/',
        language: 'en',
        icon: 'infoq',
      },
    ],
  },
  {
    id: 'technology',
    feeds: [
      {
        id: 'ruanyifeng',
        title: '阮一峰的网络日志',
        url: 'https://www.ruanyifeng.com/blog/atom.xml',
        language: 'zh-CN',
        icon: 'ruanyifeng',
      },
      {
        id: 'sspai',
        title: '少数派',
        url: 'https://sspai.com/feed',
        language: 'zh-CN',
        icon: 'sspai',
      },
      {
        id: 'geekpark',
        title: '极客公园',
        url: 'https://www.geekpark.net/rss',
        language: 'zh-CN',
        icon: 'geekpark',
      },
    ],
  },
  {
    id: 'scienceAndHumanities',
    feeds: [
      {
        id: 'quanta',
        title: 'Quanta Magazine',
        url: 'https://www.quantamagazine.org/feed/',
        language: 'en',
        icon: 'quanta',
      },
      {
        id: 'ourWorldInData',
        title: 'Our World in Data',
        url: 'https://ourworldindata.org/atom.xml',
        language: 'en',
        icon: 'our-world-in-data',
      },
      {
        id: 'theReporter',
        title: '報導者',
        url: 'https://public.twreporter.org/rss/twreporter-rss.xml',
        language: 'zh-TW',
        icon: 'the-reporter',
      },
      {
        id: 'marginalRevolution',
        title: 'Marginal Revolution',
        url: 'https://feeds.feedblitz.com/marginalrevolution',
        language: 'en',
        icon: 'marginal-revolution',
      },
      {
        id: 'publicDomainReview',
        title: 'The Public Domain Review',
        url: 'https://publicdomainreview.org/rss.xml',
        language: 'en',
        icon: 'public-domain-review',
      },
    ],
  },
  {
    id: 'zhihu',
    feeds: [
      {
        id: 'zhihuDaily',
        title: '知乎日报',
        url: 'https://rsshub.mt.cd/zhihu/daily',
        language: 'zh-CN',
        icon: 'zhihu',
      },
      {
        id: 'zhihuMorning',
        title: '知乎早报',
        url: 'https://rss.lilydjwg.me/zhihuzhuanlan/c_1085975047386050560',
        language: 'zh-CN',
        icon: 'zhihu',
      },
      {
        id: 'zhihuHot',
        title: '知乎热榜',
        url: 'https://rsshub.mt.cd/zhihu/hot',
        language: 'zh-CN',
        icon: 'zhihu',
      },
    ],
  },
  {
    id: 'douban',
    feeds: [
      {
        id: 'doubanBookReviews',
        title: '豆瓣最受欢迎的书评',
        url: 'https://www.douban.com/feed/review/book',
        language: 'zh-CN',
        icon: 'douban',
      },
      {
        id: 'doubanNewBooks',
        title: '豆瓣新书速递',
        url: 'https://rsshub.mt.cd/douban/book/latest',
        language: 'zh-CN',
        icon: 'douban',
      },
      {
        id: 'doubanMovieReviews',
        title: '豆瓣最受欢迎的影评',
        url: 'https://www.douban.com/feed/review/movie',
        language: 'zh-CN',
        icon: 'douban',
      },
      {
        id: 'doubanWeeklyMovies',
        title: '豆瓣一周口碑电影榜',
        url: 'https://rsshub.mt.cd/douban/movie/weekly',
        language: 'zh-CN',
        icon: 'douban',
      },
      {
        id: 'doubanMusicReviews',
        title: '豆瓣最受欢迎的乐评',
        url: 'https://www.douban.com/feed/review/music',
        language: 'zh-CN',
        icon: 'douban',
      },
    ],
  },
]
