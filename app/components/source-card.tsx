'use client';

import { memo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';
import type { Source } from '../page';
import { sourceToBibtex } from '@/lib/citations';

interface SourceCardProps {
  source: Source;
  /** Show inline edit/delete controls. */
  editable?: boolean;
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (updated: Source) => void;
  onDelete?: () => void;
  /** "Re-read this source and integrate it into the report" — triggers a
   *  follow-up edit run. The argument is an optional one-line instruction. */
  onRewrite?: (instruction: string) => void;
}

export function SourceCardImpl({
  source,
  editable = false,
  isEditing = false,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onRewrite,
}: SourceCardProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRewriteBox, setShowRewriteBox] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState('');

  // Edit-mode form state — kept independent of `source` so cancel reverts cleanly.
  const [editForm, setEditForm] = useState<{
    title: string; authors: string; journal: string; year: string;
    doi: string; url: string; abstract: string; snippet: string;
  }>(() => ({
    title: source.title || '',
    // Defensive: source.authors should already be string[] (page.tsx normalizes
    // at SSE ingest), but legacy stored data or hand-built sources might still
    // be a string. Coerce to display form here.
    authors: Array.isArray(source.authors) ? source.authors.join(', ') : (source.authors || ''),
    journal: source.journal || '',
    year: source.year ? String(source.year) : '',
    doi: source.doi || '',
    url: source.url || '',
    abstract: source.abstract || '',
    snippet: source.snippet || '',
  }));

  const isAcademic = source.type === 'academic';
  const href = isAcademic
    ? (source.doi ? `https://doi.org/${source.doi}` : undefined)
    : source.url;

  const handleCopyBibtex = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const bibtex = sourceToBibtex(source);
    try {
      await navigator.clipboard.writeText(bibtex);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = bibtex;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editForm.title.trim()) return;
    onSaveEdit?.({
      ...source,
      title: editForm.title.trim(),
      authors: editForm.authors ? editForm.authors.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      journal: editForm.journal || undefined,
      year: editForm.year ? Number(editForm.year) : undefined,
      doi: editForm.doi || undefined,
      url: editForm.url || undefined,
      abstract: editForm.abstract || undefined,
      snippet: editForm.snippet || undefined,
    });
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(false);
    onDelete?.();
  };

  // ─── Edit mode: render the form only when editing, but keep the display
  // subtree mounted (toggled via `hidden`) so the card itself doesn't unmount/
  // remount on Edit/Cancel — that's what was causing visible flicker. We
  // intentionally do NOT put `id="source-N"` on the edit form, otherwise
  // citation-jump (`getElementById`) would resolve to the hidden form when a
  // sibling card is being edited. The id lives only on the visible card. ──
  const editForm_jsx = isEditing ? (
      <div
        className="p-3 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10 space-y-2 scroll-mt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-mono font-bold text-blue-700 dark:text-blue-300">
            {source.citationNumber}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{t.editingSource}</span>
        </div>
        <input
          value={editForm.title}
          onChange={(e) => setEditForm(s => ({ ...s, title: e.target.value }))}
          placeholder={t.sourceTitlePlaceholder}
          className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
        />
        <input
          value={editForm.authors}
          onChange={(e) => setEditForm(s => ({ ...s, authors: e.target.value }))}
          placeholder={t.sourceAuthorsPlaceholder}
          className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
        />
        <div className="grid grid-cols-2 gap-2">
          {isAcademic && (
            <input
              value={editForm.journal}
              onChange={(e) => setEditForm(s => ({ ...s, journal: e.target.value }))}
              placeholder={t.sourceJournalPlaceholder}
              className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
            />
          )}
          <input
            value={editForm.year}
            onChange={(e) => setEditForm(s => ({ ...s, year: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            placeholder={t.sourceYearPlaceholder}
            className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
          />
        </div>
        {isAcademic && (
          <input
            value={editForm.doi}
            onChange={(e) => setEditForm(s => ({ ...s, doi: e.target.value }))}
            placeholder={t.doiPlaceholder}
            className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
          />
        )}
        <input
          value={editForm.url}
          onChange={(e) => setEditForm(s => ({ ...s, url: e.target.value }))}
          placeholder={t.sourceUrlPlaceholder}
          className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onCancelEdit?.(); }}
            className="text-xs px-3 py-1.5 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={!editForm.title.trim()}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white font-medium"
          >
            {t.saveSource}
          </button>
        </div>
      </div>
  ) : null;

  // ─── Display mode ──────────────────────────────────────────────────────────
  const content = (
    <div
      id={`source-${source.citationNumber}`}
      className={`p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 ${href ? 'hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors cursor-pointer' : ''} ${isAcademic ? 'source-card-academic' : 'source-card-web'} group relative scroll-mt-4`}
    >
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-mono font-bold text-neutral-600 dark:text-neutral-400">
          {source.citationNumber}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 pr-16">
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

          <div className="mt-1.5 flex items-center gap-1.5">
            <Badge variant={isAcademic ? 'academic' : 'web'}>
              {isAcademic ? t.academic : t.web}
            </Badge>
            {/* Inline action chips — only show on hover so the panel stays clean */}
            {(editable || onRewrite) && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                {onRewrite && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRewriteBox(s => !s); }}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-900/60 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                    title={t.rewriteFromSourceTitle}
                  >
                    {t.rewriteFromSource}
                  </button>
                )}
                {editable && onStartEdit && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartEdit(); }}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    {t.editSource}
                  </button>
                )}
                {editable && onDelete && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(true); }}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    {t.deleteSource}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Rewrite-from-source instruction box */}
          {showRewriteBox && onRewrite && (
            <div
              className="mt-2 p-2 rounded border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-purple-900/10 space-y-2"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <p className="text-[11px] text-purple-700 dark:text-purple-300">
                {t.rewriteFromSourceHint}
              </p>
              <textarea
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
                placeholder={t.rewriteFromSourcePlaceholder}
                rows={2}
                className="w-full text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 resize-none"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowRewriteBox(false); setRewriteInstruction(''); }}
                  className="text-[11px] px-2 py-1 rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRewrite(rewriteInstruction.trim());
                    setShowRewriteBox(false);
                    setRewriteInstruction('');
                  }}
                  className="text-[11px] px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium"
                >
                  {t.rewriteFromSourceConfirm}
                </button>
              </div>
            </div>
          )}

          {/* Inline delete confirmation */}
          {confirmDelete && (
            <div
              className="mt-2 p-2 rounded border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-900/10"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              <p className="text-[11px] text-red-700 dark:text-red-300 mb-1.5">
                {t.deleteSourceConfirm}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(false); }}
                  className="text-[11px] px-2 py-1 rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="text-[11px] px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
                >
                  {t.deleteSourceConfirmBtn}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Copy as BibTeX (always available; topmost-right corner) */}
        <button
          onClick={handleCopyBibtex}
          title={copied ? t.copied : t.copyAsBibtex}
          className="absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <svg className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );

  // Display subtree (hidden when editing). We render both subtrees in parallel
  // and toggle via `hidden` so toggling edit mode doesn't unmount/remount the
  // card — that was the source of the visible flicker on Edit/Cancel.
  //
  // The `<a>` wrapper is kept even when `editable` is true: every inline action
  // button inside `content` already calls `e.preventDefault()` +
  // `e.stopPropagation()`, so clicks on those buttons don't trigger
  // navigation, while clicks anywhere else on the card open the source in a
  // new tab as users expect. We only fall back to a plain `<div>` while a
  // sub-flow (rewrite box / delete confirmation) is open, since those keep
  // their own form controls inside the card.
  const displaySubtree = (href && !showRewriteBox && !confirmDelete)
    ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`block no-underline${isEditing ? ' hidden' : ''}`}
      >
        {content}
      </a>
    )
    : (
      <div className={isEditing ? 'hidden' : undefined}>
        {content}
      </div>
    );

  return (
    <>
      {editForm_jsx}
      {displaySubtree}
    </>
  );
}

/**
 * Memoized export. Re-renders only when the source's identity / mutable fields
 * or one of the editable-mode flags actually change — which means parent
 * re-renders triggered by unrelated SSE events (e.g. setSubagents on every
 * subagent_lifecycle tick) no longer cascade into every visible source card.
 */
function areSourceCardPropsEqual(prev: SourceCardProps, next: SourceCardProps): boolean {
  if (prev.editable !== next.editable) return false;
  if (prev.isEditing !== next.isEditing) return false;
  // Callbacks: identity matters only insofar as a parent might pass new fns;
  // the page wires them with useCallback-stable refs in practice. Treat them
  // as equal to avoid spurious re-renders. If a parent ever needs to force a
  // re-render with changed callbacks, bumping `source` will do it.
  const a = prev.source;
  const b = next.source;
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.citationNumber === b.citationNumber &&
    a.type === b.type &&
    a.title === b.title &&
    a.url === b.url &&
    a.doi === b.doi &&
    a.journal === b.journal &&
    a.year === b.year &&
    a.snippet === b.snippet &&
    a.abstract === b.abstract &&
    a.source === b.source &&
    a.date === b.date &&
    // authors may be string[] or string; compare by joined form for stability.
    (Array.isArray(a.authors) ? a.authors.join('|') : a.authors) ===
    (Array.isArray(b.authors) ? b.authors.join('|') : b.authors)
  );
}

export const SourceCard = memo(SourceCardImpl, areSourceCardPropsEqual);
