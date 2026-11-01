// build.files with or without the Claude Code binary; see build/cli.cjs.

const DROP = '!node_modules/@anthropic-ai/claude-agent-sdk-*/**'
// the host's npm platform name (darwin, linux, win32); electron-builder fills ${arch} per target
const KEEP = `node_modules/@anthropic-ai/claude-agent-sdk-${process.platform}-\${arch}/**`

function withCli(build, on = process.env.STM_BUNDLE_CLI === '1') {
  if (!build.files.includes(DROP)) throw new Error(`package.json build.files no longer has ${DROP}`)
  return on ? { ...build, files: build.files.map((f) => (f === DROP ? KEEP : f)) } : build
}

module.exports = { withCli }
