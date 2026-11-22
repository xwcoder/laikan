declare module 'html-encoding-sniffer' {
  export default function sniffEncoding(bytes: Uint8Array, options?: {
    xml?: boolean
    transportLayerEncodingLabel?: string
  }): string
}
