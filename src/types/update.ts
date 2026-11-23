export type UpdateState =
  | { status: 'idle' }
  | { status: 'available' | 'failed'; version: string }
  | { status: 'updating'; version: string; progress?: number }
