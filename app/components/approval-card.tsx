'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';

interface ApprovalCardProps {
  subQuestions: string[];
  onApprove: (questions: string[]) => void;
  onSkip: () => void;
}

export function ApprovalCard({ subQuestions, onApprove, onSkip }: ApprovalCardProps) {
  const { t } = useI18n();
  const [questions, setQuestions] = useState<string[]>(subQuestions);
  const [newQuestion, setNewQuestion] = useState('');

  const handleRemove = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleEdit = (index: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => i === index ? value : q));
  };

  const handleAdd = () => {
    if (newQuestion.trim()) {
      setQuestions(prev => [...prev, newQuestion.trim()]);
      setNewQuestion('');
    }
  };

  return (
    <div className="mt-4 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
          {t.approvalTitle || 'Review Sub-Questions'}
        </h3>
        <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-800/40 px-2 py-0.5 rounded-full">
          {t.hitl || 'Human-in-the-Loop'}
        </span>
      </div>

      <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">
        {t.approvalDescription || 'The AI decomposed your question into sub-questions. Edit, add, or remove them before proceeding.'}
      </p>

      {/* Editable questions */}
      <div className="space-y-2 mb-3">
        {questions.map((q, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-5 shrink-0">{i + 1}.</span>
            <input
              type="text"
              value={q}
              onChange={(e) => handleEdit(i, e.target.value)}
              className="flex-1 px-2.5 py-1.5 text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleRemove(i)}
              className="text-neutral-400 hover:text-red-500 text-lg leading-none px-1"
              title="Remove"
            >×</button>
          </div>
        ))}
      </div>

      {/* Add new question */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          placeholder={t.addQuestion || 'Add a sub-question...'}
          className="flex-1 px-2.5 py-1.5 text-sm border border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-neutral-400"
        />
        <button
          onClick={handleAdd}
          disabled={!newQuestion.trim()}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-40"
        >+</button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onApprove(questions.filter(q => q.trim()))}
          disabled={questions.filter(q => q.trim()).length === 0}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t.approveAndContinue || 'Approve & Continue Research'}
        </button>
        <button
          onClick={onSkip}
          className="px-4 py-2 text-xs font-medium rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          {t.skipApproval || 'Skip (use as-is)'}
        </button>
      </div>
    </div>
  );
}
