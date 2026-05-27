'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

interface SubQuestionConfirmProps {
  questions: string[];
  onConfirm: (questions: string[]) => void;
  onCancel: () => void;
}

export function SubQuestionConfirm({ questions, onConfirm, onCancel }: SubQuestionConfirmProps) {
  const [editableQuestions, setEditableQuestions] = useState<string[]>(questions);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // Auto-resize all textareas on mount and when questions change
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is rendered
    requestAnimationFrame(() => {
      textareaRefs.current.forEach(textarea => {
        if (textarea) {
          textarea.style.height = '0px';
          textarea.style.height = textarea.scrollHeight + 'px';
        }
      });
    });
  }, [editableQuestions]);

  const handleQuestionChange = (index: number, value: string) => {
    setEditableQuestions(prev => prev.map((q, i) => i === index ? value : q));
  };

  const handleRemove = (index: number) => {
    setEditableQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    setEditableQuestions(prev => [...prev, '']);
  };

  const handleConfirm = () => {
    const filtered = editableQuestions.filter(q => q.trim());
    if (filtered.length > 0) {
      onConfirm(filtered);
    }
  };

  return (
    <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
      <CardHeader>
        <h3 className="font-serif text-base font-semibold text-neutral-900 dark:text-warm-100 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          确认研究子问题
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          以下是为您的研究问题分解出的子问题，您可以编辑、添加或删除后再开始研究。
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {editableQuestions.map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="flex-shrink-0 w-6 h-8 flex items-center justify-center text-xs font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 rounded mt-0.5">
                {i + 1}
              </span>
              <textarea
                ref={(el) => { textareaRefs.current[i] = el; }}
                value={q}
                onChange={(e) => {
                  handleQuestionChange(i, e.target.value);
                  // Auto-resize on input
                  e.target.style.height = '0px';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 resize-none transition-all leading-relaxed overflow-hidden"
                rows={1}
                style={{ minHeight: '36px' }}
              />
              <button
                onClick={() => handleRemove(i)}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-neutral-400 hover:text-red-500 transition-colors mt-0.5"
                title="删除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {/* Add button */}
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors px-2 py-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加子问题
          </button>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleConfirm}
            disabled={editableQuestions.filter(q => q.trim()).length === 0}
            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            确认并开始研究
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm text-neutral-600 dark:text-neutral-400 font-medium transition-colors"
          >
            取消
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
