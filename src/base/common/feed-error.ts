export type FeedErrorKind = 'http' | 'timeout' | 'network' | 'encoding' | 'xml' | 'format' | 'limit'

export class FeedError extends Error {
  constructor(
    readonly kind: FeedErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'FeedError'
  }
}
