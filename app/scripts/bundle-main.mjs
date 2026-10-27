// The main process as one file: tsc writes about 250 modules to dist-electron, and loading them one by
// one through Node's ESM loader took a good part of start-up. esbuild joins them into
// dist-electron/electron/app.mjs, next to the files they came from, so paths built from import.meta.url
// (the window, the preloads) stay the same. Packages in node_modules stay outside, loaded as before.
import { build } from 'esbuild'

await build({
  entryPoints: ['dist-electron/electron/entry.js'],
  outfile: 'dist-electron/electron/app.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  external: ['electron'],
  logLevel: 'warning',
})
