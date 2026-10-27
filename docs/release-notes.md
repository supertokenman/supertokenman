No integration is on until you turn it on.

- Up to 0.1.6, a new profile started with two integrations on, Context7 and Cloudflare docs, so
  Claude Code reached mcp.context7.com and docs.mcp.cloudflare.com without being asked. The Security
  page said integrations reach the network only once turned on. Now none is on by default. If you
  never chose them, turn them off in Connections; a profile that already has them keeps its choice.
- Found by the Mac proof that CI now runs on every release. Its report for this release is attached
  here once it passes.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
