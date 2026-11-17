import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))
const alias = { '@': resolve(root, 'src') }

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      outDir: 'dist/main',
      rolldownOptions: {
        input: { index: resolve(root, 'src/main/main.ts') },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      outDir: 'dist/preload',
      externalizeDeps: false,
      rolldownOptions: {
        input: { index: resolve(root, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(root, 'src/ui'),
    base: './',
    resolve: { alias },
    plugins: [react()],
    build: {
      outDir: resolve(root, 'dist/renderer'),
      minify: true,
      rolldownOptions: {
        input: resolve(root, 'src/ui/index.html'),
      },
    },
  },
})
