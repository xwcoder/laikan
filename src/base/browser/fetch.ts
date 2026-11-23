export default function fetch(path: string, data?: any, revision?: number) {
  return window.yikan.fetch(path, data, revision)
}
