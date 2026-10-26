"""SuperToken web reader: one page as clean Markdown, read on this Mac with Crawl4AI (Apache-2.0).

  python read.py URL [MAX_CHARS] [OPTIONS_JSON]
OPTIONS_JSON: {"question", "cache": "enabled|bypass|read_only", "robots": true, "schema": {...}, "links": true}
Prints one JSON line: {"url", "title", "markdown", "chars", "rawChars", "truncated", "links"?, "items"?} or {"error"}.
This project uses Crawl4AI: https://github.com/unclecode/crawl4ai
"""
import asyncio
import json
import os
import sys

os.environ.setdefault('CRAWL4AI_NO_CLOUD_NOTICE', '1')

CACHE = {'enabled': 'ENABLED', 'bypass': 'BYPASS', 'read_only': 'READ_ONLY'}


async def read(url: str, limit: int, opt: dict):
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig, JsonCssExtractionStrategy
    from crawl4ai.content_filter_strategy import BM25ContentFilter, PruningContentFilter
    from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

    q = (opt.get('question') or '').strip()
    # with a question, only the passages that match it; without one, the page with its boilerplate pruned
    filt = BM25ContentFilter(user_query=q, bm25_threshold=1.0) if q else PruningContentFilter(threshold=0.45)
    run = CrawlerRunConfig(
        cache_mode=getattr(CacheMode, CACHE.get(opt.get('cache') or 'enabled', 'ENABLED')),
        check_robots_txt=opt.get('robots', True) is not False,
        markdown_generator=DefaultMarkdownGenerator(content_filter=filt),
        extraction_strategy=JsonCssExtractionStrategy(opt['schema']) if opt.get('schema') else None,
        page_timeout=45000,
        verbose=False,
    )
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
        r = await crawler.arun(url=url, config=run)
    if not r.success:
        msg = r.error_message or 'The page did not load.'
        if getattr(r, 'status_code', None) == 403 and 'robots' in msg.lower():
            msg = 'robots.txt does not allow reading this page.'
        return {'error': msg[:400]}
    if (getattr(r, 'status_code', None) or 200) >= 400:
        return {'error': f'The page answered {r.status_code}.'}
    md = r.markdown
    fit = (getattr(md, 'fit_markdown', None) or '').strip()
    raw = (getattr(md, 'raw_markdown', None) or str(md or '')).strip()
    # a question that matches nothing falls back to the whole page rather than to nothing
    text = fit or raw
    out = {'url': r.url, 'title': (r.metadata or {}).get('title') or '', 'markdown': text[:limit], 'chars': len(text), 'rawChars': len(r.html or ''), 'truncated': len(text) > limit, 'fit': bool(fit) and bool(q)}
    if opt.get('links'):
        out['links'] = [{'href': l.get('href'), 'text': (l.get('text') or '')[:120]} for l in (r.links or {}).get('internal', [])[:200] if l.get('href')]
    if opt.get('schema'):
        try:
            out['items'] = json.loads(r.extracted_content or '[]')
        except ValueError:
            out['items'] = []
    return out


def main():
    url = sys.argv[1] if len(sys.argv) > 1 else ''
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 40000
    try:
        opt = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    except ValueError:
        opt = {}
    if not url.startswith(('http://', 'https://')):
        print(json.dumps({'error': 'Only http and https pages.'}))
        return
    try:
        out = asyncio.run(read(url, max(1000, min(limit, 200000)), opt))
    except Exception as e:  # the reader says what went wrong instead of a stack trace
        out = {'error': str(e)[:400]}
    print(json.dumps(out), flush=True)


if __name__ == '__main__':
    main()
