import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { renameSync } from 'node:fs'

// the packaged page has no dev server: its CSP drops the hot-reload socket (phase 76)
const prodCsp = {
  name: 'stm-prod-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace(/ ws:\/\/localhost:5173/g, '').replace(/ ws:\/\/localhost:8799/g, ''),
}

// `vite build --mode demo`: the browser demo for the site (demo.html, src/demo/), written to
// ../site/demo as index.html, without public/ (the tour films stay in the app). The app build never
// sees that entry.
const demoIndex = {
  name: 'stm-demo-index',
  closeBundle: () => renameSync('../site/demo/demo.html', '../site/demo/index.html'),
}

export default defineConfig(({ mode }) => ({
  plugins: mode === 'demo' ? [react(), demoIndex] : [react(), prodCsp],
  base: './',
  server: { port: 5173, strictPort: true, fs: { allow: ['..'] } },
  ...(mode === 'demo' ? { publicDir: false, build: { outDir: '../site/demo', emptyOutDir: true, rollupOptions: { input: 'demo.html' } } } : {}),
  test: { include: ['build/**/*.test.ts', 'scripts/**/*.test.ts', 'electron/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'shared/**/*.test.ts', 'engines/revideo/src/**/*.test.ts'] },
}))
