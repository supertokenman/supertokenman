// The window's only door to the main process. Every call names its panel's session.
const { contextBridge, ipcRenderer, webUtils } = require('electron')

// secrets ask for Touch ID first when that option is on; the main process enforces it as well
async function unlocked(reason) {
  const st = await ipcRenderer.invoke('lock:get')
  if (st.secretsOpen) return
  if (!(await ipcRenderer.invoke('lock:prompt', reason))) throw new Error('Not unlocked. Touch ID is needed to change your secrets.')
}

contextBridge.exposeInMainWorld('stm', {
  personas: {
    list: () => ipcRenderer.invoke('personas:list'),
    save: (p) => ipcRenderer.invoke('personas:save', p),
    remove: (id) => ipcRenderer.invoke('personas:delete', id),
    exportFile: (id, dir) => ipcRenderer.invoke('personas:export', id, dir),
    importFiles: (paths) => ipcRenderer.invoke('personas:import', paths),
    history: (id) => ipcRenderer.invoke('personas:history', id),
    restore: (id, at) => ipcRenderer.invoke('personas:restore', id, at),
  },
  triggers: {
    list: () => ipcRenderer.invoke('triggers:list'),
    save: (t) => ipcRenderer.invoke('triggers:save', t),
    remove: (id) => ipcRenderer.invoke('triggers:delete', id),
    run: (id) => ipcRenderer.invoke('triggers:run', id),
    webhook: (id) => ipcRenderer.invoke('triggers:webhook', id),
    runs: () => ipcRenderer.invoke('runs:list'),
    begin: (sid, t, resume) => ipcRenderer.invoke('runs:begin', sid, t, resume),
    gate: (run, ok) => ipcRenderer.invoke('runs:gate', run, ok),
    onFire: (cb) => {
      const l = (_e, t) => cb(t)
      ipcRenderer.on('trigger:fire', l)
      return () => ipcRenderer.removeListener('trigger:fire', l)
    },
  },
  storage: {
    get: () => ipcRenderer.invoke('storage:get'),
    set: (config, keys) => unlocked('change the media storage keys').then(() => ipcRenderer.invoke('storage:set', config, keys)),
    test: () => ipcRenderer.invoke('storage:test'),
    upload: (path) => ipcRenderer.invoke('storage:upload', path),
  },
  hotkey: {
    get: () => ipcRenderer.invoke('hotkey:get'),
    set: (accel) => ipcRenderer.invoke('hotkey:set', accel),
  },
  palette: {
    dismissed: () => ipcRenderer.invoke('palette:dismissed'),
    used: () => ipcRenderer.invoke('palette:used'),
    onSummon: (cb) => {
      const l = () => cb()
      ipcRenderer.on('palette:summon', l)
      return () => ipcRenderer.removeListener('palette:summon', l)
    },
  },
  savings: { get: (days) => ipcRenderer.invoke('savings:get', days) },
  overhead: {
    panels: () => ipcRenderer.invoke('overhead:panels'),
    get: (sid) => ipcRenderer.invoke('overhead:get', sid),
  },
  lean: {
    get: () => ipcRenderer.invoke('lean:get'),
    set: (on) => ipcRenderer.invoke('lean:set', on),
  },
  connectIntegration: (id) => ipcRenderer.invoke('integration:connect', id),
  cli: {
    status: (cli) => ipcRenderer.invoke('cli:status', cli),
    login: (cli) => ipcRenderer.invoke('cli:login', cli),
  },
  local: {
    status: () => ipcRenderer.invoke('local:status'),
    start: () => ipcRenderer.invoke('local:start'),
    test: () => ipcRenderer.invoke('local:test'),
    chat: (id, messages, kind) => ipcRenderer.invoke('local:chat', id, messages, kind),
    stop: (id) => ipcRenderer.invoke('local:stop', id),
    suggested: () => ipcRenderer.invoke('local:suggested'),
    pull: (name) => ipcRenderer.invoke('local:pull', name),
    onDelta: (fn) => {
      const l = (_e, id, d) => fn(id, d)
      ipcRenderer.on('local:delta', l)
      return () => ipcRenderer.removeListener('local:delta', l)
    },
    onPull: (fn) => {
      const l = (_e, v) => fn(v)
      ipcRenderer.on('local:pull', l)
      return () => ipcRenderer.removeListener('local:pull', l)
    },
  },
  clearBrowse: (sid) => ipcRenderer.invoke('browse:clear', sid),
  onBrowseNet: (fn) => {
    const l = (_e, v) => fn(v)
    ipcRenderer.on('browse:net', l)
    return () => ipcRenderer.removeListener('browse:net', l)
  },
  onPanelFocus: (fn) => {
    const l = (_e, sid) => fn(sid)
    ipcRenderer.on('panel:focus', l)
    return () => ipcRenderer.removeListener('panel:focus', l)
  },
  devices: {
    get: () => ipcRenderer.invoke('devices:get'),
    on: (fn) => {
      const l = (_e, v) => fn(v)
      ipcRenderer.on('devices', l)
      return () => ipcRenderer.removeListener('devices', l)
    },
  },
  db: {
    list: () => ipcRenderer.invoke('db:list'),
    save: (c) => ipcRenderer.invoke('db:save', c),
    delete: (id) => ipcRenderer.invoke('db:delete', id),
    tables: (id) => ipcRenderer.invoke('db:tables', id),
    query: (id, sql) => ipcRenderer.invoke('db:query', id, sql),
    schema: (id) => ipcRenderer.invoke('db:schema', id),
    explain: (id, sql) => ipcRenderer.invoke('db:explain', id, sql),
    history: (id) => ipcRenderer.invoke('db:history', id),
    exportRows: (id, sql, format, dir) => ipcRenderer.invoke('db:export', id, sql, format, dir),
    ask: (id, request) => ipcRenderer.invoke('db:ask', id, request),
    apply: (id, statements) => ipcRenderer.invoke('db:apply', id, statements),
  },
  api: {
    list: () => ipcRenderer.invoke('api:list'),
    save: (r) => ipcRenderer.invoke('api:save', r),
    delete: (id) => ipcRenderer.invoke('api:delete', id),
    send: (r) => ipcRenderer.invoke('api:send', r),
  },
  term: {
    open: (sid, cols, rows) => ipcRenderer.invoke('term:open', sid, cols, rows),
    write: (sid, data) => ipcRenderer.send('term:write', sid, data),
    resize: (sid, cols, rows) => ipcRenderer.send('term:resize', sid, cols, rows),
    close: (sid) => ipcRenderer.invoke('term:close', sid),
    targets: (scope) => ipcRenderer.invoke('term:targets', scope),
    connect: (sid, command) => ipcRenderer.invoke('term:connect', sid, command),
    history: (cwd, query) => ipcRenderer.invoke('term:history', cwd, query),
    remember: (cwd, cmd) => ipcRenderer.invoke('term:remember', cwd, cmd),
    suggest: (sid, request) => ipcRenderer.invoke('term:suggest', sid, request),
    type: (sid, cmd, run, confirmed) => ipcRenderer.invoke('term:type', sid, cmd, run, confirmed),
    onData: (fn) => {
      const l = (_e, sid, d) => fn(sid, d)
      ipcRenderer.on('term:data', l)
      return () => ipcRenderer.removeListener('term:data', l)
    },
    onExit: (fn) => {
      const l = (_e, sid, code) => fn(sid, code)
      ipcRenderer.on('term:exit', l)
      return () => ipcRenderer.removeListener('term:exit', l)
    },
    onProc: (fn) => {
      const l = (_e, sid, name) => fn(sid, name)
      ipcRenderer.on('term:proc', l)
      return () => ipcRenderer.removeListener('term:proc', l)
    },
  },
  link: { open: (url) => ipcRenderer.invoke('link:open', url) },
  mini: {
    open: (url, seconds) => ipcRenderer.invoke('mini:open', url, seconds),
    onClosed: (fn) => {
      const l = (_e, v) => fn(v)
      ipcRenderer.on('mini:closed', l)
      return () => ipcRenderer.removeListener('mini:closed', l)
    },
  },
  symbols: {
    get: () => ipcRenderer.invoke('symbols:get'),
    set: (on) => ipcRenderer.invoke('symbols:set', on),
    install: () => ipcRenderer.invoke('symbols:install'),
  },
  headroom: {
    get: () => ipcRenderer.invoke('headroom:get'),
    set: (on) => ipcRenderer.invoke('headroom:set', on),
    shorter: (on) => ipcRenderer.invoke('headroom:shorter', on),
    install: () => ipcRenderer.invoke('headroom:install'),
    quality: () => ipcRenderer.invoke('headroom:quality'),
    inspect: (on) => ipcRenderer.invoke('headroom:inspect', on),
  },
  small: {
    get: () => ipcRenderer.invoke('small:get'),
    set: (model) => ipcRenderer.invoke('small:set', model),
  },
  mail: {
    status: () => ipcRenderer.invoke('mail:status'),
    connect: (acct, clientId, clientSecret) => unlocked(`connect ${acct === 'gmail' ? 'Gmail' : 'Outlook'}`).then(() => ipcRenderer.invoke('mail:connect', acct, clientId, clientSecret)),
    disconnect: (acct) => unlocked('disconnect a mail account').then(() => ipcRenderer.invoke('mail:disconnect', acct)),
    list: (acct, folder, search, next) => ipcRenderer.invoke('mail:list', acct, folder, search, next),
    unread: (acct) => ipcRenderer.invoke('mail:unread', acct),
    get: (acct, id) => ipcRenderer.invoke('mail:get', acct, id),
    markRead: (acct, id, read) => ipcRenderer.invoke('mail:read', acct, id, read),
    move: (acct, id, to) => ipcRenderer.invoke('mail:move', acct, id, to),
    reply: (acct, id, text, all) => ipcRenderer.invoke('mail:reply', acct, id, text, all),
    send: (acct, m) => ipcRenderer.invoke('mail:send', acct, m),
  },
  voice: {
    get: () => ipcRenderer.invoke('voice:get'),
    connect: (key) => unlocked('connect ElevenLabs').then(() => ipcRenderer.invoke('voice:connect', key)),
    disconnect: () => unlocked('disconnect ElevenLabs').then(() => ipcRenderer.invoke('voice:disconnect')),
  },
  content: {
    list: (project) => ipcRenderer.invoke('content:list', project),
    engine: (project) => ipcRenderer.invoke('content:engine', project),
    install: (which) => ipcRenderer.invoke('content:install', which),
    voiceReady: () => ipcRenderer.invoke('content:voiceReady'),
    pickMusic: (id, paths) => ipcRenderer.invoke('content:pickMusic', id, paths),
    create: (p) => ipcRenderer.invoke('content:create', p),
    update: (id, patch) => ipcRenderer.invoke('content:update', id, patch),
    remove: (id) => ipcRenderer.invoke('content:remove', id),
    script: (id) => ipcRenderer.invoke('content:script', id),
    tag: (sid, id) => ipcRenderer.invoke('content:tag', sid, id),
    render: (id) => ipcRenderer.invoke('content:render', id),
    check: (id) => ipcRenderer.invoke('content:check', id),
    reveal: (path) => ipcRenderer.invoke('content:reveal', path),
    onLog: (cb) => {
      const l = (_e, id, line) => cb(id, line)
      ipcRenderer.on('content:log', l)
      return () => ipcRenderer.removeListener('content:log', l)
    },
    onChanged: (cb) => {
      const l = () => cb()
      ipcRenderer.on('content:changed', l)
      return () => ipcRenderer.removeListener('content:changed', l)
    },
  },
  social: {
    status: () => ipcRenderer.invoke('social:status'),
    connectToken: (n, token) => unlocked('connect an account').then(() => ipcRenderer.invoke('social:connectToken', n, token)),
    connectOAuth: (n, id, secret) => unlocked('connect an account').then(() => ipcRenderer.invoke('social:connectOAuth', n, id, secret)),
    disconnect: (n) => unlocked('disconnect an account').then(() => ipcRenderer.invoke('social:disconnect', n)),
    profile: (n) => ipcRenderer.invoke('social:profile', n),
    timeline: (n) => ipcRenderer.invoke('social:timeline', n),
    like: (n, id) => ipcRenderer.invoke('social:like', n, id),
    repost: (n, id) => ipcRenderer.invoke('social:repost', n, id),
    posts: (n) => ipcRenderer.invoke('social:posts', n),
    comments: (n, postId) => ipcRenderer.invoke('social:comments', n, postId),
    reply: (n, commentId, text, postId) => ipcRenderer.invoke('social:reply', n, commentId, text, postId),
    suggest: (comment, post) => ipcRenderer.invoke('social:suggest', comment, post),
    queue: () => ipcRenderer.invoke('social:queue'),
    save: (item) => ipcRenderer.invoke('social:save', item),
    approve: (id, on) => ipcRenderer.invoke('social:approve', id, on),
    retry: (id) => ipcRenderer.invoke('social:retry', id),
    remove: (id) => ipcRenderer.invoke('social:remove', id),
    move: (id, when) => ipcRenderer.invoke('social:move', id, when),
    comment: (id, text) => ipcRenderer.invoke('social:comment', id, text),
    slots: () => ipcRenderer.invoke('social:slots'),
    setSlots: (s) => ipcRenderer.invoke('social:setSlots', s),
    connected: () => ipcRenderer.invoke('social:connected'),
  },
  routerAsk: (text, localOnly) => ipcRenderer.invoke('router:ask', text, localOnly),
  newSession: (opts) => ipcRenderer.invoke('session:new', opts || {}),
  closeSession: (sid) => ipcRenderer.invoke('session:close', sid),
  release: (sid) => ipcRenderer.invoke('chat:release', sid),
  panelUsage: (sid) => ipcRenderer.invoke('panel:usage', sid),
  panelCap: (sid, cap) => ipcRenderer.invoke('panel:cap', sid, cap),
  countTokens: (text, model) => ipcRenderer.invoke('tokens:count', text, model),
  memoryNode: (id) => ipcRenderer.invoke('memory:node', id),
  guardInject: (text) => ipcRenderer.invoke('guard:inject', text),
  guardSecrets: (text) => ipcRenderer.invoke('guard:secrets', text),
  trace: (sid) => ipcRenderer.invoke('trace:get', sid),
  a2m: {
    list: (q, cat, keyless) => ipcRenderer.invoke('a2m:list', q, cat, keyless),
    refresh: () => ipcRenderer.invoke('a2m:refresh'),
    spec: (url) => ipcRenderer.invoke('a2m:spec', url),
    preview: (g) => ipcRenderer.invoke('a2m:preview', g),
    write: (project, g, overwrite) => ipcRenderer.invoke('a2m:write', project, g, overwrite),
    npm: (project, name) => ipcRenderer.invoke('a2m:npm', project, name),
    install: (project, name, env, value, scope) => ipcRenderer.invoke('a2m:install', project, name, env, value, scope),
  },
  mhealth: {
    get: (cwd) => ipcRenderer.invoke('mhealth:get', cwd),
    check: (cwd, name) => ipcRenderer.invoke('mhealth:check', cwd, name),
    approve: (cwd, name) => ipcRenderer.invoke('mhealth:approve', cwd, name),
  },
  mpol: {
    get: (cwd) => ipcRenderer.invoke('mpol:get', cwd),
    set: (p) => ipcRenderer.invoke('mpol:set', p),
  },
  insp: {
    servers: (cwd) => ipcRenderer.invoke('insp:servers', cwd),
    connect: (t, cwd) => ipcRenderer.invoke('insp:connect', t, cwd),
    appDoc: (html) => ipcRenderer.invoke('insp:appdoc', html),
    call: (name, args, confirmed) => ipcRenderer.invoke('insp:call', name, args, confirmed),
    resource: (uri) => ipcRenderer.invoke('insp:resource', uri),
    prompt: (name, args) => ipcRenderer.invoke('insp:prompt', name, args),
    close: () => ipcRenderer.invoke('insp:close'),
  },
  mcat: {
    state: () => ipcRenderer.invoke('mcat:state'),
    refresh: () => ipcRenderer.invoke('mcat:refresh'),
    search: (f) => ipcRenderer.invoke('mcat:search', f),
    details: (repo) => ipcRenderer.invoke('mcat:details', repo),
    install: (o) => ipcRenderer.invoke('mcat:install', o),
    uninstall: (name, scope, cwd) => ipcRenderer.invoke('mcat:uninstall', name, scope, cwd),
  },
  prom: {
    conf: () => ipcRenderer.invoke('prom:conf'),
    setUrl: (url) => ipcRenderer.invoke('prom:setUrl', url),
    save: (name, q) => ipcRenderer.invoke('prom:save', name, q),
    unsave: (name) => ipcRenderer.invoke('prom:unsave', name),
    alerts: () => ipcRenderer.invoke('prom:alerts'),
    targets: () => ipcRenderer.invoke('prom:targets'),
    range: (q, seconds) => ipcRenderer.invoke('prom:range', q, seconds),
    ask: (q) => ipcRenderer.invoke('prom:ask', q),
  },
  ph: {
    state: () => ipcRenderer.invoke('ph:state'),
    setConn: (c) => ipcRenderer.invoke('ph:setConn', c),
    projects: () => ipcRenderer.invoke('ph:projects'),
    query: (q) => ipcRenderer.invoke('ph:query', q),
    flags: () => ipcRenderer.invoke('ph:flags'),
    setFlag: (id, change) => ipcRenderer.invoke('ph:setFlag', id, change),
    experiments: () => ipcRenderer.invoke('ph:experiments'),
    ask: (q) => ipcRenderer.invoke('ph:ask', q),
    stack: (type, message, cwd) => ipcRenderer.invoke('ph:stack', type, message, cwd),
  },
  leak: {
    state: (project) => ipcRenderer.invoke('leak:state', project),
    scan: (project, source) => ipcRenderer.invoke('leak:scan', project, source),
    verify: (on) => ipcRenderer.invoke('leak:verify', on),
    resolve: (project, fp, note) => ipcRenderer.invoke('leak:resolve', project, fp, note),
    hook: (project, on) => ipcRenderer.invoke('leak:hook', project, on),
    steps: (l) => ipcRenderer.invoke('leak:steps', l),
  },
  sec: {
    state: (project) => ipcRenderer.invoke('sec:state', project),
    scan: (project, kind, target) => ipcRenderer.invoke('sec:scan', project, kind, target),
    accept: (project, key, note, days) => ipcRenderer.invoke('sec:accept', project, key, note, days),
    unaccept: (project, key) => ipcRenderer.invoke('sec:unaccept', project, key),
    sbom: (project, format) => ipcRenderer.invoke('sec:sbom', project, format),
    setGate: (uuid, project) => ipcRenderer.invoke('sec:setGate', uuid, project),
    fixMessage: (f) => ipcRenderer.invoke('sec:fixMessage', f),
  },
  wb: {
    state: () => ipcRenderer.invoke('wb:state'),
    save: (p, note) => ipcRenderer.invoke('wb:save', p, note),
    remove: (id) => ipcRenderer.invoke('wb:remove', id),
    catalog: (q) => ipcRenderer.invoke('wb:catalog', q),
    importCatalog: () => ipcRenderer.invoke('wb:import'),
    adopt: (id) => ipcRenderer.invoke('wb:adopt', id),
    setFilters: (persona, f) => ipcRenderer.invoke('wb:setFilters', persona, f),
    rate: (sid, value, reply, note) => ipcRenderer.invoke('wb:rate', sid, value, reply, note),
  },
  s2c: {
    list: () => ipcRenderer.invoke('s2c:list'),
    get: (id) => ipcRenderer.invoke('s2c:get', id),
    start: (o) => ipcRenderer.invoke('s2c:start', o),
    stop: (id) => ipcRenderer.invoke('s2c:stop', id),
    apply: (id, n, folder, overwrite) => ipcRenderer.invoke('s2c:apply', id, n, folder, overwrite),
    prototype: (ids, folder) => ipcRenderer.invoke('s2c:prototype', ids, folder),
    onProgress: (cb) => {
      const f = (_e, p) => cb(p)
      ipcRenderer.on('s2c:progress', f)
      return () => ipcRenderer.removeListener('s2c:progress', f)
    },
  },
  models: {
    state: () => ipcRenderer.invoke('ms:state'),
    save: (e) => ipcRenderer.invoke('ms:save', e),
    remove: (id) => ipcRenderer.invoke('ms:remove', id),
    list: (id) => ipcRenderer.invoke('ms:models', id),
    test: (id, model, prompt) => ipcRenderer.invoke('ms:test', id, model, prompt),
    metrics: (id) => ipcRenderer.invoke('ms:metrics', id),
    preview: (a) => ipcRenderer.invoke('ms:preview', a),
    start: (host, a) => ipcRenderer.invoke('ms:start', host, a),
    stop: (host, port) => ipcRenderer.invoke('ms:stop', host, port),
    log: (host, port) => ipcRenderer.invoke('ms:log', host, port),
    tunnel: (host, local, remote, open) => ipcRenderer.invoke('ms:tunnel', host, local, remote, open),
  },
  monitor: {
    list: () => ipcRenderer.invoke('monitor:list'),
    history: (id) => ipcRenderer.invoke('monitor:history', id),
    save: (m) => ipcRenderer.invoke('monitor:save', m),
    remove: (id) => ipcRenderer.invoke('monitor:remove', id),
    check: (id) => ipcRenderer.invoke('monitor:check', id),
    page: (title, dir) => ipcRenderer.invoke('monitor:page', title, dir),
    pageTitle: () => ipcRenderer.invoke('monitor:pageTitle'),
    netdataUrl: () => ipcRenderer.invoke('monitor:netdataUrl'),
    setNetdata: (url) => ipcRenderer.invoke('monitor:setNetdata', url),
    netdata: () => ipcRenderer.invoke('monitor:netdata'),
    onBeat: (cb) => {
      const f = () => cb()
      ipcRenderer.on('monitor:beat', f)
      return () => ipcRenderer.removeListener('monitor:beat', f)
    },
  },
  obs: {
    turns: () => ipcRenderer.invoke('obs:turns'),
    score: (turn, name, value, note) => ipcRenderer.invoke('obs:score', turn, name, value, note),
    datasets: () => ipcRenderer.invoke('obs:datasets'),
    saveDataset: (ds) => ipcRenderer.invoke('obs:saveDataset', ds),
    deleteDataset: (id) => ipcRenderer.invoke('obs:deleteDataset', id),
    staging: () => ipcRenderer.invoke('obs:staging'),
    setStaging: (id, s) => ipcRenderer.invoke('obs:setStaging', id, s),
    promote: (id) => ipcRenderer.invoke('obs:promote', id),
    run: (datasetId, variants, must) => ipcRenderer.invoke('obs:run', datasetId, variants, must),
    stop: () => ipcRenderer.invoke('obs:stop'),
    experiments: () => ipcRenderer.invoke('obs:experiments'),
    otel: () => ipcRenderer.invoke('obs:otel'),
    setOtel: (o) => ipcRenderer.invoke('obs:setOtel', o),
    export: (ids) => ipcRenderer.invoke('obs:export', ids),
  },
  addRule: (scope, target, rule) => ipcRenderer.invoke('rule:add', scope, target, rule),
  arena: {
    run: (prompt) => ipcRenderer.invoke('arena:run', prompt),
    vote: (kind, w) => ipcRenderer.invoke('arena:vote', kind, w),
    get: () => ipcRenderer.invoke('arena:get'),
    reset: (kind) => ipcRenderer.invoke('arena:reset', kind),
  },
  evals: {
    get: (id) => ipcRenderer.invoke('evals:get', id),
    set: (id, text) => ipcRenderer.invoke('evals:set', id, text),
    run: (id, where, instructions) => ipcRenderer.invoke('evals:run', id, where, instructions),
    rewrite: (id, failures) => ipcRenderer.invoke('evals:rewrite', id, failures),
  },
  styles: { get: () => ipcRenderer.invoke('styles:get'), set: (ids) => ipcRenderer.invoke('styles:set', ids) },
  bands: () => ipcRenderer.invoke('bands:get'),
  receipts: () => ipcRenderer.invoke('receipts:verify'),
  providers: {
    state: () => ipcRenderer.invoke('providers:state'),
    preview: (id) => ipcRenderer.invoke('providers:preview', id),
    apply: (id) => ipcRenderer.invoke('providers:apply', id),
    restore: (name) => ipcRenderer.invoke('providers:restore', name),
    save: (p) => ipcRenderer.invoke('providers:save', p),
    remove: (id) => ipcRenderer.invoke('providers:delete', id),
  },
  registry: {
    state: (cwd) => ipcRenderer.invoke('registry:state', cwd),
    toggle: (persona, kind, name, on) => ipcRenderer.invoke('registry:toggle', persona, kind, name, on),
  },
  sessionLogs: {
    list: (cwd) => ipcRenderer.invoke('sessions:list', cwd),
    read: (cwd, file) => ipcRenderer.invoke('sessions:read', cwd, file),
  },
  quota: {
    tray: () => ipcRenderer.invoke('quota:tray'),
  },
  diagram: {
    list: (cwd) => ipcRenderer.invoke('diagram:list', cwd),
    open: (path) => ipcRenderer.invoke('diagram:open', path),
    create: (cwd, name, text) => ipcRenderer.invoke('diagram:create', cwd, name, text),
    edit: (path, text, ids) => ipcRenderer.invoke('diagram:edit', path, text, ids),
    fromImage: (cwd, name, hint, chosen) => ipcRenderer.invoke('diagram:fromImage', cwd, name, hint, chosen),
    er: (cwd, name, schema) => ipcRenderer.invoke('diagram:er', cwd, name, schema),
    template: (cwd, name, id) => ipcRenderer.invoke('diagram:template', cwd, name, id),
    restore: (path, at) => ipcRenderer.invoke('diagram:restore', path, at),
    save: (path, model, note) => ipcRenderer.invoke('diagram:save', path, model, note),
    external: (path) => ipcRenderer.invoke('diagram:external', path),
  },
  backtest: {
    saveScript: (cwd, kind, text) => ipcRenderer.invoke('backtest:script', cwd, kind, text),
  },
  photos: {
    get: () => ipcRenderer.invoke('photos:get'),
    pick: (chosen) => ipcRenderer.invoke('photos:pick', chosen),
    scan: () => ipcRenderer.invoke('photos:scan'),
    thumb: (source, id) => ipcRenderer.invoke('photos:thumb', source, id),
    open: (id) => ipcRenderer.invoke('photos:open', id),
    immichSet: (url, key) => ipcRenderer.invoke('photos:immichSet', url, key),
    immich: (q) => ipcRenderer.invoke('photos:immich', q),
  },
  vmeta: {
    fetch: (urls) => ipcRenderer.invoke('vmeta:fetch', urls),
    exportTo: (cwd, rel, list) => ipcRenderer.invoke('vmeta:export', cwd, rel, list),
  },
  book: {
    get: () => ipcRenderer.invoke('book:get'),
    save: (b) => ipcRenderer.invoke('book:save', b),
    preview: () => ipcRenderer.invoke('book:preview'),
    publish: () => ipcRenderer.invoke('book:publish'),
    requests: () => ipcRenderer.invoke('book:requests'),
    decide: (id, status) => ipcRenderer.invoke('book:decide', id, status),
  },
  learn: {
    cards: () => ipcRenderer.invoke('learn:cards'),
    save: (cards) => ipcRenderer.invoke('learn:save', cards),
    plan: (cwd, slug) => ipcRenderer.invoke('learn:plan', cwd, slug),
  },
  selfhost: {
    deploy: (host, id, hostPort, publicBind) => ipcRenderer.invoke('selfhost:deploy', host, id, hostPort, publicBind),
  },
  adr: {
    list: (cwd) => ipcRenderer.invoke('adr:list', cwd),
    read: (cwd, file) => ipcRenderer.invoke('adr:read', cwd, file),
    save: (cwd, file, text) => ipcRenderer.invoke('adr:save', cwd, file, text),
    create: (cwd, title, context, supersedes) => ipcRenderer.invoke('adr:create', cwd, title, context, supersedes),
    status: (cwd, file, status) => ipcRenderer.invoke('adr:status', cwd, file, status),
  },
  localVoice: {
    get: () => ipcRenderer.invoke('voice:local'),
    hear: (audio, lang) => ipcRenderer.invoke('voice:hear', audio, lang),
    speak: (text, voice) => ipcRenderer.invoke('voice:speak', text, voice),
    pick: (voice) => ipcRenderer.invoke('voice:pick', voice),
  },
  mi: {
    list: (project, mode) => ipcRenderer.invoke('mi:list', project, mode),
    add: (project, text, origin) => ipcRenderer.invoke('mi:add', project, text, origin),
    edit: (id, text) => ipcRenderer.invoke('mi:edit', id, text),
    archive: (id, on) => ipcRenderer.invoke('mi:archive', id, on),
    chain: (id) => ipcRenderer.invoke('mi:chain', id),
    search: (project, q, mode, origin) => ipcRenderer.invoke('mi:search', project, q, mode, origin),
    onChanged: (fn) => {
      const h = () => fn()
      ipcRenderer.on('memitems:changed', h)
      return () => ipcRenderer.removeListener('memitems:changed', h)
    },
  },
  compactor: {
    get: () => ipcRenderer.invoke('compact:get'),
    set: (stages) => ipcRenderer.invoke('compact:set', stages),
    saved: (sid, tokens) => ipcRenderer.invoke('compact:saved', sid, tokens),
  },
  xray: {
    images: () => ipcRenderer.invoke('xray:images'),
    run: (image) => ipcRenderer.invoke('xray:run', image),
  },
  forge: {
    get: () => ipcRenderer.invoke('forge:get'),
    set: (kind, url) => ipcRenderer.invoke('forge:set', kind, url),
  },
  act: {
    jobs: (cwd) => ipcRenderer.invoke('act:jobs', cwd),
    run: (cwd, job, secrets) => ipcRenderer.invoke('act:run', cwd, job, secrets),
    stop: () => ipcRenderer.invoke('act:stop'),
    onLine: (fn) => {
      const h = (_e, l) => fn(l)
      ipcRenderer.on('act:line', h)
      return () => ipcRenderer.removeListener('act:line', h)
    },
  },
  radar: {
    get: () => ipcRenderer.invoke('radar:get'),
    save: (groups, weights, ntfy) => ipcRenderer.invoke('radar:save', groups, weights, ntfy),
    run: (onlyNew, hours) => ipcRenderer.invoke('radar:run', onlyNew, hours),
    mark: () => ipcRenderer.invoke('radar:mark'),
    draft: (hits) => ipcRenderer.invoke('radar:draft', hits),
    notify: (text) => ipcRenderer.invoke('radar:notify', text),
  },
  bitwarden: {
    status: () => ipcRenderer.invoke('bw:status'),
    unlock: (password) => ipcRenderer.invoke('bw:unlock', password),
    lock: () => ipcRenderer.invoke('bw:lock'),
    search: (q) => ipcRenderer.invoke('bw:search', q),
    link: (name, item, field, label) => ipcRenderer.invoke('bw:link', name, item, field, label),
    unlink: (name) => ipcRenderer.invoke('bw:unlink', name),
  },
  shortTerm: {
    get: (sid) => ipcRenderer.invoke('sym:get', sid),
    set: (sid, on) => ipcRenderer.invoke('sym:set', sid, on),
    original: (sid, id) => ipcRenderer.invoke('sym:original', sid, id),
  },
  projGraph: {
    build: (cwd) => ipcRenderer.invoke('graph:build', cwd),
    get: (cwd) => ipcRenderer.invoke('graph:get', cwd),
    focus: (cwd, id) => ipcRenderer.invoke('graph:focus', cwd, id),
    ask: (cwd, text) => ipcRenderer.invoke('graph:ask', cwd, text),
  },
  reflect: {
    list: () => ipcRenderer.invoke('reflect:list'),
    draft: (id) => ipcRenderer.invoke('reflect:draft', id),
    keep: (id, picks) => ipcRenderer.invoke('reflect:keep', id, picks),
    dismiss: (id) => ipcRenderer.invoke('reflect:dismiss', id),
    onPending: (fn) => {
      const h = (_e, n) => fn(n)
      ipcRenderer.on('reflect:pending', h)
      return () => ipcRenderer.removeListener('reflect:pending', h)
    },
  },
  diagCheck: {
    get: (sid) => ipcRenderer.invoke('dg:get', sid),
    set: (sid, on) => ipcRenderer.invoke('dg:set', sid, on),
  },
  live: {
    connect: (id, r) => ipcRenderer.invoke('live:connect', id, r),
    send: (id, text, event) => ipcRenderer.invoke('live:send', id, text, event),
    close: (id) => ipcRenderer.invoke('live:close', id),
    saved: () => ipcRenderer.invoke('live:saved'),
    save: (x) => ipcRenderer.invoke('live:save', x),
    remove: (id) => ipcRenderer.invoke('live:delete', id),
    onEntry: (fn) => {
      const h = (_e, id, e) => fn(id, e)
      ipcRenderer.on('live:entry', h)
      return () => ipcRenderer.removeListener('live:entry', h)
    },
  },
  stacks: {
    list: () => ipcRenderer.invoke('stk:list'),
    open: (name) => ipcRenderer.invoke('stk:open', name),
    save: (name, file, text, mtime) => ipcRenderer.invoke('stk:save', name, file, text, mtime),
    act: (name, act) => ipcRenderer.invoke('stk:act', name, act),
    logs: (name, service) => ipcRenderer.invoke('stk:logs', name, service),
    onLog: (fn) => {
      const h = (_e, lines) => fn(lines)
      ipcRenderer.on('stk:log', h)
      return () => ipcRenderer.removeListener('stk:log', h)
    },
  },
  appContainers: {
    list: () => ipcRenderer.invoke('ctr:list'),
    watch: (on) => ipcRenderer.invoke('ctr:watch', on),
    act: (id, act) => ipcRenderer.invoke('ctr:act', id, act),
    onEvent: (fn) => {
      const h = (_e, ev) => fn(ev)
      ipcRenderer.on('ctr:event', h)
      return () => ipcRenderer.removeListener('ctr:event', h)
    },
  },
  anomalySeries: (sid) => ipcRenderer.invoke('anomaly:series', sid),
  pdfTools: {
    config: (url) => ipcRenderer.invoke('pdf:config', url),
    pick: (chosen) => ipcRenderer.invoke('pdf:pick', chosen),
    scan: (file) => ipcRenderer.invoke('pdf:scan', file),
    run: (op, files, p) => ipcRenderer.invoke('pdf:run', op, files, p),
    reveal: (file) => ipcRenderer.invoke('pdf:reveal', file),
  },
  vaultBoard: {
    notes: () => ipcRenderer.invoke('fmv:notes'),
    set: (file, key, value, mtime) => ipcRenderer.invoke('fmv:set', file, key, value, mtime),
    importEnex: (chosen) => ipcRenderer.invoke('enex:import', chosen),
  },
  handoff: {
    write: (cwd, text, replace) => ipcRenderer.invoke('design:write', cwd, text, replace),
    pickHtml: (chosen) => ipcRenderer.invoke('html:pick', chosen),
  },
  mdImages: {
    pick: (chosen) => ipcRenderer.invoke('mdimg:pick', chosen),
    scan: (file) => ipcRenderer.invoke('mdimg:scan', file),
    publish: (file, refs, template) => ipcRenderer.invoke('mdimg:publish', file, refs, template),
  },
  gatewayLog: () => ipcRenderer.invoke('gw:log'),
  office: {
    status: () => ipcRenderer.invoke('office:status'),
    preview: (file) => ipcRenderer.invoke('office:preview', file),
    reveal: (file) => ipcRenderer.invoke('office:reveal', file),
  },
  snap: {
    set: (sid, text, inject) => ipcRenderer.invoke('snap:set', sid, text, inject),
  },
  billSource: {
    get: (sid) => ipcRenderer.invoke('quota:get', sid),
    set: (sid, to, confirms) => ipcRenderer.invoke('quota:set', sid, to, confirms),
    resume: (sid) => ipcRenderer.invoke('quota:resume', sid),
    custom: (on, url) => ipcRenderer.invoke('quota:custom', on, url),
  },
  prune: {
    suggest: (sid, task) => ipcRenderer.invoke('prune:suggest', sid, task),
    apply: (sid, off) => ipcRenderer.invoke('prune:apply', sid, off),
    reset: (sid) => ipcRenderer.invoke('prune:reset', sid),
  },
  deeplink: {
    pending: () => ipcRenderer.invoke('deeplink:pending'),
    on: (fn) => {
      const h = (_e, l) => fn(l)
      ipcRenderer.on('deeplink', h)
      return () => ipcRenderer.removeListener('deeplink', h)
    },
  },
  onMenu: (fn) => {
    const h = (_e, id) => fn(id)
    ipcRenderer.on('menu:go', h)
    return () => ipcRenderer.removeListener('menu:go', h)
  },
  diag: {
    get: () => ipcRenderer.invoke('diag:get'),
    report: () => ipcRenderer.invoke('diag:report'),
    open: () => ipcRenderer.invoke('diag:open'),
    selftest: () => ipcRenderer.invoke('diag:selftest'),
    renderer: (text) => ipcRenderer.send('diag:renderer', text),
  },
  rt: {
    state: () => ipcRenderer.invoke('rt:state'),
    save: (r) => ipcRenderer.invoke('rt:save', r),
    remove: (id) => ipcRenderer.invoke('rt:remove', id),
    run: (id) => ipcRenderer.invoke('rt:run', id),
    read: (id, read) => ipcRenderer.invoke('rt:read', id, read),
    dropDraft: (id) => ipcRenderer.invoke('rt:dropDraft', id),
    onChanged: (fn) => {
      const h = () => fn()
      ipcRenderer.on('routines:changed', h)
      return () => ipcRenderer.removeListener('routines:changed', h)
    },
  },
  iso: {
    status: (sid) => ipcRenderer.invoke('iso:status', sid),
    start: (sid, image) => ipcRenderer.invoke('iso:start', sid, image),
    stop: (sid) => ipcRenderer.invoke('iso:stop', sid),
    network: (sid, on) => ipcRenderer.invoke('iso:network', sid, on),
  },
  wt: {
    list: () => ipcRenderer.invoke('wt:list'),
    create: (title, goal, budgetUsd, sid) => ipcRenderer.invoke('wt:create', title, goal, budgetUsd, sid),
    link: (id, sid, on) => ipcRenderer.invoke('wt:link', id, sid, on),
    budget: (id, usd) => ipcRenderer.invoke('wt:budget', id, usd),
    decide: (id, decision) => ipcRenderer.invoke('wt:decide', id, decision),
    onChanged: (fn) => {
      const h = () => fn()
      ipcRenderer.on('tasks:changed', h)
      return () => ipcRenderer.removeListener('tasks:changed', h)
    },
  },
  pb: {
    list: (cwd) => ipcRenderer.invoke('pb:list', cwd),
    create: (cwd) => ipcRenderer.invoke('pb:create', cwd),
    runs: (sid) => ipcRenderer.invoke('pb:runs', sid),
    run: (sid, file, resume) => ipcRenderer.invoke('pb:run', sid, file, resume),
    stop: (id) => ipcRenderer.invoke('pb:stop', id),
    onChanged: (fn) => {
      const h = () => fn()
      ipcRenderer.on('pb:changed', h)
      return () => ipcRenderer.removeListener('pb:changed', h)
    },
  },
  msgf: {
    list: () => ipcRenderer.invoke('msgf:list'),
    save: (f) => ipcRenderer.invoke('msgf:save', f),
    remove: (id) => ipcRenderer.invoke('msgf:remove', id),
    test: (code, stage, text, valves) => ipcRenderer.invoke('msgf:test', code, stage, text, valves),
  },
  extract: {
    run: (text, fields, examples, project) => ipcRenderer.invoke('extract:run', text, fields, examples, project),
    stop: () => ipcRenderer.invoke('extract:stop'),
    onProgress: (fn) => {
      const h = (_e, p) => fn(p)
      ipcRenderer.on('extract:progress', h)
      return () => ipcRenderer.removeListener('extract:progress', h)
    },
  },
  phone: {
    get: () => ipcRenderer.invoke('phone:get'),
    start: () => ipcRenderer.invoke('phone:start'),
    stop: () => ipcRenderer.invoke('phone:stop'),
    code: () => ipcRenderer.invoke('phone:code'),
    forget: () => ipcRenderer.invoke('phone:forget'),
    setSend: (on) => ipcRenderer.invoke('phone:send', on),
  },
  mcpsrv: {
    get: () => ipcRenderer.invoke('mcpsrv:get'),
    setSend: (on) => ipcRenderer.invoke('mcpsrv:send', on),
  },
  bmap: {
    scan: (cwd) => ipcRenderer.invoke('bmap:scan', cwd),
    save: (cwd, markdown, replace) => ipcRenderer.invoke('bmap:save', cwd, markdown, replace),
  },
  askData: {
    run: (id, sql) => ipcRenderer.invoke('ask:run', id, sql),
    board: () => ipcRenderer.invoke('ask:board'),
    keep: (item) => ipcRenderer.invoke('ask:keep', item),
    drop: (id) => ipcRenderer.invoke('ask:drop', id),
  },
  rc: {
    get: () => ipcRenderer.invoke('rc:get'),
    connect: (url, userId, token) => ipcRenderer.invoke('rc:connect', url, userId, token),
    disconnect: () => ipcRenderer.invoke('rc:disconnect'),
    alerts: (room, alerts) => ipcRenderer.invoke('rc:alerts', room, alerts),
    test: () => ipcRenderer.invoke('rc:test'),
  },
  inbox: {
    load: () => ipcRenderer.invoke('inbox:load'),
    status: (key, status, snooze) => ipcRenderer.invoke('inbox:status', key, status, snooze),
    labels: (key, labels) => ipcRenderer.invoke('inbox:labels', key, labels),
    note: (key, text, remove) => ipcRenderer.invoke('inbox:note', key, text, remove),
    replies: (r) => ipcRenderer.invoke('inbox:replies', r),
    views: (v) => ipcRenderer.invoke('inbox:views', v),
    hours: (h) => ipcRenderer.invoke('inbox:hours', h),
    suggest: (key) => ipcRenderer.invoke('inbox:suggest', key),
    send: (key, text) => ipcRenderer.invoke('inbox:send', key, text),
  },
  docs: {
    state: () => ipcRenderer.invoke('docs:state'),
    setFolder: (chosen) => ipcRenderer.invoke('docs:setFolder', chosen),
    addFiles: (paths) => ipcRenderer.invoke('docs:addFiles', paths),
    retry: (id) => ipcRenderer.invoke('docs:retry', id),
    doc: (id) => ipcRenderer.invoke('docs:doc', id),
    setTags: (id, tags) => ipcRenderer.invoke('docs:setTags', id, tags),
    reject: (id, tag) => ipcRenderer.invoke('docs:reject', id, tag),
    chunk: (id, text) => ipcRenderer.invoke('docs:chunk', id, text),
    addChunk: (doc, text) => ipcRenderer.invoke('docs:addChunk', doc, text),
    merge: (id) => ipcRenderer.invoke('docs:merge', id),
    split: (id, at) => ipcRenderer.invoke('docs:split', id, at),
    compiled: (id) => ipcRenderer.invoke('docs:compiled', id),
    compile: (id, how) => ipcRenderer.invoke('docs:compile', id, how),
    fact: (id, ok) => ipcRenderer.invoke('docs:fact', id, ok),
    rule: (r) => ipcRenderer.invoke('docs:rule', r),
    dropRule: (id) => ipcRenderer.invoke('docs:dropRule', id),
    template: (t) => ipcRenderer.invoke('docs:template', t),
    search: (q, tag) => ipcRenderer.invoke('docs:search', q, tag),
    show: (id) => ipcRenderer.invoke('docs:show', id),
    remove: (id) => ipcRenderer.invoke('docs:remove', id),
    onChanged: (fn) => {
      const l = () => fn()
      ipcRenderer.on('docs:changed', l)
      return () => ipcRenderer.removeListener('docs:changed', l)
    },
    onStage: (fn) => {
      const l = (_e, d) => fn(d)
      ipcRenderer.on('docs:stage', l)
      return () => ipcRenderer.removeListener('docs:stage', l)
    },
  },
  sites: {
    list: () => ipcRenderer.invoke('sites:list'),
    save: (input, id) => ipcRenderer.invoke('sites:save', input, id),
    remove: (id) => ipcRenderer.invoke('sites:remove', id),
  },
  transcript: {
    get: (r) => ipcRenderer.invoke('transcript:get', r),
    enabled: (on) => ipcRenderer.invoke('transcript:enabled', on),
    tools: () => ipcRenderer.invoke('transcript:tools'),
  },
  brief: {
    sources: () => ipcRenderer.invoke('brief:sources'),
    connectReddit: (id, secret) => unlocked('save a secret').then(() => ipcRenderer.invoke('brief:connectReddit', id, secret)),
    youtubeKey: (key) => unlocked('save a secret').then(() => ipcRenderer.invoke('brief:youtubeKey', key)),
    run: (r) => ipcRenderer.invoke('brief:run', r),
  },
  research: {
    run: (r) => ipcRenderer.invoke('research:run', r),
    stop: () => ipcRenderer.invoke('research:stop'),
    save: (cwd, topic, report, sources) => ipcRenderer.invoke('research:save', cwd, topic, report, sources),
    extract: (target, schema) => ipcRenderer.invoke('research:extract', target, schema),
    onEvent: (fn) => {
      const l = (_e, d) => fn(d)
      ipcRenderer.on('research:event', l)
      return () => ipcRenderer.removeListener('research:event', l)
    },
  },
  reader: {
    config: () => ipcRenderer.invoke('web:config'),
    setCache: (rules) => ipcRenderer.invoke('web:setCache', rules),
    setSearch: (url) => ipcRenderer.invoke('web:setSearch', url),
    dropSchema: (name) => ipcRenderer.invoke('web:dropSchema', name),
    extract: (url, name) => ipcRenderer.invoke('web:extract', url, name),
    tryRead: (url, question, mode) => ipcRenderer.invoke('web:try', url, question, mode),
  },
  team: {
    exportFile: (name, dir) => ipcRenderer.invoke('team:export', name, dir),
    open: (path, chosen) => ipcRenderer.invoke('team:open', path, chosen),
    apply: (team, picked) => ipcRenderer.invoke('team:apply', team, picked),
  },
  design: {
    extract: (url) => ipcRenderer.invoke('design:extract', url),
    inventory: (cwd) => ipcRenderer.invoke('design:inventory', cwd),
    consolidate: (cwd, key) => ipcRenderer.invoke('design:consolidate', cwd, key),
  },
  deploys: {
    advisors: () => ipcRenderer.invoke('deploys:advisors'),
    lintMessage: (project, lint) => ipcRenderer.invoke('deploys:lintMessage', project, lint),
    coolify: () => ipcRenderer.invoke('coolify:get'),
    setUrl: (url) => ipcRenderer.invoke('coolify:setUrl', url),
    setHealth: (uuid, path) => ipcRenderer.invoke('coolify:setHealth', uuid, path),
    deploy: (uuid) => ipcRenderer.invoke('coolify:deploy', uuid),
    rollback: (uuid, commit) => ipcRenderer.invoke('coolify:rollback', uuid, commit),
    dokploy: () => ipcRenderer.invoke('dokploy:get'),
    setDokployUrl: (url) => ipcRenderer.invoke('dokploy:setUrl', url),
    dokployDeploy: (id) => ipcRenderer.invoke('dokploy:deploy', id),
    dokployRollback: (id, rollbackId) => ipcRenderer.invoke('dokploy:rollback', id, rollbackId),
    history: (uuid) => ipcRenderer.invoke('coolify:history', uuid),
    onEvent: (fn) => {
      const l = (_e, d) => fn(d)
      ipcRenderer.on('deploy:event', l)
      return () => ipcRenderer.removeListener('deploy:event', l)
    },
  },
  panelBus: {
    onInbox: (fn) => {
      const l = (_e, sid, text, sent) => fn(sid, text, sent)
      ipcRenderer.on('panel:inbox', l)
      return () => ipcRenderer.removeListener('panel:inbox', l)
    },
    links: () => ipcRenderer.invoke('panel:links'),
    onLinks: (fn) => {
      const l = (_e, v) => fn(v)
      ipcRenderer.on('panel:links', l)
      return () => ipcRenderer.removeListener('panel:links', l)
    },
    setAuto: (a, b, on) => ipcRenderer.invoke('panel:linkAuto', a, b, on),
    setCap: (a, b, usd) => ipcRenderer.invoke('panel:linkCap', a, b, usd),
    roomPost: (sids, text) => ipcRenderer.invoke('room:post', sids, text),
    roomNext: () => ipcRenderer.invoke('room:next'),
  },
  teamBundle: {
    exportTo: () => ipcRenderer.invoke('team:export'),
    importFrom: () => ipcRenderer.invoke('team:import'),
    onReview: (fn) => {
      const l = (_e, r) => fn(r)
      ipcRenderer.on('team:review', l)
      return () => ipcRenderer.removeListener('team:review', l)
    },
    prepare: (team, base) => ipcRenderer.invoke('team:prepare', team, base),
    apply: (team, opened) => ipcRenderer.invoke('team:apply', team, opened),
  },
  away: {
    get: () => ipcRenderer.invoke('away:get'),
    onShow: (fn) => {
      const l = (_e, c) => fn(c)
      ipcRenderer.on('away:show', l)
      return () => ipcRenderer.removeListener('away:show', l)
    },
    setCard: (on) => ipcRenderer.invoke('away:setting', on),
    say: () => ipcRenderer.invoke('away:say'),
    touch: () => ipcRenderer.send('away:touch'),
  },
  stmCli: {
    onOpen: (fn) => {
      const l = (_e, r) => fn(r)
      ipcRenderer.on('cli:open', l)
      return () => ipcRenderer.removeListener('cli:open', l)
    },
    opened: (req, sid) => ipcRenderer.send('cli:opened', req, sid),
    install: () => ipcRenderer.invoke('stm:install'),
  },
  vec: { status: (cwd) => ipcRenderer.invoke('vec:status', cwd), model: (m) => ipcRenderer.invoke('vec:model', m), build: (cwd) => ipcRenderer.invoke('vec:build', cwd) },
  memtest: (cwd, q, where) => ipcRenderer.invoke('memtest:run', cwd, q, where),
  goal: { set: (sid, text) => ipcRenderer.invoke('goal:set', sid, text), get: (sid) => ipcRenderer.invoke('goal:get', sid) },
  headroomLearn: (cwd, apply) => ipcRenderer.invoke('headroom:learn', cwd, apply),
  spec: {
    list: (cwd) => ipcRenderer.invoke('spec:list', cwd),
    constitution: (cwd) => ipcRenderer.invoke('constitution:get', cwd),
    saveConstitution: (cwd, text) => ipcRenderer.invoke('constitution:set', cwd, text),
  },
  worktree: {
    stat: (sid) => ipcRenderer.invoke('worktree:stat', sid),
    merge: (sid, message) => ipcRenderer.invoke('worktree:merge', sid, message),
    drop: (sid) => ipcRenderer.invoke('worktree:drop', sid),
    keep: (sid, message) => ipcRenderer.invoke('worktree:keep', sid, message),
    test: (sid) => ipcRenderer.invoke('worktree:test', sid),
  },
  drop: (sid) => ipcRenderer.invoke('chat:drop', sid),
  budget: {
    get: () => ipcRenderer.invoke('budget:get'),
    set: (limits) => ipcRenderer.invoke('budget:set', limits),
  },
  sandbox: {
    status: () => ipcRenderer.invoke('sandbox:status'),
    prepare: (cwd) => ipcRenderer.invoke('sandbox:prepare', cwd),
    onLog: (cb) => {
      const l = (_e, line) => cb(line)
      ipcRenderer.on('sandbox:log', l)
      return () => ipcRenderer.removeListener('sandbox:log', l)
    },
    changes: (cwd) => ipcRenderer.invoke('sandbox:changes', cwd),
    apply: (cwd, paths) => ipcRenderer.invoke('sandbox:apply', cwd, paths),
    remove: (cwd) => ipcRenderer.invoke('sandbox:remove', cwd),
  },
  vaultList: () => ipcRenderer.invoke('vault:list'),
  vaultSet: (name, value, forCommands) => unlocked('save a secret').then(() => ipcRenderer.invoke('vault:set', name, value, forCommands)),
  vaultDelete: (name) => unlocked('delete a secret').then(() => ipcRenderer.invoke('vault:delete', name)),
  vaultForCommands: (name, on) => unlocked('change a secret').then(() => ipcRenderer.invoke('vault:forCommands', name, on)),
  integrations: () => ipcRenderer.invoke('integrations:list'),
  integrationStars: (fetchNow) => ipcRenderer.invoke('integrations:stars', Boolean(fetchNow)),
  web: {
    install: () => ipcRenderer.invoke('web:install'),
    onLog: (cb) => {
      const l = (_e, line) => cb(line)
      ipcRenderer.on('web:log', l)
      return () => ipcRenderer.removeListener('web:log', l)
    },
  },
  setIntegration: (id, on) => ipcRenderer.invoke('integrations:set', id, on),
  openUrl: (url) => ipcRenderer.invoke('open:url', url),
  exportText: (name, text, dir) => ipcRenderer.invoke('export:text', name, text, dir),
  setPanelModel: (sid, model) => ipcRenderer.invoke('chat:model', sid, model),
  routeTally: () => ipcRenderer.invoke('route:tally'),
  faithJudge: (pairs) => ipcRenderer.invoke('faith:judge', pairs),
  onClosing: (fn) => ipcRenderer.on('app:closing', () => fn()),
  ctx: {
    onOpen: (fn) => {
      const h = (_e, m) => fn(m)
      ipcRenderer.on('ctx:open', h)
      return () => ipcRenderer.removeListener('ctx:open', h)
    },
    pick: (i) => ipcRenderer.send('ctx:pick', i),
  },
  closeReady: () => ipcRenderer.send('app:close-ready'),
  existing: (paths) => ipcRenderer.invoke('fs:existing', paths),
  remote: {
    hosts: () => ipcRenderer.invoke('remote:hosts'),
    check: (host, dir) => ipcRenderer.invoke('remote:check', host, dir),
    forward: (sid, port) => ipcRenderer.invoke('remote:forward', sid, port),
    worktree: (sid, act) => ipcRenderer.invoke('remote:worktree', sid, act),
  },
  issue: {
    list: (cwd) => ipcRenderer.invoke('issue:list', cwd),
    get: (repo, n) => ipcRenderer.invoke('issue:get', repo, n),
    spec: (worktree, repo, issue) => ipcRenderer.invoke('issue:spec', worktree, repo, issue),
  },
  sdraft: {
    list: () => ipcRenderer.invoke('sdraft:list'),
    save: (row) => ipcRenderer.invoke('sdraft:save', row),
    discard: (id) => ipcRenderer.invoke('sdraft:discard', id),
    approve: (id, draft, scope, replace, acknowledged) => ipcRenderer.invoke('sdraft:approve', id, draft, scope, replace, acknowledged),
    import: (url, cwd) => ipcRenderer.invoke('sdraft:import', url, cwd),
    factory: (cwd) => ipcRenderer.invoke('sdraft:factory', cwd),
    existing: (cwd, name, scope) => ipcRenderer.invoke('sdraft:existing', cwd, name, scope),
  },
  past: {
    search: (q, cwd, mode) => ipcRenderer.invoke('past:search', q, cwd, mode),
    index: () => ipcRenderer.invoke('past:index'),
    around: (file, n, before) => ipcRenderer.invoke('past:around', file, n, before),
  },
  setupOpen: (url) => ipcRenderer.invoke('setup:open', url),
  catalogLocal: (cwd, fresh) => ipcRenderer.invoke('catalog:local', cwd, fresh),
  catalogSearch: (q) => ipcRenderer.invoke('catalog:search', q),
  catalogReadme: (url) => ipcRenderer.invoke('catalog:readme', url),
  installPlugin: (id) => ipcRenderer.invoke('plugin:install', id),
  uninstallPlugin: (id) => ipcRenderer.invoke('plugin:uninstall', id),
  addMarketplace: (repo) => ipcRenderer.invoke('marketplace:add', repo),
  addMcp: (c) => ipcRenderer.invoke('mcp:add', c),
  memoryInfo: (cwd) => ipcRenderer.invoke('memory:info', cwd),
  memorySearch: (cwd, q) => ipcRenderer.invoke('memory:search', cwd, q),
  memoryGraph: () => ipcRenderer.invoke('memory:graph'),
  memoryDoc: (kind, cwd) => ipcRenderer.invoke('memory:doc', kind, cwd),
  memorySaveDoc: (kind, cwd, text) => ipcRenderer.invoke('memory:saveDoc', kind, cwd, text),
  memoryRead: (file) => ipcRenderer.invoke('memory:read', file),
  remember: (cwd, title, text) => ipcRenderer.invoke('memory:remember', cwd, title, text),
  timeGet: () => ipcRenderer.invoke('time:get'),
  timeSet: (log) => ipcRenderer.invoke('time:set', log),
  spotifyNow: () => ipcRenderer.invoke('spotify:now'),
  spotifyCmd: (c) => ipcRenderer.invoke('spotify:cmd', c),
  spotifySaved: () => ipcRenderer.invoke('spotify:saved'),
  spotifyAdd: (link) => ipcRenderer.invoke('spotify:add', link),
  spotifyRemove: (uri) => ipcRenderer.invoke('spotify:remove', uri),
  ciRefresh: (sid) => ipcRenderer.invoke('ci:refresh', sid),
  ciJobs: (sid, runId) => ipcRenderer.invoke('ci:jobs', sid, runId),
  ciLog: (sid, jobId) => ipcRenderer.invoke('ci:log', sid, jobId),
  ciRerun: (sid, runId) => ipcRenderer.invoke('ci:rerun', sid, runId),
  ciCancel: (sid, runId) => ipcRenderer.invoke('ci:cancel', sid, runId),
  setScheme: (scheme) => ipcRenderer.invoke('theme:scheme', scheme),
  publishDraft: (sid, brief, networks) => ipcRenderer.invoke('publish:draft', sid, brief, networks),
  lock: {
    get: () => ipcRenderer.invoke('lock:get'),
    set: (prefs) => ipcRenderer.invoke('lock:set', prefs),
    prompt: (reason, method) => ipcRenderer.invoke('lock:prompt', reason, method),
    onLock: (cb) => {
      const l = () => cb()
      ipcRenderer.on('lock:now', l)
      return () => ipcRenderer.removeListener('lock:now', l)
    },
  },
  openAtLogin: (on) => ipcRenderer.invoke('app:login', on),
  cloud: {
    scan: () => ipcRenderer.invoke('cloud:scan'),
    repoSecrets: () => ipcRenderer.invoke('cloud:repo-secrets'),
  },
  env: {
    scan: () => ipcRenderer.invoke('env:scan'),
    toVault: (path, name, as) => unlocked('save a secret').then(() => ipcRenderer.invoke('env:to-vault', path, name, as)),
    ignore: (path) => ipcRenderer.invoke('env:ignore', path),
    reveal: (path) => ipcRenderer.invoke('env:reveal', path),
  },
  account: (sid) => ipcRenderer.invoke('session:account', sid),
  updateCheck: (auto) => ipcRenderer.invoke('update:check', Boolean(auto)),
  updateAuto: (on) => ipcRenderer.invoke('update:auto', on),
  updateAsked: () => ipcRenderer.invoke('update:asked'),
  claudeUsageData: (on) => ipcRenderer.invoke('claude:usage-data', on),
  updateRun: () => ipcRenderer.invoke('update:run'),
  onUpdateProgress: (cb) => {
    const l = (_e, m) => cb(m)
    ipcRenderer.on('update:progress', l)
    return () => ipcRenderer.removeListener('update:progress', l)
  },
  health: () => ipcRenderer.invoke('health:get'),
  sleepPanel: (sid) => ipcRenderer.invoke('health:sleep-panel', sid),
  searchSymbols: (q) => ipcRenderer.invoke('markets:search', q),
  predictions: (filter) => ipcRenderer.invoke('markets:predictions', filter),
  quotes: (symbols) => ipcRenderer.invoke('markets:quotes', symbols),
  calendar: {
    list: () => ipcRenderer.invoke('calendar:list'),
    add: (name, url) => ipcRenderer.invoke('calendar:add', name, url),
    remove: (name) => ipcRenderer.invoke('calendar:remove', name),
    events: (from, to) => ipcRenderer.invoke('calendar:events', from, to),
  },
  news: {
    feeds: () => ipcRenderer.invoke('news:feeds'),
    fetch: () => ipcRenderer.invoke('news:fetch'),
    add: (input) => ipcRenderer.invoke('news:add', input),
    suggested: () => ipcRenderer.invoke('news:suggested'),
    remove: (url) => ipcRenderer.invoke('news:remove', url),
    rsshub: (url) => ipcRenderer.invoke('news:rsshub', url),
    discover: (input) => ipcRenderer.invoke('news:discover', input),
    subscribe: (f) => ipcRenderer.invoke('news:subscribe', f),
    read: (url) => ipcRenderer.invoke('news:read', url),
    setup: () => ipcRenderer.invoke('news:setup'),
    rules: (r) => ipcRenderer.invoke('news:rules', r),
    senders: (l) => ipcRenderer.invoke('news:senders', l),
    newsletter: (id) => ipcRenderer.invoke('news:newsletter', id),
    opmlImport: (chosen) => ipcRenderer.invoke('news:opmlImport', chosen),
    opmlExport: (dir) => ipcRenderer.invoke('news:opmlExport', dir),
    digest: (items, save) => ipcRenderer.invoke('news:digest', items, save),
    briefing: (name) => ipcRenderer.invoke('news:briefing', name),
    schedule: (s) => ipcRenderer.invoke('news:schedule', s),
  },
  billing: {
    all: () => ipcRenderer.invoke('billing:all'),
    fixed: () => ipcRenderer.invoke('billing:getFixed'),
    setFixed: (f) => ipcRenderer.invoke('billing:fixed', f),
  },
  naming: {
    check: (name) => ipcRenderer.invoke('naming:check', name),
    links: (name) => ipcRenderer.invoke('naming:links', name),
    research: (idea, name) => ipcRenderer.invoke('naming:research', idea, name),
  },
  pr: {
    inbox: () => ipcRenderer.invoke('pr:inbox'),
    detail: (repo, n) => ipcRenderer.invoke('pr:detail', repo, n),
    comment: (repo, n, body) => ipcRenderer.invoke('pr:comment', repo, n, body),
    review: (repo, n, event, body) => ipcRenderer.invoke('pr:review', repo, n, event, body),
    merge: (repo, n, method) => ipcRenderer.invoke('pr:merge', repo, n, method),
    checkout: (sid, repo, n) => ipcRenderer.invoke('pr:checkout', sid, repo, n),
  },
  docker: {
    containers: () => ipcRenderer.invoke('docker:containers'),
    images: () => ipcRenderer.invoke('docker:images'),
    volumes: () => ipcRenderer.invoke('docker:volumes'),
    act: (op, id, confirmed) => ipcRenderer.invoke('docker:act', op, id, confirmed),
    logs: (id) => ipcRenderer.invoke('docker:logs', id),
    exec: (id, command, confirmed) => ipcRenderer.invoke('docker:exec', id, command, confirmed),
    removeImage: (id, confirmed) => ipcRenderer.invoke('docker:rmi', id, confirmed),
    removeVolume: (name, confirmed) => ipcRenderer.invoke('docker:rmv', name, confirmed),
    hosts: () => ipcRenderer.invoke('docker:hosts'),
    setHost: (name) => ipcRenderer.invoke('docker:host', name),
    setWritable: (name, on) => ipcRenderer.invoke('docker:writable', name, on),
  },
  ports: () => ipcRenderer.invoke('ports:list'),
  killProcess: (pid, force) => ipcRenderer.invoke('ports:kill', pid, force),
  git: (op, sid, ...args) => ipcRenderer.invoke(`git:${op}`, sid, ...args),
  pickFolder: () => ipcRenderer.invoke('session:pick'),
  template: { plan: (id, dir) => ipcRenderer.invoke('template:plan', id, dir), apply: (id, dir, replace) => ipcRenderer.invoke('template:apply', id, dir, replace) },
  findRepos: () => ipcRenderer.invoke('folders:repos'),
  setPrivate: (on) => ipcRenderer.invoke('privacy:set', on),
  runShell: (sid, command) => ipcRenderer.invoke('shell:run', sid, command),
  stopShell: (sid, id) => ipcRenderer.invoke('shell:stop', sid, id),
  send: (sid, text, attachments, why) => ipcRenderer.invoke('chat:send', sid, text, attachments, why),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  attachPaths: (paths) => ipcRenderer.invoke('files:attach', paths),
  readPicked: (path) => ipcRenderer.invoke('files:read', path),
  filePick: {
    list: (dir, hidden) => ipcRenderer.invoke('filepick:list', dir, hidden),
    project: (dir, hidden) => ipcRenderer.invoke('filepick:project', dir, hidden),
    recent: (attached, hidden) => ipcRenderer.invoke('filepick:recent', attached, hidden),
    thumb: (path) => ipcRenderer.invoke('filepick:thumb', path),
  },
  isDir: (path) => ipcRenderer.invoke('files:isDir', path),
  // where a dropped or pasted file lives on disk (Electron no longer puts it on File)
  pathOf: (file) => webUtils.getPathForFile(file),
  interrupt: (sid) => ipcRenderer.invoke('chat:interrupt', sid),
  loopSettings: (next) => ipcRenderer.invoke('loop:settings', next),
  loopQuiet: (sid) => ipcRenderer.invoke('loop:quiet', sid),
  answer: (sid, id, allow, extra) => ipcRenderer.invoke('perm:answer', sid, id, allow, extra),
  onEvent: (fn) => {
    const listener = (_e, sid, ev) => fn(sid, ev)
    ipcRenderer.on('chat:event', listener)
    return () => ipcRenderer.removeListener('chat:event', listener)
  },
})
