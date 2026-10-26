// A self-hosting catalog: single-container apps worth running on your own server, described in our words
// and linked to their projects (the lists that inspired it have no license file, so they are only linked).
// Deploying writes a docker compose file you read first, then runs it on a host from ~/.ssh/config, on a
// click and a confirm. Licenses below are what each project states; check them before relying on one.

export type SelfApp = { id: string; name: string; category: string; what: string; url: string; license: string; image: string; port: number; data?: string; env?: Record<string, string> }

export const CATALOG: SelfApp[] = [
  { id: 'uptime-kuma', name: 'Uptime Kuma', category: 'Monitoring', what: 'Checks your sites and APIs and alerts when they go down.', url: 'https://github.com/louislam/uptime-kuma', license: 'MIT', image: 'louislam/uptime-kuma:1', port: 3001, data: '/app/data' },
  { id: 'dozzle', name: 'Dozzle', category: 'Monitoring', what: 'Live logs of the Docker containers on the host, in the browser.', url: 'https://github.com/amir20/dozzle', license: 'MIT', image: 'amir20/dozzle:latest', port: 8080 },
  { id: 'prometheus', name: 'Prometheus', category: 'Monitoring', what: 'Metrics collection and queries; the Metrics screen reads it.', url: 'https://github.com/prometheus/prometheus', license: 'Apache-2.0', image: 'prom/prometheus:latest', port: 9090, data: '/prometheus' },
  { id: 'gitea', name: 'Gitea', category: 'Code', what: 'A light Git server with issues, pull requests and CI runners.', url: 'https://github.com/go-gitea/gitea', license: 'MIT', image: 'gitea/gitea:1', port: 3000, data: '/data' },
  { id: 'code-server', name: 'code-server', category: 'Code', what: 'VS Code in the browser, on your server.', url: 'https://github.com/coder/code-server', license: 'MIT', image: 'codercom/code-server:latest', port: 8080, data: '/home/coder', env: { PASSWORD: '{{CODE_SERVER_PASSWORD}}' } },
  { id: 'adminer', name: 'Adminer', category: 'Data', what: 'A database admin page in one file: Postgres, MySQL, SQLite and more.', url: 'https://github.com/vrana/adminer', license: 'Apache-2.0 or GPL-2.0', image: 'adminer:latest', port: 8080 },
  { id: 'ollama', name: 'Ollama', category: 'AI', what: 'Local models over an HTTP API; point the app\'s local model at it.', url: 'https://github.com/ollama/ollama', license: 'MIT', image: 'ollama/ollama:latest', port: 11434, data: '/root/.ollama' },
  { id: 'excalidraw', name: 'Excalidraw', category: 'Docs', what: 'A whiteboard for hand-drawn diagrams.', url: 'https://github.com/excalidraw/excalidraw', license: 'MIT', image: 'excalidraw/excalidraw:latest', port: 80 },
  { id: 'memos', name: 'Memos', category: 'Docs', what: 'Quick notes and a timeline, markdown first.', url: 'https://github.com/usememos/memos', license: 'MIT', image: 'neosmemo/memos:stable', port: 5230, data: '/var/opt/memos' },
  { id: 'linkding', name: 'linkding', category: 'Docs', what: 'A bookmark manager with tags and full-text search.', url: 'https://github.com/sissbruecker/linkding', license: 'MIT', image: 'sissbruecker/linkding:latest', port: 9090, data: '/etc/linkding/data' },
  { id: 'stirling-pdf', name: 'Stirling PDF', category: 'Tools', what: 'Merge, split, convert and sign PDFs locally.', url: 'https://github.com/Stirling-Tools/Stirling-PDF', license: 'MIT (core)', image: 'stirlingtools/stirling-pdf:latest', port: 8080 },
  { id: 'it-tools', name: 'IT Tools', category: 'Tools', what: 'Dozens of small developer tools: encoders, hashes, converters.', url: 'https://github.com/CorentinTh/it-tools', license: 'GPL-3.0', image: 'corentinth/it-tools:latest', port: 80 },
  { id: 'ntfy', name: 'ntfy', category: 'Tools', what: 'Push notifications to your phone from a curl.', url: 'https://github.com/binwiederhier/ntfy', license: 'Apache-2.0 or GPL-2.0', image: 'binwiederhier/ntfy:latest', port: 80, data: '/var/cache/ntfy' },
  { id: 'glance', name: 'Glance', category: 'Dashboards', what: 'A dashboard of feeds, repos and server status.', url: 'https://github.com/glanceapp/glance', license: 'AGPL-3.0', image: 'glanceapp/glance:latest', port: 8080, data: '/app/config' },
  { id: 'homepage', name: 'Homepage', category: 'Dashboards', what: 'A start page for your services with live widgets.', url: 'https://github.com/gethomepage/homepage', license: 'GPL-3.0', image: 'ghcr.io/gethomepage/homepage:latest', port: 3000, data: '/app/config' },
  { id: 'vaultwarden', name: 'Vaultwarden', category: 'Security', what: 'A light Bitwarden-compatible password server.', url: 'https://github.com/dani-garcia/vaultwarden', license: 'AGPL-3.0', image: 'vaultwarden/server:latest', port: 80, data: '/data' },
  { id: 'minio', name: 'MinIO', category: 'Storage', what: 'S3-compatible object storage on your disk.', url: 'https://github.com/minio/minio', license: 'AGPL-3.0', image: 'minio/minio:latest', port: 9000, data: '/data', env: { MINIO_ROOT_USER: 'admin', MINIO_ROOT_PASSWORD: '{{MINIO_ROOT_PASSWORD}}' } },
  { id: 'grafana', name: 'Grafana', category: 'Monitoring', what: 'Dashboards over Prometheus, Postgres, Loki and more.', url: 'https://github.com/grafana/grafana', license: 'AGPL-3.0', image: 'grafana/grafana-oss:latest', port: 3000, data: '/var/lib/grafana' },
]

/** Placeholders like {{NAME}} the compose file needs from the vault. */
export const needsOf = (a: SelfApp) => [...new Set(Object.values(a.env ?? {}).flatMap((v) => [...v.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!)))]

/** The compose file: one service, a named volume for its data, bound to localhost unless you open it. */
export function composeOf(a: SelfApp, o: { hostPort: number; publicBind: boolean; secrets?: Record<string, string> }): string {
  const env = Object.entries(a.env ?? {}).map(([k, v]) => `      ${k}: "${v.replace(/\{\{(\w+)\}\}/g, (_, n: string) => (o.secrets?.[n] ?? '${' + n + '}')).replace(/"/g, '\\"')}"`)
  return [
    `# ${a.name} (${a.url}), license as stated upstream: ${a.license}`,
    `# Written by SuperTokenMan. Bound to ${o.publicBind ? 'all interfaces' : '127.0.0.1 only: reach it through a tunnel or a reverse proxy'}.`,
    'services:',
    `  ${a.id}:`,
    `    image: ${a.image}`,
    '    restart: unless-stopped',
    '    labels:',
    '      stm: "1"',
    `      stm.kind: "selfhost"`,
    '    ports:',
    `      - "${o.publicBind ? '' : '127.0.0.1:'}${o.hostPort}:${a.port}"`,
    ...(env.length ? ['    environment:', ...env] : []),
    ...(a.data ? ['    volumes:', `      - ${a.id}-data:${a.data}`] : []),
    ...(a.data ? ['volumes:', `  ${a.id}-data: {}`] : []),
    '',
  ].join('\n')
}

/** The remote script: the compose file comes on stdin, then docker compose brings it up. */
export const deployScript = (id: string) => `set -e; mkdir -p "$HOME"/selfhost/${id} && cat > "$HOME"/selfhost/${id}/compose.yml && cd "$HOME"/selfhost/${id} && docker compose up -d && docker compose ps --format '{{.Name}} {{.State}}'`
