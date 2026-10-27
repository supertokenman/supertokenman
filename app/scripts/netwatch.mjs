// Starts the built app with every way it can reach the network wrapped, and writes one JSON line per
// attempt to STM_NETWATCH_LOG: fetch, http(s), Electron net, child processes, and the window's own
// requests. Used by `npm run netwatch` to check what the app does on its own with a clean profile.
import { appendFileSync } from 'node:fs'
import cp from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'

const out = process.env.STM_NETWATCH_LOG
const log = (kind, target) => {
  const line = JSON.stringify({ t: Date.now(), kind, target: String(target).slice(0, 300) })
  if (out) appendFileSync(out, line + '\n')
  else console.log('[netwatch]', line)
}

const realFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  log('fetch', typeof input === 'string' ? input : input?.url ?? input)
  return realFetch(input, init)
}
for (const [name, mod] of [['http', http], ['https', https]]) {
  for (const fn of ['request', 'get']) {
    const real = mod[fn]
    mod[fn] = (...args) => {
      const a = args[0]
      log(name, typeof a === 'string' || a instanceof URL ? a : `${a?.protocol ?? name + ':'}//${a?.hostname ?? a?.host}${a?.path ?? ''}`)
      return real.apply(mod, args)
    }
  }
}
for (const fn of ['spawn', 'execFile', 'exec', 'fork', 'spawnSync', 'execFileSync', 'execSync']) {
  const real = cp[fn]
  cp[fn] = (...args) => {
    log('process', [args[0], ...(Array.isArray(args[1]) ? args[1] : [])].join(' '))
    return real.apply(cp, args)
  }
}
syncBuiltinESMExports()

const { app, net, session } = await import('electron')
// with STM_NETWATCH_IPC=1, also which window calls ran, to trace what started a request
if (process.env.STM_NETWATCH_IPC) {
  const { ipcMain } = await import('electron')
  const realHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, fn) => realHandle(channel, (...args) => (log('ipc', channel), fn(...args)))
}
const realNet = net.fetch.bind(net)
net.fetch = (input, init) => {
  log('net', typeof input === 'string' ? input : input?.url)
  return realNet(input, init)
}
// every session, including webviews and partitions made later
const watch = (s) =>
  s.webRequest.onBeforeRequest((d, cb) => {
    if (!/^(file|devtools|chrome-extension|data|blob|stm|stmui|stmapp|stmmedia|app):/.test(d.url)) log('window', d.url)
    cb({})
  })
app.on('session-created', watch)
app.whenReady().then(() => watch(session.defaultSession))

await import('../dist-electron/electron/app.mjs')
