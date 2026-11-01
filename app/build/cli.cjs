// The package.json build block. By default the app does not carry the Claude Code binary: it downloads the
// pinned build on first need (electron/claudecli.ts). STM_BUNDLE_CLI=1 puts the binary for the target's
// own os and cpu back in app.asar.unpacked, where the app looks first, so a release can go back to the
// old layout without a code change: STM_BUNDLE_CLI=1 npx electron-builder --config build/cli.cjs ...
// (signed.cjs builds on this file, so STM_BUNDLE_CLI=1 npm run dist:mac:signed works too).
const { withCli } = require('./cli-files.cjs')

module.exports = withCli(require('../package.json').build)
