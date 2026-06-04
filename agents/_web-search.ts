/**
 * Web search backend — multi-engine fallback chain.
 *
 * Used by the search_web tool factory in _tools.ts when the agent's
 * built-in `web_search` tool isn't available or returns nothing. Tries
 * curl-via-sandbox first (most reliable, sandbox can do TCP), then
 * falls back to runtime fetch.
 *
 * Strategy priority:
 *   S1: sandbox.commands.run + curl Bing (SSR, best for headless)
 *   S2: sandbox.commands.run + curl DuckDuckGo HTML (SSR, no JS needed)
 *   S3: safeFetch Bing (runtime fetch, may be blocked)
 *   S4: safeFetch DuckDuckGo (fallback)
 *
 * Note: sandbox.browser.goto + getContent is skipped because getContent()
 * returns empty in the current EdgeOne runtime (Chromium not fully initialized).
 */
import { createLogger, safeFetch } from './_shared';
import type { Article } from './_sources';

const logger = createLogger('web-search');

export async function searchWithBrowser(context: any, query: string): Promise<Article[]> {
  const shortQuery = query.length > 80 ? query.slice(0, 80) : query;
  logger.log(`[searchWeb] Starting web search, query="${shortQuery}"`);

  const sandbox = context?.sandbox;
  const hasCommands = sandbox?.commands?.run;

  // Strategy 1: curl Bing (most reliable for SSR results)
  if (hasCommands) {
    logger.log('[searchWeb] Strategy 1: curl Bing...');
    try {
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(shortQuery)}&count=10&setlang=zh-Hans`;
      const startTime = Date.now();
      const result = await sandbox.commands.run(
        `curl -sS --max-time 8 -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' -H 'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8' '${bingUrl}'`,
        { timeout: 12_000 }
      );
      const elapsed = Date.now() - startTime;
      const stdout = result?.stdout || '';
      logger.log(`[searchWeb] S1 curl Bing: length=${stdout.length}, elapsed=${elapsed}ms`);

      if (stdout.length > 1000) {
        const articles = parseSearchHTML(stdout, 'bing');
        logger.log(`[searchWeb] S1 curl Bing: parsed ${articles.length} articles`);
        if (articles.length >= 3) {
          logger.log(`[searchWeb] S1 SUCCESS: ${articles.length} results`);
          return articles;
        }
      }
    } catch (e) {
      logger.log(`[searchWeb] S1 ERROR: ${(e as Error).message}`);
    }

    // Strategy 2: curl DuckDuckGo HTML (lightweight, no JS)
    logger.log('[searchWeb] Strategy 2: curl DuckDuckGo HTML...');
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(shortQuery)}`;
      const startTime = Date.now();
      const result = await sandbox.commands.run(
        `curl -sS --max-time 8 -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' '${ddgUrl}'`,
        { timeout: 12_000 }
      );
      const elapsed = Date.now() - startTime;
      const stdout = result?.stdout || '';
      logger.log(`[searchWeb] S2 curl DuckDuckGo: length=${stdout.length}, elapsed=${elapsed}ms`);

      if (stdout.length > 500) {
        const articles = parseSearchHTML(stdout, 'duckduckgo');
        logger.log(`[searchWeb] S2 curl DuckDuckGo: parsed ${articles.length} articles`);
        if (articles.length > 0) {
          logger.log(`[searchWeb] S2 SUCCESS: ${articles.length} results`);
          return articles;
        }
      }
    } catch (e) {
      logger.log(`[searchWeb] S2 ERROR: ${(e as Error).message}`);
    }
  }

  // Strategy 3: safeFetch Bing (runtime fetch)
  logger.log('[searchWeb] Strategy 3: safeFetch Bing...');
  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(shortQuery)}&count=10&setlang=zh-Hans`;
    const content = await safeFetch(context, bingUrl, {
      timeout: 8_000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    if (content && content.length > 1000) {
      const articles = parseSearchHTML(content, 'bing');
      logger.log(`[searchWeb] S3 safeFetch Bing: parsed ${articles.length} articles`);
      if (articles.length > 0) {
        logger.log(`[searchWeb] S3 SUCCESS: ${articles.length} results`);
        return articles;
      }
    }
  } catch (e) {
    logger.log(`[searchWeb] S3 ERROR: ${(e as Error).message}`);
  }

  // Strategy 4: safeFetch DuckDuckGo (last resort)
  logger.log('[searchWeb] Strategy 4: safeFetch DuckDuckGo...');
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(shortQuery)}`;
    const content = await safeFetch(context, ddgUrl, {
      timeout: 8_000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    });
    if (content && content.length > 200) {
      const articles = parseSearchHTML(content, 'duckduckgo');
      logger.log(`[searchWeb] S4 safeFetch DuckDuckGo: parsed ${articles.length} articles`);
      if (articles.length > 0) {
        logger.log(`[searchWeb] S4 SUCCESS: ${articles.length} results`);
        return articles;
      }
    }
  } catch (e) {
    logger.log(`[searchWeb] S4 ERROR: ${(e as Error).message}`);
  }

  logger.log('[searchWeb] ALL STRATEGIES FAILED, returning empty');
  return [];
}

/**
 * Parse search results HTML (supports Bing, Google, DuckDuckGo, Sogou formats).
 */
function parseSearchHTML(content: string, engine: 'google' | 'duckduckgo' | 'bing' | 'sogou'): Article[] {
  const articles: Article[] = [];

  if (engine === 'sogou') {
    // Sogou results: <h3 class="vr-title"><a href="URL">Title</a></h3>
    const resultPattern = /<h3[^>]*class="[^"]*vr-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/gi;
    let match;
    while ((match = resultPattern.exec(content)) !== null && articles.length < 10) {
      const block = match[1];
      const linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (linkMatch) {
        const url = linkMatch[1];
        const title = (linkMatch[2] || '').replace(/<[^>]+>/g, '').trim();
        if (url && title && !url.includes('sogou.com')) {
          let source = '';
          try { source = new URL(url).hostname.replace('www.', ''); } catch {}
          articles.push({ title, url, snippet: '', source, date: '' });
        }
      }
    }
    // Try to get snippets from nearby paragraph/span elements
    if (articles.length === 0) {
      // Fallback: extract all external links
      const linkPattern = /<a[^>]*href="(https?:\/\/(?!.*sogou\.com)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = linkPattern.exec(content)) !== null && articles.length < 10) {
        const url = match[1];
        const title = (match[2] || '').replace(/<[^>]+>/g, '').trim();
        if (url && title && title.length > 5 && !url.includes('sogou.com') && !url.includes('javascript:')) {
          let source = '';
          try { source = new URL(url).hostname.replace('www.', ''); } catch {}
          if (!articles.some(a => a.url === url)) {
            articles.push({ title, url, snippet: '', source, date: '' });
          }
        }
      }
    }
  } else if (engine === 'duckduckgo') {
    const linkPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = linkPattern.exec(content)) !== null && articles.length < 10) {
      let url = match[1] || '';
      const title = (match[2] || '').replace(/<[^>]+>/g, '').trim();
      if (url.includes('uddg=')) {
        try {
          const uddg = new URLSearchParams(url.split('?')[1]).get('uddg');
          if (uddg) url = decodeURIComponent(uddg);
        } catch {}
      }
      if (url.startsWith('http') && title) {
        let source = '';
        try { source = new URL(url).hostname.replace('www.', ''); } catch {}
        articles.push({ title, url, snippet: '', source, date: '' });
      }
    }
    const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let snippetIdx = 0;
    while ((match = snippetPattern.exec(content)) !== null && snippetIdx < articles.length) {
      articles[snippetIdx].snippet = (match[1] || '').replace(/<[^>]+>/g, '').trim();
      snippetIdx++;
    }
  } else if (engine === 'bing') {
    // Bing results: <li class="b_algo ..."><h2><a href="URL">Title</a></h2>...
    // Pattern is lenient — class may contain additional values
    const resultPattern = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    while ((match = resultPattern.exec(content)) !== null && articles.length < 10) {
      const block = match[1];
      // Try h2 > a first (standard format)
      let linkMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      // Fallback: any a with href
      if (!linkMatch) {
        linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      }
      if (linkMatch) {
        const url = linkMatch[1];
        const title = (linkMatch[2] || '').replace(/<[^>]+>/g, '').trim();
        // Try multiple snippet patterns
        const snippetMatch = block.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
          || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
          || block.match(/<span[^>]*class="[^"]*b_caption[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        const snippet = snippetMatch ? (snippetMatch[1] || '').replace(/<[^>]+>/g, '').trim() : '';
        if (url && title && !url.includes('bing.com') && !url.includes('microsoft.com/bing')) {
          let source = '';
          try { source = new URL(url).hostname.replace('www.', ''); } catch {}
          articles.push({ title, url, snippet: snippet.slice(0, 300), source, date: '' });
        }
      }
    }
    // Secondary pattern: some Bing results use <div class="b_title"><h2><a>
    if (articles.length < 3) {
      const altPattern = /<h2[^>]*><a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/gi;
      while ((match = altPattern.exec(content)) !== null && articles.length < 10) {
        const url = match[1];
        const title = (match[2] || '').replace(/<[^>]+>/g, '').trim();
        if (url && title && !url.includes('bing.com') && !articles.some(a => a.url === url)) {
          let source = '';
          try { source = new URL(url).hostname.replace('www.', ''); } catch {}
          articles.push({ title, url, snippet: '', source, date: '' });
        }
      }
    }
    // Fallback: extract all external URLs if structured parsing failed
    if (articles.length === 0) {
      const urlPattern = /https?:\/\/[^\s"'<>&]+/g;
      const urls = (content.match(urlPattern) || []).filter((u: string) =>
        !u.includes('bing.') && !u.includes('microsoft.') && !u.includes('msn.') &&
        !u.includes('schema.org') && u.startsWith('http')
      );
      const seen = new Set<string>();
      for (const url of urls) {
        if (seen.has(url) || articles.length >= 10) continue;
        seen.add(url);
        let source = '';
        try { source = new URL(url).hostname.replace('www.', ''); } catch { continue; }
        if (source) articles.push({ title: source, url, snippet: '', source, date: '' });
      }
    }
  } else {
    // Google: extract URLs from page content
    const urlPattern = /https?:\/\/[^\s"'<>&]+/g;
    const urls = (content.match(urlPattern) || []).filter((u: string) =>
      !u.includes('google.') && !u.includes('googleapis.') && !u.includes('gstatic.') &&
      !u.includes('schema.org') && !u.includes('w3.org') && u.startsWith('http')
    );
    const seen = new Set<string>();
    for (const url of urls) {
      if (seen.has(url) || articles.length >= 10) continue;
      seen.add(url);
      let source = '';
      try { source = new URL(url).hostname.replace('www.', ''); } catch { continue; }
      if (source) articles.push({ title: source, url, snippet: '', source, date: '' });
    }
  }

  return articles;
}
