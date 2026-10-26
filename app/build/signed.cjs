// Developer ID build (phase 77): the package.json build block, signed with the Developer ID found in
// the keychain (in CI, a keychain the release-mac workflow builds from the secrets) and notarized with an App Store Connect API key.
// No credential lives in the repo: notarization reads APPLE_API_KEY (path to the .p8), APPLE_API_KEY_ID
// and APPLE_API_ISSUER from the environment.
const base = require('../package.json').build
// the everyday build signs ad hoc (identity "-"); that key is dropped here so the Developer ID is used
const { identity: _adHoc, ...baseMac } = base.mac

module.exports = {
  ...base,
  mac: {
    ...baseMac,
    // no identity here: electron-builder finds the "Developer ID Application" identity in the keychain
    // (in CI, the one release-mac imports). identity: null would skip signing altogether in electron-builder 26.
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: true,
    entitlements: 'build/entitlements.signed.plist',
    entitlementsInherit: 'build/entitlements.signed.plist',
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }, { target: 'zip', arch: ['arm64', 'x64'] }],
  },
  // fixed names, so the site can link releases/latest/download/SuperTokenMan-arm64.dmg (and -x64)
  dmg: { sign: false, artifactName: 'SuperTokenMan-${arch}.${ext}' },
  // the update feed: app-update.yml in the bundle points electron-updater at the public releases repo
  publish: { provider: 'github', owner: 'supertokenman', repo: 'supertokenman', releaseType: 'release' },
}
