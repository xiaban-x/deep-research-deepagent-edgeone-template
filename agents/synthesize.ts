/**
 * Synthesize Sub-Agent — Compiles comprehensive research report.
 *
 * Uses direct model.invoke() for fast report generation.
 * Called by orchestrator via context.agents.invoke('/synthesize', payload).
 */
import { createModel, createLogger } from './_shared';
import { HumanMessage } from '@langchain/core/messages';

const logger = createLogger('synthesize');

const SYSTEM_PROMPT = `You are a research report writer. Compile a comprehensive, well-structured research report using ALL provided materials.

Format requirements:
- Markdown with ## for main sections, ### for subsections
- Include inline citations like [1], [2] referencing the sources
- Structure: Executive Summary → Background → Key Findings → Analysis → Future Directions → Conclusion → References
- Academic but accessible tone
- All major findings must be supported by citations
- Include a "References" section at the end listing all cited sources
- Write in the same language as the original research question
- Be thorough — use all provided papers and articles as references`;

export async function onRequest(context: any) {
    const { request } = context;
    const { question, subQuestions, papers, articles } = request?.body ?? {};

    if (!question) {
        return new Response(JSON.stringify({ error: 'Missing question' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        logger.log(`Synthesizing report for: "${question.slice(0, 80)}"`);

        const model = createModel();

        const userMessage = `Original research question: "${question}"

Sub-questions investigated:
${(subQuestions || []).map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Academic papers found (cite as [1], [2], etc.):
${JSON.stringify(papers || [], null, 2)}

Web articles found (cite continuing from last paper number):
${JSON.stringify(articles || [], null, 2)}

Write a comprehensive research report in markdown. Include ALL citations. Be thorough and detailed.`;

        const response = await model.invoke([
            { role: 'system', content: SYSTEM_PROMPT },
            new HumanMessage(userMessage),
        ]);

        const report = typeof response.content === 'string' ? response.content : '';

        if (!report) {
            return new Response(JSON.stringify({ report: `# Research Report: ${question}\n\nUnable to generate report. Please try again.` }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }

        logger.log(`Report generated: ${report.length} chars`);
        return new Response(JSON.stringify({ report }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        logger.error((e as Error).message);
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
