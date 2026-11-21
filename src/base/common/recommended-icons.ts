import { feedUrlKey } from './feed-url'
import { recommendedGroups } from './recommended-feeds'

const icons = import.meta.glob<string>('../../ui/assets/feed-icons/*.png', {
  eager: true, query: '?inline', import: 'default',
})
const byUrl = new Map(recommendedGroups.flatMap((group) => (
  group.feeds.map((feed) => [feedUrlKey(feed.url), feed.icon] as const)
)))

export const recommendedIcon = (key: string): string | undefined => icons[`../../ui/assets/feed-icons/${key}.png`]

export function bundledFeedIcon(url: string) {
  const key = byUrl.get(feedUrlKey(url))
  return key && recommendedIcon(key)
}
