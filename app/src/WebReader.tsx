import { useEffect, useState } from 'react'
import { IconClose, IconTrash } from './icons'
import { RowAct, RowActs } from './RowActs'
import type { CacheMode, CacheRule } from '../shared/leanfetch'
import type { Crawl, Page, WebConfig } from '../electron/web/reader'
import { StateMark } from './StateMark'
import { clean } from './errors'
import './bridge'

const MODES: Record<CacheMode, string> = { enabled: 'Cache on', bypass: 'Always fresh', read_only: 'Saved copy only' }
const STOP: Record<Crawl['stop'], string> = { covered: 'the question is covered', 'no-gain': 'the last pages added nothing new', 'max-pages': 'the page cap', 'no-links': 'no more relevant links' }

/**
 * Web reader: try a page or a crawl with a question and see what would reach the model, the cache rule
 * per address, the SearXNG address search uses, and the schemas the model saved to extract for free.
 */
export function WebReaderSheet(props: { onClose: () => void }) {
  const [cfg, setCfg] = useState<(WebConfig & { ready: boolean }) | null>(null)
  const [err, setErr] = useState('')
  const [url, setUrl] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<'page' | 'crawl' | null>(null)
  const [page, setPage] = useState<Page | null>(null)
  const [crawl, setCrawl] = useState<Crawl | null>(null)
  const [rule, setRule] = useState<CacheRule>({ prefix: '', mode: 'bypass' })
  const [searx, setSearx] = useState('')
  const [ran, setRan] = useState<Record<string, string>>({})
  const load = () => void window.stm.reader.config().then((c) => (setCfg(c), setSearx(c.searchUrl)), (e) => setErr(clean(e)))
  useEffect(load, [])
  const save = (p: Promise<WebConfig>) => void p.then(load, (e) => setErr(clean(e)))
  const tryIt = async (mode: 'page' | 'crawl') => {
    setBusy(mode)
    setErr('')
    setPage(null)
    setCrawl(null)
    try {
      const r = await window.stm.reader.tryRead(url.trim(), q.trim(), mode)
      if (r.page?.error) setErr(r.page.error)
      else if (r.page) setPage(r.page)
      if (r.crawl) setCrawl(r.crawl)
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(null)
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet webreader" role="dialog" aria-label="Web reader">
        <header className="sheet-head">
          <div className="sheet-title">Web reader</div>
          <span className="faint">Pages read on this Mac, trimmed to the question. robots.txt is always checked.</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="dsg-body">
          {cfg && !cfg.ready && <div className="notice">The reader's engine is not installed yet: Connections, Web reader, Install (about 450 MB, once).</div>}
          {err && <div className="notice error">{err}</div>}
          <div className="sp-label">Try it</div>
          <div className="dep-row">
            <input id="wr-url" value={url} placeholder="https://docs.example.com" onChange={(e) => setUrl(e.target.value)} />
            <input id="wr-q" value={q} placeholder="Question, e.g. what are the fees" onChange={(e) => setQ(e.target.value)} />
            <button className="ghost small" disabled={!!busy || !url.trim()} onClick={() => void tryIt('page')}>{busy === 'page' ? <><StateMark state="busy" label="Reading" /> Reading…</> : 'Read page'}</button>
            <button className="primary small" disabled={!!busy || !url.trim() || q.trim().length < 3} onClick={() => void tryIt('crawl')}>{busy === 'crawl' ? <><StateMark state="busy" label="Crawling" /> Crawling…</> : 'Crawl to answer'}</button>
          </div>
          {page && (
            <div className="wr-out">
              <div className="wr-meta"><b>{page.title || page.url}</b><span className="faint">{page.rawChars?.toLocaleString('en-US')} characters of HTML → {page.markdown?.length.toLocaleString('en-US')} sent{q && (page.fit ? ', only the matching passages' : ', nothing matched closely so the whole page')}</span></div>
              <pre className="tr-text">{page.markdown}</pre>
            </div>
          )}
          {crawl && (
            <div className="wr-out">
              <div className="wr-meta"><StateMark state={crawl.stop === 'covered' ? 'up' : 'warn'} label={crawl.stop} /><b>{crawl.pages.length} page{crawl.pages.length === 1 ? '' : 's'} read; stopped at {STOP[crawl.stop]}</b>{crawl.missing.length > 0 && <span className="faint">Not found: {crawl.missing.join(', ')}</span>}</div>
              <ol className="wr-pages">
                {crawl.pages.map((p) => (
                  <li key={p.url}><span className="wr-share">{Math.round(p.share * 100)}%</span><a href={p.url} target="_blank" rel="noreferrer">{p.url}</a><span className="faint">{p.markdown.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').slice(0, 140)}</span></li>
                ))}
                {crawl.skipped.map((s) => <li key={s.url} className="bad"><span className="wr-share">skip</span><span>{s.url}</span><span className="faint">{s.error}</span></li>)}
              </ol>
            </div>
          )}
          <div className="sp-label">Cache by address</div>
          <div className="wr-rules">
            {(cfg?.cache ?? []).map((r) => (
              <div key={r.prefix} className="wr-rule row-host">
                <code>{r.prefix}</code>
                <span className="faint">{MODES[r.mode]}</span>
                <RowActs><RowAct label={`Remove the rule for ${r.prefix}`} icon={<IconTrash />} danger onClick={() => save(window.stm.reader.setCache(cfg!.cache.filter((x) => x.prefix !== r.prefix)))} /></RowActs>
              </div>
            ))}
            <div className="dep-row">
              <input id="wr-prefix" value={rule.prefix} placeholder="https://status.example.com/" onChange={(e) => setRule({ ...rule, prefix: e.target.value })} />
              <div className="segmented small" role="radiogroup" aria-label="Cache mode">
                {(Object.keys(MODES) as CacheMode[]).map((m) => <button key={m} role="radio" aria-checked={rule.mode === m} aria-selected={rule.mode === m} onClick={() => setRule({ ...rule, mode: m })}>{MODES[m]}</button>)}
              </div>
              <button className="ghost small" disabled={!/^https?:\/\//.test(rule.prefix)} onClick={() => (save(window.stm.reader.setCache([...(cfg?.cache ?? []).filter((x) => x.prefix !== rule.prefix), rule])), setRule({ prefix: '', mode: 'bypass' }))}>Add</button>
            </div>
            <div className="faint">Every other address uses the cache. Fresh for pages that change often; saved copy only to never fetch again.</div>
          </div>
          <div className="sp-label">Search</div>
          <div className="dep-row">
            <input id="wr-searx" value={searx} placeholder="http://127.0.0.1:8888 (your SearXNG)" onChange={(e) => setSearx(e.target.value)} />
            <button className="ghost small" onClick={() => save(window.stm.reader.setSearch(searx))}>Save</button>
          </div>
          <div className="faint">search_web asks this SearXNG, reads the top pages with the question and hands Claude numbered sources. Turn on the json format in its settings.yml.</div>
          <div className="sp-label">Learned schemas · run with no model</div>
          {(cfg?.schemas ?? []).length === 0 && <div className="faint">None yet. Ask a panel to "save a schema for the prices on this page"; it looks once, then extract costs nothing.</div>}
          <div className="wr-rules">
            {(cfg?.schemas ?? []).map((s) => (
              <div key={s.name} className="wr-schema">
                <div className="wr-rule row-host">
                  <b>{s.name}</b>
                  <code>{s.prefix}</code>
                  <span className="faint">{s.fields.map((f) => f.name).join(', ')} · run {s.runs} time{s.runs === 1 ? '' : 's'}</span>
                  <span className="spacer-flex" />
                  <button className="ghost small" disabled={!url.trim().startsWith(s.prefix)} data-tip={url.trim().startsWith(s.prefix) ? `Run on ${url.trim()}` : `Put a page under ${s.prefix} in Try it to run it`} onClick={() => void window.stm.reader.extract(url.trim(), s.name).then((r) => (setRan({ ...ran, [s.name]: r.error ?? JSON.stringify(r.items, null, 1) }), load()), (e) => setErr(clean(e)))}>Run</button>
                  <RowActs><RowAct label={`Forget ${s.name}`} icon={<IconTrash />} danger onClick={() => save(window.stm.reader.dropSchema(s.name))} /></RowActs>
                </div>
                {ran[s.name] && <pre className="tr-text">{ran[s.name]}</pre>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
