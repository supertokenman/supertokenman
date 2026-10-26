// Where a sign-in window asked for a passkey, which cannot work in it (see passkey-preload.cjs).
import type { WebContents } from 'electron'

export const PASSKEY_MARK = 'stm:passkey'

/** Calls back once per page load that asked for a passkey, in this window or the popups it opens. */
export function watchPasskeys(wc: WebContents, asked: () => void) {
  let told = false
  wc.on('did-start-navigation', (_e, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) told = false
  })
  wc.on('console-message', (e) => {
    const message = (e as unknown as { message?: string }).message
    if (message === PASSKEY_MARK && !told) {
      told = true
      asked()
    }
  })
  wc.on('did-create-window', (child) => watchPasskeys(child.webContents, asked))
}
