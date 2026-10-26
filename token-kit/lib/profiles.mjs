// @ts-check

/**
 * @typedef {object} Profile
 * @property {string} name
 * @property {RegExp} match  tested against the command with leading env assignments stripped
 * @property {RegExp[]} keep lines that are always kept (summary, specific errors)
 * @property {RegExp[]} drop noise dropped before anything else
 * @property {number} [tail]
 */

const PM = '(?:npm|pnpm|yarn|bun)';
const RUN = `${PM}(?:\\s+run)?`;

/** Commands that never finish on their own (servers, watch): never wrap. */
export const NEVER_WRAP = [
  new RegExp(`^${RUN}\\s+(?:dev|start|serve|watch|preview)\\b`),
  /--watch\b|\bwatch\b\s*$/,
  /^(?:npx\s+)?wrangler\s+(?:dev|tail)\b/,
  /^(?:npx\s+)?(?:vite|next\s+dev|nodemon|tsc\s+.*--watch)\b(?!\s+build)/,
  /^docker\s+compose\s+(?:up|logs)\b(?!.*\s-d\b)/,
];

const PROGRESS = [
  /^\s*[⠀-⣿⠁-⣿|/\\-]\s*$/, // spinner alone on a line
  /^\s*\[?[=#>\-. ]{10,}\]?\s*\d{1,3}(?:\.\d+)?\s*%/, // progress bars
  /^\s*\d{1,3}(?:\.\d+)?%\s*(?:\||$)/,
];

/** @type {Profile[]} */
export const BUILTIN = [
  {
    name: 'test',
    match: new RegExp(
      `^(?:${RUN}\\s+test(?::\\S+)?|${PM}\\s+t|npx\\s+(?:vitest|jest|mocha|playwright\\s+test)|vitest|jest|mocha|node\\s+--test|` +
        `(?:python3?\\s+-m\\s+)?pytest|go\\s+test|cargo\\s+test|deno\\s+test|playwright\\s+test)\\b`,
    ),
    keep: [
      /^\s*(?:Tests?|Test Files|Test Suites|Suites|Snapshots|Duration|Time)\s*:?/,
      /\b\d+\s+(?:passing|failing|pending|passed|failed|skipped|errors?)\b/i,
      /^\s*(?:FAIL|not ok|---\s*FAIL|FAILED|ERROR)\b/,
      /short test summary|^=+ .*(?:passed|failed|error)/i,
      /^\s*(?:Expected|Received|expected|actual)\b/,
      /^\s*\u276F\s+\S+:\d+:\d+/,
    ],
    drop: [/^\s*[\u2713\u2714\u221A]\s/, /^\s*PASS\s/, /^\s*ok\s+\d+\s/, /^\s*# (?:Subtest|tests|suites|pass|cancelled|todo|duration_ms)/],
    tail: 20,
  },
  {
    name: 'typecheck',
    match: new RegExp(`^(?:${RUN}\\s+(?:typecheck|type-check|tsc|lint|build|check)\\b|(?:npx\\s+)?(?:tsc|eslint|biome|ruff|mypy|pyright|cargo\\s+(?:build|check|clippy)|go\\s+(?:build|vet)|next\\s+build|vite\\s+build))`),
    keep: [/error\s+TS\d+/, /^\S+:\d+:\d+/, /\b\d+\s+(?:errors?|warnings?|problems?)\b/i, /^Found \d+ error/],
    drop: [],
    tail: 15,
  },
  {
    name: 'install',
    match: new RegExp(
      `^(?:${PM}\\s+(?:install|i|ci|add)\\b|${PM}\\s*$|pip3?\\s+install|python3?\\s+-m\\s+pip\\s+install|uv\\s+(?:pip\\s+install|sync)|poetry\\s+install|` +
        `bundle\\s+install|(?:sudo\\s+)?apt(?:-get)?\\s+install|brew\\s+install|(?:npx\\s+)?playwright\\s+install|cargo\\s+install|go\\s+mod\\s+download)`,
    ),
    keep: [/^(?:added|removed|changed|up to date|audited)\b/, /Successfully installed/, /vulnerabilit/i, /ERR!/],
    drop: [
      /^npm (?:WARN|warn) deprecated/,
      /^\s*(?:Collecting|Downloading|Using cached|Requirement already satisfied|Obtaining|Building wheel|Created wheel|Stored in)\b/,
      /^(?:Get|Hit|Ign):\d+\s/,
      /^(?:Reading|Building|Selecting|Preparing|Unpacking|Setting up|Processing)\b/,
      /^\s*\|\s*[█▉▊▋▌▍▎▏ ]+\|/,
    ],
    tail: 12,
  },
  {
    name: 'wrangler',
    match: /^(?:npx\s+)?wrangler\s+(?:deploy|publish|d1|r2|kv|secret|types|versions|deployments)\b/,
    keep: [/\u2718|\[ERROR\]|Uploaded|Published|Deployed|Current Version ID|https?:\/\/\S+workers\.dev/],
    drop: [/^\s*\u26C5\uFE0F? wrangler/, /^-{5,}$/, /^\s*Total Upload:/],
    tail: 15,
  },
  {
    name: 'docker',
    match: /^docker\s+(?:build|compose\s+build|pull|push)\b|^docker\s+buildx\s+build\b/,
    keep: [/^#\d+ ERROR|^ERROR|failed to/i, /naming to|writing image|Successfully (?:built|tagged)/],
    drop: [/^#\d+ (?:sha256|extracting|\[internal\]|DONE \d|CACHED)/, /^\s*[a-f0-9]{12}: (?:Pulling|Waiting|Downloading|Verifying|Download complete|Extracting|Pull complete)/],
    tail: 15,
  },
  {
    name: 'media',
    match: /^ffmpeg\b|^ffprobe\b/,
    keep: [/^\s*(?:Input|Output|Stream mapping)\b/, /\b(?:Error|Invalid|No such file)\b/],
    drop: [/^(?:frame|size)=\s*\d+/, /^\s*(?:built with|configuration:|lib\w+\s+\d)/],
    tail: 8,
  },
];

/** Used by the generic filter (PostToolUse) and as the base of every profile. */
export const GENERIC = /** @type {Profile} */ ({ name: 'generic', match: /$^/, keep: [], drop: [], tail: 25 });

/** Error lines count for every profile. Includes Portuguese words because some tools print them (ERRO, falha). */
export const IMPORTANT = /(?:\b(?:error|errors|erro|fail|failed|failure|falh\w*|exception|traceback|panic|fatal|assert(?:ion)?\w*|unhandled|segmentation fault|cannot find|not found|no such file|denied|refused)\b|\u2717|\u2716|\u274C|\bE\s{3})/i;
export const WARNING = /\b(?:warn|warning|deprecated|aviso)\b/i;
export const NOISE = PROGRESS;

/**
 * @param {import('./config.mjs').UserProfile} p
 * @returns {Profile}
 */
function compileUser(p) {
  return {
    name: p.name,
    match: new RegExp(p.match),
    keep: (p.keep || []).map((r) => new RegExp(r)),
    drop: (p.drop || []).map((r) => new RegExp(r)),
    tail: p.tail,
  };
}

/** Strips leading `FOO=1 BAR=x ` and harmless `time`/`npx -y` so the profile can match. */
export function normalizeForMatch(cmd) {
  let s = cmd.trim();
  s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)\s+)+/, '');
  s = s.replace(/^(?:time|command|nice)\s+/, '');
  s = s.replace(/^npx\s+(?:-y|--yes)\s+/, 'npx ');
  return s;
}

/**
 * Profile for a simple command (one segment). User profiles take precedence over built-in ones.
 * @param {string} segment
 * @param {import('./config.mjs').UserProfile[]} [userProfiles]
 * @returns {Profile | null}
 */
export function profileFor(segment, userProfiles = []) {
  const s = normalizeForMatch(segment);
  if (NEVER_WRAP.some((r) => r.test(s))) return null;
  for (const p of userProfiles.map(compileUser)) if (p.match.test(s)) return p;
  for (const p of BUILTIN) if (p.match.test(s)) return p;
  return null;
}

/**
 * @param {string} name
 * @param {import('./config.mjs').UserProfile[]} [userProfiles]
 * @returns {Profile}
 */
export function profileByName(name, userProfiles = []) {
  const user = userProfiles.find((p) => p.name === name);
  if (user) return compileUser(user);
  return BUILTIN.find((p) => p.name === name) || GENERIC;
}
