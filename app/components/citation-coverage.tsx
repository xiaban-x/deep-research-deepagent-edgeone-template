'use client';

import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Source } from '@/app/page';
import { analyzeCitations } from '@/lib/citations';

interface CitationCoverageProps {
  report: string;
  sources: Source[];
}

/**
 * Citation Coverage panel — a deep-research-specific feature absent from
 * blog/SEO templates. Surfaces three quality signals:
 *
 *   1. **Coverage %** — what fraction of paragraphs cite something.
 *      Below 60% = the report is making claims without backing them up.
 *   2. **Uncited sources** — sources that ended up in the panel but never
 *      got referenced in the body. The model hallucinated their relevance
 *      or the synthesizer forgot them.
 *   3. **Ghost citations** — [N] numbers in the body that don't map to any
 *      source. Hard quality bug — citations point to nothing.
 *
 * All three are silent failure modes that plain word-count / readability
 * tools (the kind content-creator has) won't catch. This is exactly what
 * a researcher / fact-checker needs.
 */
export function CitationCoverage({ report, sources }: CitationCoverageProps) {
  const { t } = useI18n();
  const stats = useMemo(() => analyzeCitations(report, sources), [report, sources]);

  if (!report || stats.totalSources === 0) return null;

  const coverageColor =
    stats.coveragePercent >= 70 ? 'text-emerald-600 dark:text-emerald-400' :
    stats.coveragePercent >= 40 ? 'text-amber-600 dark:text-amber-400' :
    'text-red-600 dark:text-red-400';

  const coverageBg =
    stats.coveragePercent >= 70 ? 'bg-emerald-500' :
    stats.coveragePercent >= 40 ? 'bg-amber-500' :
    'bg-red-500';

  const hasIssues = stats.ghostCitations.length > 0 || stats.uncitedSources.length > 0;

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t.citationCoverage}
          </span>
          {!hasIssues && (
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">
              {t.citationGood}
            </span>
          )}
          {hasIssues && (
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
              {t.citationIssues.replace('{n}', String(stats.ghostCitations.length + stats.uncitedSources.length))}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {/* Coverage gauge */}
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs text-neutral-600 dark:text-neutral-400">
              {t.coveragePercentLabel}
            </span>
            <span className={`text-lg font-semibold tabular-nums ${coverageColor}`}>
              {stats.coveragePercent}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
            <div
              className={`h-full ${coverageBg} transition-all`}
              style={{ width: `${Math.min(100, stats.coveragePercent)}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-500 mt-1.5">
            {t.coverageHint
              .replace('{cited}', String(stats.paragraphsWithCitations))
              .replace('{total}', String(stats.paragraphs))}
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="text-center px-2 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
            <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums">
              {stats.citedSources}/{stats.totalSources}
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-500 leading-tight mt-0.5">
              {t.citedSources}
            </div>
          </div>
          <div className="text-center px-2 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
            <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums">
              {stats.citedNumbers.length}
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-500 leading-tight mt-0.5">
              {t.citationsUsed}
            </div>
          </div>
          <div className="text-center px-2 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
            <div className={`text-lg font-semibold tabular-nums ${stats.ghostCitations.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-800 dark:text-neutral-200'}`}>
              {stats.ghostCitations.length}
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-500 leading-tight mt-0.5">
              {t.ghostCitations}
            </div>
          </div>
        </div>

        {/* Issues */}
        {stats.ghostCitations.length > 0 && (
          <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.27 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  {t.ghostCitationsTitle}
                </p>
                <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5">
                  {t.ghostCitationsDesc}
                </p>
                <p className="text-[11px] font-mono text-red-700 dark:text-red-300 mt-1.5">
                  {stats.ghostCitations.map(n => `[${n}]`).join(' ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {stats.uncitedSources.length > 0 && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 p-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {t.uncitedSourcesTitle.replace('{n}', String(stats.uncitedSources.length))}
                </p>
                <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                  {t.uncitedSourcesDesc}
                </p>
                <ul className="mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
                  {stats.uncitedSources.slice(0, 6).map((s) => (
                    <li key={s.citationNumber} className="text-[11px] text-amber-700 dark:text-amber-300 truncate">
                      <span className="font-mono">[{s.citationNumber}]</span>{' '}
                      <span className="text-amber-600/80 dark:text-amber-400/80">{s.title}</span>
                    </li>
                  ))}
                  {stats.uncitedSources.length > 6 && (
                    <li className="text-[11px] text-amber-600/60 dark:text-amber-400/60 italic">
                      …{t.andMoreSources.replace('{n}', String(stats.uncitedSources.length - 6))}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
