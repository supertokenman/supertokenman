// Sign-in windows: macOS gives passkeys (Touch ID, iCloud Keychain) only to browsers Apple has
// approved, so in an app window the request waits forever. This answers it at once with "not
// allowed", which most sign-in pages treat as "try another way", and tells the app, which offers to
// finish the sign-in in the person's own browser. Runs before the page's scripts.
const { contextBridge } = require('electron')
contextBridge.executeInMainWorld({
  func: (mark) => {
    // say up front that this device has no passkey, so most sites offer a password or a code instead
    const P = window.PublicKeyCredential
    if (P) {
      P.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(false)
      P.isConditionalMediationAvailable = () => Promise.resolve(false)
    }
    const c = navigator.credentials
    if (!c) return
    const wrap = (fn) =>
      function (options) {
        if (options && options.publicKey) {
          console.info(mark)
          return Promise.reject(new DOMException('Passkeys do not work in this window.', 'NotAllowedError'))
        }
        return fn.call(c, options)
      }
    c.get = wrap(c.get)
    c.create = wrap(c.create)
  },
  args: ['stm:passkey'],
})
