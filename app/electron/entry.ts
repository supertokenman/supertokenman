// The app's entry. With --stm-cli it runs the stm command line script inside this same binary (no
// window), so the packaged app can turn off the RunAsNode fuse; otherwise it starts the app.
import { pathToFileURL } from 'node:url'

// STM_PERF=1: how long Electron took before any of the app's code ran
if (process.env.STM_PERF) console.log(`[perf] entry started ${process.uptime().toFixed(3)}s`)

const i = process.argv.indexOf('--stm-cli')
if (i >= 0) {
  const script = process.argv[i + 1] ?? ''
  process.argv = [process.argv[0]!, script, ...process.argv.slice(i + 2)]
  const { app } = await import('electron')
  app.dock?.hide()
  await import(pathToFileURL(script).href)
  // a command that finished (stm mcp never does): leave with its code
  app.exit(typeof process.exitCode === 'number' ? process.exitCode : 0)
} else await import('./main.js')
