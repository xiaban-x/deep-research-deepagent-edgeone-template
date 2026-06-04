'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { ExportMenu } from './export-menu';
import { stripTrailingReferencesSection } from '@/lib/latex';
import { formatReference } from '@/lib/citations';
import type { Source } from '../page';

interface ReportViewProps {
  content: string;
  isStreaming: boolean;
  sources?: Source[];
  /** Citation style for the app-generated References list. Defaults to APA. */
  citationStyle?: string;
}

interface CitationHover {
  source: Source;
  // Anchor coordinates relative to the scrolling container — used to position
  // the popover above the citation marker.
  top: number;
  left: number;
}

/**
 * Wrap every `[N]` citation marker in a `<a class="citation-link" data-cite="N">`
 * after marked() has produced HTML. Walks the DOM to skip code blocks (where
 * `[1]` might be code, not a citation). The links power both the hover preview
 * and the click-to-jump-to-source-card behavior.
 */
function injectCitationLinks(html: string, validNumbers: Set<number>): string {
  if (!html) return html;
  // Use a DOMParser so we can skip <pre><code> safely without regex headaches.
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstChild as HTMLElement | null;
  if (!root) return html;

  const skip = new Set(['CODE', 'PRE', 'A', 'SCRIPT', 'STYLE']);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p: Node | null = node.parentNode;
      while (p && p !== root) {
        if (p.nodeType === 1 && skip.has((p as HTMLElement).tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        p = p.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Collect first; mutating during walk breaks iteration.
  const targets: Text[] = [];
  let node: Node | null = walker.currentNode;
  while ((node = walker.nextNode())) {
    if (node.nodeValue && /[\[\uFF3B]\d+[\]\uFF3D]/.test(node.nodeValue)) {
      targets.push(node as Text);
    }
  }

  for (const text of targets) {
    const value = text.nodeValue || '';
    const frag = doc.createDocumentFragment();
    let lastIdx = 0;
    const re = /[\[\uFF3B](\d+)[\]\uFF3D]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(value)) !== null) {
      if (m.index > lastIdx) frag.appendChild(doc.createTextNode(value.slice(lastIdx, m.index)));
      const num = Number(m[1]);
      if (validNumbers.has(num)) {
        const a = doc.createElement('a');
        a.className = 'citation-link';
        a.setAttribute('data-cite', String(num));
        a.setAttribute('href', `#ref-${num}`);
        a.textContent = m[0];
        frag.appendChild(a);
      } else {
        // Unknown number — render as a "ghost" span so the user spots it
        // (matches the citation-coverage panel's red highlighting).
        const span = doc.createElement('span');
        span.className = 'citation-ghost';
        span.setAttribute('data-cite', String(num));
        span.setAttribute('title', `Unknown citation [${num}]`);
        span.textContent = m[0];
        frag.appendChild(span);
      }
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < value.length) frag.appendChild(doc.createTextNode(value.slice(lastIdx)));
    text.parentNode?.replaceChild(frag, text);
  }

  return root.innerHTML;
}

export function ReportView({ content, isStreaming, sources = [], citationStyle = 'apa' }: ReportViewProps) {
  const { t } = useI18n();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState<CitationHover | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);

  // Quick lookup by citationNumber for hover popover content.
  const sourceByNumber = useMemo(() => {
    const map = new Map<number, Source>();
    for (const s of sources) map.set(s.citationNumber, s);
    return map;
  }, [sources]);

  // Sources sorted by citationNumber for the app-generated References list.
  const sortedSources = useMemo(
    () => [...sources].sort((a, b) => a.citationNumber - b.citationNumber),
    [sources],
  );

  // Render the markdown — when streaming, skip the citation injection (it
  // does a full DOM parse on every chunk, which is wasteful and the partial
  // text often has incomplete `[N` markers). Inject only after streaming ends.
  //
  // Once streaming is complete we ALSO strip any trailing "References /
  // 参考文献" section the synthesizer LLM wrote inline. The on-page UI
  // already shows the canonical sources in the right-hand SourcesPanel, so
  // an extra inline list created by the model just produces a confusing
  // duplicate (the user reported "正文里有两个参考文献"). Same heuristic
  // we apply on PDF / .tex export.
  const renderedHtml = useMemo(() => {
    if (!content) return '';
    if (isStreaming || sources.length === 0) {
      return marked.parse(content) as string;
    }
    const cleaned = stripTrailingReferencesSection(content);
    const raw = marked.parse(cleaned) as string;
    const valid = new Set(sources.map(s => s.citationNumber));
    return injectCitationLinks(raw, valid);
  }, [content, isStreaming, sources]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      setShowScrollTop(el.scrollTop > 300);
      // A scroll while the popover is open would visually decouple it from
      // its citation; close it so it doesn't drift.
      if (hover) setHover(null);
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [hover]);

  // Auto-scroll during streaming
  useEffect(() => {
    if (isStreaming && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  // Citation hover + click. We attach handlers on the prose container and
  // delegate so we don't have to wire one listener per citation marker.
  const handleProseMouseOver = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('a.citation-link') as HTMLAnchorElement | null;
    if (!target || !containerRef.current) return;
    const num = Number(target.getAttribute('data-cite'));
    const source = sourceByNumber.get(num);
    if (!source) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const linkRect = target.getBoundingClientRect();
    setHover({
      source,
      top: linkRect.top - containerRect.top + containerRef.current.scrollTop,
      left: linkRect.left - containerRect.left + linkRect.width / 2,
    });
  }, [sourceByNumber]);

  const handleProseMouseOut = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as HTMLElement | null;
    // Stay open if the user moves into the popover itself.
    if (related && related.closest('.citation-popover')) return;
    setHover(null);
  }, []);

  // Reusable jump-to-reference: scrolls the report's own scroll container to
  // the app-generated References entry (`ref-N`) at the bottom of the report
  // and flashes it. The References list lives inside containerRef, so a single
  // scrollIntoView within that container is all that's needed — no nested
  // scroll-ancestor walking, no right-panel coupling.
  const jumpToSource = useCallback((num: number) => {
    const refEl = document.getElementById(`ref-${num}`);
    const container = containerRef.current;
    if (!refEl || !container) return;

    requestAnimationFrame(() => {
      // Bring the reference entry to ~80px below the container's top so it
      // sits comfortably in view rather than flush against the edge.
      const cRect = container.getBoundingClientRect();
      const rRect = refEl.getBoundingClientRect();
      const delta = (rRect.top - cRect.top) - 80;
      if (Math.abs(delta) > 1) {
        container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' });
      }
      refEl.classList.remove('source-flash');
      void refEl.offsetWidth;
      refEl.classList.add('source-flash');
    });
  }, []);

  const handleProseClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('a.citation-link') as HTMLAnchorElement | null;
    if (!target) return;
    e.preventDefault();
    const num = Number(target.getAttribute('data-cite'));
    jumpToSource(num);
  }, [jumpToSource]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // Fallback for non-secure contexts or browsers that block clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = content;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!content && !isStreaming) return null;

  return (
    <Card className="relative">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-sm font-semibold text-neutral-900 dark:text-warm-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t.researchReport}
            {isStreaming && (
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse-dot" />
            )}
          </h3>

          {content && !isStreaming && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {copied ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  )}
                </svg>
                {copied ? t.copied : t.copy}
              </Button>
              <ExportMenu report={content} sources={sources} />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="max-h-[calc(100vh-12rem)] min-h-[60vh] overflow-y-auto pr-2 relative"
        >
          {/* Loading state when waiting for report content */}
          {isStreaming && !content && (
            <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 py-4">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t.generatingReport}
            </div>
          )}
          {content && (
            <div
              ref={proseRef}
              onMouseOver={handleProseMouseOver}
              onMouseOut={handleProseMouseOut}
              onClick={handleProseClick}
              className="prose-research max-w-prose"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          )}

          {/* App-generated References list. The synthesizer no longer writes
              its own "参考文献 / References" section (it's stripped above);
              instead we render the canonical numbered list here from the
              sources panel, so every [n] resolves to a real entry and the
              numbering can never drift from the source list. Each entry is
              the jump target (`ref-N`) for the inline citation links. */}
          {content && !isStreaming && sortedSources.length > 0 && (
            <div className="report-references mt-10 pt-5 border-t border-neutral-200 dark:border-neutral-800">
              <h2 className="font-serif text-base font-semibold text-neutral-900 dark:text-warm-100 mb-3">
                {t.references}
              </h2>
              <ol className="space-y-2 list-none p-0 m-0">
                {sortedSources.map((s) => {
                  const link = s.doi ? `https://doi.org/${s.doi}` : s.url;
                  return (
                    <li
                      key={s.citationNumber}
                      id={`ref-${s.citationNumber}`}
                      className="reference-entry scroll-mt-4 rounded-md px-2 py-1.5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300 flex gap-2"
                    >
                      <span className="flex-shrink-0 font-mono font-semibold text-neutral-500 dark:text-neutral-500 tabular-nums">
                        [{s.citationNumber}]
                      </span>
                      <span className="min-w-0">
                        {formatReference(s, citationStyle)}
                        {link && (
                          <>
                            {' '}
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                            >
                              {s.doi ? `https://doi.org/${s.doi}` : link}
                            </a>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* Citation hover popover */}
          {hover && (
            <div
              className="citation-popover absolute z-20 w-80 max-w-[90%] rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg p-3 pointer-events-auto cursor-pointer hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
              style={{
                top: Math.max(8, hover.top - 12) + 'px',
                left: Math.max(8, Math.min(hover.left, (containerRef.current?.clientWidth || 600) - 320)) + 'px',
                transform: 'translateY(-100%)',
              }}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const num = hover.source.citationNumber;
                setHover(null);
                jumpToSource(num);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-[10px] font-mono font-bold text-neutral-600 dark:text-neutral-400">
                  {hover.source.citationNumber}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-3">
                    {hover.source.title || '(Untitled)'}
                  </p>
                  {hover.source.authors && (Array.isArray(hover.source.authors) ? hover.source.authors.length > 0 : true) && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 truncate">
                      {Array.isArray(hover.source.authors) ? hover.source.authors.join(', ') : hover.source.authors}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500 dark:text-neutral-500">
                    {hover.source.journal && <span className="truncate">{hover.source.journal}</span>}
                    {hover.source.year ? <span>· {hover.source.year}</span> : null}
                    {hover.source.source && <span className="truncate">{hover.source.source}</span>}
                    {hover.source.date && <span>· {hover.source.date}</span>}
                  </div>
                  {hover.source.abstract && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1.5 line-clamp-3">
                      {hover.source.abstract}
                    </p>
                  )}
                  {hover.source.snippet && !hover.source.abstract && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1.5 line-clamp-3">
                      {hover.source.snippet}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                {t.clickToJumpToSource}
              </div>
            </div>
          )}
        </div>

        {/* Scroll to top button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="absolute bottom-6 right-6 w-8 h-8 rounded-full bg-neutral-900 dark:bg-warm-100 text-white dark:text-neutral-900 flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
