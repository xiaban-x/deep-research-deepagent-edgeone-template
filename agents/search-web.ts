/**
 * Web Search Sub-Agent — Finds relevant web articles and news.
 *
 * Uses lightweight model.invoke() + direct tool execution (no deepagents overhead).
 * Called by orchestrator via context.agents.invoke('/search-web', payload).
 */
import { createModel, createLogger } from './_shared';
import { HumanMessage } from '@langchain/core/messages';

const logger = createLogger('search-web');

const MOCK_ARTICLES = [
    { title: 'The Race to Build a Practical Quantum Computer Enters a New Phase', url: 'https://www.technologyreview.com/2025/quantum-computing-race', source: 'MIT Technology Review', date: '2025-03-15', snippet: 'Major tech companies are competing to achieve quantum advantage in practical applications.' },
    { title: 'AI Research Tools Are Changing How Scientists Work', url: 'https://www.nature.com/articles/d41586-025-00892-3', source: 'Nature News', date: '2025-02-28', snippet: 'A growing number of research institutions are adopting AI-powered tools for literature review.' },
    { title: 'OpenAI Announces New Research-Focused Model Architecture', url: 'https://openai.com/blog/research-model-2025', source: 'OpenAI Blog', date: '2025-04-01', snippet: 'New architecture designed for multi-step reasoning in scientific contexts.' },
    { title: 'Climate Impact of AI: Industry Report 2025', url: 'https://www.iea.org/reports/ai-energy-2025', source: 'International Energy Agency', date: '2025-01-20', snippet: 'Data centers supporting AI workloads now consume 4% of global electricity.' },
    { title: 'Neuralink Achieves Milestone in Human Brain-Computer Interface Trials', url: 'https://www.reuters.com/technology/neuralink-bci-milestone-2025', source: 'Reuters', date: '2025-03-22', snippet: 'Participants can now control complex digital interfaces using thought alone.' },
    { title: 'Fusion Startup Secures Record $2B Funding Round', url: 'https://www.bloomberg.com/news/fusion-funding-2025', source: 'Bloomberg', date: '2025-02-10', snippet: 'Commonwealth Fusion Systems raises largest-ever private fusion investment.' },
    { title: 'CRISPR Gene Therapy Shows Promise for Rare Diseases', url: 'https://www.statnews.com/crispr-rare-diseases-2025', source: 'STAT News', date: '2025-04-05', snippet: 'Clinical trials demonstrate sustained remission in patients with sickle cell disease.' },
    { title: 'Autonomous Vehicles: The Regulatory Landscape in 2025', url: 'https://www.wired.com/autonomous-vehicles-regulation-2025', source: 'Wired', date: '2025-03-01', snippet: 'New federal guidelines create pathway for Level 4 autonomous driving.' },
];

const SYSTEM_PROMPT = `You are a web research specialist. Based on the sub-questions provided, select the most relevant web articles from the search results.
Output ONLY a JSON array of the selected articles. No markdown fences, no explanations.`;

function searchArticles(query: string, maxResults = 4): any[] {
    const keywords = query.toLowerCase().split(/\s+/);
    const scored = MOCK_ARTICLES.map(article => {
        const text = `${article.title} ${article.snippet} ${article.source}`.toLowerCase();
        const score = keywords.filter(k => text.includes(k)).length;
        return { ...article, score };
    }).sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map(({ score, ...a }) => a);
}

export async function onRequest(context: any) {
    const { request } = context;
    const { subQuestions } = request?.body ?? {};

    if (!subQuestions || !Array.isArray(subQuestions)) {
        return new Response(JSON.stringify({ error: 'Missing subQuestions array' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        logger.log(`Searching web for ${subQuestions.length} sub-questions`);

        // Direct tool call: search articles based on sub-questions
        const query = subQuestions.join(' ');
        const searchResults = searchArticles(query, 5);

        // Use model to select and contextualize
        const model = createModel();
        const response = await model.invoke([
            { role: 'system', content: SYSTEM_PROMPT },
            new HumanMessage(`Sub-questions:\n${subQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}\n\nSearch results:\n${JSON.stringify(searchResults, null, 2)}\n\nSelect the most relevant articles and output as JSON array.`),
        ]);

        let articles: any[] = [];
        const content = typeof response.content === 'string' ? response.content : '';
        let jsonStr = content.trim();
        if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) articles = parsed;
        } catch {
            const match = content.match(/\[[\s\S]*\]/);
            if (match) { try { articles = JSON.parse(match[0]); } catch {} }
        }

        if (articles.length === 0) articles = searchResults;

        logger.log(`Found ${articles.length} articles`);
        return new Response(JSON.stringify({ articles }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
        logger.error((e as Error).message);
        // Fallback: return mock articles on error
        const fallback = searchArticles(subQuestions.join(' '), 4);
        return new Response(JSON.stringify({ articles: fallback }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
}
