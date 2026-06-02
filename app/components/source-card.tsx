'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';
import type { Source } from '../page';

interface SourceCardProps {
  source: Source;
}

export function SourceCard({ source }: SourceCardProps) {
  const { t } = useI18n();
  const isAcademic = source.type === 'academic';
  const href = isAcademic
    ? (source.doi ? `https://doi.org/${source.doi}` : undefined)
    : source.url;

  const content = (
    <div className={`p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 ${href ? 'hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors cursor-pointer' : ''} ${isAcademic ? 'source-card-academic' : 'source-card-web'}`}>
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-mono font-bold text-neutral-600 dark:text-neutral-400">
          {source.citationNumber}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2">
            {source.title || '(Untitled)'}
          </h4>

          {isAcademic ? (
            <div className="mt-1 space-y-0.5">
              {source.authors && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                  {Array.isArray(source.authors) ? source.authors.join(', ') : source.authors}
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
                {source.journal && <span>{source.journal}</span>}
                {source.year ? <span>{source.year}</span> : null}
              </div>
            </div>
          ) : (
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
                {source.source && <span>{source.source}</span>}
                {source.date && <span>{source.date}</span>}
              </div>
              {source.snippet && (
                <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                  {source.snippet}
                </p>
              )}
            </div>
          )}

          <div className="mt-1.5">
            <Badge variant={isAcademic ? 'academic' : 'web'}>
              {isAcademic ? t.academic : t.web}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block no-underline">
        {content}
      </a>
    );
  }

  return content;
}
