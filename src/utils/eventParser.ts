import type {
  CarefulDateItem,
  ConversationTurn,
  EventCardIconType,
  EventCardItem,
  PromptDomain,
  ThreadRating,
} from '../types/workbench';
import { renderMarkdownToHtml } from './markdownExport';
import {
  formatShortYearMonth,
  getPromptDomainShortLabel,
  THREAD_RATING_OPTIONS,
} from './promptTemplates';

export const EVENT_EXTRACTION_SYSTEM_DIRECTIVE = [
  'Response formatting rule:',
  '1. Write your complete, thorough report in clean Markdown first. This full report goes into the HTML Reference Document.',
  '2. Structure Section 3 (the 3rd main heading/section of the report) as "## 3. Detailed <Domain> Event Breakdown" (for example: "## 3. Detailed Relationship Event Breakdown", "## 3. Detailed Career Event Breakdown", "## 3. Detailed Family Event Breakdown", or "## 3. Detailed Health Event Breakdown").',
  '3. Inside Section 3, list every specific event as a numbered event subheading (e.g. "### Event 1: <Specific Event Heading>", "### Event 2: <Specific Event Heading>", etc.) and include all three labeled items under each event:',
  '   - **When it will happen:** Exact date or date range (e.g. 2026-11-12 to 2026-11-19)',
  '   - **Probability Rating:** Clear rating and percentage (e.g. High · 84%)',
  '   - **How it will happen:** Complete, practical everyday explanation of how the event unfolds.',
  '4. Keep each event free of raw astrological tables; use clear everyday language.',
  '5. At the very end of your response, append a <pa_events>...</pa_events> JSON array containing EVERY event listed in Section 3 (matching all Event 1..N items). Do NOT include Overview, Introduction, or Summary cards in <pa_events>.',
  '6. Schema for each <pa_events> item: {"title":"Event 1: Specific event heading","when":"Exact date or range","probability":"Probability rating e.g. High · 82%","how":"Full explanation of how it will happen.","category":"Relationship|Love|Career|Family|Health|General","icon":"heart|shield|briefcase|layers|calendar|compass|sparkles"}.',
  '7. Immediately after </pa_events>, also append a <pa_caution_dates>...</pa_caution_dates> JSON array listing specific dates or short date windows to be careful about across domains.',
  '8. Schema for each <pa_caution_dates> item: {"domain":"Relationship|Health|Career|Family|Finance|General","date":"Specific date or range","note":"Brief caution note on what to watch out for.","severity":"high|caution|watch"}.',
].join('\n');

const VALID_ICONS: readonly EventCardIconType[] = [
  'layers',
  'calendar',
  'compass',
  'sparkles',
  'briefcase',
  'heart',
  'shield',
];

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

function inferCategoryAndIcon(
  hintText: string,
  fallbackDomain?: PromptDomain,
): { category: string; icon: EventCardIconType } {
  const lower = hintText.toLowerCase();
  if (/(relationship|love|romance|partner|marriage|couple|affection|dating)/.test(lower)) {
    return {
      category: lower.includes('relationship') ? 'Relationship' : 'Love',
      icon: 'heart',
    };
  }
  if (/(health|wellness|energy|rest|vital|fitness|medical|sleep|stress|body)/.test(lower)) {
    return {
      category: 'Health',
      icon: 'shield',
    };
  }
  if (/(career|work|job|project|business|team|lead|promotion|role|profession)/.test(lower)) {
    return {
      category: 'Career',
      icon: 'briefcase',
    };
  }
  if (/(family|home|parent|child|relative|household|domestic|money|finance|income|budget)/.test(lower)) {
    return {
      category: 'Family',
      icon: 'layers',
    };
  }

  switch (fallbackDomain) {
    case 'health':
      return { category: 'Health', icon: 'shield' };
    case 'general':
      return { category: 'Love', icon: 'heart' };
    case 'finance':
      return { category: 'Family', icon: 'layers' };
    case 'astrology':
      return { category: 'Career', icon: 'briefcase' };
    default:
      return { category: 'General', icon: 'sparkles' };
  }
}

function inferIconFromText(text: string, fallbackIndex: number): EventCardIconType {
  const lower = text.toLowerCase();
  if (/(relationship|love|family|partner|marriage|romance)/.test(lower)) {
    return 'heart';
  }
  if (/(health|wellness|energy|rest|vital|fitness|medical|sleep)/.test(lower)) {
    return 'shield';
  }
  if (/(career|work|job|project|business|team|lead|promotion|role)/.test(lower)) {
    return 'briefcase';
  }
  if (/(money|finance|income|budget|invest|saving|expense|domestic|home)/.test(lower)) {
    return 'layers';
  }
  if (/(date|month|year|schedule|plan|timeline|quarter|week|transition|period)/.test(lower)) {
    return 'calendar';
  }
  if (/(focus|direction|path|goal|opportunity|strategy|priority)/.test(lower)) {
    return 'compass';
  }
  return VALID_ICONS[fallbackIndex % VALID_ICONS.length];
}

function cleanPlainSummary(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\|[^\n]*\|/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanLineKeepText(raw: string): string {
  return raw
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > 42 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

function normalizeIcon(
  rawIcon: unknown,
  hintText: string,
  index: number,
  fallbackDomain?: PromptDomain,
): EventCardIconType {
  const inferred = inferCategoryAndIcon(hintText, fallbackDomain);
  if (inferred.icon === 'heart' || inferred.icon === 'shield') {
    return inferred.icon;
  }
  if (typeof rawIcon === 'string') {
    const cleaned = rawIcon.trim().toLowerCase() as EventCardIconType;
    if (VALID_ICONS.includes(cleaned)) return cleaned;
  }
  return inferIconFromText(hintText, index);
}

const DATE_RANGE_REGEX =
  /\b(?:\d{4}-\d{2}-\d{2}(?:\s*(?:to|–|-|through)\s*\d{4}-\d{2}-\d{2})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*(?:to|–|-|through)\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+)?\d{1,2}(?:st|nd|rd|th)?)?(?:,?\s*\d{4})?|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})\b/i;

const LIKELIHOOD_REGEX =
  /\b(?:(?:very\s+high|high|moderate-high|moderate|medium|low|strong|probable|likely)\s*(?:likelihood|probability|rating|chance)?\s*(?:[:·(\-]\s*\d{1,3}%\)?)?|\d{1,3}%\s*(?:likelihood|probability|rating|chance|confidence)?)\b/i;

function extractDateAndLikelihood(text: string): {
  dateRange?: string;
  likelihood?: string;
} {
  const dateMatch = text.match(DATE_RANGE_REGEX);
  const likelihoodMatch = text.match(LIKELIHOOD_REGEX);
  return {
    dateRange: dateMatch?.[0]?.trim(),
    likelihood: likelihoodMatch?.[0]?.trim(),
  };
}

function isOverviewHeading(heading: string): boolean {
  return /^(?:overview|executive summary|summary|introduction|background|context|conclusion|key takeaways)$/i.test(
    heading.trim(),
  );
}

const WHEN_LABEL_REGEX =
  /^(?:[-*•+]\s*)?(?:\*\*|__)?(?:when(?:\s+it\s+(?:will\s+)?happen(?:s)?)?|timing|date(?:\s*range|\s*window|s)?|time\s*frame|timeframe|period|schedule)(?:\*\*|__)?\s*[:\-–—]\s*(.*)$/i;

const PROB_LABEL_REGEX =
  /^(?:[-*•+]\s*)?(?:\*\*|__)?(?:probability(?:\s+rating)?|likelihood(?:\s+rating)?|chance|confidence|rating)(?:\*\*|__)?\s*[:\-–—]\s*(.*)$/i;

const HOW_LABEL_REGEX =
  /^(?:[-*•+]\s*)?(?:\*\*|__)?(?:how(?:\s+it\s+(?:will\s+)?happen(?:s)?)?|what(?:\s+happens|\s+will\s+happen)?|details?|description|mechanism|explanation|breakdown|outcome)(?:\*\*|__)?\s*[:\-–—]\s*(.*)$/i;

function parseEventHeadingLine(line: string, sectionHeadingLevel: number): string | null {
  const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const text = cleanLineKeepText(headingMatch[2]);
    if (!text) return null;
    if (level > sectionHeadingLevel || /^event\s+\d+\b/i.test(text)) {
      return text;
    }
    return null;
  }

  const boldEventMatch = line.match(
    /^\s*(?:[-*•]\s*|\d+\.\s*)?(?:\*\*|__)(Event\s+\d+(?:\s*[:\-–—.]\s*[^*_]+)?)(?:\*\*|__)\s*:?\s*$/i,
  );
  if (boldEventMatch) {
    return cleanLineKeepText(boldEventMatch[1]);
  }

  const plainEventMatch = line.match(
    /^\s*(?:[-*•]\s*|\d+\.\s*)?(Event\s+\d+\s*[:\-–—]\s*.+)$/i,
  );
  if (plainEventMatch) {
    return cleanLineKeepText(plainEventMatch[1]);
  }

  const boldNumberedMatch = line.match(
    /^\s*(\d+\.\s+(?:\*\*|__)[^*_]+(?:\*\*|__))\s*:?\s*$/,
  );
  if (boldNumberedMatch) {
    return cleanLineKeepText(boldNumberedMatch[1]);
  }

  return null;
}

function parseSingleEventBlock(
  title: string,
  bodyLines: string[],
  sectionHeading: string,
  index: number,
  fallbackDomain?: PromptDomain,
): EventCardItem {
  const whenParts: string[] = [];
  const probParts: string[] = [];
  const howParts: string[] = [];
  const fallbackHowParts: string[] = [];
  let activeField: 'when' | 'prob' | 'how' | null = null;

  for (const rawLine of bodyLines) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^[-*_]{3,}$/.test(trimmed) || /^\|/.test(trimmed)) {
      if (activeField === 'how' && howParts.length > 0) {
        activeField = 'how';
      }
      continue;
    }

    const whenMatch = trimmed.match(WHEN_LABEL_REGEX);
    if (whenMatch) {
      const val = cleanLineKeepText(whenMatch[1]);
      if (val) whenParts.push(val);
      activeField = 'when';
      continue;
    }

    const probMatch = trimmed.match(PROB_LABEL_REGEX);
    if (probMatch) {
      const val = cleanLineKeepText(probMatch[1]);
      if (val) probParts.push(val);
      activeField = 'prob';
      continue;
    }

    const howMatch = trimmed.match(HOW_LABEL_REGEX);
    if (howMatch) {
      const val = cleanLineKeepText(howMatch[1]);
      if (val) howParts.push(val);
      activeField = 'how';
      continue;
    }

    const cleanedLine = cleanLineKeepText(trimmed.replace(/^\s*(?:[-*•+])\s+/, ''));
    if (!cleanedLine) continue;

    if (activeField === 'how') {
      howParts.push(cleanedLine);
    } else if (activeField === 'when' && whenParts.length === 0) {
      whenParts.push(cleanedLine);
    } else if (activeField === 'prob' && probParts.length === 0) {
      probParts.push(cleanedLine);
    } else {
      activeField = 'how';
      fallbackHowParts.push(cleanedLine);
    }
  }

  const combinedBodyText = cleanPlainSummary(bodyLines.join(' '));
  const inferredMeta = extractDateAndLikelihood(`${title} ${combinedBodyText}`);

  const whenText = whenParts.join(' ').trim() || inferredMeta.dateRange;
  const probText = probParts.join(' ').trim() || inferredMeta.likelihood;
  const fullHowText =
    howParts.join('\n').trim() ||
    fallbackHowParts.join('\n').trim() ||
    combinedBodyText ||
    title;

  const { category, icon } = inferCategoryAndIcon(
    `${sectionHeading} ${title} ${fullHowText}`,
    fallbackDomain,
  );

  return {
    id: `evt-${index + 1}`,
    title,
    summary: fullHowText,
    how: fullHowText,
    category,
    dateRange: whenText,
    when: whenText,
    likelihood: probText,
    probability: probText,
    timeframe: whenText,
    icon,
  };
}

function extractBreakdownSectionEvents(
  cleanMarkdown: string,
  fallbackDomain?: PromptDomain,
): { events: EventCardItem[]; sectionHeading: string } {
  const lines = cleanMarkdown.split(/\r?\n/);

  interface HeadingEntry {
    lineIdx: number;
    level: number;
    text: string;
  }

  const allHeadings: HeadingEntry[] = [];
  let inCodeFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (match) {
      allHeadings.push({
        lineIdx: i,
        level: match[1].length,
        text: cleanLineKeepText(match[2]),
      });
    }
  }

  // Filter major report sections (not individual "Event 1" / "Event 2" headings)
  const nonEventHeadings = allHeadings.filter(
    (h) => !/^event\s+\d+\b/i.test(h.text),
  );

  // 1. Prefer an explicit "Detailed <Domain> Event Breakdown" or "Event Breakdown" heading
  let targetHeading = nonEventHeadings.find((h) =>
    /(?:detailed\s+.{0,40}\bevent\s+breakdown|\bevent\s+breakdown\b)/i.test(h.text),
  );

  // 2. Otherwise fall back to the 3rd major section heading in the report
  if (!targetHeading && nonEventHeadings.length >= 3) {
    const preferredLevel = nonEventHeadings.some((h) => h.level === 2)
      ? 2
      : nonEventHeadings.some((h) => h.level === 3)
        ? 3
        : nonEventHeadings[0].level;
    const levelSections = nonEventHeadings.filter((h) => h.level === preferredLevel);
    targetHeading = levelSections[2] ?? nonEventHeadings[2];
  }

  let sectionLines: string[] = [];
  let sectionHeading = '';
  let sectionLevel = 2;

  if (targetHeading) {
    sectionHeading = targetHeading.text;
    sectionLevel = targetHeading.level;
    const nextPeerHeading = allHeadings.find(
      (h) =>
        h.lineIdx > targetHeading!.lineIdx &&
        h.level <= targetHeading!.level &&
        !/^event\s+\d+\b/i.test(h.text),
    );
    const endIdx = nextPeerHeading ? nextPeerHeading.lineIdx : lines.length;
    sectionLines = lines.slice(targetHeading.lineIdx + 1, endIdx);
  } else {
    // No structured sections found — check if inline Event 1..N blocks exist directly
    sectionLines = lines;
    sectionLevel = 2;
  }

  const eventBlocks: Array<{ title: string; bodyLines: string[] }> = [];
  let currentTitle: string | null = null;
  let currentBody: string[] = [];

  for (const line of sectionLines) {
    const detectedTitle = parseEventHeadingLine(line, sectionLevel);
    if (detectedTitle) {
      if (currentTitle) {
        eventBlocks.push({ title: currentTitle, bodyLines: currentBody });
      }
      currentTitle = detectedTitle;
      currentBody = [];
      continue;
    }
    if (currentTitle !== null) {
      currentBody.push(line);
    }
  }

  if (currentTitle) {
    eventBlocks.push({ title: currentTitle, bodyLines: currentBody });
  }

  const parsedBlocks = eventBlocks
    .filter((b) => !isOverviewHeading(b.title))
    .map((block, idx) =>
      parseSingleEventBlock(
        block.title,
        block.bodyLines,
        sectionHeading,
        idx,
        fallbackDomain,
      ),
    );

  if (parsedBlocks.length > 0) {
    return { events: parsedBlocks, sectionHeading };
  }

  // Markdown table fallback inside the 3rd / Event Breakdown section
  const tableLines = sectionLines.filter((l) => /^\s*\|.*\|\s*$/.test(l));
  if (tableLines.length >= 3) {
    const parseRow = (row: string) =>
      row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => cleanLineKeepText(c));
    const headers = parseRow(tableLines[0]).map((h) => h.toLowerCase());
    const dataRows = tableLines.slice(2);
    const titleIdx = Math.max(
      0,
      headers.findIndex((h) => /event|title|name|milestone|heading/.test(h)),
    );
    const whenIdx = headers.findIndex((h) => /when|date|time|window|period/.test(h));
    const probIdx = headers.findIndex((h) => /prob|likel|chance|rating|conf/.test(h));
    const howIdx = headers.findIndex((h) => /how|detail|what|desc|summary|explain/.test(h));

    const tableEvents: EventCardItem[] = [];
    for (let r = 0; r < dataRows.length; r += 1) {
      const cells = parseRow(dataRows[r]);
      if (cells.length === 0 || cells.every((c) => !c)) continue;
      const title = cells[titleIdx] || `Event ${r + 1}`;
      const whenText = whenIdx >= 0 ? cells[whenIdx] : undefined;
      const probText = probIdx >= 0 ? cells[probIdx] : undefined;
      const howText =
        howIdx >= 0
          ? cells[howIdx]
          : cells.filter((_, ci) => ci !== titleIdx && ci !== whenIdx && ci !== probIdx).join(' — ');
      const { category, icon } = inferCategoryAndIcon(
        `${sectionHeading} ${title} ${howText}`,
        fallbackDomain,
      );
      tableEvents.push({
        id: `evt-${r + 1}`,
        title,
        summary: howText || title,
        how: howText || title,
        category,
        dateRange: whenText,
        when: whenText,
        likelihood: probText,
        probability: probText,
        timeframe: whenText,
        icon,
      });
    }
    if (tableEvents.length > 0) {
      return { events: tableEvents, sectionHeading };
    }
  }

  return { events: [], sectionHeading };
}

function extractFallbackEvents(
  cleanMarkdown: string,
  fallbackDomain?: PromptDomain,
): EventCardItem[] {
  const lines = cleanMarkdown.split(/\r?\n/);
  const sections: Array<{ heading: string; body: string[] }> = [];
  let currentHeading = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^\s{0,3}#{1,4}\s+(.+)$/);
    if (headingMatch) {
      if (currentHeading || currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody });
      }
      currentHeading = cleanPlainSummary(headingMatch[1]);
      currentBody = [];
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || /^\|/.test(trimmed) || /^[-*_]{3,}$/.test(trimmed)) {
      continue;
    }
    currentBody.push(trimmed);
  }
  if (currentHeading || currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody });
  }

  const specificSections = sections.filter((sec) => !isOverviewHeading(sec.heading));
  const targetSections = specificSections.length > 0 ? specificSections : sections;

  const cards: EventCardItem[] = [];

  for (const sec of targetSections) {
    const rawJoined = sec.body.join(' ');
    const summaryText = cleanPlainSummary(rawJoined);
    if (!summaryText && !sec.heading) continue;

    const bullets = sec.body
      .filter((line) => /^\s*(?:[-*•]|\d+\.)\s+/.test(line))
      .map((line) => cleanLineKeepText(line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '')))
      .filter((text) => text.length >= 20);

    if (bullets.length >= 2 && cards.length < 12) {
      for (const bullet of bullets) {
        const colonSplit = bullet.split(/:\s+/, 2);
        const hasPrefixTitle = colonSplit.length === 2 && colonSplit[0].length <= 56;
        const title = hasPrefixTitle ? colonSplit[0] : truncateText(bullet, 56);
        const body = hasPrefixTitle ? colonSplit[1] : bullet;
        const meta = extractDateAndLikelihood(bullet);
        const { category, icon } = inferCategoryAndIcon(
          `${sec.heading} ${title} ${body}`,
          fallbackDomain,
        );
        cards.push({
          id: `evt-fb-${cards.length + 1}`,
          title,
          summary: body,
          how: body,
          category,
          dateRange: meta.dateRange,
          when: meta.dateRange,
          likelihood: meta.likelihood,
          probability: meta.likelihood,
          timeframe: meta.dateRange,
          icon,
        });
      }
      continue;
    }

    const title = sec.heading || truncateText(summaryText, 56);
    const body = summaryText || sec.heading;
    const meta = extractDateAndLikelihood(`${title} ${body}`);
    const { category, icon } = inferCategoryAndIcon(
      `${sec.heading} ${title} ${body}`,
      fallbackDomain,
    );

    cards.push({
      id: `evt-fb-${cards.length + 1}`,
      title,
      summary: body,
      how: body,
      category,
      dateRange: meta.dateRange,
      when: meta.dateRange,
      likelihood: meta.likelihood,
      probability: meta.likelihood,
      timeframe: meta.dateRange,
      icon,
    });
  }

  if (cards.length === 0 && cleanMarkdown.trim()) {
    const fullPlain = cleanPlainSummary(cleanMarkdown);
    const sentences = fullPlain
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20);
    for (let i = 0; i < sentences.length && cards.length < 4; i += 2) {
      const chunk = sentences.slice(i, i + 2).join(' ');
      const meta = extractDateAndLikelihood(chunk);
      const { category, icon } = inferCategoryAndIcon(chunk, fallbackDomain);
      cards.push({
        id: `evt-sent-${cards.length + 1}`,
        title: truncateText(sentences[i], 56),
        summary: chunk,
        how: chunk,
        category,
        dateRange: meta.dateRange,
        when: meta.dateRange,
        likelihood: meta.likelihood,
        probability: meta.likelihood,
        timeframe: meta.dateRange,
        icon,
      });
    }
  }

  return cards.slice(0, 24);
}

function inferDomainFromLine(line: string, fallbackDomain?: PromptDomain): string {
  const lower = line.toLowerCase();
  if (/(relationship|love|partner|marriage|romance|bond)/.test(lower)) return 'Relationship';
  if (/(health|wellness|sleep|stress|medical|fatigue|energy)/.test(lower)) return 'Health';
  if (/(career|work|job|boss|office|project|promotion|business)/.test(lower)) return 'Career';
  if (/(family|home|parent|child|relative|household)/.test(lower)) return 'Family';
  if (/(finance|money|spend|invest|budget|debt|expense)/.test(lower)) return 'Finance';
  return getPromptDomainShortLabel(fallbackDomain);
}

function extractFallbackCautionDates(
  cleanMarkdown: string,
  fallbackDomain?: PromptDomain,
): CarefulDateItem[] {
  const items: CarefulDateItem[] = [];
  const lines = cleanMarkdown.split(/\r?\n/);

  for (const rawLine of lines) {
    const cleaned = cleanPlainSummary(rawLine);
    if (!cleaned || cleaned.length < 18) continue;
    const hasCautionSignal =
      /\b(careful|caution|avoid|watch|sensitive|tension|friction|delay|risk|stress|conflict|misunderstanding|strain)\b/i.test(
        cleaned,
      );
    const dateMatch = cleaned.match(DATE_RANGE_REGEX);
    if (!hasCautionSignal || !dateMatch) continue;

    const severity: CarefulDateItem['severity'] =
      /\b(high|avoid|critical|severe|major|conflict|risk)\b/i.test(cleaned)
        ? 'high'
        : /\b(watch|minor|mild)\b/i.test(cleaned)
          ? 'watch'
          : 'caution';

    items.push({
      id: `cd-fb-${items.length + 1}`,
      domain: inferDomainFromLine(cleaned, fallbackDomain),
      date: dateMatch[0].trim(),
      note: truncateText(cleaned, 150),
      severity,
    });

    if (items.length >= 12) break;
  }

  return items;
}

export function parseResponseEventsAndReport(
  rawContent: string,
  fallbackDomain?: PromptDomain,
): {
  cleanMarkdown: string;
  events: EventCardItem[];
  carefulDates: CarefulDateItem[];
} {
  const eventsMatch = rawContent.match(/<pa_events>([\s\S]*?)<\/pa_events>/i);
  const cautionMatch = rawContent.match(/<pa_caution_dates>([\s\S]*?)<\/pa_caution_dates>/i);

  const cleanMarkdown = rawContent
    .replace(/<pa_events>[\s\S]*?<\/pa_events>/gi, '')
    .replace(/<pa_caution_dates>[\s\S]*?<\/pa_caution_dates>/gi, '')
    .trim();

  const normalizedMarkdown = cleanMarkdown || rawContent.trim();

  // 1. Parse the 3rd / Detailed Event Breakdown section from the Markdown report
  const { events: breakdownEvents, sectionHeading } = extractBreakdownSectionEvents(
    normalizedMarkdown,
    fallbackDomain,
  );

  // 2. Parse <pa_events> JSON if provided
  let jsonEvents: EventCardItem[] = [];
  if (eventsMatch && eventsMatch[1]) {
    try {
      const jsonCandidate = eventsMatch[1]
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
      const parsed: unknown = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const mapped = parsed
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item, idx) => {
            const title =
              typeof item.title === 'string' && item.title.trim()
                ? item.title.trim()
                : `Event ${idx + 1}`;
            const rawHow =
              typeof item.how === 'string' && item.how.trim()
                ? cleanLineKeepText(item.how.trim())
                : typeof item.howItHappens === 'string' && item.howItHappens.trim()
                  ? cleanLineKeepText(item.howItHappens.trim())
                  : typeof item.summary === 'string' && item.summary.trim()
                    ? cleanLineKeepText(item.summary.trim())
                    : title;
            const rawWhen =
              typeof item.when === 'string' && item.when.trim()
                ? item.when.trim()
                : typeof item.dateRange === 'string' && item.dateRange.trim()
                  ? item.dateRange.trim()
                  : typeof item.timeframe === 'string' && item.timeframe.trim()
                    ? item.timeframe.trim()
                    : undefined;
            const rawProb =
              typeof item.probability === 'string' && item.probability.trim()
                ? item.probability.trim()
                : typeof item.probabilityRating === 'string' && item.probabilityRating.trim()
                  ? item.probabilityRating.trim()
                  : typeof item.likelihood === 'string' && item.likelihood.trim()
                    ? item.likelihood.trim()
                    : undefined;
            const inferredMeta = extractDateAndLikelihood(`${title} ${rawHow}`);
            const finalWhen = rawWhen || inferredMeta.dateRange;
            const finalProb = rawProb || inferredMeta.likelihood;
            const rawCat =
              typeof item.category === 'string' && item.category.trim()
                ? item.category.trim()
                : '';
            const inferredDomain = inferCategoryAndIcon(
              `${sectionHeading} ${rawCat} ${title} ${rawHow}`,
              fallbackDomain,
            );
            const category = rawCat || inferredDomain.category;
            return {
              id: `evt-${idx + 1}`,
              title,
              summary: rawHow,
              how: rawHow,
              category,
              dateRange: finalWhen,
              when: finalWhen,
              likelihood: finalProb,
              probability: finalProb,
              timeframe: finalWhen,
              icon: normalizeIcon(
                item.icon,
                `${sectionHeading} ${category} ${title} ${rawHow}`,
                idx,
                fallbackDomain,
              ),
            };
          });

        const nonOverview = mapped.filter((evt) => !isOverviewHeading(evt.title));
        jsonEvents = (nonOverview.length > 0 ? nonOverview : mapped).slice(0, 24);
      }
    } catch {
      // Fall through to breakdown / fallback extractor
    }
  }

  // Merge: prefer Markdown Event Breakdown blocks when present, backfilling missing fields from JSON
  let finalEvents: EventCardItem[];
  if (breakdownEvents.length > 0) {
    finalEvents = breakdownEvents.map((evt, idx) => {
      const jsonMatch =
        jsonEvents[idx] ??
        jsonEvents.find((j) =>
          j.title.toLowerCase().includes(evt.title.toLowerCase().slice(0, 16)),
        );
      const whenVal = evt.when || evt.dateRange || jsonMatch?.when || jsonMatch?.dateRange;
      const probVal =
        evt.probability || evt.likelihood || jsonMatch?.probability || jsonMatch?.likelihood;
      const howVal = evt.how || evt.summary || jsonMatch?.how || jsonMatch?.summary || evt.title;
      return {
        ...evt,
        when: whenVal,
        dateRange: whenVal,
        timeframe: whenVal,
        probability: probVal,
        likelihood: probVal,
        how: howVal,
        summary: howVal,
      };
    });
  } else if (jsonEvents.length > 0) {
    finalEvents = jsonEvents;
  } else {
    finalEvents = extractFallbackEvents(normalizedMarkdown, fallbackDomain);
  }

  let parsedCarefulDates: CarefulDateItem[] = [];
  if (cautionMatch && cautionMatch[1]) {
    try {
      const jsonCandidate = cautionMatch[1]
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
      const parsed: unknown = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed) && parsed.length > 0) {
        parsedCarefulDates = parsed
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item, idx) => {
            const domain =
              typeof item.domain === 'string' && item.domain.trim()
                ? item.domain.trim()
                : getPromptDomainShortLabel(fallbackDomain);
            const date =
              typeof item.date === 'string' && item.date.trim()
                ? item.date.trim()
                : 'Upcoming window';
            const note =
              typeof item.note === 'string' && item.note.trim()
                ? cleanPlainSummary(item.note.trim())
                : 'Exercise extra care and patience.';
            const rawSev =
              typeof item.severity === 'string' ? item.severity.trim().toLowerCase() : '';
            const severity: CarefulDateItem['severity'] =
              rawSev === 'high' || rawSev === 'watch' ? rawSev : 'caution';
            return {
              id: `cd-${idx + 1}`,
              domain: truncateText(domain, 28),
              date: truncateText(date, 40),
              note: truncateText(note, 170),
              severity,
            };
          })
          .slice(0, 16);
      }
    } catch {
      // Fall through to fallback caution extractor
    }
  }

  return {
    cleanMarkdown: normalizedMarkdown,
    events: finalEvents,
    carefulDates:
      parsedCarefulDates.length > 0
        ? parsedCarefulDates
        : extractFallbackCautionDates(normalizedMarkdown, fallbackDomain),
  };
}

export function deriveThreadTitleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Assistant Thread';
  const words = cleaned.split(' ').slice(0, 6);
  const joined = words.join(' ').replace(/[?!.,:;]+$/, '');
  return joined.length > 42 ? `${joined.slice(0, 39)}...` : joined;
}

export function formatSidebarThreadLabel(
  qTurn?: ConversationTurn | null,
  fallbackIndex = 0,
): string {
  const reportName = qTurn?.threadName?.trim() || `Report #${fallbackIndex + 1}`;
  const periodPrefix = formatShortYearMonth(qTurn?.threadMonth, qTurn?.threadYear);
  return periodPrefix ? `${periodPrefix}-${reportName}` : reportName;
}

export interface ThreadHtmlExchangeInput {
  question: string;
  replies: ConversationTurn[];
  askedAt?: string;
}

export function buildThreadHtmlDocument({
  title,
  question,
  replies,
  exchanges,
  domain,
  month,
  year,
  rating,
  createdAt,
}: {
  title: string;
  question?: string;
  replies?: ConversationTurn[];
  exchanges?: ThreadHtmlExchangeInput[];
  domain?: PromptDomain;
  month?: string;
  year?: number;
  rating?: ThreadRating;
  createdAt?: string;
}): string {
  const ratingMeta = rating
    ? THREAD_RATING_OPTIONS.find((item) => item.id === rating)
    : undefined;
  const shortPeriod = formatShortYearMonth(month, year);
  const metaParts = [
    domain ? `Domain: ${getPromptDomainShortLabel(domain)}` : '',
    shortPeriod
      ? `Period: ${shortPeriod}${month && year ? ` (${month} ${year})` : ''}`
      : month && year
        ? `Period: ${month} ${year}`
        : '',
    ratingMeta ? `Rating: ${ratingMeta.starGlyphs} (${ratingMeta.label})` : '',
    createdAt ? `Updated: ${new Date(createdAt).toLocaleString()}` : '',
  ].filter(Boolean);

  const normalizedExchanges: ThreadHtmlExchangeInput[] =
    exchanges && exchanges.length > 0
      ? exchanges
      : [
          {
            question: question || '',
            replies: replies || [],
            askedAt: createdAt,
          },
        ];

  const exchangeHtml = normalizedExchanges
    .map((ex, idx) => {
      const label = idx === 0 ? 'Initial Question' : `Follow-up #${idx}`;
      const answerSections = ex.replies
        .filter((turn) => turn.role === 'assistant')
        .map((turn) => {
          const provider =
            turn.scope === 'private'
              ? 'Private · Ollama'
              : `Public · ${
                  turn.adapterId === 'claude'
                    ? 'Claude'
                    : turn.adapterId === 'fable'
                      ? 'Fable'
                      : 'Gemini'
                }`;
          const { cleanMarkdown } = parseResponseEventsAndReport(turn.content, domain);
          return `<section class="report-card">
            <div class="provider-line">${escapeHtml(`${provider} · ${turn.model}`)}</div>
            <div class="markdown-content">${renderMarkdownToHtml(cleanMarkdown)}</div>
          </section>`;
        })
        .join('\n');

      return `<article class="exchange-block">
        <section class="question-box">
          <div class="question-label">${escapeHtml(label)}</div>
          <p class="question-text">${escapeHtml(ex.question)}</p>
        </section>
        ${answerSections}
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 2.5rem 1.5rem;
      background: #f5f8fd;
      color: #0f172a;
      font: 16px/1.68 "DM Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
    }
    main {
      max-width: 920px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 2.25rem 2.5rem;
      box-shadow: 0 20px 50px -28px rgba(15, 23, 42, 0.16);
    }
    header {
      padding-bottom: 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 1.5rem;
    }
    h1 {
      margin: 0;
      font-size: 1.75rem;
      line-height: 1.25;
      letter-spacing: -0.02em;
      color: #0f172a;
    }
    .meta {
      margin: 0.5rem 0 0;
      font-size: 0.85rem;
      color: #64748b;
    }
    .exchange-block + .exchange-block {
      margin-top: 2.25rem;
      padding-top: 2rem;
      border-top: 2px dashed #cbd5e1;
    }
    .question-box {
      background: #f0f7ff;
      border: 1px solid #bae6fd;
      border-radius: 14px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.5rem;
    }
    .question-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #0369a1;
      margin-bottom: 0.35rem;
    }
    .question-text {
      margin: 0;
      font-size: 1rem;
      font-weight: 500;
      color: #0f172a;
    }
    .report-card + .report-card {
      margin-top: 1.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #e2e8f0;
    }
    .provider-line {
      font-size: 0.8rem;
      font-weight: 600;
      color: #0f766e;
      margin-bottom: 0.75rem;
    }
    .markdown-content > * + * { margin-top: 0.85rem; }
    .markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4 {
      color: #0f172a;
      margin: 1.35rem 0 0.45rem;
      line-height: 1.3;
    }
    .markdown-content h3 { font-size: 1.22rem; }
    .markdown-content h4 { font-size: 1.08rem; }
    .markdown-content p { margin: 0.65rem 0; }
    .markdown-content ul, .markdown-content ol { padding-left: 1.4rem; margin: 0.65rem 0; }
    .markdown-content ul { list-style: disc; }
    .markdown-content ol { list-style: decimal; }
    .markdown-content li + li { margin-top: 0.25rem; }
    .markdown-content blockquote {
      margin: 0.9rem 0;
      padding: 0.5rem 1rem;
      border-left: 3px solid #94a3b8;
      background: #f8fafc;
      color: #475569;
    }
    .markdown-content .table-wrap { overflow-x: auto; margin: 1rem 0; }
    .markdown-content table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    .markdown-content th, .markdown-content td {
      border: 1px solid #cbd5e1;
      padding: 0.5rem 0.75rem;
      text-align: left;
      vertical-align: top;
    }
    .markdown-content th { background: #f1f5f9; font-weight: 600; }
    .markdown-content code {
      background: #f1f5f9;
      padding: 0.12rem 0.35rem;
      border-radius: 5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.88em;
    }
    .markdown-content .code-block {
      background: #0f172a;
      color: #f8fafc;
      border-radius: 12px;
      overflow: hidden;
      margin: 1rem 0;
    }
    .markdown-content .code-language {
      padding: 0.4rem 0.85rem;
      border-bottom: 1px solid #334155;
      color: #94a3b8;
      font-size: 0.75rem;
      font-family: ui-monospace, monospace;
    }
    .markdown-content .code-block pre {
      margin: 0;
      padding: 0.9rem 1rem;
      overflow-x: auto;
      font-family: ui-monospace, monospace;
      font-size: 0.85rem;
    }
    .markdown-content .code-block code { background: transparent; padding: 0; color: inherit; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      ${metaParts.length > 0 ? `<p class="meta">${escapeHtml(metaParts.join(' · '))}</p>` : ''}
    </header>
    ${exchangeHtml}
  </main>
</body>
</html>`;
}
