export default function fetch(path: string, data?: any, revision?: number) {
  return window.laikan.fetch(path, data, revision)
}
