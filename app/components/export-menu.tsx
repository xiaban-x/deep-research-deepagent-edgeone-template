'use client';

import { useState, useRef, useEffect } from 'react';
import { marked } from 'marked';
import { useI18n } from '@/lib/i18n';
import type { Source } from '@/app/page';
import {
  sourcesToBibtex,
  sourcesToRis,
  sourcesToCslJson,
  downloadText,
} from '@/lib/citations';
import {
  markdownToLatexDocument,
  printReportAsPDF,
  stripTrailingReferencesSection,
} from '@/lib/latex';

interface ExportMenuProps {
  report: string;
  sources: Source[];
  /** Filename stem (no extension). Defaults to "research-report". */
  filename?: string;
}

interface MenuItem {
  label: string;
  description: string;
  onSelect: () => void;
}

/**
 * Wrap [N] markers in HTML output with `<a href="#source-N">` so the printed
 * PDF retains clickable internal links to the References block. Mirrors the
 * logic in ReportView's injectCitationLinks but operates on a one-shot
 * string for the print window (no DOMParser available there at write-time).
 */
function injectCitationLinksForPrint(html: string, validNumbers: Set<number>): string {
  // Naive but adequate: replace [N] outside <pre>/<code> blocks. We split on
  // those tags first so we don't touch their contents.
  const segments = html.split(/(<(?:pre|code)[\s\S]*?<\/(?:pre|code)>)/i);
  return segments.map(seg => {
    if (/^<(?:pre|code)/i.test(seg)) return seg;
    return seg.replace(/[\[\uFF3B](\d+)[\]\uFF3D]/g, (full, numStr) => {
      const num = Number(numStr);
      if (!validNumbers.has(num)) {
        return `<span class="ghost">${full}</span>`;
      }
      return `<a class="citation-link" href="#source-${num}">${full}</a>`;
    });
  }).join('');
}

/**
 * Export dropdown — the differentiating feature for a research-report tool.
 *
 * Plain markdown is for blogs; researchers want their citations to drop
 * straight into Zotero / Mendeley / EndNote / Overleaf. We export:
 *
 *   - Markdown (.md)         — the report body, what most users want
 *   - BibTeX (.bib)          — for LaTeX / Overleaf workflows
 *   - RIS (.ris)             — for EndNote / Zotero / Mendeley import
 *   - CSL-JSON (.json)       — canonical interchange (Pandoc, citeproc)
 *   - Markdown + BibTeX      — single zip-style "academic bundle" (concatenated)
 */
export function ExportMenu({ report, sources, filename = 'research-report' }: ExportMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const academicCount = sources.filter(s => s.type === 'academic').length;
  const hasSources = sources.length > 0;

  const items: MenuItem[] = [
    {
      label: t.exportMarkdown,
      description: t.exportMarkdownDesc,
      onSelect: () => downloadText(report, `${filename}.md`, 'text/markdown'),
    },
    {
      label: t.exportLatex,
      description: t.exportLatexDesc,
      onSelect: () => {
        // Single self-contained .tex — the References block is hand-rolled
        // inside the document so users don't need a sidecar refs.bib file
        // and don't need to run biber. Users who want a real .bib for
        // Zotero / Mendeley / Overleaf import can still grab it from the
        // dedicated "BibTeX (.bib)" entry below.
        downloadText(
          markdownToLatexDocument(report, sources, { title: filename, referencesLabel: t.references }),
          `${filename}.tex`,
          'application/x-tex',
        );
      },
    },
    {
      label: t.exportPdf,
      description: t.exportPdfDesc,
      onSelect: () => {
        // Strip any trailing References / 参考文献 the synthesizer wrote
        // inline so we don't end up with two reference sections in the PDF
        // (one inline, one from our structured References block below).
        const cleaned = stripTrailingReferencesSection(report);
        // Render markdown → HTML, then post-process to wrap [N] citations in
        // clickable <a href="#source-N"> links so the resulting PDF has
        // working internal jumps.
        const rawHtml = marked.parse(cleaned) as string;
        const linked = injectCitationLinksForPrint(rawHtml, new Set(sources.map(s => s.citationNumber)));
        printReportAsPDF(linked, sources, filename, t.references);
      },
    },
    {
      label: t.exportBibtex,
      description: t.exportBibtexDesc.replace('{n}', String(sources.length)),
      onSelect: () => downloadText(sourcesToBibtex(sources), `${filename}.bib`, 'application/x-bibtex'),
    },
    {
      label: t.exportRis,
      description: t.exportRisDesc.replace('{n}', String(sources.length)),
      onSelect: () => downloadText(sourcesToRis(sources), `${filename}.ris`, 'application/x-research-info-systems'),
    },
    {
      label: t.exportCslJson,
      description: t.exportCslJsonDesc.replace('{n}', String(sources.length)),
      onSelect: () => downloadText(sourcesToCslJson(sources), `${filename}.json`, 'application/vnd.citationstyles.csl+json'),
    },
  ];

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {t.export}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
            <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              {t.exportFormatsTitle}
            </p>
            {hasSources && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-500 mt-0.5">
                {t.exportSourcesSummary
                  .replace('{total}', String(sources.length))
                  .replace('{academic}', String(academicCount))}
              </p>
            )}
          </div>
          <div className="py-1">
            {items.map((item, i) => {
              // Citation-only formats (BibTeX/RIS/CSL-JSON, last three) need
              // sources. Everything else works with just the report body.
              // LaTeX (.tex) also needs sources because it pairs with refs.bib.
              const isCitationFormat = i >= items.length - 3;
              const isLatex = i === 1;
              const disabled = (isCitationFormat || isLatex) && !hasSources;
              return (
                <button
                  key={i}
                  onClick={() => { if (!disabled) { item.onSelect(); setOpen(false); } }}
                  disabled={disabled}
                  className={`w-full text-left px-3 py-2 transition-colors ${
                    disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    {item.label}
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-500 mt-0.5">
                    {disabled ? t.exportNoSources : item.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
