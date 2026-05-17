'use client';

import { useState, useCallback, useEffect } from 'react';
import { ResearchForm } from './components/research-form';
import { ProgressTree } from './components/progress-tree';
import { SourcesPanel } from './components/sources-panel';
import { ReportView } from './components/report-view';
import { ApprovalCard } from './components/approval-card';
import { LanguageToggle } from '@/components/ui/language-toggle';
import { TokenUsage } from '@/components/ui/token-usage';
import { useI18n } from '@/lib/i18n';

export interface SubagentEvent {
  id: string;
  agent: string;
  status: 'pending' | 'running' | 'complete';
  description?: string;
  content?: string;
}

export interface Source {
  type: 'academic' | 'web';
  title: string;
  authors?: string[];
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  url?: string;
  source?: string;
  date?: string;
  snippet?: string;
  citationNumber: number;
}

interface HistoryItem {
  id: string;
  question: string;
  depth: string;
  createdAt: string;
}

export default function Home() {
  const { t } = useI18n();
  const [isResearching, setIsResearching] = useState(false);
  const [subagents, setSubagents] = useState<SubagentEvent[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [report, setReport] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState({ input: 0, output: 0 });

  // HITL state
  const [hitlPending, setHitlPending] = useState(false);
  const [hitlSubQuestions, setHitlSubQuestions] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentDepth, setCurrentDepth] = useState('standard');

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await fetch('/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      if (res.ok) {
        const { reports } = await res.json();
        setHistory(reports || []);
      }
    } catch {}
  };

  // Load a specific historical report
  const loadReport = useCallback(async (id: string) => {
    try {
      const res = await fetch('/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', id }),
      });
      if (res.ok) {
        const { report: data } = await res.json();
        if (data) {
          setReport(data.report || '');
          const allSources: Source[] = [];
          let counter = 0;
          for (const p of data.papers || []) { counter++; allSources.push({ type: 'academic', citationNumber: counter, ...p }); }
          for (const a of data.articles || []) { counter++; allSources.push({ type: 'web', citationNumber: counter, ...a }); }
          setSources(allSources);
          setSubagents([
            { id: 'stage-1', agent: 'question-decomposer', status: 'complete' },
            { id: 'stage-2', agent: 'literature-searcher', status: 'complete' },
            { id: 'stage-3', agent: 'web-researcher', status: 'complete' },
            { id: 'stage-4', agent: 'synthesizer', status: 'complete' },
          ]);
        }
      }
    } catch {}
  }, []);

  // Main research handler
  const handleResearch = useCallback(async (question: string, depth: string) => {
    setIsResearching(true);
    setSubagents([]);
    setSources([]);
    setReport('');
    setError(null);
    setTokenUsage({ input: 0, output: 0 });
    setHitlPending(false);
    setHitlSubQuestions([]);
    setCurrentQuestion(question);
    setCurrentDepth(depth);

    await streamResearch({ message: question, depth });
  }, []);

  // Resume after HITL approval
  const handleApprove = useCallback(async (approvedQuestions: string[]) => {
    setHitlPending(false);
    setIsResearching(true);

    // Save approval
    try {
      await fetch('/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subQuestions: approvedQuestions, originalQuestion: currentQuestion }),
      });
    } catch {}

    // Resume research with approved questions
    await streamResearch({ message: currentQuestion, depth: currentDepth, approved: true, subQuestions: approvedQuestions });
  }, [currentQuestion, currentDepth]);

  // Skip HITL — continue with original sub-questions
  const handleSkipApproval = useCallback(() => {
    handleApprove(hitlSubQuestions);
  }, [hitlSubQuestions, handleApprove]);

  // Core streaming logic
  const streamResearch = async (body: Record<string, unknown>) => {
    let citationCounter = 0;

    try {
      const response = await fetch('/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Research failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let synthesizerContent = '';
      let currentAgent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;

          try {
            const event = JSON.parse(payload);

            switch (event.type) {
              case 'ping':
                break;

              case 'subagent_lifecycle':
                setSubagents(prev => {
                  const existing = prev.find(s => s.id === event.id);
                  if (existing) {
                    return prev.map(s => s.id === event.id ? { ...s, status: event.status, content: event.content || s.content } : s);
                  }
                  return [...prev, { id: event.id, agent: event.agent, status: event.status, description: event.description, content: event.content }];
                });

                // Parse sources from completed search subagents
                if (event.status === 'complete' && event.content) {
                  try {
                    const parsed = JSON.parse(event.content);
                    if (Array.isArray(parsed)) {
                      const newSources: Source[] = parsed
                        .filter((item: any) => item.title && item.title.trim())
                        .map((item: any) => {
                          citationCounter++;
                          if (item.doi || item.journal) {
                            return { type: 'academic' as const, citationNumber: citationCounter, ...item };
                          }
                          return { type: 'web' as const, citationNumber: citationCounter, ...item };
                        });
                      setSources(prev => [...prev, ...newSources]);
                    }
                  } catch {}
                }
                break;

              case 'source_switch':
                currentAgent = event.agent;
                break;

              case 'ai_response':
                const agent = event.agent || currentAgent;
                if (agent === 'synthesizer' || agent === 'main') {
                  synthesizerContent += event.content;
                  setReport(synthesizerContent);
                }
                break;

              case 'hitl_request':
                // Agent is requesting human approval
                if (event.stage === 'decompose' && Array.isArray(event.data)) {
                  setHitlPending(true);
                  setHitlSubQuestions(event.data);
                  setIsResearching(false); // Pause until user approves
                  return; // Stop processing stream — user will re-trigger
                }
                break;

              case 'progress':
                // Could update a progress bar UI
                break;

              case 'error_message':
                setError(event.content);
                break;

              case 'usage':
                setTokenUsage({ input: event.input_tokens || 0, output: event.output_tokens || 0 });
                break;
            }
          } catch {}
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsResearching(false);
      loadHistory(); // Refresh history after completion
    }
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h1 className="font-serif text-xl font-bold text-neutral-900 dark:text-warm-100">
            {t.title}
          </h1>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
            {t.multiAgent}
          </span>
          <span className="text-xs text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
            deepagents
          </span>
          <div className="ml-auto flex items-center gap-3">
            <TokenUsage inputTokens={tokenUsage.input} outputTokens={tokenUsage.output} />
            <LanguageToggle />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Research Form with History */}
        <ResearchForm onSubmit={handleResearch} isLoading={isResearching} history={history} onLoadReport={loadReport} />

        {/* HITL Approval Card */}
        {hitlPending && (
          <ApprovalCard
            subQuestions={hitlSubQuestions}
            onApprove={handleApprove}
            onSkip={handleSkipApproval}
          />
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Results Area */}
        {(subagents.length > 0 || report) && (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Progress + Sources */}
            <div className="lg:col-span-1 space-y-6">
              <ProgressTree subagents={subagents} isActive={isResearching} />
              <SourcesPanel sources={sources} />
            </div>

            {/* Right Column: Report */}
            <div className="lg:col-span-2">
              <ReportView content={report} isStreaming={isResearching} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
