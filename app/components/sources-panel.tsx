'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { SourceCard } from './source-card';
import { useI18n } from '@/lib/i18n';
import type { Source } from '../page';

interface SourcesPanelProps {
  sources: Source[];
  onAddSource?: (source: Source) => void;
  onUpdateSource?: (source: Source) => void;
  onDeleteSource?: (citationNumber: number) => void;
  /** Triggered when the user asks to integrate a single source into the
   *  report. Receives the source plus an optional one-line instruction. */
  onRewriteFromSource?: (source: Source, instruction: string) => void;
  /** Disable mutation actions while a research run is streaming. */
  disabled?: boolean;
}

interface AddFormState {
  type: 'academic' | 'web';
  // For academic sources we offer DOI auto-fill via /enrich-doi.
  doi: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  url: string;
  enriching: boolean;
  error: string;
}

const emptyAddState: AddFormState = {
  type: 'academic', doi: '', title: '', authors: '', journal: '', year: '', url: '', enriching: false, error: '',
};

export function SourcesPanel({
  sources,
  onAddSource,
  onUpdateSource,
  onDeleteSource,
  onRewriteFromSource,
  disabled = false,
}: SourcesPanelProps) {
  const { t } = useI18n();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(emptyAddState);
  const [editingId, setEditingId] = useState<number | null>(null);
  // Filter the visible cards by type, but ALWAYS render all of them (just
  // hide the non-matching ones with `hidden`). This keeps every source-id
  // present in the DOM so the report's [N] click-to-jump works regardless
  // of which filter is active. (Previously we used a Tabs widget that
  // unmounted the inactive tab — citations to web sources couldn't scroll
  // when the academic tab was selected.)
  const [filter, setFilter] = useState<'all' | 'academic' | 'web'>('all');

  // Reset filter to "all" when the report fires `citation-jump-clear-filter`
  // (a citation pointing to a filtered-out source needs the wrapper to be
  // visible before scrollIntoView lands on it). See ReportView's
  // handleProseClick for the dispatching side.
  useEffect(() => {
    const handler = () => setFilter('all');
    window.addEventListener('citation-jump-clear-filter', handler);
    return () => window.removeEventListener('citation-jump-clear-filter', handler);
  }, []);

  if (sources.length === 0 && !onAddSource) return null;

  const academicCount = sources.filter(s => s.type === 'academic').length;
  const webCount = sources.length - academicCount;

  const handleEnrichDoi = async () => {
    const doi = addForm.doi.trim();
    if (!doi) return;
    setAddForm(s => ({ ...s, enriching: true, error: '' }));
    try {
      const res = await fetch('/enrich-doi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doi }),
      });
      const data = await res.json();
      if (!res.ok || !data.source) {
        setAddForm(s => ({ ...s, enriching: false, error: data.error || t.enrichDoiFailed }));
        return;
      }
      const src = data.source;
      setAddForm(s => ({
        ...s,
        enriching: false,
        error: '',
        title: src.title || s.title,
        authors: Array.isArray(src.authors) ? src.authors.join(', ') : (src.authors || s.authors),
        journal: src.journal || s.journal,
        year: src.year ? String(src.year) : s.year,
        url: src.url || s.url,
        doi: src.doi || doi,
      }));
    } catch (e) {
      setAddForm(s => ({ ...s, enriching: false, error: (e as Error).message }));
    }
  };

  const handleSubmitAdd = () => {
    if (!addForm.title.trim()) return;
    const source: Source = {
      type: addForm.type,
      title: addForm.title.trim(),
      authors: addForm.authors ? addForm.authors.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      journal: addForm.journal || undefined,
      year: addForm.year ? Number(addForm.year) : undefined,
      doi: addForm.doi || undefined,
      url: addForm.url || undefined,
      citationNumber: 0, // assigned by handleAppendSource
    };
    onAddSource?.(source);
    setAddForm(emptyAddState);
    setShowAdd(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-serif text-sm font-semibold text-neutral-900 dark:text-warm-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            {t.sources} ({sources.length})
          </h3>
          {onAddSource && !disabled && (
            <button
              onClick={() => setShowAdd(s => !s)}
              className="text-xs px-2 py-1 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center gap-1"
              title={t.addSourceManual}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showAdd ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                )}
              </svg>
              {showAdd ? t.cancel : t.addSourceManual}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Add-source form */}
        {showAdd && (
          <div className="mb-3 p-3 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={addForm.type}
                onChange={(e) => setAddForm(s => ({ ...s, type: e.target.value as 'academic' | 'web' }))}
                className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
              >
                <option value="academic">{t.academic}</option>
                <option value="web">{t.web}</option>
              </select>
              {addForm.type === 'academic' && (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    type="text"
                    value={addForm.doi}
                    onChange={(e) => setAddForm(s => ({ ...s, doi: e.target.value, error: '' }))}
                    placeholder={t.doiPlaceholder}
                    className="flex-1 text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
                  />
                  <button
                    onClick={handleEnrichDoi}
                    disabled={!addForm.doi.trim() || addForm.enriching}
                    className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white font-medium transition-colors"
                  >
                    {addForm.enriching ? t.enriching : t.enrichDoi}
                  </button>
                </div>
              )}
            </div>
            {addForm.error && (
              <p className="text-xs text-red-600 dark:text-red-400">{addForm.error}</p>
            )}
            <input
              type="text"
              value={addForm.title}
              onChange={(e) => setAddForm(s => ({ ...s, title: e.target.value }))}
              placeholder={t.sourceTitlePlaceholder}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={addForm.authors}
                onChange={(e) => setAddForm(s => ({ ...s, authors: e.target.value }))}
                placeholder={t.sourceAuthorsPlaceholder}
                className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
              />
              <input
                type="text"
                value={addForm.year}
                onChange={(e) => setAddForm(s => ({ ...s, year: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                placeholder={t.sourceYearPlaceholder}
                className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
              />
            </div>
            {/* Academic sources need both journal and url. Render journal
                only for academic; URL applies to both types. */}
            {addForm.type === 'academic' && (
              <input
                type="text"
                value={addForm.journal}
                onChange={(e) => setAddForm(s => ({ ...s, journal: e.target.value }))}
                placeholder={t.sourceJournalPlaceholder}
                className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
              />
            )}
            <input
              type="text"
              value={addForm.url}
              onChange={(e) => setAddForm(s => ({ ...s, url: e.target.value }))}
              placeholder={t.sourceUrlPlaceholder}
              className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => { setShowAdd(false); setAddForm(emptyAddState); }}
                className="text-xs px-3 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300 transition-colors"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSubmitAdd}
                disabled={!addForm.title.trim()}
                className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white font-medium transition-colors"
              >
                {t.addSourceBtn}
              </button>
            </div>
          </div>
        )}

        {/* Filter chips. All cards stay mounted regardless — non-matching
            ones are visually hidden so their `id="source-N"` survives for
            citation jumps from the report. */}
        <div className="flex items-center gap-1 mb-3 text-xs">
          {([
            { value: 'all', label: `${t.allFilter} (${sources.length})` },
            { value: 'academic', label: `${t.academic} (${academicCount})` },
            { value: 'web', label: `${t.web} (${webCount})` },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                filter === opt.value
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {sources.length === 0 ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
              {t.noAcademicSources}
            </p>
          ) : (
            sources.map((source) => {
              const visible = filter === 'all' || source.type === filter;
              return (
                <div key={`src-${source.citationNumber}`} className={visible ? '' : 'hidden'}>
                  <SourceCard
                    source={source}
                    editable={!disabled && (!!onUpdateSource || !!onDeleteSource)}
                    isEditing={editingId === source.citationNumber}
                    onStartEdit={() => setEditingId(source.citationNumber)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={(updated) => { onUpdateSource?.(updated); setEditingId(null); }}
                    onDelete={onDeleteSource ? () => onDeleteSource(source.citationNumber) : undefined}
                    onRewrite={onRewriteFromSource ? (instruction) => onRewriteFromSource(source, instruction) : undefined}
                  />
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
