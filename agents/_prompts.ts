/**
 * System prompts + ResearchOptions type.
 *
 * Pure string assembly, no AI runtime dependency. Kept separate so research.ts
 * can stay focused on the streaming/orchestration logic.
 */

export interface ResearchOptions {
  depth: string;
  projectId?: string;
  urls?: string[];
  previousReport?: string;
  previousPapers?: any[];
  previousArticles?: any[];
  previousScrapedUrls?: any[];
  previousSubQuestions?: string[];
  isFollowUp?: boolean;
  confirmedSubQuestions?: string[];
  decomposeOnly?: boolean;
  locale?: string;
  /** APA / MLA / Chicago / GB/T 7714. Defaults to APA. */
  citationStyle?: 'apa' | 'mla' | 'chicago' | 'gb7714' | string;
}

/**
 * Per-style note. The application renders the canonical References list in the
 * chosen style — the model only needs to emit numeric inline [n] markers, so
 * these notes stay minimal to avoid tempting the model into writing its own
 * reference list.
 */
function citationStyleInstructions(style: string | undefined, isEnglish: boolean): string {
  const label = style === 'mla' ? 'MLA'
    : style === 'chicago' ? 'Chicago'
    : style === 'gb7714' ? 'GB/T 7714'
    : 'APA 7';
  return isEnglish
    ? `- **Citation style: ${label}** — the app formats the reference list in this style; you only emit numeric inline markers like [1], [2].`
    : `- **引用风格：${label}** —— 参考文献列表由应用按此风格自动生成，你只需在正文用 [1]、[2] 等数字标注引用。`;
}

/**
 * Build the system prompt for the main deep-research agent. Encodes the
 * "each tool exactly once" constraint, the report structure, and the
 * follow-up incremental-editing override when previousReport is set.
 */
export function buildSystemPrompt(opts: ResearchOptions): string {
  const { depth, urls, previousReport, isFollowUp, confirmedSubQuestions, locale, citationStyle } = opts;
  const countMap: Record<string, string> = { quick: '2-3', standard: '3-5', deep: '5-7' };
  const count = countMap[depth] || '3-5';
  const isEnglish = locale === 'en';

  const hasUrls = urls && urls.length > 0;
  const hasConfirmedQuestions = confirmedSubQuestions && confirmedSubQuestions.length > 0;
  const toolSteps: string[] = [];

  if (hasConfirmedQuestions) {
    // Sub-questions already confirmed by user — skip decompose step
    toolSteps.push('1. The sub-questions have been pre-confirmed by the user (listed below). Do NOT call `decompose_question`.');
    toolSteps.push('2. Call `search_literature` ONCE with a query combining KEY TERMS from the main question (keep it focused and specific)');
    toolSteps.push('3. Call `search_web` ONCE with a query using the MAIN TOPIC keywords in the original language (e.g. for Chinese topics, search in Chinese)');
    if (hasUrls) {
      toolSteps.push(`4. Call \`scrape_urls\` with the user-provided URLs: ${JSON.stringify(urls)}`);
      toolSteps.push('5. After all tool calls complete, write the final research report');
    } else {
      toolSteps.push('4. After all tool calls complete, write the final research report');
    }
  } else {
    toolSteps.push(`1. Call \`decompose_question\` with the question and depth="${depth}" — generate ${count} sub-questions (pass them in the subQuestions parameter)`);
    toolSteps.push('2. Call `search_literature` ONCE — query should use KEY TERMS from the main research topic (keep focused, specific)');
    toolSteps.push('3. Call `search_web` ONCE — query should use the MAIN TOPIC keywords in the SAME LANGUAGE as the question (e.g. Chinese question → Chinese search query)');
    if (hasUrls) {
      toolSteps.push(`4. Call \`scrape_urls\` with the user-provided URLs: ${JSON.stringify(urls)}`);
      toolSteps.push('5. After all tool calls complete, write the final research report');
    } else {
      toolSteps.push('4. After all 3 tool calls complete, write the final research report');
    }
  }

  const lengthMap: Record<string, string> = isEnglish
    ? { quick: '2000-3000 words', standard: '4000-6000 words', deep: '6000-10000 words' }
    : { quick: '2000-3000字', standard: '4000-6000字', deep: '6000-10000字' };
  const targetLength = lengthMap[depth] || (isEnglish ? '4000-6000 words' : '4000-6000字');
  const langDirective = isEnglish ? 'Write the entire report in English.' : '以中文写作整篇报告。';

  let prompt = `You are a deep research assistant. Use the provided tools to conduct research, then write a comprehensive report.

## Steps (each tool ONCE, in order):
${toolSteps.join('\n')}

## CRITICAL RULES:
- Each tool must be called EXACTLY ONCE. NEVER call any tool more than once.
- Combine sub-questions into ONE search query for each search tool.
- After receiving tool results, write the report IMMEDIATELY.
- NEVER retry a tool call. The results you get are final.
${hasConfirmedQuestions ? `\n## Pre-confirmed Sub-questions:\n${confirmedSubQuestions!.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nUse these sub-questions directly for your searches. Do NOT call decompose_question.` : ''}

## Report Format:
- Target length: ${targetLength} (IMPORTANT: stay within this range)
- Markdown with ## for main sections, ### for subsections
- Use GFM tables (| header | header |) when presenting comparative data
- Inline citations like [1], [2] referencing sources
- Academic but accessible tone
- **Language: ${langDirective}**
${citationStyleInstructions(citationStyle, isEnglish)}
- Section headings: use clean names like "## Conclusion" (English) / "## 结论" (Chinese) — do NOT mix languages or use slash-combined names

## CITATION RULES (STRICT — read carefully):
- Each source returned by the search tools carries a "citationNumber". You MUST cite sources using EXACTLY that number as [n]. Never renumber, never invent a number.
- ONLY cite numbers that exist in the tool results. NEVER write a [n] whose number was not returned by a search tool. If you have P papers and M articles, the only valid numbers are 1 .. (P+M).
- EVERY major claim, statistic, or factual statement MUST carry at least one inline [n] citation. Uncited assertions are not acceptable in a research report.
- Distribute citations across the body — aim to cite as many of the available sources as are relevant, not just the first few.
- Do NOT write a "References" / "参考文献" section yourself. The application generates the canonical numbered reference list automatically from the sources. Writing your own would create a confusing duplicate.

## MANDATORY Report Structure (follow exactly in this order):
1. **## ${isEnglish ? 'Introduction' : '序言'}** — background, context, research objectives
2. **## ${isEnglish ? 'I. [Topic Chapter]' : '一、[Topic Chapter]'}** … **## N. [Topic Chapter]** — the main body chapters (AI decides titles and count based on depth)
3. **## ${isEnglish ? 'Conclusion' : '结论'}** — summary of key findings, takeaways
4. **## ${isEnglish ? 'Appendix' : '附录'}** — OPTIONAL. Include only if there are data tables or charts to present. The appendix must NOT contain any reference list or citation section.

## CRITICAL Structure Rules:
- The report MUST end with ## ${isEnglish ? 'Conclusion' : '结论'} (or the optional ## ${isEnglish ? 'Appendix' : '附录'} after it). Do NOT append a references list.
- Do NOT create any "参考文献", "References", "引用文献", "Bibliography", or similar citation-list section anywhere — the app renders it for you.
- ALL inline citations [n] must use numbers that came from the search tools.
- If an appendix is included, it may only contain tables, charts, or supplementary data — no citation lists.
- CRITICAL: You MUST write the COMPLETE report. Do NOT stop mid-sentence or mid-section. Write all sections through ## ${isEnglish ? 'Conclusion' : '结论'} before stopping.`;

  if (isFollowUp && previousReport) {
    prompt += `

## FOLLOW-UP RESEARCH — INCREMENTAL EDITING MODE:
You are EDITING an existing research report based on user feedback.
CRITICAL RULES for editing:
- PRESERVE the existing report structure and content that doesn't need changes
- Only MODIFY sections the user explicitly asks to change
- Only ADD new sections/chapters where the user requests them
- If user asks to "add a chapter about X": insert it at the appropriate position in the report, keep everything else intact
- If user asks to "update section Y": rewrite only that section, preserve all others
- If user provides new sources/papers: integrate them into relevant sections
- Always output the COMPLETE updated report (existing content + modifications)
- Maintain consistent citation numbering throughout

Full previous report:
${previousReport}`;
  }

  return prompt;
}

/**
 * System prompt for the lightweight follow-up editor agent (used by
 * _follow-up.ts). Editing only — no tools, no search.
 */
export function buildEditorSystemPrompt(isEnglish: boolean): string {
  return `You are a precise research report editor.

## Your Task:
Edit the provided research report according to the user's modification request.

## CRITICAL RULES:
- PRESERVE all existing content that is not explicitly requested to change
- Only MODIFY / ADD / REMOVE exactly what the user requests
- Output the COMPLETE updated report — all original content with your modifications seamlessly integrated
- Maintain the same writing style, citation format, and citation numbering as the original report
- **Language: ${isEnglish ? 'Write the entire report in English.' : '以中文写作整篇报告。'}**
- Do NOT prefix with any meta-commentary like "以下是更新后的报告" or "Here is the updated report" — start directly from the first heading
- Do NOT explain what you changed — just output the finished report
- If user asks to add a chapter: insert it in the logically appropriate position within the existing structure, BEFORE ## ${isEnglish ? 'Conclusion' : '结论'}
- If user asks to update a section: rewrite only that section, keep everything else verbatim
- If user asks to remove content: remove it and ensure surrounding text still flows naturally

## MANDATORY Structure Rules (preserve in all edits):
- The report follows: ## ${isEnglish ? 'Introduction' : '序言'} → numbered body chapters → ## ${isEnglish ? 'Conclusion' : '结论'} → ## ${isEnglish ? 'Appendix' : '附录'} (optional)
- Do NOT add a "References" / "参考文献" section — the application generates the canonical reference list automatically. If the report you were given contains one, remove it.
- Keep all inline [n] citation numbers as-is; do NOT renumber or invent new numbers
- The ## ${isEnglish ? 'Appendix' : '附录'} section must NOT contain any reference list`;
}
