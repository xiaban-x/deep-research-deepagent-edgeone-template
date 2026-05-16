'use client';

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SourceCard } from './source-card';
import { useI18n } from '@/lib/i18n';
import type { Source } from '../page';

interface SourcesPanelProps {
  sources: Source[];
}

export function SourcesPanel({ sources }: SourcesPanelProps) {
  const { t } = useI18n();

  if (sources.length === 0) return null;

  const academicSources = sources.filter(s => s.type === 'academic');
  const webSources = sources.filter(s => s.type === 'web');

  return (
    <Card>
      <CardHeader>
        <h3 className="font-serif text-sm font-semibold text-neutral-900 dark:text-warm-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          {t.sources} ({sources.length})
        </h3>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="academic">
          <TabsList className="mb-3">
            <TabsTrigger value="academic">
              {t.academic} ({academicSources.length})
            </TabsTrigger>
            <TabsTrigger value="web">
              {t.web} ({webSources.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="academic" className="space-y-2 max-h-96 overflow-y-auto">
            {academicSources.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">{t.noAcademicSources}</p>
            ) : (
              academicSources.map((source, i) => (
                <SourceCard key={`academic-${i}`} source={source} />
              ))
            )}
          </TabsContent>

          <TabsContent value="web" className="space-y-2 max-h-96 overflow-y-auto">
            {webSources.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">{t.noWebSources}</p>
            ) : (
              webSources.map((source, i) => (
                <SourceCard key={`web-${i}`} source={source} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
