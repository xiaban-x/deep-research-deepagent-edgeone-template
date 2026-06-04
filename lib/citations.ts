/**
 * Citation export formats — BibTeX, RIS (EndNote/Zotero/Mendeley), CSL-JSON.
 *
 * These are the differentiating features of deep-research vs.
 * content-creator: every research report should be exportable in formats
 * that drop straight into Zotero / Mendeley / EndNote / Word's reference
 * manager / Overleaf. Plain markdown is for blogs; this is for citations.
 *
 * Format references:
 *   - BibTeX: https://www.bibtex.com/g/bibtex-format/
 *   - RIS:    https://en.wikipedia.org/wiki/RIS_(file_format)
 *   - CSL-JSON: https://citeproc-js.readthedocs.io/en/latest/csl-json/
 */
import type { Source } from '@/app/page';

// ─── Citation key generation ─────────────────────────────────────────────────

/**
 * Coerce the loosely-typed `authors` value coming off the wire into a clean
 * `string[]`. The backend's `_sources.ts` parsers serialize CrossRef/S2
 * authors as a single comma-joined string of "First Last" tokens (e.g.
 * "John Smith, Jane Doe"), but the frontend Source type declares `string[]`
 * — and a SourcesPanel manually-added source genuinely stores an array.
 * UI code calling `.join()` blew up on the string form, so normalize here
 * at every entry point that ingests a Source.
 */
export function normalizeAuthors(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (Array.isArray(raw)) {
    return raw.map(a => String(a).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    // Split on ", " separators inserted by the backend join. Filter empties
    // in case the backend ever emits a stray ", , " from a missing field.
    return trimmed
      .split(/\s*,\s*/)
      .map(a => a.trim())
      .filter(Boolean);
  }
  return undefined;
}

/**
 * Build a BibTeX/CSL citation key like "smith2024quantum" from source data.
 * Falls back gracefully when fields are missing.
 */
export function buildCitationKey(source: Source): string {
  const authors = normalizeAuthors(source.authors);
  const firstAuthor = (authors?.[0] || '').split(/[,\s]+/)[0] || 'anon';
  const cleanAuthor = firstAuthor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase() || 'anon';

  const year = source.year || new Date().getFullYear();

  const firstWord = (source.title || 'untitled')
    .split(/\s+/)
    .find(w => w.length >= 3 && /^[a-zA-Z\u4e00-\u9fff]+$/.test(w))
    // Last resort: take any contiguous run of letters/CJK from the title
    || (source.title?.match(/[a-zA-Z\u4e00-\u9fff]+/)?.[0])
    || 'untitled';
  const cleanWord = firstWord
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z\u4e00-\u9fff]/g, '')
    .toLowerCase()
    .slice(0, 20) || 'untitled';

  return `${cleanAuthor}${year}${cleanWord}`;
}

// ─── Field escaping ──────────────────────────────────────────────────────────

/**
 * Escape special characters that would break a BibTeX value. We wrap values
 * in {curly braces} (the safer of BibTeX's two quoting styles) and only need
 * to escape backslashes, braces, and `%` (BibTeX comment marker).
 */
function escapeBibtex(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, m => `\\${m}`)
    .replace(/%/g, '\\%')
    .replace(/&/g, '\\&')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\$/g, '\\$');
}

/**
 * RIS values are line-based ("XX  - value"). Strip newlines so a multi-line
 * abstract doesn't terminate the field early.
 */
function escapeRis(value: string): string {
  return String(value || '').replace(/\r?\n/g, ' ').trim();
}

// ─── BibTeX ──────────────────────────────────────────────────────────────────

/**
 * Convert a single source to a BibTeX entry. Academic sources become
 * `@article` (or `@misc` if no DOI/journal), web sources become `@misc`
 * with `howpublished` and `note = {Accessed: ...}`.
 */
export function sourceToBibtex(source: Source): string {
  const key = buildCitationKey(source);
  const fields: Array<[string, string]> = [];

  if (source.title) fields.push(['title', escapeBibtex(source.title)]);
  // Defensive: tolerate the wire-form string in case a legacy source slipped past
  // page.tsx's normalizeAuthors gate (e.g. loaded from older project versions).
  const authorsList = normalizeAuthors(source.authors);
  if (authorsList && authorsList.length > 0) {
    // BibTeX joins authors with " and "
    fields.push(['author', authorsList.map(escapeBibtex).join(' and ')]);
  }
  if (source.year) fields.push(['year', String(source.year)]);
  if (source.journal) fields.push(['journal', escapeBibtex(source.journal)]);
  if (source.doi) fields.push(['doi', escapeBibtex(source.doi)]);
  if (source.url) fields.push(['url', source.url]); // URLs aren't escaped in {}
  if (source.abstract) fields.push(['abstract', escapeBibtex(source.abstract.slice(0, 1500))]);

  if (source.type === 'web') {
    // BibTeX `howpublished` for web sources: emit a real `\url{...}` macro
    // followed by the publisher / site name. `\url` already handles its
    // arguments verbatim, so we emit the macro directly without running
    // its body through escapeBibtex (which would otherwise escape the
    // backslash and braces and turn `\url{...}` into the literal string
    // "\textbackslash{}url\{...\}", which is what users were seeing in
    // the generated .bib).
    if (source.source) {
      const safeSite = escapeBibtex(source.source);
      const url = source.url || '';
      const howpublished = url
        ? `\\url{${url}}, ${safeSite}`
        : safeSite;
      fields.push(['howpublished', howpublished]);
    }
    if (source.date) fields.push(['note', escapeBibtex(`Accessed: ${source.date}`)]);
  }

  const entryType = source.type === 'academic'
    ? (source.journal || source.doi ? 'article' : 'misc')
    : 'misc';

  const fieldLines = fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  return `@${entryType}{${key},\n${fieldLines}\n}`;
}

/**
 * Convert all sources to a single .bib file.
 */
export function sourcesToBibtex(sources: Source[]): string {
  return sources.map(sourceToBibtex).join('\n\n') + '\n';
}

// ─── RIS (EndNote / Zotero / Mendeley import format) ─────────────────────────

/**
 * Convert a single source to an RIS record. Each tag is a 2-character code
 * followed by `  - value`, with `ER  -` terminating the record.
 *
 * Tag mapping:
 *   TY = type (JOUR for journal, ELEC for web)
 *   AU = author (one per line)
 *   TI = title
 *   PY = year
 *   T2 = journal/container
 *   DO = DOI
 *   UR = URL
 *   AB = abstract
 *   N1 = notes (we use this for source name on web)
 *   DA = access date
 */
export function sourceToRis(source: Source): string {
  const lines: string[] = [];

  const ty = source.type === 'academic'
    ? (source.journal || source.doi ? 'JOUR' : 'GEN')
    : 'ELEC';
  lines.push(`TY  - ${ty}`);

  if (source.title) lines.push(`TI  - ${escapeRis(source.title)}`);
  const risAuthors = normalizeAuthors(source.authors);
  if (risAuthors) {
    for (const author of risAuthors) {
      if (author) lines.push(`AU  - ${escapeRis(author)}`);
    }
  }
  if (source.year) lines.push(`PY  - ${source.year}`);
  if (source.journal) lines.push(`T2  - ${escapeRis(source.journal)}`);
  if (source.doi) lines.push(`DO  - ${escapeRis(source.doi)}`);
  if (source.url) lines.push(`UR  - ${escapeRis(source.url)}`);
  if (source.abstract) lines.push(`AB  - ${escapeRis(source.abstract.slice(0, 2000))}`);
  if (source.source && source.type === 'web') lines.push(`N1  - Source: ${escapeRis(source.source)}`);
  if (source.date) lines.push(`DA  - ${escapeRis(source.date)}`);

  lines.push('ER  - ');
  return lines.join('\n');
}

/**
 * Convert all sources to an RIS file (EndNote / Zotero / Mendeley import).
 */
export function sourcesToRis(sources: Source[]): string {
  return sources.map(sourceToRis).join('\n\n') + '\n';
}

// ─── CSL-JSON (Citeproc / Zotero / Pandoc) ───────────────────────────────────

/**
 * CSL-JSON is the canonical citation interchange format used by Zotero,
 * Pandoc, citeproc-js, and modern reference managers. It's machine-readable
 * and handles edge cases (multi-author, nested affiliations, locator types)
 * better than RIS or BibTeX.
 */
export function sourceToCslJson(source: Source): Record<string, any> {
  const entry: Record<string, any> = {
    id: buildCitationKey(source),
    type: source.type === 'academic'
      ? (source.journal || source.doi ? 'article-journal' : 'article')
      : 'webpage',
  };
  if (source.title) entry.title = source.title;
  const cslAuthors = normalizeAuthors(source.authors);
  if (cslAuthors && cslAuthors.length > 0) {
    entry.author = cslAuthors.map(name => {
      // Try to split "First Last" or "Last, First" into family/given
      if (name.includes(',')) {
        const [family, given] = name.split(',', 2).map(s => s.trim());
        return given ? { family, given } : { family: name.trim() };
      }
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
      }
      return { family: name.trim() };
    });
  }
  if (source.year) entry.issued = { 'date-parts': [[source.year]] };
  if (source.journal) entry['container-title'] = source.journal;
  if (source.doi) entry.DOI = source.doi;
  if (source.url) entry.URL = source.url;
  if (source.abstract) entry.abstract = source.abstract;
  if (source.date && source.type === 'web') entry.accessed = { 'date-parts': parseAccessDate(source.date) };

  return entry;
}

function parseAccessDate(raw: string): number[][] {
  const m = raw.match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return [[new Date().getFullYear()]];
  const parts = [Number(m[1])];
  if (m[2]) parts.push(Number(m[2]));
  if (m[3]) parts.push(Number(m[3]));
  return [parts];
}

export function sourcesToCslJson(sources: Source[]): string {
  return JSON.stringify(sources.map(sourceToCslJson), null, 2);
}

// ─── Human-readable reference formatting (for the in-report References list) ──

/**
 * Format a single source as a plain-text reference string in the requested
 * citation style. Used by ReportView to render the app-generated References
 * section at the bottom of the report (the model no longer writes its own).
 *
 * Returns the reference body WITHOUT the leading "[N]" marker and WITHOUT the
 * trailing URL/DOI link — ReportView prepends the numbered anchor and appends
 * a clickable link itself, so the URL stays a real <a> rather than escaped text.
 */
export function formatReference(source: Source, style: string | undefined): string {
  const authors = normalizeAuthors(source.authors);
  const authorStr = authors && authors.length > 0 ? authors.join(', ') : '';
  const year = source.year;
  const title = (source.title || '(Untitled)').trim().replace(/[.。]\s*$/, '');
  const venue = source.journal || source.source || '';
  const isAcademic = source.type === 'academic';

  const join = (parts: string[]) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  switch (style) {
    case 'mla':
      // Author. "Title." Venue, Year.
      return join([
        authorStr ? `${authorStr}.` : '',
        `“${title}.”`,
        venue ? `${venue},` : '',
        year ? `${year}.` : '',
      ]);
    case 'chicago':
      // Author. "Title." Venue (Year).
      return join([
        authorStr ? `${authorStr}.` : '',
        `“${title}.”`,
        venue ? venue : '',
        year ? `(${year}).` : '',
      ]);
    case 'gb7714': {
      // [作者]. 题名[J/EB/OL]. 刊名, 年.
      const typeTag = isAcademic ? '[J]' : '[EB/OL]';
      return join([
        authorStr ? `${authorStr}.` : '',
        `${title}${typeTag}.`,
        venue ? `${venue},` : '',
        year ? `${year}.` : '',
      ]);
    }
    case 'apa':
    default:
      // Author (Year). Title. Venue.
      return join([
        authorStr ? `${authorStr}` : '',
        year ? `(${year}).` : '',
        `${title}.`,
        venue ? `${venue}.` : '',
      ]);
  }
}

// ─── Citation coverage analysis ──────────────────────────────────────────────

export interface CitationCoverage {
  totalSources: number;
  citedSources: number;
  uncitedSources: Source[];
  ghostCitations: number[];           // [N] numbers used in report but missing from sources
  citedNumbers: number[];             // sorted unique [N] actually used
  paragraphs: number;
  paragraphsWithCitations: number;
  coveragePercent: number;            // 0–100
}

/**
 * Walk the markdown report + sources and build a coverage report:
 *   - Which [N] numbers actually appear in the text
 *   - Which sources are never cited
 *   - Which [N] in the text point to nothing (ghost citations)
 *   - What fraction of paragraphs contain at least one citation
 *
 * This is a unique selling point vs content-creator: a research report
 * that doesn't cite its sources is a vibe blog, and you want to catch that
 * before exporting.
 */
export function analyzeCitations(report: string, sources: Source[]): CitationCoverage {
  // Extract every [N] from the body (ignore code blocks). The model uses
  // ASCII brackets, sometimes Chinese fullwidth ［N］ — accept both.
  const text = report.replace(/```[\s\S]*?```/g, ''); // strip fenced code blocks
  const citationPattern = /[\[\uFF3B](\d+)[\]\uFF3D]/g;

  const usedNumbers = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = citationPattern.exec(text)) !== null) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) usedNumbers.add(n);
  }

  const sourceNumbers = new Set(sources.map(s => s.citationNumber));
  const ghostCitations = [...usedNumbers].filter(n => !sourceNumbers.has(n)).sort((a, b) => a - b);
  const uncitedSources = sources.filter(s => !usedNumbers.has(s.citationNumber));
  const citedSources = sources.length - uncitedSources.length;

  // Paragraph-level coverage: split on blank lines, ignore headings/lists
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p && !p.startsWith('#') && !p.startsWith('|'));
  const paragraphsWithCitations = paragraphs.filter(p => citationPattern.test(p)).length;
  // Reset lastIndex after .test() in a loop
  citationPattern.lastIndex = 0;

  const coveragePercent = paragraphs.length > 0
    ? Math.round((paragraphsWithCitations / paragraphs.length) * 100)
    : 0;

  return {
    totalSources: sources.length,
    citedSources,
    uncitedSources,
    ghostCitations,
    citedNumbers: [...usedNumbers].sort((a, b) => a - b),
    paragraphs: paragraphs.length,
    paragraphsWithCitations,
    coveragePercent,
  };
}

// ─── Browser download helper ─────────────────────────────────────────────────

/**
 * Trigger a browser download for the given text content.
 */
export function downloadText(content: string, filename: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
