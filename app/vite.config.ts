import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// the packaged page has no dev server: its CSP drops the hot-reload socket (phase 76)
const prodCsp = {
  name: 'stm-prod-csp',
  apply: 'build' as const,
  transformIndexHtml: (html: string) => html.replace(/ ws:\/\/localhost:5173/g, '').replace(/ ws:\/\/localhost:8799/g, ''),
}

export default defineConfig({
  plugins: [react(), prodCsp],
  base: './',
  server: { port: 5173, strictPort: true, fs: { allow: ['..'] } },
  test: { include: ['build/**/*.test.ts', 'scripts/**/*.test.ts', 'electron/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'shared/**/*.test.ts', 'engines/revideo/src/**/*.test.ts'] },
})
