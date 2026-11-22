import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const alias = { '@': resolve(root, 'src') }

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      outDir: 'dist/main',
      rolldownOptions: {
        input: {
          index: resolve(root, 'src/main/main.ts'),
          'database-worker': resolve(root, 'src/base/node/sqlite-worker.ts'),
        },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      outDir: 'dist/preload',
      externalizeDeps: false,
      rolldownOptions: {
        input: {
          index: resolve(root, 'src/preload/index.ts'),
          'article-extractor': resolve(root, 'src/preload/article-extractor.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(root, 'src/ui'),
    base: './',
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(root, 'dist/renderer'),
      minify: true,
      rolldownOptions: {
        input: resolve(root, 'src/ui/index.html'),
      },
    },
  },
})
