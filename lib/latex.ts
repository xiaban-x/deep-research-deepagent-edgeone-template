/**
 * Markdown → LaTeX (.tex) conversion + browser-side PDF export.
 *
 * Why these formats matter for deep-research vs content-creator:
 * Researchers writing journal articles, theses, or grant proposals work in
 * LaTeX (Overleaf, TeX Live). They want a `.tex` file that compiles directly
 * with their reference list, AND they want a PDF preview without leaving the
 * browser. This module handles both.
 *
 * The LaTeX converter is intentionally minimal: it covers the markdown
 * subset our research reports use (h2/h3 headings, paragraphs, ordered/
 * unordered lists, tables, code, blockquotes, inline emphasis, citations).
 * Anything else passes through as-is — the user can post-process if needed.
 */
import type { Source } from '@/app/page';
import { sourcesToBibtex } from './citations';

// ─── Special-character escaping ──────────────────────────────────────────────

/**
 * Strip a trailing "References" / "参考文献" / "Bibliography" section from a
 * markdown report. The synthesizer LLM tends to repeat the citation list it
 * was fed (sometimes once in Chinese, once in English) right at the end of
 * the report — which then collides with the structured References block we
 * always render ourselves. Trimming everything from the first matching label
 * line onward gives us a single, canonical references section in both the
 * printed PDF and the .tex output.
 *
 * The label can appear as any of:
 *   - a markdown heading:           `## 参考文献`,  `### References`
 *   - a bold pseudo-heading:        `**参考文献**`,  `__References__`
 *   - a numbered heading:           `## 5. References`,  `5、参考文献`
 *   - a plain bare line:            `参考文献`  (this is what GPT/Claude
 *                                    typically emit for Chinese reports)
 *   - any of the above with a trailing colon `:` / `：`
 *
 * We anchor on the LAST such line in the bottom 60% of the document, so
 * a body section legitimately discussing related work earlier on is safe.
 */
export function stripTrailingReferencesSection(markdown: string): string {
  if (!markdown) return markdown;
  const lines = markdown.split('\n');

  // Core label alternation, used for every variant. Allow internal whitespace
  // for CJK so "参 考 文 献" still matches.
  const LABEL =
    '(?:' +
      'references?' +
      '|bibliography' +
      '|works\\s+cited' +
      '|参\\s*考\\s*文\\s*献' +
      '|参\\s*考\\s*资\\s*料' +
      '|引\\s*用\\s*文\\s*献' +
      '|引\\s*用\\s*来\\s*源' +
      '|文\\s*献\\s*列\\s*表' +
      '|来\\s*源\\s*列\\s*表' +
      '|参\\s*考\\s*书\\s*目' +
    ')';
  // Optional leading numbering: "5.", "5、", "5．", "5 "
  const NUMBERING = '(?:\\d+\\s*[\\.、．]?\\s*)?';
  // Optional trailing punctuation: ":" / "："
  const TRAILING = '\\s*[:：]?\\s*';

  // Variant 1: markdown heading — "## References"
  const headingRe = new RegExp(`^\\s{0,3}#{1,6}\\s+${NUMBERING}${LABEL}${TRAILING}$`, 'i');
  // Variant 2: bold pseudo-heading — "**References**" / "__参考文献__"
  const boldRe = new RegExp(`^\\s{0,3}(?:\\*\\*|__)${NUMBERING}${LABEL}${TRAILING}(?:\\*\\*|__)\\s*$`, 'i');
  // Variant 3: bare line — "参考文献" / "References" / "5. 参考文献"
  // We're stricter here (no inline content trailing the label) so we don't
  // chop body paragraphs that happen to start with "References show that...".
  const bareRe = new RegExp(`^\\s{0,3}${NUMBERING}${LABEL}${TRAILING}$`, 'i');

  const isLabelLine = (s: string) => headingRe.test(s) || boldRe.test(s) || bareRe.test(s);

  // Find the LAST label line in the bottom 60% of the file.
  const minIdx = Math.floor(lines.length * 0.4);
  let cutAt = -1;
  for (let i = lines.length - 1; i >= minIdx; i--) {
    if (isLabelLine(lines[i])) { cutAt = i; break; }
  }
  if (cutAt === -1) return markdown;

  // Trim trailing blank lines before the cut so the body doesn't end with
  // phantom whitespace.
  let end = cutAt;
  while (end > 0 && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(0, end).join('\n');
}

/** Escape LaTeX special chars in arbitrary text content. */
function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, m => `\\${m}`)
    .replace(/[#$%&_]/g, m => `\\${m}`)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

// ─── Inline-element conversion ───────────────────────────────────────────────

/**
 * Convert inline markdown (bold/italic/code/links/citations) to LaTeX.
 *
 * Citation markers `[1]` are emitted as a literal "[1]" (wrapped in
 * `\hyperlink{ref:1}{...}` so the PDF gets a clickable jump to the matching
 * entry in the manual References list at the end of the document). We
 * intentionally do NOT use `\cite{key}` / biblatex anymore: that pipeline
 * required users to run `biber` between xelatex passes, and most casual
 * compilers (TeXShop's default ⌘B, Online "Quick" compile, ...) only run
 * xelatex once — leaving the report full of unresolved
 * "[yi2012gpgpu]"-style raw keys.
 *
 * We must escape special chars LAST, after we've extracted the inline
 * structure (otherwise `\textbf{...}` itself gets escaped).
 */
function convertInline(line: string, sourceByCite: Map<number, Source>): string {
  // Step 1: Pull out structures into placeholder tokens before escaping.
  const tokens: string[] = [];
  const PLACEHOLDER = '\u0001TOKEN\u0001';
  const stash = (latex: string) => {
    tokens.push(latex);
    return `${PLACEHOLDER}${tokens.length - 1}${PLACEHOLDER}`;
  };

  let out = line;

  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, (_, code) => stash(`\\texttt{${escapeLatex(code)}}`));
  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, t) => stash(`\\textbf{${escapeLatex(t)}}`));
  out = out.replace(/__([^_]+)__/g, (_, t) => stash(`\\textbf{${escapeLatex(t)}}`));
  // Italic: *text* or _text_ (skip the previously-tokenized bold)
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_, t) => stash(`\\emph{${escapeLatex(t)}}`));
  out = out.replace(/(?<!_)_([^_\n]+)_(?!_)/g, (_, t) => stash(`\\emph{${escapeLatex(t)}}`));
  // Links: [text](url) — convert to \href{url}{text}
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
    stash(`\\href{${url}}{${escapeLatex(text)}}`),
  );
  // Citation markers: [N] → "[N]" wrapped in \hyperlink to the manual
  // References entry at the bottom of the document. The visible text stays
  // exactly the same as in the markdown (bracketed integer), so users see
  // the familiar "[1] [2]" rendering with no biber roundtrip required.
  // Full-width brackets are honored so reports written with Chinese
  // punctuation also link cleanly.
  out = out.replace(/[\[\uFF3B](\d+)[\]\uFF3D]/g, (full, num) => {
    const source = sourceByCite.get(Number(num));
    if (!source) return stash(escapeLatex(full)); // ghost — keep visible literally
    // \hyperlink renders as plain text when hyperref is loaded but no anchor
    // is found, so even if the References block is somehow missing the
    // "[N]" still shows correctly.
    return stash(`\\hyperlink{ref:${num}}{[${num}]}`);
  });

  // Step 2: Escape everything that's left.
  out = escapeLatex(out);

  // Step 3: Restore tokens (escaping `escapeLatex` would have mangled `\u0001`).
  out = out.replace(/\u0001TOKEN\u0001(\d+)\u0001TOKEN\u0001/g, (_, idx) => tokens[Number(idx)] || '');

  return out;
}

// ─── Block-level conversion ──────────────────────────────────────────────────

interface ConvertOptions {
  title?: string;
  author?: string;
  /** Path to the .bib file referenced in \bibliography{...}. Default: "refs". */
  bibBasename?: string;
  /**
   * Heading text for the auto-generated References section. Defaults to
   * "References" — pass the locale-appropriate label (e.g. "参考文献") so
   * the .tex output matches the user's interface language.
   */
  referencesLabel?: string;
}

/**
 * Convert markdown body → LaTeX body (no preamble, no document wrapper).
 * Useful when the user has their own LaTeX template and just wants the body.
 */
export function markdownToLatexBody(markdown: string, sources: Source[]): string {
  // Drop any trailing References / 参考文献 the synthesizer wrote inline so
  // we don't end up with two reference sections (one inline, one from
  // \printbibliography) in the compiled PDF.
  markdown = stripTrailingReferencesSection(markdown);

  const sourceByCite = new Map<number, Source>();
  for (const s of sources) sourceByCite.set(s.citationNumber, s);

  const lines = markdown.split('\n');
  const out: string[] = [];
  let inUnorderedList = false;
  let inOrderedList = false;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let inTable = false;
  let tableHeaderEmitted = false;
  let tableColCount = 0;

  const closeLists = () => {
    if (inUnorderedList) { out.push('\\end{itemize}'); inUnorderedList = false; }
    if (inOrderedList) { out.push('\\end{enumerate}'); inOrderedList = false; }
  };
  const closeTable = () => {
    if (inTable) { out.push('\\end{longtable}'); out.push('\\end{center}'); inTable = false; tableHeaderEmitted = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code fences (```)
    if (/^```/.test(line)) {
      if (inCodeBlock) {
        out.push('\\begin{verbatim}');
        out.push(...codeBuffer);
        out.push('\\end{verbatim}');
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        closeLists();
        closeTable();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // GFM tables. Detect by the `|---|---|` separator on the second row.
    const looksLikeTableRow = (s: string) => /^\s*\|.+\|\s*$/.test(s);
    const looksLikeTableSep = (s: string) => /^\s*\|?\s*:?-+:?(\s*\|\s*:?-+:?)+\s*\|?\s*$/.test(s);
    if (looksLikeTableRow(line) && looksLikeTableSep(lines[i + 1] || '')) {
      // header row — count columns and start tabular
      closeLists();
      const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1 || arr.length <= 2);
      const cleaned = cells.length > 0 ? cells : line.split('|').map(c => c.trim()).filter(Boolean);
      tableColCount = cleaned.length || 1;
      inTable = true;
      // Use longtable for cross-page wrapping. The column width is computed
      // with `\dimexpr ... \relax` because the `p{...}` argument expects a
      // single <dimen> token — bare arithmetic like
      // `0.2\linewidth - 2\tabcolsep` is NOT evaluated, and LaTeX would
      // happily typeset the literal "- 2..." as the cell content (that's
      // what produced the "- 2 技术路线" prefix on every cell). Wrapping in
      // \dimexpr forces actual length arithmetic.
      //
      // Width budget: split the line width evenly across columns, then
      // subtract the per-column padding (2*\tabcolsep) and the rule width
      // so the total still fits within \linewidth even with N+1 vertical
      // rules. \small reduces font size to give long English entries
      // (e.g. "Quantinuum H2") more breathing room before they overflow.
      const colWidth = (1.0 / tableColCount).toFixed(4);
      const colSpec = `|${('>{\\raggedright\\arraybackslash\\small}p{\\dimexpr ' + colWidth + '\\linewidth-2\\tabcolsep-1.5pt\\relax}|').repeat(tableColCount)}`;
      out.push('\\begin{center}\\small');
      out.push(`\\begin{longtable}{${colSpec}}`);
      out.push('\\hline');
      out.push(cleaned.map(c => `\\textbf{${convertInline(c, sourceByCite)}}`).join(' & ') + ' \\\\');
      out.push('\\hline');
      out.push('\\endhead');
      tableHeaderEmitted = true;
      i += 1; // skip the separator line on next iteration
      continue;
    }
    if (inTable) {
      if (looksLikeTableRow(line)) {
        const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const cleaned = cells.length > 0 ? cells : line.split('|').map(c => c.trim()).filter(Boolean);
        const padded = [...cleaned];
        while (padded.length < tableColCount) padded.push('');
        out.push(padded.slice(0, tableColCount).map(c => convertInline(c, sourceByCite)).join(' & ') + ' \\\\');
        out.push('\\hline');
        continue;
      }
      // Non-table line: close it.
      closeTable();
    }

    // Horizontal rules (---, ***, ___) — markdown uses these as section
    // dividers but they have no native LaTeX equivalent in `article` style
    // and would otherwise leak into the .tex output as bare text. Drop them.
    if (/^\s{0,3}(?:-\s*-\s*-+|\*\s*\*\s*\*+|_\s*_\s*_+)\s*$/.test(line)) {
      closeLists();
      continue;
    }

    // Headings (## / ###). We use the *-variants (\section*, \subsection*)
    // so LaTeX doesn't auto-number them: the synthesizer's markdown already
    // includes manual numbering ("一、M5...", "1.1 制程..."), and stacking
    // both gives the dreaded "2 一、M5..." / "2.1 1.1 制程..." double-
    // numbered output the user reported.
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 || h2 || h3) {
      closeLists();
      const text = (h1 || h2 || h3)![1];
      const cmd = h1 ? '\\section*' : h2 ? '\\section*' : '\\subsection*';
      out.push(`${cmd}{${convertInline(text, sourceByCite)}}`);
      continue;
    }

    // Blockquote (single line for now)
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      closeLists();
      out.push(`\\begin{quote}\n${convertInline(bq[1], sourceByCite)}\n\\end{quote}`);
      continue;
    }

    // Unordered list
    const ul = line.match(/^\s*[-*+]\s+(.+)$/);
    if (ul) {
      if (!inUnorderedList) {
        closeLists();
        out.push('\\begin{itemize}');
        inUnorderedList = true;
      }
      out.push(`  \\item ${convertInline(ul[1], sourceByCite)}`);
      continue;
    }

    // Ordered list
    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ol) {
      if (!inOrderedList) {
        closeLists();
        out.push('\\begin{enumerate}');
        inOrderedList = true;
      }
      out.push(`  \\item ${convertInline(ol[1], sourceByCite)}`);
      continue;
    }

    // Blank line: close any open list/table
    if (line.trim() === '') {
      closeLists();
      out.push('');
      continue;
    }

    // Default: paragraph text
    closeLists();
    out.push(convertInline(line, sourceByCite));
  }
  closeLists();
  closeTable();
  if (inCodeBlock) {
    out.push('\\begin{verbatim}');
    out.push(...codeBuffer);
    out.push('\\end{verbatim}');
  }

  return out.join('\n');
}

/**
 * Convert markdown → a complete, compilable LaTeX document.
 *
 * Compiles with **xelatex** (or lualatex) in a single pass. The ctex
 * package provides Chinese support; UTF-8 source is read natively by
 * xelatex, so inputenc/fontenc/lmodern (which break CJK in pdflatex) are
 * not needed.
 *
 * Why no biblatex / \cite / biber: research reports are typically read,
 * not formally cited from. Forcing users to run a 4-pass biber build just
 * to resolve "[1]" markers leads to the all-too-common
 * "[yi2012gpgpu]"-still-shows-as-key bug. Instead we emit the citation
 * markers as literal "[N]" hyperlinks pointing to a hand-rolled
 * References list at the end of the document — one xelatex pass produces
 * a complete PDF with clickable internal links.
 *
 * Why no \title / \maketitle / page numbers in the running header: the
 * report markdown already starts with its own H1 ("序言" / "Introduction"
 * etc.) and uses manual section numbering ("一、M5..."). Auto-numbering on
 * top of the manual numbering is what produces the "1 序言 / 2.1 1.1 制程"
 * double-numbered output the user reported. \pagestyle{plain} also drops
 * the section-name running header.
 */
export function markdownToLatexDocument(markdown: string, sources: Source[], opts: ConvertOptions = {}): string {
  // Accept opts.title / opts.author for API compatibility but ignore them
  // — see the doc-block above for why.
  void opts.title;
  void opts.author;
  void opts.bibBasename;

  const referencesLabel = opts.referencesLabel || 'References';
  const body = markdownToLatexBody(markdown, sources);
  const refsBlock = renderSourcesAsLatex(sources, referencesLabel);

  return `% !TEX program = xelatex
% Compiles with xelatex (or lualatex) in ONE pass — no biber/biblatex
% roundtrip required. Citations render as literal "[N]" hyperlinks
% pointing to the References block at the end of the document. Section
% headings use the *-variants so LaTeX does not auto-number on top of the
% report's manual "一、" / "1.1 " numbering.
\\documentclass[11pt,a4paper]{ctexart}

\\usepackage{microtype}
\\usepackage[margin=1in]{geometry}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\hypersetup{colorlinks=true, linkcolor=blue, citecolor=blue, urlcolor=blue}
\\usepackage{enumitem}
\\usepackage{array}
\\usepackage{booktabs}
\\usepackage{longtable}

% Drop the running header that puts "1 序言" at the top of every page,
% and don't number sections (we want the source markdown's own numbering).
\\pagestyle{plain}
\\setcounter{secnumdepth}{-2}

\\begin{document}

${body}
${refsBlock}
\\end{document}
`;
}

/**
 * Render the sources list as a hand-rolled LaTeX References block.
 *
 * Each entry sits behind a `\hypertarget{ref:N}` so the inline `[N]`
 * citation hyperlinks defined in convertInline() jump straight to it. We
 * intentionally don't use `thebibliography` (which would auto-number with
 * its own `\bibitem` counter) — the report's citation numbers come from
 * the synthesizer and we want to preserve them verbatim.
 *
 * Implementation note: we don't use `\item[...]` to set the label,
 * because LaTeX's `\item` optional argument terminates at the first `]`
 * it sees — even when the `]` is inside a `{...}` group nested in a
 * macro argument like `\hypertarget{ref:1}{[1]}`. That bug caused every
 * entry's label to render as the literal "1" (the first character past
 * the truncated argument). Instead we use a `description`-style list
 * that emits the label inline as a regular `\item ...` body, where
 * `[1]` survives without being parsed as an optional-arg delimiter.
 *
 * URLs and DOIs are emitted as `\url{}` so xelatex preserves them as
 * clickable links in the PDF without us having to manually escape `%`,
 * `#`, or `_` inside them.
 */
function renderSourcesAsLatex(sources: Source[], referencesLabel: string): string {
  if (!sources.length) return '';
  const lines: string[] = [];
  lines.push('');
  lines.push(`\\section*{${escapeLatex(referencesLabel)}}`);
  // Compact, journal-style References block. We use a manual list with no
  // bullet so the bracketed number we emit ourselves is the visible label.
  lines.push('\\begingroup');
  lines.push('\\small');
  lines.push('\\setlength{\\parindent}{0pt}');
  lines.push('\\setlength{\\parskip}{0.35em}');

  for (const s of sources) {
    const num = s.citationNumber;
    const parts: string[] = [];
    parts.push(`\\textbf{${escapeLatex(s.title || '(Untitled)')}}`);
    if (Array.isArray(s.authors) && s.authors.length > 0) {
      parts.push(escapeLatex(s.authors.join(', ')));
    } else if (typeof s.authors === 'string' && s.authors) {
      parts.push(escapeLatex(s.authors as unknown as string));
    }
    const meta: string[] = [];
    if (s.year) meta.push(String(s.year));
    if (s.journal) meta.push(`\\emph{${escapeLatex(s.journal)}}`);
    if (s.source && !s.journal) meta.push(escapeLatex(s.source));
    if (s.date && !s.year) meta.push(escapeLatex(s.date));
    if (meta.length) parts.push(meta.join(' \\textperiodcentered\\ '));
    if (s.doi) parts.push(`DOI: \\url{https://doi.org/${s.doi}}`);
    else if (s.url) parts.push(`\\url{${s.url}}`);

    // Each entry is a hanging-indent paragraph with the number flush left.
    // \noindent + \hangindent gives the classic "[1] body...\n    continued"
    // layout without relying on list-environment optional-arg parsing.
    lines.push(`\\noindent\\hangindent=2.4em\\hangafter=1\\makebox[2.2em][l]{\\textbf{\\hypertarget{ref:${num}}{[${num}]}}}${parts.join(' \\textperiodcentered\\ ')}\\par`);
  }
  lines.push('\\endgroup');
  return lines.join('\n');
}

// ─── PDF export (browser print, in-place via hidden iframe) ─────────────────



/**
 * Render the given HTML body to a printable document inside a hidden iframe
 * and trigger the browser's print dialog directly. The user picks "Save as
 * PDF" from the dialog; the resulting file has native, selectable text and
 * working internal `#source-N` jumps as well as external `<a href>` links.
 *
 * Why this approach (vs. jsPDF + html2canvas, which we used previously):
 *   - jsPDF + html2canvas produces an *image-only* PDF — text isn't
 *     selectable and search engines can't index it. Users called this out
 *     as a regression. Embedding a CJK font in jsPDF to get native text
 *     would balloon the bundle by ~10MB.
 *   - The browser's print engine handles font shaping, page breaks, and CJK
 *     glyphs natively (using whatever fonts the OS already has). It produces
 *     a real text PDF for free.
 *   - The previous "open new tab" implementation was annoying because the
 *     user got bounced to a separate page. Using a hidden iframe keeps the
 *     print dialog in the original tab — the user's research context stays
 *     visible behind the dialog.
 *
 * The iframe is removed after the print dialog closes (or after a generous
 * timeout) so we don't leak DOM nodes across multiple exports.
 */
export function printReportAsPDF(htmlBody: string, sources: Source[], title = 'Research Report', referencesLabel = 'References'): void {
  const sourcesHtml = sources.length > 0 ? renderSourcesAsHtml(sources, referencesLabel) : '';

  const doc = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "PingFang SC", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "Microsoft YaHei", Georgia, "Times New Roman", serif;
    line-height: 1.65;
    color: #1f2937;
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 0;
  }
  h1 { font-size: 24pt; margin-top: 0; }
  h2 { font-size: 16pt; margin-top: 1.6em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.2em; }
  h3 { font-size: 13pt; margin-top: 1.2em; }
  p { margin: 0.6em 0; }
  ul, ol { margin: 0.4em 0 0.8em 1.4em; }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 10.5pt; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; }
  tr:nth-child(even) td { background: #fafafa; }
  code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 90%; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
  blockquote { margin: 0.8em 0; padding-left: 1em; border-left: 3px solid #d1d5db; color: #4b5563; }
  a.citation-link { color: #2563eb; text-decoration: none; padding: 0 1px; font-weight: 500; }
  a.citation-link:hover { text-decoration: underline; }
  .ghost { color: #dc2626; text-decoration: underline wavy 1px; }
  /* References block — journal-style: small font, tight leading, hanging
     indent so multi-line entries align under the title rather than the
     bracketed number. The previous (large body-size) layout took several
     pages just for the references; this knocks it down to ~60% the
     vertical space. */
  .sources-block { margin-top: 1.8em; padding-top: 0.8em; border-top: 1px solid #d1d5db; page-break-before: auto; }
  .sources-block h2 { font-size: 14pt; border: none; margin-bottom: 0.6em; }
  /* Hanging indent via padding + text-indent: \`text-indent\` only applies
     to inline content (not inline-block), so we DON'T mark .num as
     inline-block here — that previously pulled the bracketed number off
     screen and is what made the References look unnumbered. Plain inline
     keeps "[N]" visible flush-left, with subsequent lines aligned under
     the title because of the negative text-indent + padding-left. */
  .source-entry { font-size: 9.5pt; line-height: 1.45; margin: 0.35em 0; padding: 0; padding-left: 2.4em; text-indent: -2.4em; color: #374151; }
  .source-entry .num { font-family: ui-monospace, monospace; font-weight: 700; color: #1f2937; margin-right: 0.5em; }
  .source-entry .title { font-weight: 600; color: #1f2937; }
  .source-entry .meta { color: #6b7280; }
  .source-entry a { color: #2563eb; text-decoration: none; word-break: break-all; }
  /* Print: avoid awkward breaks */
  h1, h2, h3 { page-break-after: avoid; }
  table, pre, blockquote { page-break-inside: avoid; }
  .source-entry { page-break-inside: avoid; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${htmlBody}
${sourcesHtml}
</body>
</html>`;

  // Hidden iframe — keeps the print dialog in the original tab so the user
  // doesn't get bounced to a separate page. We position off-screen instead
  // of `display:none` because Safari / older Firefox refuse to print frames
  // with `display:none`.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const cleanup = () => {
    // Defer removal to next tick — Chrome occasionally re-fires the
    // `afterprint` event on the parent right after we yank the iframe.
    setTimeout(() => { try { iframe.remove(); } catch {} }, 100);
  };

  // Schedule the print after the iframe document has settled. We use a
  // micro-delay (50ms) on top of the load event — webfonts and image data
  // URIs occasionally need that extra tick before the first paint completes.
  iframe.onload = () => {
    const w = iframe.contentWindow;
    if (!w) { cleanup(); return; }
    // Listen on the iframe window itself; afterprint bubbles to the parent
    // in some browsers but not all.
    w.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      try { w.focus(); w.print(); } catch { cleanup(); }
    }, 50);
    // Hard-timeout fallback: if the user dismisses without afterprint
    // firing (some browsers, blocked dialogs), still clean up.
    setTimeout(cleanup, 60_000);
  };

  // Write the document. Using srcdoc would be cleaner but Safari has flaky
  // afterprint behavior with srcdoc. document.open/write is the boring path
  // and works everywhere we care about.
  const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!innerDoc) { cleanup(); return; }
  innerDoc.open();
  innerDoc.write(doc);
  innerDoc.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSourcesAsHtml(sources: Source[], referencesLabel = 'References'): string {
  const items = sources.map(s => {
    const parts: string[] = [];
    if (Array.isArray(s.authors) && s.authors.length > 0) parts.push(escapeHtml(s.authors.join(', ')));
    else if (typeof s.authors === 'string' && s.authors) parts.push(escapeHtml(s.authors as unknown as string));
    if (s.year) parts.push(String(s.year));
    if (s.journal) parts.push(`<em>${escapeHtml(s.journal)}</em>`);
    if (s.source) parts.push(escapeHtml(s.source));
    if (s.doi) parts.push(`DOI: <a href="https://doi.org/${escapeHtml(s.doi)}">${escapeHtml(s.doi)}</a>`);
    else if (s.url) parts.push(`<a href="${escapeHtml(s.url)}">${escapeHtml(s.url)}</a>`);
    // One-line layout: "[N]  Title  · authors · year · journal · DOI"
    // Compact font/leading is applied via the .source-entry style block in
    // printReportAsPDF's <style> sheet — this keeps the References section
    // in a journal-typical density rather than ballooning to body size.
    const meta = parts.length ? ` <span class="meta">${parts.join(' · ')}</span>` : '';
    return `<div class="source-entry" id="source-${s.citationNumber}"><span class="num">[${s.citationNumber}]</span> <span class="title">${escapeHtml(s.title || '(Untitled)')}</span>${meta}</div>`;
  }).join('\n');
  return `<div class="sources-block">
<h2>${escapeHtml(referencesLabel)}</h2>
${items}
</div>`;
}

// ─── Bundle: tex + bib together (.zip-like single text file) ─────────────────

/**
 * For users who want both the .tex and .bib in one go without the browser
 * opening two download dialogs. We concatenate them into a single text file
 * with `% =====` separators — they paste each half into their LaTeX project.
 *
 * (A real .zip would need JSZip. Not worth ~30KB extra deps for this corner.)
 */
export function bundleLatexAndBib(markdown: string, sources: Source[], title?: string): string {
  const tex = markdownToLatexDocument(markdown, sources, { title });
  const bib = sourcesToBibtex(sources);
  return `% ============================================================
% File 1 of 2 — main.tex
% ============================================================

${tex}

% ============================================================
% File 2 of 2 — refs.bib
% Save the section below into a file named "refs.bib" in the
% same folder as main.tex.
% ============================================================

${bib}
`;
}
