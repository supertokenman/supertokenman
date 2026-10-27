import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Crash } from './Crash'
import { handOver, playClosing } from './boot'
import { installTips } from './tips'
import './app.css'
import './motion.css'

createRoot(document.getElementById('root')!).render(
  <Crash>
    <App />
  </Crash>,
)
requestAnimationFrame(() => handOver())
installTips()
window.stm.onClosing?.(() => playClosing(() => window.stm.closeReady()))
// errors in the window go to the local log too (masked there); nothing leaves the machine
window.addEventListener('error', (e) => window.stm.diag.renderer(`${e.message}\n${e.error?.stack ?? ''}`))
window.addEventListener('unhandledrejection', (e) => window.stm.diag.renderer(`Unhandled: ${e.reason instanceof Error ? `${e.reason.message}\n${e.reason.stack}` : String(e.reason)}`))
