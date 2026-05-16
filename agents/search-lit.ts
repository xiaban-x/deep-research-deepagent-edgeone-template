/**
 * Literature Search Sub-Agent — Finds relevant academic papers.
 *
 * Uses lightweight model.invoke() + direct tool execution (no deepagents overhead).
 * Called by orchestrator via context.agents.invoke('/search-lit', payload).
 */
import { z } from 'zod';
import { createModel, createLogger } from './_shared';
import { HumanMessage } from '@langchain/core/messages';

const logger = createLogger('search-lit');

const MOCK_PAPERS = [
    { title: 'Quantum Error Correction with Surface Codes: A Comprehensive Review', authors: 'Chen, L., Wang, M., & Park, S.', journal: 'Physical Review Letters', year: 2024, doi: '10.1103/PhysRevLett.132.040601', abstract: 'We present a comprehensive review of surface code implementations for quantum error correction, demonstrating a 10x improvement in logical error rates.' },
    { title: 'Large Language Models as Research Assistants: Capabilities and Limitations', authors: 'Thompson, R., Garcia, A., & Kim, J.', journal: 'Nature Machine Intelligence', year: 2024, doi: '10.1038/s42256-024-0812-3', abstract: 'This study evaluates the effectiveness of large language models in assisting scientific research.' },
    { title: 'Transformer Architectures for Scientific Discovery', authors: 'Liu, H., Patel, N., & Brown, K.', journal: 'Science', year: 2025, doi: '10.1126/science.abq1234', abstract: 'Novel transformer architectures specifically designed for scientific hypothesis generation.' },
    { title: 'Sustainable AI: Environmental Impact of Training Large Models', authors: 'Mueller, F., Santos, P., & Johnson, D.', journal: 'Nature Climate Change', year: 2024, doi: '10.1038/s41558-024-1987-2', abstract: 'Carbon footprint of training large AI models has decreased by 40% through algorithmic efficiency improvements.' },
    { title: 'Brain-Computer Interfaces: From Laboratory to Clinical Practice', authors: 'Yamamoto, K., Fischer, E., & O\'Brien, T.', journal: 'The Lancet Neurology', year: 2025, doi: '10.1016/S1474-4422(25)00034-1', abstract: 'Review of brain-computer interfaces transitioning from research settings to clinical applications.' },
    { title: 'Nuclear Fusion: Progress Toward Commercial Viability', authors: 'Anderson, J., Zhao, W., & Petrov, I.', journal: 'Nature Energy', year: 2025, doi: '10.1038/s41560-025-0145-7', abstract: 'Recent breakthroughs in tokamak confinement bring commercial fusion power within a 15-year horizon.' },
    { title: 'Drug Discovery with Graph Neural Networks', authors: 'Robinson, S., Lee, C., & Nakamura, H.', journal: 'Journal of Medicinal Chemistry', year: 2024, doi: '10.1021/acs.jmedchem.4c00891', abstract: 'Graph neural networks have accelerated drug candidate identification by 3x.' },
    { title: 'Advances in Multimodal AI for Healthcare Diagnostics', authors: 'Gupta, R., Williams, T., & Choi, S.', journal: 'NEJM', year: 2025, doi: '10.1056/NEJMoa2501234', abstract: 'Multimodal AI systems achieve diagnostic accuracy exceeding specialist physicians.' },
];

const SYSTEM_PROMPT = `You are an academic research librarian. Based on the sub-questions provided, select the most relevant academic papers from the search results.
Output ONLY a JSON array of the selected papers. No markdown fences, no explanations.`;

function searchPapers(query: string, maxResults = 4): any[] {
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = MOCK_PAPERS.map(paper => {
        const text = `${paper.title} ${paper.abstract} ${paper.authors}`.toLowerCase();
        const score = keywords.filter(k => text.includes(k)).length;
        return { ...paper, score };
    }).sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map(({ score, ...p }) => p);
}

export async function onRequest(context: any) {
    const { request } = context;
    const { subQuestions } = request?.body ?? {};

    if (!subQuestions || !Array.isArray(subQuestions)) {
        return new Response(JSON.stringify({ error: 'Missing subQuestions array' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        logger.log(`Searching literature for ${subQuestions.length} sub-questions`);

        // Direct tool call: search papers based on sub-questions
        const query = subQuestions.join(' ');
        const searchResults = searchPapers(query, 5);

        // Use model to select and contextualize the most relevant papers
        const model = createModel();
        const response = await model.invoke([
            { role: 'system', content: SYSTEM_PROMPT },
            new HumanMessage(`Sub-questions:\n${subQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}\n\nSearch results:\n${JSON.stringify(searchResults, null, 2)}\n\nSelect the most relevant papers and output as JSON array.`),
        ]);

        let papers: any[] = [];
        const content = typeof response.content === 'string' ? response.content : '';
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) papers = parsed;
        } catch {
            const match = content.match(/\[[\s\S]*\]/);
            if (match) { try { papers = JSON.parse(match[0]); } catch {} }
        }

        if (papers.length === 0) papers = searchResults;

        logger.log(`Found ${papers.length} papers`);
        return new Response(JSON.stringify({ papers }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        logger.error((e as Error).message);
        // Fallback: return mock papers on error
        const fallback = searchPapers(subQuestions.join(' '), 4);
        return new Response(JSON.stringify({ papers: fallback }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
}
