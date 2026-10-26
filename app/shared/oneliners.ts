// Phase 113: one-liners for the command bar, written for this app. Each says what you want in plain
// words, the command, and where it runs. Inspired by The Art of Command Line and The Book of Secret
// Knowledge (linked, not copied). Nothing here is run by itself: a pick goes into the bar.

export type Os = 'any' | 'mac' | 'linux'
export type Recipe = { ask: string; cmd: string; os: Os; tags: string }
export const SOURCES = [
  { name: 'The Art of Command Line', url: 'https://github.com/jlevy/the-art-of-command-line' },
  { name: 'The Book of Secret Knowledge', url: 'https://github.com/trimstray/the-book-of-secret-knowledge' },
]

const R = (ask: string, cmd: string, os: Os = 'any', tags = ''): Recipe => ({ ask, cmd, os, tags })

export const RECIPES: Recipe[] = [
  // ports and processes
  R('see what is using port 3000', 'lsof -nP -iTCP:3000 -sTCP:LISTEN', 'any', 'port listen free'),
  R('free port 3000 (stop what holds it)', 'lsof -ti tcp:3000 | xargs kill', 'any', 'port kill'),
  R('list every listening port', 'lsof -nP -iTCP -sTCP:LISTEN', 'any', 'ports'),
  R('list listening ports with their programs', 'ss -ltnp', 'linux', 'ports'),
  R('find a process by name', 'pgrep -fl node', 'any', 'process'),
  R('top processes by memory', 'ps aux --sort=-%mem | head -15', 'linux', 'memory ram'),
  R('top processes by memory', 'ps aux -m | head -15', 'mac', 'memory ram'),
  R('top processes by CPU', 'ps aux --sort=-%cpu | head -15', 'linux', 'cpu'),
  R('top processes by CPU', 'ps aux -r | head -15', 'mac', 'cpu'),
  R('process tree', 'pstree -p | less', 'linux', 'tree'),
  R('how long a command takes', 'time npm test', 'any', 'timing benchmark'),
  R('run a command again every 2 seconds', 'watch -n 2 "ls -la"', 'linux', 'repeat'),
  R('keep a command running after logout', 'nohup ./job.sh > job.log 2>&1 &', 'any', 'background'),
  R('what a program is doing (system calls)', 'strace -f -p <pid>', 'linux', 'debug'),
  R('open files of a process', 'lsof -p <pid>', 'any', 'files fd'),
  // disk
  R('see who uses the disk in this folder', 'du -sh * .[^.]* 2>/dev/null | sort -h | tail -20', 'any', 'space size'),
  R('free space on each disk', 'df -h', 'any', 'space'),
  R('biggest files under this folder', 'find . -type f -size +100M -exec ls -lh {} + 2>/dev/null | sort -k5 -h | tail', 'any', 'large'),
  R('size of node_modules folders here', 'find . -name node_modules -type d -prune -exec du -sh {} +', 'any', 'node space'),
  R('interactive disk usage browser', 'ncdu', 'any', 'space'),
  R('files changed in the last day', 'find . -type f -mtime -1 -not -path "*/.git/*"', 'any', 'recent modified'),
  R('empty folders here', 'find . -type d -empty', 'any', 'clean'),
  // search
  R('search text in the project', 'rg -n "TODO" --hidden -g "!.git"', 'any', 'grep find'),
  R('search text, file names only', 'rg -l "useEffect"', 'any', 'grep'),
  R('find files by name', 'fd -H "config"', 'any', 'find'),
  R('find files by name without fd', 'find . -iname "*config*" -not -path "*/node_modules/*"', 'any', 'find'),
  R('replace text in many files (preview first)', 'rg -l "oldName" | xargs sed -n "s/oldName/newName/gp"', 'any', 'rename refactor'),
  R('count lines of code by type', 'git ls-files | grep -E "\\.(ts|tsx|js|py)$" | xargs wc -l | tail -1', 'any', 'loc'),
  R('the 20 most common words in a file', 'tr -cs "[:alnum:]" "\\n" < file.txt | sort | uniq -c | sort -rn | head -20', 'any', 'text'),
  // text
  R('show a file with line numbers', 'nl -ba file.txt | less', 'any', 'view'),
  R('lines in a not in b', 'comm -23 <(sort a.txt) <(sort b.txt)', 'any', 'diff sets'),
  R('unique lines, counted', 'sort file.txt | uniq -c | sort -rn', 'any', 'count'),
  R('columns of a CSV, pretty', 'column -s, -t < data.csv | less -S', 'any', 'csv table'),
  R('the second column of a file', 'awk "{print $2}" file.txt', 'any', 'columns'),
  R('sum a column of numbers', 'awk "{s+=$1} END {print s}" numbers.txt', 'any', 'math'),
  R('remove blank lines', 'sed "/^\\s*$/d" file.txt', 'any', 'clean'),
  R('convert Windows line endings', 'sed -i.bak "s/\\r$//" file.txt', 'any', 'crlf'),
  R('diff two folders', 'diff -rq dirA dirB', 'any', 'compare'),
  R('side by side diff', 'diff -y --width=160 a.txt b.txt | less', 'any', 'compare'),
  R('watch a log as it grows', 'tail -F app.log', 'any', 'logs follow'),
  R('watch a log and only errors', 'tail -F app.log | grep --line-buffered -i error', 'any', 'logs'),
  // json
  R('pretty print JSON', 'jq . data.json', 'any', 'json'),
  R('keys of a JSON object', 'jq "keys" data.json', 'any', 'json'),
  R('one field from a list of JSON objects', 'jq -r ".[].name" data.json', 'any', 'json'),
  R('JSON lines to CSV', 'jq -r "[.id, .name] | @csv" data.jsonl', 'any', 'json csv'),
  R('validate a JSON file', 'jq empty data.json && echo valid', 'any', 'json'),
  R('YAML to JSON', 'yq -o=json file.yaml', 'any', 'yaml'),
  // git
  R('what changed since the last commit', 'git diff --stat', 'any', 'status'),
  R('undo the last commit, keep the changes', 'git reset --soft HEAD~1', 'any', 'undo'),
  R('show the log as a graph', 'git log --oneline --graph --decorate -20', 'any', 'history'),
  R('who changed this line', 'git blame -L 40,60 src/file.ts', 'any', 'blame'),
  R('find the commit that added a text', 'git log -S "functionName" --oneline', 'any', 'pickaxe search'),
  R('branches sorted by last commit', 'git branch --sort=-committerdate --format="%(committerdate:relative) %(refname:short)"', 'any', 'branches'),
  R('local branches already merged', 'git branch --merged main', 'any', 'cleanup'),
  R('files changed in a branch', 'git diff --name-only main...HEAD', 'any', 'diff'),
  R('stash only some files', 'git stash push -m "wip" -- src/a.ts src/b.ts', 'any', 'stash'),
  R('bring one file from another branch', 'git restore --source=main -- path/to/file', 'any', 'checkout'),
  R('find which commit broke something', 'git bisect start && git bisect bad && git bisect good <commit>', 'any', 'bisect'),
  R('largest files in git history', 'git rev-list --objects --all | git cat-file --batch-check="%(objecttype) %(objectname) %(objectsize) %(rest)" | sort -k3 -n | tail -10', 'any', 'size'),
  R('commits per author', 'git shortlog -sn --all', 'any', 'stats'),
  R('see a file as it was', 'git show main~5:src/file.ts', 'any', 'history'),
  R('change the last commit message', 'git commit --amend', 'any', 'message'),
  R('work on two branches at once', 'git worktree add ../app-hotfix hotfix', 'any', 'worktree'),
  R('ignore a file already tracked', 'git rm --cached path/to/file', 'any', 'gitignore'),
  R('why a file is ignored', 'git check-ignore -v path/to/file', 'any', 'gitignore'),
  // network
  R('my public IP', 'curl -s https://ifconfig.me', 'any', 'ip'),
  R('my local IP', 'ipconfig getifaddr en0', 'mac', 'ip'),
  R('my local IP', 'hostname -I', 'linux', 'ip'),
  R('response headers of a URL', 'curl -sI https://example.com', 'any', 'http'),
  R('time of each phase of a request', 'curl -s -o /dev/null -w "dns %{time_namelookup} connect %{time_connect} tls %{time_appconnect} total %{time_total}\\n" https://example.com', 'any', 'latency http'),
  R('follow redirects and show them', 'curl -sIL https://example.com | grep -i "^location"', 'any', 'http'),
  R('send JSON to an API', 'curl -s -X POST -H "Content-Type: application/json" -d \'{"a":1}\' http://localhost:3000/api', 'any', 'post'),
  R('DNS records of a domain', 'dig +short example.com A', 'any', 'dns'),
  R('all DNS answers with TTL', 'dig example.com ANY +noall +answer', 'any', 'dns'),
  R('certificate of a site and its dates', 'echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -dates -subject', 'any', 'tls ssl'),
  R('is a port open on a host', 'nc -zv example.com 443', 'any', 'port check'),
  R('path to a host', 'traceroute example.com', 'any', 'route'),
  R('serve this folder over http', 'python3 -m http.server 8000', 'any', 'static server'),
  R('download a file with resume', 'curl -LO -C - https://example.com/file.zip', 'any', 'download'),
  R('test a websocket', 'npx wscat -c ws://localhost:3000', 'any', 'ws'),
  // ssh
  R('make an SSH key', 'ssh-keygen -t ed25519 -C "me@example.com"', 'any', 'key'),
  R('copy my key to a server', 'ssh-copy-id user@host', 'any', 'key'),
  R('reach a remote port on this machine', 'ssh -N -L 5433:localhost:5432 user@host', 'any', 'tunnel forward'),
  R('copy a folder to a server', 'rsync -avz --progress ./dist/ user@host:/srv/app/', 'any', 'deploy copy'),
  R('run one command on a server', 'ssh user@host "uptime && df -h /"', 'any', 'remote'),
  // docker
  R('running containers with ports', 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', 'any', 'containers'),
  R('logs of a container, live', 'docker logs -f --tail 100 <name>', 'any', 'logs'),
  R('shell inside a container', 'docker exec -it <name> sh', 'any', 'exec'),
  R('space Docker uses', 'docker system df', 'any', 'disk'),
  R('remove stopped containers', 'docker container prune', 'any', 'clean'),
  R('images by size', 'docker images --format "{{.Size}}\\t{{.Repository}}:{{.Tag}}" | sort -h', 'any', 'images'),
  R('use of each container', 'docker stats --no-stream', 'any', 'cpu memory'),
  R('environment of a container', 'docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" <name>', 'any', 'env'),
  R('compose up in the background', 'docker compose up -d', 'any', 'compose'),
  R('compose logs of one service', 'docker compose logs -f api', 'any', 'compose logs'),
  // node and js
  R('why a package is installed', 'npm explain left-pad', 'any', 'deps'),
  R('outdated packages', 'npm outdated', 'any', 'deps update'),
  R('packages with known vulnerabilities', 'npm audit --omit=dev', 'any', 'security'),
  R('size of each dependency', 'npx -y cost-of-modules', 'any', 'size'),
  R('scripts this project has', 'npm run', 'any', 'scripts'),
  R('find unused dependencies', 'npx -y depcheck', 'any', 'deps'),
  R('clear the npm cache', 'npm cache verify', 'any', 'cache'),
  R('which node and where', 'node -v && which node', 'any', 'version'),
  R('run TypeScript once', 'npx tsx script.ts', 'any', 'ts'),
  R('check types only', 'npx tsc --noEmit', 'any', 'typescript'),
  // python
  R('make a virtual environment', 'python3 -m venv .venv && source .venv/bin/activate', 'any', 'venv'),
  R('installed packages with versions', 'pip list --format=freeze', 'any', 'deps'),
  R('pretty JSON with python', 'python3 -m json.tool data.json', 'any', 'json'),
  R('profile a python script', 'python3 -m cProfile -s cumtime script.py | head -30', 'any', 'performance'),
  // archives
  R('pack a folder', 'tar -czf backup.tgz folder/', 'any', 'tar zip'),
  R('unpack a tarball', 'tar -xzf backup.tgz', 'any', 'tar'),
  R('list a tarball without unpacking', 'tar -tzf backup.tgz | less', 'any', 'tar'),
  R('zip a folder without junk', 'zip -r out.zip folder -x "*.DS_Store" "*/node_modules/*"', 'any', 'zip'),
  // files and permissions
  R('make a script runnable', 'chmod +x script.sh', 'any', 'permissions'),
  R('permissions in numbers', 'stat -c "%a %n" *', 'linux', 'permissions'),
  R('permissions in numbers', 'stat -f "%Lp %N" *', 'mac', 'permissions'),
  R('rename many files', 'for f in *.jpeg; do mv -- "$f" "${f%.jpeg}.jpg"; done', 'any', 'batch'),
  R('make a folder tree at once', 'mkdir -p src/{api,lib,ui}', 'any', 'create'),
  R('sha256 of a file', 'shasum -a 256 file.zip', 'any', 'checksum hash'),
  R('copy with progress', 'rsync -ah --progress src/ dest/', 'any', 'copy'),
  R('show folders as a tree', 'tree -L 2 -I node_modules', 'any', 'tree'),
  // system
  R('how long the machine has been up', 'uptime', 'any', 'load'),
  R('memory free', 'free -h', 'linux', 'ram'),
  R('memory free', 'vm_stat', 'mac', 'ram'),
  R('CPU cores', 'nproc', 'linux', 'cpu'),
  R('CPU cores', 'sysctl -n hw.ncpu', 'mac', 'cpu'),
  R('OS version', 'sw_vers', 'mac', 'version'),
  R('OS version', 'cat /etc/os-release', 'linux', 'version'),
  R('errors from the system log today', 'journalctl -p err --since today', 'linux', 'logs'),
  R('recent system log lines', 'log show --last 10m --predicate "messageType == error"', 'mac', 'logs'),
  R('services that failed', 'systemctl --failed', 'linux', 'systemd'),
  R('environment variables, sorted', 'env | sort', 'any', 'env'),
  R('where a command lives', 'command -v git', 'any', 'path'),
  R('the PATH, one per line', 'echo "$PATH" | tr ":" "\\n"', 'any', 'path'),
  // macOS
  R('copy a file to the clipboard', 'pbcopy < file.txt', 'mac', 'clipboard'),
  R('paste the clipboard into a file', 'pbpaste > file.txt', 'mac', 'clipboard'),
  R('keep the Mac awake while a job runs', 'caffeinate -i npm run build', 'mac', 'sleep'),
  R('open this folder in Finder', 'open .', 'mac', 'finder'),
  R('flush the DNS cache', 'sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder', 'mac', 'dns'),
  R('show hidden files in Finder', 'defaults write com.apple.finder AppleShowAllFiles -bool true && killall Finder', 'mac', 'finder'),
  R('battery health', 'system_profiler SPPowerDataType | grep -E "Cycle Count|Condition"', 'mac', 'battery'),
  R('say it out loud when done', 'npm test; say done', 'mac', 'notify'),
  // linux
  R('copy a file to the clipboard', 'xclip -selection clipboard < file.txt', 'linux', 'clipboard'),
  R('follow a service log', 'journalctl -u nginx -f', 'linux', 'logs'),
  R('who is logged in', 'who', 'any', 'users'),
  // time
  R('date in ISO format', 'date -u +"%Y-%m-%dT%H:%M:%SZ"', 'any', 'iso utc'),
  R('a Unix time as a date', 'date -d @1700000000', 'linux', 'epoch'),
  R('a Unix time as a date', 'date -r 1700000000', 'mac', 'epoch'),
  R('the current Unix time', 'date +%s', 'any', 'epoch'),
  // databases
  R('connect to Postgres', 'psql "postgresql://user@localhost:5432/db"', 'any', 'postgres'),
  R('size of each Postgres table', 'psql -c "select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 10"', 'any', 'postgres size'),
  R('dump a Postgres database', 'pg_dump -Fc db > db.dump', 'any', 'backup'),
  R('open a SQLite file', 'sqlite3 data.db ".tables"', 'any', 'sqlite'),
  R('ping Redis', 'redis-cli ping', 'any', 'redis'),
  // security, read only
  R('secrets committed by mistake', 'git log -p | grep -nE "(api[_-]?key|secret|token)\\s*[:=]" | head', 'any', 'leak scan'),
  R('random password', 'openssl rand -base64 24', 'any', 'password generate'),
  R('random hex token', 'openssl rand -hex 32', 'any', 'token generate'),
  R('decode a JWT payload', 'cut -d. -f2 <<< "$TOKEN" | base64 -d 2>/dev/null | jq .', 'any', 'jwt'),
  R('base64 of a file', 'base64 -i file.png', 'mac', 'encode'),
  R('base64 of a file', 'base64 -w0 file.png', 'linux', 'encode'),
]

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)
/** Recipes for what was typed, best first; only ones for this system, and only when words were typed. */
export function findRecipes(q: string, os: 'mac' | 'linux', n = 6): Recipe[] {
  const qs = words(q)
  if (qs.length < 2 && !(qs[0] && qs[0].length > 3)) return []
  const scored = RECIPES.filter((r) => r.os === 'any' || r.os === os).map((r) => {
    const hay = words(`${r.ask} ${r.tags} ${r.cmd}`)
    const ask = words(r.ask)
    let s = 0
    for (const w of qs) {
      if (ask.includes(w)) s += 3
      else if (hay.some((h) => h.startsWith(w))) s += 1
    }
    return { r, s: s / qs.length }
  })
  return scored.filter((x) => x.s >= 1.2).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.r)
}
