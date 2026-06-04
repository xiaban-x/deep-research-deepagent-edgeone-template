/**
 * Post-processing for the synthesizer's draft report.
 *
 * The model occasionally leaks chain-of-thought, prepends preamble phrases,
 * or — after a multi-step continuation loop — duplicates the conclusion /
 * references sections. These heuristics clean those artifacts before the
 * report is shown to the user or persisted.
 */
import { createLogger } from './_shared';

const logger = createLogger('report-cleanup');

/**
 * Run the structure-fix pipeline on a draft report. Returns the cleaned
 * version (may equal the input if no changes were needed). Logs each rule
 * that fired. The caller is responsible for emitting `report_replace` to
 * the frontend when the length changes.
 */
export function cleanReportStructure(report: string): string {
  if (!report || report.length <= 500) return report;

  const originalLen = report.length;

  // 0a. Strip leaked internal reasoning / chain-of-thought text that sometimes
  //     appears at the very beginning of the report before the actual content.
  //     These are lines that clearly belong to the model's internal process,
  //     not to the final research report.
  //
  //     Patterns caught:
  //     - "第N步：..." / "Step N: ..."
  //     - Lines starting with "现在" + action ("现在所有数据已收集完毕。", "现在让我", ...)
  //     - "让我撰写" / "Let me write" / "I will now write"
  //     - "好的，" / "好的。" (affirmative self-talk)
  //     - "我需要" / "我将" / "我现在" lines
  //     - "首先，" / "接下来，" planning preambles
  {
    const firstHeadingIdx = report.indexOf('\n#');
    const preamble = firstHeadingIdx > 0 ? report.slice(0, firstHeadingIdx) : '';
    const rest = firstHeadingIdx > 0 ? report.slice(firstHeadingIdx) : report;

    if (preamble) {
      const reasoningLinePattern = /^(?:(?:第[一二三四五六七八九十\d]+步[：:：]|Step\s*\d+\s*[:：])[^\n]*\n?|现在(?:所有数据已收集完毕|让我|我将|开始)[^\n]*\n?|让我(?:撰写|开始|整合|综合|写一|生成)[^\n]*\n?|好的[，。,][^\n]*\n?|我(?:需要|将|现在|已经)[^\n]*\n?|(?:首先|接下来|然后|最后)[，,][^\n]*\n?|I(?:'ll| will| am going to| need to| have)[^\n]*\n?|(?:Now|Let me|OK,|Alright,)[^\n]*\n?)/gim;
      const cleanedPreamble = preamble.replace(reasoningLinePattern, '').trim();
      report = cleanedPreamble ? cleanedPreamble + rest : rest.trimStart();
    }

    // Also strip reasoning lines that appear anywhere in the report when they
    // are sandwiched between content (e.g. mid-stream leak of a "第三步：" line)
    report = report
      .replace(/^第[一二三四五六七八九十\d]+步[：:：][^\n]*\n/gm, '')
      .replace(/^Step\s*\d+\s*[:：][^\n]*\n/gim, '')
      .replace(/^现在(?:所有数据已收集完毕|让我|我将|开始)[^\n]*\n/gm, '')
      .replace(/^让我(?:撰写|开始|整合|综合|写一|生成)[^\n]*\n/gm, '')
      .replace(/^好的[，。,][^\n]*\n/gm, '')
      .replace(/^我(?:需要|将|现在|已经)(?:进行|开始|撰写|综合|生成|整理)[^\n]*\n/gm, '')
      .replace(/^以下是[^\n]*\n?/gm, '')
      .replace(/^下面是[^\n]*\n?/gm, '')
      .replace(/^Here(?:'s| is)(?: the| a)? (?:comprehensive |detailed |in-depth )?(?:research|report|summary|analysis|findings)[^\n]*\n?/gim, '')
      .replace(/^Based on (?:the |my )?(?:search results?|research)[^\n]*\n?/gim, '')
      .replace(/^The following (?:is |are )?(?:a |the )?(?:comprehensive |detailed )?(?:research|report|summary|analysis)[^\n]*\n?/gim, '');

    if (report.length !== originalLen) {
      logger.log(`stripped ${originalLen - report.length} chars of leaked reasoning text`);
    }
  }

  // 0b. Strip any supplementary reference sections inside appendix
  //    e.g. "参考文献（补充）", "补充参考文献", "Additional References"
  report = report
    .replace(/\n###?\s*(参考文献（补充）|补充参考文献|Additional References?|参考文献补充)[^\n]*\n[\s\S]*?(?=\n##|\s*$)/gi, '')
    .trimEnd();

  // 1. Find the FIRST references section and remove everything after it that's a duplicate
  const refPatterns = [/\n## 参考文献\n/g, /\n## 参考\n/g, /\n## References\n/g, /\n## 引用文献\n/g];
  let firstRefIndex = -1;
  let firstRefPattern = '';
  for (const pattern of refPatterns) {
    const match = pattern.exec(report);
    if (match && (firstRefIndex === -1 || match.index < firstRefIndex)) {
      firstRefIndex = match.index;
      firstRefPattern = match[0];
    }
    pattern.lastIndex = 0;
  }

  if (firstRefIndex > 0) {
    const afterFirstRef = report.slice(firstRefIndex + firstRefPattern.length);
    let secondRefIndex = -1;
    for (const pattern of refPatterns) {
      const match = pattern.exec(afterFirstRef);
      if (match && (secondRefIndex === -1 || match.index < secondRefIndex)) {
        secondRefIndex = match.index;
      }
      pattern.lastIndex = 0;
    }

    const conclusionPatterns = [/\n## 结论\n/g, /\n## 总结\n/g, /\n## Conclusion\n/g];
    const reportAfterRef = report.slice(firstRefIndex);
    let hasDuplicateConclusion = false;
    for (const pattern of conclusionPatterns) {
      if (pattern.test(reportAfterRef)) hasDuplicateConclusion = true;
      pattern.lastIndex = 0;
    }

    if (secondRefIndex > -1 || hasDuplicateConclusion) {
      if (secondRefIndex > -1) {
        const cutPoint = firstRefIndex + firstRefPattern.length + secondRefIndex;
        const before = report.length;
        report = report.slice(0, cutPoint).trimEnd();
        logger.log(`removed duplicate content after references (cut ${before - report.length} chars)`);
      }
    }

    // Remove any citation sub-section inside ## 附录 (after the first references section)
    const appendixMatch = /\n## 附录[\s\S]*$/.exec(report);
    if (appendixMatch) {
      const appendixStart = appendixMatch.index;
      const appendixContent = appendixMatch[0];
      const cleanedAppendix = appendixContent.replace(
        /\n###?\s*(参考文献|References?|引用|补充参考)[^\n]*\n[\s\S]*/gi,
        '',
      );
      if (cleanedAppendix !== appendixContent) {
        report = report.slice(0, appendixStart) + cleanedAppendix;
        logger.log('removed citation list inside appendix');
      }
    }
  }

  // 2. If report ends with a trailing empty section header from a continuation
  //    artifact, strip it
  report = report.replace(/\n## (结论|总结|Conclusion|参考文献|References|引用文献)\s*$/i, '').trimEnd();

  if (report.length !== originalLen) {
    logger.log(`adjusted report from ${originalLen} to ${report.length} chars`);
  }

  return report;
}

/**
 * Strip preamble phrases ("以下是...", "Here's the...") from the first
 * synthesizer chunk before sending it to the frontend. Returns the cleaned
 * text — empty string if everything was preamble.
 */
export function stripStreamPreamble(buffer: string): string {
  let cleaned = buffer
    .replace(/^以下是[^\n]*\n?/gm, '')
    .replace(/^下面是[^\n]*\n?/gm, '')
    .replace(/^Here(?:'s| is)(?: the| a)? (?:comprehensive |detailed |in-depth )?(?:research|report|summary|analysis|findings)[^\n]*\n?/gim, '')
    .replace(/^Based on (?:the |my )?(?:search results?|research)[^\n]*/gim, '')
    .replace(/^The following (?:is |are )?(?:a |the )?(?:comprehensive |detailed )?(?:research|report|summary|analysis)[^\n]*\n?/gim, '');
  cleaned = cleaned.replace(/^\n+/, '');
  return cleaned;
}

/**
 * Validate inline citations against the set of valid citation numbers.
 *
 * The app renders the canonical References list, so any [n] in the body must
 * map to a real source. This:
 *   1. Removes the model-written References / 参考文献 section entirely (the
 *      app owns it now). Reuses stripTrailingReferencesSection-style logic.
 *   2. Strips "ghost" [n] markers whose number is out of range (> maxNumber
 *      or <= 0) — they would otherwise render as red broken citations.
 *
 * Returns the cleaned report. `maxNumber` is the total source count
 * (papers + articles); valid citation numbers are 1..maxNumber.
 */
export function validateCitations(report: string, maxNumber: number): string {
  if (!report) return report;

  // 1. Drop any model-written references section. The app generates it.
  report = stripTrailingReferencesSection(report);

  // 2. Strip out-of-range [n] markers (and the surrounding bracket). Keep
  //    valid ones untouched. Handle both ASCII [n] and full-width ［n］.
  if (maxNumber >= 0) {
    report = report.replace(/[\[\uFF3B](\d+)[\]\uFF3D]/g, (full, numStr) => {
      const n = Number(numStr);
      if (Number.isFinite(n) && n >= 1 && n <= maxNumber) return full;
      // Ghost citation — remove it (and any leading space it left behind).
      return '';
    });
    // Collapse any double spaces left by removed markers.
    report = report.replace(/ {2,}/g, ' ').replace(/ +([,.;，。；])/g, '$1');
  }

  return report;
}

/**
 * Local copy of the frontend's trailing-references stripper so the backend
 * can remove a model-written "参考文献 / References" section before persisting.
 * Anchors on the LAST reference-label heading in the bottom 60% of the doc.
 */
function stripTrailingReferencesSection(markdown: string): string {
  if (!markdown) return markdown;
  const lines = markdown.split('\n');
  const LABEL =
    '(?:references?|bibliography|works\\s+cited' +
    '|参\\s*考\\s*文\\s*献|参\\s*考\\s*资\\s*料|引\\s*用\\s*文\\s*献' +
    '|引\\s*用\\s*来\\s*源|文\\s*献\\s*列\\s*表|来\\s*源\\s*列\\s*表|参\\s*考\\s*书\\s*目)';
  const NUMBERING = '(?:\\d+\\s*[\\.、．]?\\s*)?';
  const TRAILING = '\\s*[:：]?\\s*';
  const headingRe = new RegExp(`^\\s{0,3}#{1,6}\\s+${NUMBERING}${LABEL}${TRAILING}$`, 'i');
  const boldRe = new RegExp(`^\\s{0,3}(?:\\*\\*|__)${NUMBERING}${LABEL}${TRAILING}(?:\\*\\*|__)\\s*$`, 'i');
  const bareRe = new RegExp(`^\\s{0,3}${NUMBERING}${LABEL}${TRAILING}$`, 'i');
  const isLabelLine = (s: string) => headingRe.test(s) || boldRe.test(s) || bareRe.test(s);

  const minIdx = Math.floor(lines.length * 0.4);
  let cutAt = -1;
  for (let i = lines.length - 1; i >= minIdx; i--) {
    if (isLabelLine(lines[i])) { cutAt = i; break; }
  }
  if (cutAt === -1) return markdown;
  let end = cutAt;
  while (end > 0 && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(0, end).join('\n');
}
