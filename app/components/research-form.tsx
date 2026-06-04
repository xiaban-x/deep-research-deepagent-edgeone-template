'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

const DEPTH_OPTIONS = [
  { value: 'quick', labelKey: 'quick' as const, description: '' },
  { value: 'standard', labelKey: 'standard' as const, description: '' },
  { value: 'deep', labelKey: 'deep' as const, description: '' },
];

// Academic citation styles. The model gets style-specific instructions in
// the system prompt — see _prompts.ts buildSystemPrompt's citationStyle block.
const CITATION_STYLES = [
  { value: 'apa', label: 'APA' },
  { value: 'mla', label: 'MLA' },
  { value: 'chicago', label: 'Chicago' },
  { value: 'gb7714', label: 'GB/T 7714' },
] as const;

export type CitationStyle = (typeof CITATION_STYLES)[number]['value'];

interface HistoryItem {
  id: string;
  question: string;
  depth: string;
  createdAt: string;
}

interface ResearchFormProps {
  onSubmit: (question: string, depth: string, citationStyle: CitationStyle) => void;
  isLoading: boolean;
  history?: HistoryItem[];
  onLoadReport?: (id: string) => void;
}

export function ResearchForm({ onSubmit, isLoading, history = [], onLoadReport }: ResearchFormProps) {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [depth, setDepth] = useState('standard');
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('apa');
  const [showHistory, setShowHistory] = useState(false);
  const examplePrompts = t.examplePrompts;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;
    onSubmit(question.trim(), depth, citationStyle);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Question Input */}
        <div className="relative">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t.inputPlaceholder}
            className="w-full h-28 px-5 py-4 rounded-xl border border-neutral-300 bg-white text-base placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent resize-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:ring-warm-400 font-serif"
            disabled={isLoading}
          />
        </div>

        {/* Depth Selector + History + Submit */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1">
              {DEPTH_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDepth(opt.value)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    depth === opt.value
                      ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                  disabled={isLoading}
                >
                  <span>{t[opt.labelKey]}</span>
                  {opt.description && <span className="ml-1 text-xs text-neutral-400 dark:text-neutral-500">{opt.description}</span>}
                </button>
              ))}
            </div>

            {/* Citation style — academic differentiator */}
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800">
              <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <select
                value={citationStyle}
                onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
                disabled={isLoading}
                title={t.citationStyleLabel}
                className="bg-transparent text-xs font-medium text-neutral-700 dark:text-neutral-300 focus:outline-none cursor-pointer disabled:opacity-50"
              >
                {CITATION_STYLES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* History button */}
            {history.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    showHistory ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {history.length}
                </button>

                {/* History dropdown */}
                {showHistory && (
                  <div className="absolute top-full left-0 mt-1 w-80 max-h-64 overflow-y-auto bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl z-20">
                    {history.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { onLoadReport?.(item.id); setShowHistory(false); }}
                        className="w-full text-left px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-b border-neutral-100 dark:border-neutral-800 last:border-0 transition-colors"
                      >
                        <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">{item.question}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500">{item.depth}</span>
                          <span className="text-[10px] text-neutral-400">{formatDate(item.createdAt)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button type="submit" size="lg" disabled={!question.trim() || isLoading}>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t.researching}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {t.startResearch}
              </span>
            )}
          </Button>
        </div>
      </form>

      {/* Example Prompts */}
      {!isLoading && !question && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
            {t.tryExample}
          </p>
          <div className="flex flex-wrap gap-2">
            {examplePrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => setQuestion(prompt)}
                className="text-sm px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
              >
                {prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
