// electron-builder afterPack: flip the Electron fuses (phase 76) before the app is signed.
// Kept in step with FUSES in electron/hardening.ts; a test reads them back from the packed app.
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const { join } = require('node:path')

exports.default = async function afterPack(ctx) {
  const name = ctx.packager.appInfo.productFilename
  const exe =
    ctx.electronPlatformName === 'darwin' ? join(ctx.appOutDir, `${name}.app`)
      : ctx.electronPlatformName === 'win32' ? join(ctx.appOutDir, `${name}.exe`)
        : join(ctx.appOutDir, ctx.packager.executableName)
  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: ctx.electronPlatformName === 'darwin' && ctx.arch === 3,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  })
}
