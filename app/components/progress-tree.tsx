'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import type { SubagentEvent } from '../page';

const AGENT_ICONS: Record<string, string> = {
  'question-decomposer': 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  'literature-searcher': 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  'web-researcher': 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  'synthesizer': 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

interface ProgressTreeProps {
  subagents: SubagentEvent[];
  isActive: boolean;
}

/** Safely parse a JSON array out of a subagent's `content` field. */
function parseArray(content?: string): any[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Orchestration Pipeline view.
 *
 * Renders the 4-stage research flow as a directed pipeline: each node shows
 * its role, live status, and an input → output data summary (sub-question
 * count, papers, articles, report) so the user can see how data flows from
 * the question through search into the synthesized report. This reframes the
 * old flat progress list as an explicit orchestration graph.
 */
export function ProgressTree({ subagents, isActive }: ProgressTreeProps) {
  const { t } = useI18n();

  if (subagents.length === 0 && !isActive) return null;

  const byId = (id: string) => subagents.find(s => s.id === id);
  const stage1 = byId('stage-1');
  const stage2 = byId('stage-2');
  const stage3 = byId('stage-3');
  const stage4 = byId('stage-4');

  const subQuestions = parseArray(stage1?.content);
  const papers = parseArray(stage2?.content);
  const articles = parseArray(stage3?.content);

  // Progress percentage across the 4 stages.
  const totalStages = 4;
  const completedStages = subagents.filter(s => s.status === 'complete').length;
  const runningStages = subagents.filter(s => s.status === 'running').length;
  const progress = Math.round(((completedStages + runningStages * 0.5) / totalStages) * 100);

  const fmt = (tpl: string, n: number) => tpl.replace('{n}', String(n));

  const nodes = [
    {
      id: 'stage-1',
      agent: 'question-decomposer',
      label: t.decomposingQuestion,
      status: stage1?.status ?? 'pending',
      input: t.nodeInQuestion,
      output: subQuestions.length > 0 ? fmt(t.nodeOutSubQuestions, subQuestions.length) : t.nodeOutSubQuestions.replace('{n}', '—'),
      detail: subQuestions.length > 0 ? <SubQuestionList questions={subQuestions} /> : null,
    },
    {
      id: 'stage-2',
      agent: 'literature-searcher',
      label: t.searchingLiterature,
      status: stage2?.status ?? 'pending',
      input: t.nodeInSubQuestions,
      output: papers.length > 0 ? fmt(t.nodeOutPapers, papers.length) : t.nodeOutPapers.replace('{n}', '—'),
      detail: null,
    },
    {
      id: 'stage-3',
      agent: 'web-researcher',
      label: t.searchingWeb,
      status: stage3?.status ?? 'pending',
      input: t.nodeInSubQuestions,
      output: articles.length > 0 ? fmt(t.nodeOutArticles, articles.length) : t.nodeOutArticles.replace('{n}', '—'),
      detail: null,
    },
    {
      id: 'stage-4',
      agent: 'synthesizer',
      label: t.synthesizingReport,
      status: stage4?.status ?? 'pending',
      input: fmt(t.nodeInSources, papers.length + articles.length),
      output: t.nodeOutReport,
      detail: null,
    },
  ];

  const statusPill = (status: string) => {
    if (status === 'complete') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {t.pipelineDone}
        </span>
      );
    }
    if (status === 'running') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse-dot" />
          {t.pipelineRunning}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
        {t.pipelineWaiting}
      </span>
    );
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="font-serif text-sm font-semibold text-neutral-900 dark:text-warm-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {t.orchestrationPipeline}
          {isActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-dot" />}
          {isActive && subagents.length > 0 && (
            <span className="ml-auto text-xs font-normal text-neutral-500 dark:text-neutral-400">{progress}%</span>
          )}
        </h3>
        {isActive && subagents.length > 0 && (
          <div className="mt-2 w-full h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isActive && subagents.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t.initializingPipeline}
          </div>
        ) : (
          <div className="space-y-0">
            {nodes.map((node, index) => (
              <div key={node.id}>
                {/* Pipeline node */}
                <div
                  className={`rounded-lg border p-3 transition-colors ${
                    node.status === 'running'
                      ? 'border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10'
                      : node.status === 'complete'
                        ? 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'
                        : 'border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                      node.status === 'complete' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                        : node.status === 'running' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500'
                    }`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={AGENT_ICONS[node.agent]} />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{node.label}</span>
                    <span className="ml-auto">{statusPill(node.status)}</span>
                  </div>

                  {/* Input → Output data flow row */}
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] pl-8">
                    <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                      <span className="text-neutral-400 dark:text-neutral-500">{t.pipelineInput}:</span> {node.input}
                    </span>
                    <svg className="w-3 h-3 text-neutral-400 dark:text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    <span className={`px-1.5 py-0.5 rounded ${
                      node.status === 'pending'
                        ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500'
                        : 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    }`}>
                      <span className="opacity-60">{t.pipelineOutput}:</span> {node.output}
                    </span>
                  </div>

                  {node.detail && <div className="pl-8 mt-1">{node.detail}</div>}
                </div>

                {/* Directional connector between nodes */}
                {index < nodes.length - 1 && (
                  <div className="flex justify-center py-1">
                    <svg
                      className={`w-4 h-4 ${nodes[index].status === 'complete' ? 'text-purple-400 dark:text-purple-500' : 'text-neutral-300 dark:text-neutral-700'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Collapsible sub-question list to avoid taking too much space
function SubQuestionList({ questions }: { questions: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {t.subQuestionCount.replace('{n}', String(questions.length))}
      </button>
      {expanded && (
        <ul className="mt-1.5 ml-1 space-y-1 border-l-2 border-neutral-200 dark:border-neutral-700 pl-2.5 max-h-48 overflow-y-auto">
          {questions.map((q: string, i: number) => (
            <li key={i} className="text-[11px] text-neutral-600 dark:text-neutral-400 flex items-start gap-1">
              <span className="text-neutral-400 dark:text-neutral-500 font-mono flex-shrink-0 text-[10px] mt-px">{i + 1}.</span>
              <span className="leading-snug line-clamp-2">{q}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
