'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type Locale = 'zh' | 'en';

export const translations = {
  zh: {
    title: '深度研究',
    description: '多智能体驱动的深度研究助手',
    inputPlaceholder: '输入研究问题',
    startResearch: '开始研究',
    quick: '快速',
    standard: '标准',
    deep: '深度',
    academicSources: '学术来源',
    webSources: '网页来源',
    researchReport: '研究报告',
    multiAgent: '多智能体',
    progress: '研究进度',
    sources: '来源',
    researching: '研究中...',
    tryExample: '试试示例',
    initializingPipeline: '初始化研究管道...',
    noAcademicSources: '暂无学术来源...',
    noWebSources: '暂无网页来源...',
    academic: '学术',
    web: '网页',
    generatingReport: '生成报告中...',
    copy: '复制',
    download: '下载',
    approvalTitle: '审核子问题',
    approvalDescription: 'AI 将研究问题分解为以下子问题，您可以编辑、添加或删除后再继续。',
    hitl: '人机交互',
    addQuestion: '添加子问题...',
    approveAndContinue: '确认并继续研究',
    skipApproval: '跳过（直接使用）',
    history: '历史',
  },
  en: {
    title: 'Deep Research',
    description: 'Multi-agent powered deep research assistant',
    inputPlaceholder: 'Enter research question',
    startResearch: 'Start Research',
    quick: 'Quick',
    standard: 'Standard',
    deep: 'Deep',
    academicSources: 'Academic Sources',
    webSources: 'Web Sources',
    researchReport: 'Research Report',
    multiAgent: 'Multi-Agent',
    progress: 'Progress',
    sources: 'Sources',
    researching: 'Researching...',
    tryExample: 'Try an example',
    initializingPipeline: 'Initializing research pipeline...',
    noAcademicSources: 'No academic sources yet...',
    noWebSources: 'No web sources yet...',
    academic: 'Academic',
    web: 'Web',
    generatingReport: 'Generating report...',
    copy: 'Copy',
    download: 'Download',
    approvalTitle: 'Review Sub-Questions',
    approvalDescription: 'The AI decomposed your question into sub-questions. Edit, add, or remove them before proceeding.',
    hitl: 'Human-in-the-Loop',
    addQuestion: 'Add a sub-question...',
    approveAndContinue: 'Approve & Continue Research',
    skipApproval: 'Skip (use as-is)',
    history: 'History',
  },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: typeof translations.zh;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'zh',
  setLocale: () => {},
  t: translations.zh,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('zh');
  const t = translations[locale];
  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
