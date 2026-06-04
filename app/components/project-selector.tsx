'use client';

import { useState, useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';

interface Project {
  id: string;
  name: string;
  createdAt: string;
}

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  /** Initial fetch in flight — show skeleton rows instead of "no projects". */
  loading?: boolean;
  /** Create-project request in flight — disable the button + spinner. */
  creating?: boolean;
}

export function ProjectSelector({
  projects,
  selectedProjectId,
  onSelect,
  onCreate,
  onDelete,
  loading = false,
  creating = false,
}: ProjectSelectorProps) {
  const { t } = useI18n();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const hasFiredCreate = useRef(false);

  const handleCreate = () => {
    if (!newName.trim() || creating) return;
    // Fire the request but DON'T close the create form yet — we want the
    // user to see the spinner on the "Create" button while the request is
    // in flight. Mark that we've fired so the effect below knows to close
    // the form on the matching return (creating: true → false).
    hasFiredCreate.current = true;
    onCreate(newName.trim());
  };

  // When the parent finishes the create request we initiated, close the
  // create form. We gate on `hasFiredCreate.current` so the form only
  // auto-closes on the *return* of a request we started — toggles of the
  // creating prop from elsewhere (e.g. parent's other create paths) don't
  // accidentally collapse the form.
  useEffect(() => {
    if (!creating && hasFiredCreate.current) {
      setIsCreating(false);
      setNewName('');
      hasFiredCreate.current = false;
    }
  }, [creating]);

  const handleDelete = (id: string) => {
    onDelete(id);
    setDeleteConfirmId(null);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // ─── Initial-load skeleton ──────────────────────────────────────────────
  // On a slow network the first /project list request can take a few hundred
  // ms; without this the user sees the misleading "no projects yet" empty
  // state followed by a sudden flash of cards. A handful of muted skeleton
  // rows reads as "we're loading, don't worry".
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-3 rounded-lg text-sm text-neutral-300 dark:text-neutral-600 border border-dashed border-neutral-200 dark:border-neutral-800">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{t.newProject}</span>
        </div>
        <div className="space-y-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="px-3 py-2.5 rounded-lg border border-transparent"
              style={{ opacity: 1 - i * 0.15 }}
            >
              <div className="h-3.5 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" style={{ width: `${85 - i * 8}%` }} />
              <div className="h-2.5 rounded bg-neutral-200/60 dark:bg-neutral-800/60 animate-pulse mt-1.5" style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (projects.length === 0 && !isCreating) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-center space-y-4">
        <div className="text-neutral-500 dark:text-neutral-400 text-sm">
          {t.noProjects}
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-sm transition-all"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t.newProject}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Create new project — always at top */}
      {isCreating ? (
        <div className="mb-3 space-y-2.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={t.projectName}
            className="w-full bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:focus:ring-blue-400/40 dark:focus:border-blue-400 dark:text-neutral-100 placeholder:text-neutral-400 transition-all"
            autoFocus
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setIsCreating(false); setNewName(''); }}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              {creating && (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {t.createProject}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsCreating(true)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-3 rounded-lg text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-300 border border-dashed border-neutral-300 dark:border-neutral-700 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t.newProject}
        </button>
      )}

      {/* Project list — fills remaining height */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {projects.map((project) => (
          <div
            key={project.id}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors group ${
              selectedProjectId === project.id
                ? 'bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600'
                : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50 border border-transparent'
            }`}
            onClick={() => onSelect(project.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                {project.name}
              </div>
              <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                {formatDate(project.createdAt)}
              </div>
            </div>

            {/* Delete button */}
            {deleteConfirmId === project.id ? (
              <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleDelete(project.id)}
                  className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                >
                  {t.confirm}
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="text-xs px-2 py-1 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmId(project.id);
                }}
                className="opacity-0 group-hover:opacity-100 ml-2 p-1 rounded text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                aria-label="Delete project"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
