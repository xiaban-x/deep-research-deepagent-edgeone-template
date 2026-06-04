'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

interface Version {
  version: number;
  question: string;
  trigger?: string;
  createdAt: string;
}

interface VersionSelectorProps {
  versions: Version[];
  currentVersion: number | null;
  onSelectVersion: (version: number) => void;
  onDiff: (v1: number, v2: number) => void;
}

export function VersionSelector({
  versions,
  currentVersion,
  onSelectVersion,
  onDiff,
}: VersionSelectorProps) {
  const { t } = useI18n();
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  // Default to collapsed: research reports are typically read top-to-bottom,
  // and the version timeline took an outsized chunk of vertical space at the
  // very top of the report (the user's "太高了" feedback). One-line summary
  // by default; the user expands it only when they actually want to switch
  // versions or run a diff.
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleVersionClick = (version: number) => {
    if (compareMode) {
      setSelected((prev) => {
        if (prev.includes(version)) return prev.filter((v) => v !== version);
        if (prev.length >= 2) return [prev[1], version];
        return [...prev, version];
      });
    } else {
      onSelectVersion(version);
    }
  };

  const handleCompare = () => {
    if (selected.length === 2) {
      const sorted = [...selected].sort((a, b) => a - b);
      onDiff(sorted[0], sorted[1]);
      setCompareMode(false);
      setSelected([]);
    }
  };

  if (versions.length === 0) return null;

  // ─── Collapsed: single-row summary ─────────────────────────────────────
  // Tight strip showing "v3 · 当前版本 · 共 N 个版本" with a chevron to
  // expand. With only one version the button is intentionally low-key —
  // there's nothing to switch to or compare against.
  if (!expanded) {
    const latest = versions[0];
    const isOnLatest = currentVersion === latest.version || currentVersion === null;
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/60 hover:bg-neutral-50 dark:hover:bg-neutral-800/70 transition-colors text-left"
        aria-expanded="false"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            {t.versions}
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            v{currentVersion ?? latest.version}
            {isOnLatest && <span className="ml-1 text-neutral-400 dark:text-neutral-500">· {t.currentVersion}</span>}
            <span className="ml-1 text-neutral-400 dark:text-neutral-500">· {versions.length}</span>
          </span>
        </div>
        <svg className="w-3.5 h-3.5 flex-shrink-0 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    );
  }

  // ─── Expanded: full timeline + compare controls ────────────────────────
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t.versions}
        </h3>
        <div className="flex items-center gap-2">
          {compareMode && selected.length === 2 && (
            <Button size="sm" onClick={handleCompare}>
              {t.compareVersions}
            </Button>
          )}
          <Button
            size="sm"
            variant={compareMode ? 'default' : 'outline'}
            onClick={() => {
              setCompareMode(!compareMode);
              setSelected([]);
            }}
          >
            {compareMode ? t.cancelCompare : t.compareVersions}
          </Button>
          <button
            type="button"
            onClick={() => { setExpanded(false); setCompareMode(false); setSelected([]); }}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1 -mr-1"
            aria-label="Collapse versions"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Version list - horizontal scrollable */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {versions.map((ver) => {
          const isSelected = compareMode && selected.includes(ver.version);
          const isCurrent = ver.version === currentVersion;

          return (
            <button
              key={ver.version}
              onClick={() => handleVersionClick(ver.version)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg border text-left transition-colors ${
                isSelected
                  ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : isCurrent
                  ? 'border-neutral-400 dark:border-neutral-500 bg-neutral-100 dark:bg-neutral-800'
                  : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${
                  isCurrent ? 'text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-400'
                }`}>
                  v{ver.version}
                </span>
                {isCurrent && !compareMode && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
                    {t.currentVersion}
                  </span>
                )}
                {isSelected && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200">
                    {selected.indexOf(ver.version) + 1}
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-[120px] truncate">
                {ver.question}
              </div>
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                {formatDate(ver.createdAt)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Compare mode hint */}
      {compareMode && selected.length < 2 && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          {t.selectTwoVersions.replace('{n}', String(selected.length))}
        </p>
      )}
    </div>
  );
}
