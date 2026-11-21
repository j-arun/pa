import type {
  AnyAdapterId,
  ConversationScope,
  ConversationTurn,
  PromptDomain,
  RatedThreadRecord,
} from '../types/workbench';
import {
  buildThreadHtmlDocument,
  extractReadOutSections,
  parseResponseEventsAndReport,
} from './eventParser';
import {
  getDomainQueryValue,
  getMonthNameFromNumber,
  getMonthNumberFromName,
  getPromptDomainShortLabel,
  THREAD_MONTHS,
} from './promptTemplates';

export interface MarkdownImportInput {
  rawMarkdown: string;
  fileName: string;
  fallbackMonth?: number;
  fallbackYear?: number;
  fallbackDomain?: PromptDomain;
  existingReports?: RatedThreadRecord[];
}

export interface MarkdownImportResult {
  record: RatedThreadRecord;
  htmlReport: string;
  detectedPeriodLabel: string;
  detectedDomainLabel: string;
  detectedCarrierLabel: string;
}

interface ParsedCarrierInfo {
  adapterId: AnyAdapterId;
  scope: ConversationScope;
  label: string;
  model: string;
}

const MONTH_NAME_ALTERNATION =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';

function stripFrontmatterAndCollectMetadata(rawMarkdown: string): {
  body: string;
  meta: Record<string, string>;
} {
  const meta: Record<string, string> = {};
  let remaining = rawMarkdown.replace(/^\uFEFF/, '');

  const fmMatch = remaining.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (fmMatch) {
    const fmLines = fmMatch[1].split(/\r?\n/);
    for (const line of fmLines) {
      const kv = line.match(/^\s*([A-Za-z0-9_ -]+?)\s*:\s*(.+?)\s*$/);
      if (kv) {
        const key = kv[1].trim().toLowerCase().replace(/[\s-]+/g, '_');
        const val = kv[2].trim().replace(/^['"]|['"]$/g, '');
        if (val) meta[key] = val;
      }
    }
    remaining = remaining.slice(fmMatch[0].length);
  }

  // Also scan leading and trailing metadata lines (e.g. "**Carrier:** ChatGPT", "Period: Nov 2026")
  const lines = remaining.split(/\r?\n/);
  const scanWindows = [lines.slice(0, 24), lines.slice(-20)];
  for (const windowLines of scanWindows) {
    for (const line of windowLines) {
      const cleaned = line
        .replace(/^\s*[-*•>]\s*/, '')
        .replace(/[*_`]/g, '')
        .trim();
      const kv = cleaned.match(
        /^(carrier|generator|generated\s+by|provider|model|engine|source|domain|category|topic|period|month|year|title|question|prompt|request)\s*[:\-–—]\s*(.+)$/i,
      );
      if (kv) {
        const key = kv[1].trim().toLowerCase().replace(/\s+/g, '_');
        const val = kv[2].trim();
        if (val && !meta[key]) {
          meta[key] = val;
        }
      }
    }
  }

  return { body: remaining.trim(), meta };
}

function matchCarrierText(rawText: string): ParsedCarrierInfo | null {
  const text = rawText.trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  if (
    /\b(?:chatgpt|chat[\s_-]*gpt|openai|gpt[-\s]*(?:5|4o|4\.1|4\.5|4|3\.5)|o[134](?:[-\s]*(?:mini|pro|preview))?)\b/i.test(
      lower,
    )
  ) {
    const modelMatch = text.match(
      /\b(?:chatgpt[^\n,|)]*|gpt[-\s]*[0-9a-zA-Z.+-]+|o[134](?:[-\s]*(?:mini|pro|preview))?)\b/i,
    );
    return {
      adapterId: 'chatgpt',
      scope: 'public',
      label: 'ChatGPT',
      model: modelMatch ? modelMatch[0].trim() : 'ChatGPT',
    };
  }

  if (
    /\b(?:sonnet|claude(?:\s*[0-9.]+)?(?:\s*sonnet|\s*opus|\s*haiku)?|anthropic|claude-3|claude-sonnet|claude-4)\b/i.test(
      lower,
    )
  ) {
    const modelMatch = text.match(
      /\b(?:claude[^\n,|)]*|sonnet[^\n,|)]*|opus[^\n,|)]*|haiku[^\n,|)]*)\b/i,
    );
    return {
      adapterId: 'claude',
      scope: 'public',
      label: 'Sonnet',
      model: modelMatch ? modelMatch[0].trim() : 'Sonnet',
    };
  }

  if (/\b(?:gemini|google\s+ai\s+studio)\b/i.test(lower)) {
    const modelMatch = text.match(/\bgemini[^\n,|)]*/i);
    return {
      adapterId: 'gemini',
      scope: 'public',
      label: 'Gemini',
      model: modelMatch ? modelMatch[0].trim() : 'Gemini',
    };
  }

  if (/\bfable\b/i.test(lower)) {
    return {
      adapterId: 'fable',
      scope: 'public',
      label: 'Fable',
      model: 'Fable',
    };
  }

  if (/\b(?:ollama|local\s+llm|llama\s*3|qwen\s*2|mistral)\b/i.test(lower)) {
    return {
      adapterId: 'ollama',
      scope: 'private',
      label: 'Local',
      model: 'Ollama',
    };
  }

  return null;
}

function detectCarrier(
  meta: Record<string, string>,
  fileName: string,
  body: string,
): ParsedCarrierInfo {
  const metaKeys = [
    'carrier',
    'generator',
    'generated_by',
    'provider',
    'model',
    'engine',
    'source',
  ];
  for (const key of metaKeys) {
    if (meta[key]) {
      const matched = matchCarrierText(meta[key]);
      if (matched) return matched;
    }
  }

  const fromFileName = matchCarrierText(fileName);
  if (fromFileName) return fromFileName;

  const lines = body.split(/\r?\n/);
  const headText = lines.slice(0, 25).join('\n');
  const fromHead = matchCarrierText(headText);
  if (fromHead) return fromHead;

  const tailText = lines.slice(-20).join('\n');
  const fromTail = matchCarrierText(tailText);
  if (fromTail) return fromTail;

  const fromBody = matchCarrierText(body);
  if (fromBody) return fromBody;

  // Consumer exports from external chat UIs default to ChatGPT when no Sonnet/other signature exists
  return {
    adapterId: 'chatgpt',
    scope: 'public',
    label: 'ChatGPT',
    model: 'ChatGPT',
  };
}

function normalizeYear(rawYear: number): number | undefined {
  if (!Number.isFinite(rawYear) || rawYear < 1990 || rawYear > 2090) return undefined;
  return Math.round(rawYear);
}

function detectPeriod(
  meta: Record<string, string>,
  fileName: string,
  body: string,
  fallbackMonth?: number,
  fallbackYear?: number,
): { monthName: string; monthNum: number; year: number } {
  const now = new Date();
  const safeFallbackMonth =
    fallbackMonth && fallbackMonth >= 1 && fallbackMonth <= 12
      ? fallbackMonth
      : now.getMonth() + 1;
  const safeFallbackYear = normalizeYear(fallbackYear ?? NaN) ?? now.getFullYear();

  const metaMonth = getMonthNumberFromName(meta.month);
  const metaYear = normalizeYear(Number(meta.year));
  if (metaMonth && metaYear) {
    return {
      monthNum: metaMonth,
      monthName: getMonthNameFromNumber(metaMonth) ?? THREAD_MONTHS[metaMonth - 1],
      year: metaYear,
    };
  }

  const scores = new Map<string, { month: number; year: number; score: number }>();
  const addScore = (month: number | undefined, year: number | undefined, weight: number) => {
    if (!month || month < 1 || month > 12 || !year || year < 1990 || year > 2090) return;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const existing = scores.get(key);
    if (existing) {
      existing.score += weight;
    } else {
      scores.set(key, { month, year, score: weight });
    }
  };

  const scanTextForPeriods = (text: string, baseWeight: number) => {
    // 1. Month [DD,] YYYY or Month YYYY
    const monthFirstRegex = new RegExp(
      `\\b(${MONTH_NAME_ALTERNATION})\\b(?:\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*(?:to|–|-|through)\\s*(?:(?:${MONTH_NAME_ALTERNATION})\\s+)?\\d{1,2}(?:st|nd|rd|th)?)?)?,?\\s+(\\d{4})\\b`,
      'gi',
    );
    for (const match of text.matchAll(monthFirstRegex)) {
      const m = getMonthNumberFromName(match[1]);
      const y = normalizeYear(Number(match[2]));
      const idx = match.index ?? 0;
      const surrounding = text.slice(Math.max(0, idx - 32), idx + match[0].length + 20).toLowerCase();
      const isBirthContext = /\b(?:born|birth|dob|natal)\b/.test(surrounding);
      addScore(m, y, isBirthContext ? 0.25 : baseWeight);
    }

    // 2. YYYY Month (e.g. 2026 November) or YYYYMon (2026Nov)
    const yearFirstRegex = new RegExp(
      `\\b(\\d{4})[-_\\s]*(${MONTH_NAME_ALTERNATION})\\b`,
      'gi',
    );
    for (const match of text.matchAll(yearFirstRegex)) {
      const y = normalizeYear(Number(match[1]));
      const m = getMonthNumberFromName(match[2]);
      addScore(m, y, baseWeight * 1.4);
    }

    // 3. YYYY-MM-DD or YYYY-MM or YYYY_MM
    const isoRegex = /\b((?:19|20)\d{2})[-_/](\d{1,2})(?:[-_/]\d{1,2})?\b/g;
    for (const match of text.matchAll(isoRegex)) {
      const y = normalizeYear(Number(match[1]));
      const m = Number(match[2]);
      const idx = match.index ?? 0;
      const surrounding = text.slice(Math.max(0, idx - 32), idx + match[0].length + 20).toLowerCase();
      const isBirthContext = /\b(?:born|birth|dob|natal)\b/.test(surrounding);
      if (m >= 1 && m <= 12) {
        addScore(m, y, isBirthContext ? 0.25 : baseWeight);
      }
    }
  };

  if (meta.period) {
    scanTextForPeriods(meta.period, 25);
  }
  if (meta.title) {
    scanTextForPeriods(meta.title, 12);
  }
  scanTextForPeriods(fileName, 14);

  const headingsText = body
    .split(/\r?\n/)
    .filter((line) => /^\s{0,3}#{1,3}\s+/.test(line))
    .slice(0, 8)
    .join('\n');
  scanTextForPeriods(headingsText, 8);
  scanTextForPeriods(body, 2);

  if (scores.size > 0) {
    const sorted = Array.from(scores.values()).sort((a, b) => b.score - a.score);
    const best = sorted[0];
    const resolvedMonth = metaMonth ?? best.month;
    const resolvedYear = metaYear ?? best.year;
    return {
      monthNum: resolvedMonth,
      monthName: getMonthNameFromNumber(resolvedMonth) ?? THREAD_MONTHS[resolvedMonth - 1],
      year: resolvedYear,
    };
  }

  const finalMonth = metaMonth ?? safeFallbackMonth;
  const finalYear = metaYear ?? safeFallbackYear;
  return {
    monthNum: finalMonth,
    monthName: getMonthNameFromNumber(finalMonth) ?? THREAD_MONTHS[finalMonth - 1],
    year: finalYear,
  };
}

function matchDomainExplicit(rawText: string): PromptDomain | null {
  const lower = rawText.trim().toLowerCase();
  if (!lower) return null;
  if (/\b(?:love|relationship|relationships|romance|partner|marriage|couple|dating)\b/.test(lower)) {
    return 'general';
  }
  if (/\b(?:career|profession|professional|job|workplace|promotion|business|astrology)\b/.test(lower)) {
    return 'astrology';
  }
  if (/\b(?:family|domestic|household|home|parents?|children|relatives|finance|financial)\b/.test(lower)) {
    return 'finance';
  }
  if (/\b(?:health|wellness|vitality|medical|fitness|well-being|wellbeing|sleep)\b/.test(lower)) {
    return 'health';
  }
  return null;
}

function detectDomain(
  meta: Record<string, string>,
  fileName: string,
  body: string,
  fallbackDomain?: PromptDomain,
): PromptDomain {
  for (const key of ['domain', 'category', 'topic']) {
    if (meta[key]) {
      const explicit = matchDomainExplicit(meta[key]);
      if (explicit) return explicit;
    }
  }

  const fromFileName = matchDomainExplicit(fileName.replace(/[-_]+/g, ' '));
  if (fromFileName) return fromFileName;

  const headingLines = body
    .split(/\r?\n/)
    .filter((line) => /^\s{0,3}#{1,3}\s+/.test(line))
    .slice(0, 12)
    .join('\n');
  const fromHeadings = matchDomainExplicit(headingLines);
  if (fromHeadings) return fromHeadings;

  // Weighted keyword score across entire document
  const lowerBody = body.toLowerCase();
  const countMatches = (regex: RegExp) => Array.from(lowerBody.matchAll(regex)).length;

  const domainScores: Array<{ domain: PromptDomain; score: number }> = [
    {
      domain: 'general',
      score: countMatches(
        /\b(?:love|relationship|relationships|romance|partner|marriage|couple|affection|intimacy|dating)\b/g,
      ),
    },
    {
      domain: 'astrology',
      score: countMatches(
        /\b(?:career|job|work|office|boss|manager|promotion|project|business|salary|interview|profession)\b/g,
      ),
    },
    {
      domain: 'finance',
      score: countMatches(
        /\b(?:family|household|domestic|parent|mother|father|child|children|home|sibling|relative|budget|savings)\b/g,
      ),
    },
    {
      domain: 'health',
      score: countMatches(
        /\b(?:health|wellness|vitality|sleep|energy|fatigue|stress|medical|fitness|diet|illness|immunity)\b/g,
      ),
    },
  ];

  domainScores.sort((a, b) => b.score - a.score);
  if (domainScores[0] && domainScores[0].score > 0) {
    return domainScores[0].domain;
  }

  return fallbackDomain ?? 'astrology';
}

function cleanTitleText(raw: string): string {
  return raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitleAndQuestion(
  meta: Record<string, string>,
  fileName: string,
  body: string,
  domainLabel: string,
  monthName: string,
  year: number,
): { title: string; question: string } {
  const lines = body.split(/\r?\n/);
  const h1Line = lines.find((l) => /^\s{0,3}#\s+/.test(l));
  const cleanedFileName = fileName
    .replace(/\.(?:md|markdown|txt)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let title =
    (meta.title && cleanTitleText(meta.title)) ||
    (h1Line && cleanTitleText(h1Line)) ||
    cleanedFileName ||
    `${domainLabel} Report · ${monthName} ${year}`;

  if (title.length > 72) {
    title = `${title.slice(0, 69).trim()}...`;
  }

  let question =
    (meta.question || meta.prompt || meta.request || '').trim();

  if (!question) {
    const qMatch = body.match(
      /^(?:#{1,4}\s*)?(?:\*\*|__)?(?:question|prompt|focus\s+question|user\s+request)(?:\*\*|__)?\s*[:\-–—]\s*(.+)$/im,
    );
    if (qMatch && qMatch[1]) {
      question = qMatch[1].replace(/[*_`]/g, '').trim();
    }
  }

  if (!question) {
    question = `Imported ${domainLabel} report for ${monthName} ${year} (${title})`;
  }

  return { title, question };
}

function buildSynthesizedReadOutSuffix(
  cleanBody: string,
  question: string,
  domainLabel: string,
): string {
  const lines = cleanBody.split(/\r?\n/);
  const sections: Array<{ heading: string; content: string[] }> = [];
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const h = line.match(/^\s{0,3}#{1,3}\s+(.+)$/);
    if (h) {
      if (currentHeading || currentLines.length > 0) {
        sections.push({ heading: currentHeading, content: currentLines });
      }
      currentHeading = cleanTitleText(h[1]);
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }
  if (currentHeading || currentLines.length > 0) {
    sections.push({ heading: currentHeading, content: currentLines });
  }

  const pickSectionText = (sec?: { heading: string; content: string[] }): string => {
    if (!sec) return '';
    return sec.content
      .filter((l) => !/^\s*\|/.test(l) && !/^\s*[-*_]{3,}\s*$/.test(l))
      .map((l) => l.replace(/^\s*[-*•+]\s+/, '• ').replace(/[*_`]/g, '').trim())
      .filter(Boolean)
      .slice(0, 8)
      .join('\n')
      .trim();
  };

  const summarySec =
    sections.find((s) =>
      /\b(?:overview|synthesis|executive\s+summary|summary|introduction|highlights)\b/i.test(
        s.heading,
      ),
    ) ?? sections[0];
  const answerSec = sections.find((s) =>
    /\b(?:answer|direct\s+answer|key\s+takeaways?|conclusion|guidance|recommendations?|action\s+plan|next\s+steps)\b/i.test(
      s.heading,
    ),
  );

  const summaryText = pickSectionText(summarySec);
  const answerText =
    pickSectionText(answerSec) ||
    `${domainLabel} outlook summary derived from the imported report for: ${question}`;

  if (!summaryText && !answerText) return '';

  const parts: string[] = ['## Read Out'];
  if (summaryText) {
    parts.push('### Summary', summaryText);
  }
  if (answerText) {
    parts.push('### Answer', answerText);
  }
  return parts.join('\n\n');
}

export function parseMarkdownReportImport({
  rawMarkdown,
  fileName,
  fallbackMonth,
  fallbackYear,
  fallbackDomain,
  existingReports = [],
}: MarkdownImportInput): MarkdownImportResult {
  const { body, meta } = stripFrontmatterAndCollectMetadata(rawMarkdown);
  const effectiveBody = body || rawMarkdown.trim();

  const carrier = detectCarrier(meta, fileName, effectiveBody);
  const period = detectPeriod(meta, fileName, effectiveBody, fallbackMonth, fallbackYear);
  const domain = detectDomain(meta, fileName, effectiveBody, fallbackDomain);
  const domainLabel = getPromptDomainShortLabel(domain);

  const { title: baseTitle, question } = extractTitleAndQuestion(
    meta,
    fileName,
    effectiveBody,
    domainLabel,
    period.monthName,
    period.year,
  );

  // Deduplicate title if another report with identical title exists in the same Period/Domain/Carrier folder
  const matchingBucketTitles = existingReports
    .filter((rec) => {
      const q = rec.turns.find((t) => t.role === 'user');
      const a = [...rec.turns].reverse().find((t) => t.role === 'assistant');
      const recAdapter = a?.adapterId ?? q?.adapterId;
      const recMonth = (q?.threadMonth || '').trim().toLowerCase();
      const recYear = q?.threadYear;
      const recDomain = q?.promptDomain ?? 'astrology';
      return (
        recMonth === period.monthName.toLowerCase() &&
        recYear === period.year &&
        recDomain === domain &&
        recAdapter === carrier.adapterId
      );
    })
    .map((rec) => rec.turns.find((t) => t.role === 'user')?.threadName || '')
    .filter(Boolean);

  let resolvedTitle = baseTitle;
  const existingLower = new Set(matchingBucketTitles.map((t) => t.trim().toLowerCase()));
  if (existingLower.has(resolvedTitle.toLowerCase())) {
    let suffix = 2;
    while (existingLower.has(`${baseTitle} (${suffix})`.toLowerCase())) {
      suffix += 1;
    }
    resolvedTitle = `${baseTitle} (${suffix})`;
  }

  let parsed = parseResponseEventsAndReport(effectiveBody, domain);
  let normalizedMarkdown = parsed.cleanMarkdown;

  // Ensure Read Out bubbles (Summary & Answer) always populate identically to live workbench reports
  if (!extractReadOutSections(normalizedMarkdown)) {
    const readOutBlock = buildSynthesizedReadOutSuffix(
      normalizedMarkdown,
      question,
      domainLabel,
    );
    if (readOutBlock) {
      normalizedMarkdown = `${normalizedMarkdown}\n\n${readOutBlock}`.trim();
      parsed = parseResponseEventsAndReport(normalizedMarkdown, domain);
    }
  }

  const nowIso = new Date().toISOString();
  const uniqueSuffix = Math.random().toString(36).slice(2, 7);
  const userTurnId = `md-${Date.now()}-${uniqueSuffix}`;
  const assistantTurnId = `asst-md-${Date.now()}-${uniqueSuffix}`;
  const domainQuery = getDomainQueryValue(domain);

  const userTurn: ConversationTurn = {
    id: userTurnId,
    role: 'user',
    content: question,
    timestamp: nowIso,
    inputMode: 'text',
    scope: carrier.scope,
    responseScopes: [carrier.scope],
    adapterId: carrier.adapterId,
    model: carrier.model,
    promptDomain: domain,
    threadName: resolvedTitle,
    threadMonth: period.monthName,
    threadYear: period.year,
    isFinalized: true,
    refContextDomain: domainQuery,
  };

  const prelimAssistantTurn: ConversationTurn = {
    id: assistantTurnId,
    exchangeId: userTurnId,
    role: 'assistant',
    content: normalizedMarkdown,
    eventCards: parsed.events,
    carefulDates: parsed.carefulDates,
    timestamp: nowIso,
    scope: carrier.scope,
    adapterId: carrier.adapterId,
    model: carrier.model,
    refContextDomain: domainQuery,
  };

  const htmlReport = buildThreadHtmlDocument({
    title: resolvedTitle,
    exchanges: [
      {
        question: userTurn.content,
        replies: [prelimAssistantTurn],
        askedAt: nowIso,
      },
    ],
    domain,
    month: period.monthName,
    year: period.year,
    createdAt: nowIso,
  });

  const assistantTurn: ConversationTurn = {
    ...prelimAssistantTurn,
    htmlReport,
  };

  const record: RatedThreadRecord = {
    id: userTurnId,
    turns: [userTurn, assistantTurn],
    ratedAt: nowIso,
    isFinalized: true,
    isExternalFile: false,
  };

  return {
    record,
    htmlReport,
    detectedPeriodLabel: `${period.year} ${period.monthName}`,
    detectedDomainLabel: domainLabel,
    detectedCarrierLabel: carrier.label,
  };
}
