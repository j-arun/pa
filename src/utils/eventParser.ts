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
  '3. Inside Section 3, list every specific event as a descriptive event subheading WITHOUT "Event 1", "Event 2", "Event 3" or numeric prefixes (for example: "### Turning Point and Communication Breakthrough", "### Quiet Emotional Pull and Unspoken Longing"). Include all three labeled items under each event:',
  '   - **When it will happen:** Exact date or date range (e.g. 2026-11-12 to 2026-11-19)',
  '   - **Probability Rating:** Clear rating and percentage (e.g. High · 84%)',
  '   - **How it will happen:** Complete, practical everyday explanation of how the event unfolds.',
  '4. STRICTLY NO ASTROLOGICAL INFORMATION IN EVENTS OR CARDS: Do NOT include any astrological terms, planet names (Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Rahu, Ketu), zodiac signs, houses, transits, aspects, conjunctions, retrogrades, dashas, nakshatras, birth charts, horoscopes, or ascendants in event titles, timing, probability ratings, or "How it will happen" descriptions. Describe every event purely in clear, everyday human and practical terms.',
  '5. At the very end of your response, append a <pa_events>...</pa_events> JSON array containing EVERY event listed in Section 3. Do NOT include Overview, Introduction, or Summary cards in <pa_events>.',
  '6. Schema for each <pa_events> item: {"title":"Turning Point and Communication Breakthrough","when":"Exact date or range","probability":"High · 82%","how":"Full practical everyday explanation of how it will happen, with zero astrological details.","category":"Relationship|Love|Career|Family|Health|General","icon":"heart|shield|briefcase|layers|calendar|compass|sparkles"}. NEVER prefix title with "Event 1:", "Event 2:", or numbers.',
  '7. Immediately after </pa_events>, also append a <pa_caution_dates>...</pa_caution_dates> JSON array listing specific dates (and time windows when specified) to be careful about across domains.',
  '8. Schema for each <pa_caution_dates> item: {"domain":"Relationship|Health|Career|Family|Finance|General","date":"Specific date or range, including time window if available","note":"Only what to avoid or watch out for (the practical guidance after Avoid), with ZERO astrological terms or planetary context.","severity":"high|caution|watch"}.',
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
  switch (fallbackDomain) {
    case 'astrology':
      return { category: 'Career', icon: 'briefcase' };
    case 'finance':
      return { category: 'Family', icon: 'layers' };
    case 'general':
      return { category: 'Love', icon: 'heart' };
    case 'health':
      return { category: 'Health', icon: 'shield' };
    default:
      break;
  }

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

  return { category: 'General', icon: 'sparkles' };
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
    .replace(/^\s*\|[^\n]*\|\s*$/gm, ' ')
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

const ASTROLOGY_PARENTHETICAL_REGEX =
  /\b(?:transit(?:ing|s)?|retrograde|conjunct(?:ion)?|opposition|sextile|trine|square|quincunx|semi-?square|aspect(?:s|ed|ing)?|dasha|antardasha|mahadasha|bhukti|pratyantardasha|nakshatra|lagna|ascendant|descendant|midheaven|horoscope|zodiac|rashi|navamsa|bhava|tithi|muhurta|panchang|hora|yoga|karana|amavasya|purnima|eclipse|combust(?:ion)?|debilitated|exalted|malefic|benefic|natal|ephemeris|void[\s-]+of[\s-]+course|planetary|astrolog(?:y|ical|ically)|house\s+lord|\d+(?:st|nd|rd|th)\s+house|rahu|ketu|saturn|jupiter|venus|mercury|mars|uranus|neptune|pluto|chandra|mangal|budha|guru|shukra|shani|surya|aries|taurus|gemini|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i;

const ASTROLOGY_SENTENCE_REGEX =
  /\b(?:transit(?:ing|s)?|retrograde|conjunct(?:ion)?|opposition|sextile|trine|square|quincunx|semi-?square|aspect(?:s|ed|ing)?|dasha|antardasha|mahadasha|bhukti|pratyantardasha|nakshatra|lagna|ascendant|descendant|midheaven|horoscope|zodiac|rashi|navamsa|bhava|tithi|muhurta|panchang|hora|yoga|karana|amavasya|purnima|eclipse|combust(?:ion)?|debilitated|exalted|malefic|benefic|natal(?:\s+chart)?|ephemeris|void[\s-]+of[\s-]+course|planetary|astrolog(?:y|ical|ically)|house\s+lord|\d+(?:st|nd|rd|th)\s+house|rahu|ketu|saturn|jupiter|venus|mercury|uranus|neptune|pluto|chandra|mangal|budha|guru|shukra|shani|surya)\b/i;

const ASTROLOGY_CAPITALIZED_ZODIAC_OR_MARS_REGEX =
  /\b(?:Sun|Moon|Aries|Taurus|Gemini|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces|Mars)\b(?!\s*(?:,?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\d{1,2}\b|day|light|beam|flower|rise|set|burn|glasses|shine))/;

const ASTROLOGY_CANCER_CONTEXT_REGEX =
  /\bCancer\b(?=[^.!?]{0,40}\b(?:sign|house|moon|sun|rising|ascendant|transit|venus|mars|jupiter|saturn|mercury)\b)|\b(?:in|sign\s+of|house\s+of|transit(?:ing)?\s+in)\s+Cancer\b/;

function containsAstrologicalContent(text: string): boolean {
  return (
    ASTROLOGY_SENTENCE_REGEX.test(text) ||
    ASTROLOGY_CAPITALIZED_ZODIAC_OR_MARS_REGEX.test(text) ||
    ASTROLOGY_CANCER_CONTEXT_REGEX.test(text)
  );
}

export function stripEventNumberPrefix(rawTitle: string): string {
  let cleaned = (rawTitle || '').trim();
  // Strip repeated prefixes like "Event 1:", "Event #2 -", "1.", "Event 3 —"
  for (let pass = 0; pass < 2; pass += 1) {
    cleaned = cleaned
      .replace(/^(?:event\s*#?\s*\d+\s*[:.\-–—]*\s*)/i, '')
      .replace(/^(?:\d+\s*[.):\-–—]\s+)/, '')
      .trim();
  }
  return cleaned;
}

export function stripAstrologicalInfo(rawText: string): string {
  if (!rawText) return '';

  // 1. Strip parenthetical or bracketed astrological asides
  let text = rawText.replace(/\(([^()]{1,180})\)|\[([^\[\]]{1,180})\]/g, (full, p1, p2) => {
    const inner = String(p1 ?? p2 ?? '');
    return ASTROLOGY_PARENTHETICAL_REGEX.test(inner) ? '' : full;
  });

  // 2. Strip trailing attribution clauses after commas/dashes
  text = text.replace(
    /(?:,\s*|\s+[–—-]\s+)(?:driven|triggered|sparked|influenced|shaped|activated|marked|guided|caused)\s+by\s+(?:the\s+)?[^.!?\n]*(?:transit|retrograde|conjunction|dasha|nakshatra|planetary|astrolog|house|saturn|jupiter|venus|mercury|mars|rahu|ketu|aries|taurus|gemini|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)[^.!?\n]*/gi,
    '',
  );

  // 3. Filter out sentences that carry astrological mechanics
  const lines = text.split(/\n+/);
  const keptLines: string[] = [];

  for (const line of lines) {
    const sentences = line.split(/(?<=[.!?])\s+/);
    const cleanSentences = sentences.filter((sentence) => {
      const trimmed = sentence.trim();
      if (!trimmed) return false;
      return !containsAstrologicalContent(trimmed);
    });
    if (cleanSentences.length > 0) {
      keptLines.push(cleanSentences.join(' '));
    }
  }

  return keptLines
    .join('\n')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/[:\-–—]\s*$/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function sanitizeEventTitle(rawTitle: string): string {
  const withoutNumber = stripEventNumberPrefix(rawTitle);
  let cleaned = withoutNumber;
  // If title has "Actual Name: Saturn Transit" or "Actual Name - Venus Aspect", drop the astrological side
  const colonSplit = cleaned.split(/\s*[:\-–—]\s+/);
  if (colonSplit.length >= 2) {
    const nonAstroParts = colonSplit.filter((part) => !containsAstrologicalContent(part));
    if (nonAstroParts.length > 0) {
      cleaned = nonAstroParts.join(' — ');
    }
  }
  cleaned = stripAstrologicalInfo(cleaned);
  return cleaned || withoutNumber || 'Key Milestone';
}

export function normalizeEventCardItem(card: EventCardItem, index = 0): EventCardItem {
  const cleanTitle = sanitizeEventTitle(card.title || `Milestone ${index + 1}`);
  const rawWhen = card.when || card.dateRange || card.timeframe || '';
  const cleanWhen = rawWhen ? stripAstrologicalInfo(rawWhen) || rawWhen.trim() : undefined;
  const rawProb = card.probability || card.likelihood || '';
  const cleanProb = rawProb ? stripAstrologicalInfo(rawProb) || rawProb.trim() : undefined;
  const rawHow = card.how || card.summary || '';
  const strippedHow = stripAstrologicalInfo(rawHow);
  const cleanHow =
    strippedHow ||
    'Practical real-world developments around this milestone unfold through everyday conversations, timing, and personal decisions.';

  return {
    ...card,
    title: cleanTitle,
    when: cleanWhen,
    dateRange: cleanWhen,
    timeframe: cleanWhen,
    probability: cleanProb,
    likelihood: cleanProb,
    how: cleanHow,
    summary: cleanHow,
  };
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

const MONTH_WORD_PATTERN =
  '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';

const DATE_RANGE_REGEX = new RegExp(
  `\\b(?:` +
    `\\d{4}-\\d{2}-\\d{2}(?:\\s*(?:to|–|-|—|through|thru)\\s*\\d{4}-\\d{2}-\\d{2})?|` +
    `${MONTH_WORD_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*(?:to|–|-|—|through|thru|&|,)\\s*(?:${MONTH_WORD_PATTERN}\\s+)?\\d{1,2}(?:st|nd|rd|th)?)*(?:,?\\s*\\d{4})?|` +
    `\\d{1,2}(?:st|nd|rd|th)?(?:\\s*(?:to|–|-|—|through|thru|&|,)\\s*\\d{1,2}(?:st|nd|rd|th)?)*\\s+${MONTH_WORD_PATTERN}(?:,?\\s*\\d{4})?|` +
    `(?:early|mid|late)[\\s-]+${MONTH_WORD_PATTERN}(?:,?\\s*\\d{4})?|` +
    `${MONTH_WORD_PATTERN}\\s+\\d{4}` +
  `)\\b`,
  'i',
);

const TIME_WINDOW_REGEX =
  /\b(?:\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]\.?M\.?)?(?:\s*(?:IST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT|LOCAL))?(?:\s*(?:to|–|-|—|through|thru|~)\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]\.?M\.?)?(?:\s*(?:IST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT|LOCAL))?)?|\d{1,2}\s*[AP]\.?M\.?(?:\s*(?:to|–|-|—|through|thru|~)\s*\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?)?(?:\s*(?:IST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT|LOCAL))?)\b/i;

function extractDateAndTimeLabel(text: string): {
  dateLabel: string;
  matchedDateRaw: string;
  matchedTimeRaw: string;
} {
  const dateMatch = text.match(DATE_RANGE_REGEX);
  if (!dateMatch) {
    return { dateLabel: '', matchedDateRaw: '', matchedTimeRaw: '' };
  }
  const matchedDateRaw = dateMatch[0].trim();
  const dateEndIdx = (dateMatch.index ?? 0) + dateMatch[0].length;
  const afterDateSlice = text.slice(dateEndIdx, dateEndIdx + 64);
  const adjacentTimeMatch = afterDateSlice.match(
    new RegExp(`^[\\s,;|·(\\[\\-–—]*(?:from|at|between)?\\s*(${TIME_WINDOW_REGEX.source})`, 'i'),
  );
  const fallbackTimeMatch = !adjacentTimeMatch ? text.match(TIME_WINDOW_REGEX) : null;
  const matchedTimeRaw = (adjacentTimeMatch?.[1] || fallbackTimeMatch?.[0] || '')
    .replace(/\s+/g, ' ')
    .trim();

  const dateLabel = matchedTimeRaw
    ? `${matchedDateRaw} · ${matchedTimeRaw}`
    : matchedDateRaw;

  return { dateLabel, matchedDateRaw, matchedTimeRaw };
}

const LIKELIHOOD_REGEX =
  /\b(?:(?:very\s+high|high(?:ly)?\s*likely|mostly\s*likely|moderate[-\s]*(?:to[-\s]*high|high)?|medium|low|strong|probable|likely)\s*(?:likelihood|probability|rating|chance)?(?:\s*[:·(\-–—]\s*(?:\d{1,3}%|rating\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)\)?)?|\d{1,3}%(?:\s*(?:likelihood|probability|rating|chance|confidence))?(?:\s*[·|/-]\s*rating\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)?|rating\s*[:#\-]?\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)(?=$|[\s.,;|•–—])/i;

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
  const trimmed = heading.trim();
  return (
    /^(?:overview|executive\s+summary|month(?:ly)?\s+summary|two[-\s]?months?\s+(?:summary|explanation|outlook)|2[-\s]?months?\s+(?:summary|explanation|outlook)|summary|introduction|background|context|conclusion|key\s+takeaways?|read[\s_-]*out|answers?(?:\s+to\b.*)?|questions?\s*(?:&|and)\s*answers?|timeline\s*(?:&|and)\s*rating\s*matrix|care\s+must\s+be\s+taken)$/i.test(
      trimmed,
    ) ||
    /^(?:\d+[.)]\s*)?(?:overview|executive\s+summary|month(?:ly)?\s+summary|summary|introduction|conclusion|read[\s_-]*out|answers?)\b/i.test(
      trimmed,
    )
  );
}

function isBreakdownCategorySubheading(heading: string): boolean {
  const cleaned = cleanLineKeepText(heading);
  if (!cleaned) return false;
  if (/^(?:detailed\s+)?[a-z\s&/,-]{2,42}\s+(?:domain\s+)?event\s+breakdown\b/i.test(cleaned)) {
    return true;
  }
  if (/^(?:detailed\s+)?(?:career|retail(?:\s+domain)?|family|domestic|love|relationship|health|finance)\s+(?:domain\s+)?(?:events?|event\s+breakdown|cards?)\b/i.test(cleaned)) {
    return true;
  }
  return false;
}

const WHEN_LABEL_REGEX =
  /^(?:[-*•+]\s*)?(?:\*\*|__)?(?:when(?:\s+it\s+(?:will\s+)?happen(?:s)?)?|timing|date(?:\s*range|\s*window|s)?|time\s*frame|timeframe|period|schedule)(?:\*\*|__)?\s*[:\-–—]\s*(.*)$/i;

const PROB_LABEL_REGEX =
  /^(?:[-*•+]\s*)?(?:\*\*|__)?(?:probability(?:\s+rating)?|likelihood(?:\s+rating)?|chance|confidence|rating)(?:\*\*|__)?\s*[:\-–—]\s*(.*)$/i;

const HOW_LABEL_REGEX =
  /^(?:[-*•+]\s*)?(?:\*\*|__)?(?:how(?:\s+it\s+(?:will\s+)?happen(?:s)?)?|what(?:\s+happens|\s+will\s+happen)?|details?|description|mechanism|explanation|breakdown|outcome|care\s+plan|precautions?)(?:\*\*|__)?\s*[:\-–—]\s*(.*)$/i;

function parseEventHeadingLine(
  line: string,
  sectionHeadingLevel: number,
): { title: string; inlineRemainder?: string } | null {
  const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const text = cleanLineKeepText(headingMatch[2]);
    if (!text) return null;
    if (level > sectionHeadingLevel || /^event\s*#?\s*\d+\b/i.test(text)) {
      return { title: text };
    }
    return null;
  }

  // "- **Event 1: Title** — details" or "- **Event 1** | Nov 12 | 80%"
  const boldEventWithRemainderMatch = line.match(
    /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(?:\*\*|__)(Event\s*#?\s*\d+(?:\s*[:\-–—.,]\s*[^*_\n]+)?)(?:\*\*|__)\s*(?:[:\-–—|,]\s*(.+))?$/i,
  );
  if (boldEventWithRemainderMatch) {
    const title = cleanLineKeepText(boldEventWithRemainderMatch[1]);
    const remainder = boldEventWithRemainderMatch[2]?.trim();
    if (title) {
      return { title, ...(remainder ? { inlineRemainder: remainder } : {}) };
    }
  }

  // "- Event 1, Date Range, Prob, Mechanism" or "- Event 1: Title — ..."
  const plainEventMatch = line.match(
    /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(Event\s*#?\s*\d+\s*[:\-–—|,]\s*.+)$/i,
  );
  if (plainEventMatch) {
    const raw = plainEventMatch[1].trim();
    const parts = raw.split(/\s*(?:\||—|–|:\s+|\s+-\s+|,\s+)\s*/);
    if (parts.length >= 2) {
      const firstPart = cleanLineKeepText(parts[0]);
      const secondPart = cleanLineKeepText(parts[1]);
      let titleCandidate = firstPart;
      let consumedCount = 1;

      if (/^event\s*#?\s*\d+$/i.test(firstPart)) {
        if (secondPart && !DATE_RANGE_REGEX.test(secondPart) && !LIKELIHOOD_REGEX.test(secondPart)) {
          titleCandidate = cleanLineKeepText(`${firstPart}: ${secondPart}`);
          consumedCount = 2;
        } else {
          // Format: "Event 2, 2026-12-03 to 2026-12-11, Moderate · 72%, Mechanism..."
          const mechanismPart = parts
            .slice(1)
            .map((p) => cleanLineKeepText(p))
            .find(
              (p) =>
                p.length >= 8 &&
                !DATE_RANGE_REGEX.test(p) &&
                !LIKELIHOOD_REGEX.test(p) &&
                !/^(?:rating\s*\d|moderate|high|low)/i.test(p),
            );
          if (mechanismPart) {
            titleCandidate = truncateText(mechanismPart, 64);
          }
        }
      }
      const remainder = parts.slice(consumedCount).join(' — ').trim();
      return {
        title: titleCandidate,
        ...(remainder ? { inlineRemainder: remainder } : {}),
      };
    }
    return { title: cleanLineKeepText(raw) };
  }

  // Standalone bold title or bulleted bold title with optional inline remainder ("- **Career Push**: Nov 12...")
  const boldBulletOrStandaloneMatch = line.match(
    /^\s*(?:[-*•]\s*|\d+[.)]\s*)?(?:\*\*|__)([^*\n_]{4,110})(?:\*\*|__)\s*(?:[:\-–—|]\s*(.+))?$/,
  );
  if (boldBulletOrStandaloneMatch) {
    const inner = cleanLineKeepText(boldBulletOrStandaloneMatch[1]);
    const remainder = boldBulletOrStandaloneMatch[2]?.trim();
    if (
      inner &&
      !WHEN_LABEL_REGEX.test(`${inner}:`) &&
      !PROB_LABEL_REGEX.test(`${inner}:`) &&
      !HOW_LABEL_REGEX.test(`${inner}:`) &&
      !isOverviewHeading(inner) &&
      !isCautionSectionHeading(inner) &&
      !DATE_RANGE_REGEX.test(inner.replace(/^dates?\s*[:\-]?\s*/i, ''))
    ) {
      return { title: inner, ...(remainder ? { inlineRemainder: remainder } : {}) };
    }
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

  return normalizeEventCardItem(
    {
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
    },
    index,
  );
}

function parseEventsFromSectionSlice(
  sectionLines: string[],
  sectionHeading: string,
  sectionLevel: number,
  startIndex: number,
  fallbackDomain?: PromptDomain,
): EventCardItem[] {
  const eventBlocks: Array<{
    title: string;
    contextHeading: string;
    bodyLines: string[];
  }> = [];
  let currentTitle: string | null = null;
  let currentBody: string[] = [];
  let activeCategoryHeading = sectionHeading;

  for (let idx = 0; idx < sectionLines.length; idx += 1) {
    const line = sectionLines[idx];
    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = cleanLineKeepText(headingMatch[2]);
      if (isOverviewHeading(headingText) || isCautionSectionHeading(headingText)) {
        if (currentTitle) {
          eventBlocks.push({
            title: currentTitle,
            contextHeading: activeCategoryHeading,
            bodyLines: currentBody,
          });
          currentTitle = null;
          currentBody = [];
        }
        continue;
      }
      if (isBreakdownCategorySubheading(headingText) && level >= sectionLevel) {
        if (currentTitle) {
          eventBlocks.push({
            title: currentTitle,
            contextHeading: activeCategoryHeading,
            bodyLines: currentBody,
          });
          currentTitle = null;
          currentBody = [];
        }
        activeCategoryHeading = headingText;
        continue;
      }
    }

    const detected = parseEventHeadingLine(line, sectionLevel);
    if (detected) {
      if (currentTitle) {
        eventBlocks.push({
          title: currentTitle,
          contextHeading: activeCategoryHeading,
          bodyLines: currentBody,
        });
      }
      currentTitle = detected.title;
      currentBody = detected.inlineRemainder ? [detected.inlineRemainder] : [];
      continue;
    }
    if (currentTitle !== null) {
      currentBody.push(line);
    }
  }

  if (currentTitle) {
    eventBlocks.push({
      title: currentTitle,
      contextHeading: activeCategoryHeading,
      bodyLines: currentBody,
    });
  }

  const parsedBlocks = eventBlocks
    .filter(
      (b) =>
        !isOverviewHeading(b.title) &&
        !isCautionSectionHeading(b.title) &&
        !isBreakdownCategorySubheading(b.title),
    )
    .map((block, idx) =>
      parseSingleEventBlock(
        block.title,
        block.bodyLines,
        block.contextHeading || sectionHeading,
        startIndex + idx,
        fallbackDomain,
      ),
    );

  if (parsedBlocks.length > 0) {
    return parsedBlocks;
  }

  // Markdown table fallback inside the Event Cards / Breakdown / Matrix section
  const tableEvents: EventCardItem[] = [];
  for (let i = 0; i < sectionLines.length; i += 1) {
    const line = sectionLines[i];
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    if (i + 1 >= sectionLines.length || !/^\s*\|[\s|:-]+\|\s*$/.test(sectionLines[i + 1].trim())) {
      continue;
    }
    const parseRow = (row: string) =>
      row
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => cleanLineKeepText(c));
    const headers = parseRow(line).map((h) => h.toLowerCase());
    const dataRows: string[][] = [];
    let j = i + 2;
    while (j < sectionLines.length && /^\s*\|.*\|\s*$/.test(sectionLines[j])) {
      dataRows.push(parseRow(sectionLines[j]));
      j += 1;
    }
    i = j - 1;

    const whenIdx = headers.findIndex((h) => /when|date|time|window|period/.test(h));
    const probIdx = headers.findIndex((h) => /prob|likel|chance|conf/.test(h));
    const ratingIdx = headers.findIndex((h) => /\brating\b/.test(h));
    const howIdx = headers.findIndex((h) => /how|detail|what|desc|summary|explain|trigger|mechanism|organ/.test(h));
    let titleIdx = headers.findIndex((h) => /event|issue|title|name|milestone|heading/.test(h));
    if (titleIdx < 0) {
      titleIdx = whenIdx === 0 && headers.length > 1 ? 1 : 0;
    }

    for (let r = 0; r < dataRows.length; r += 1) {
      const cells = dataRows[r];
      if (cells.length === 0 || cells.every((c) => !c)) continue;
      const title = cells[titleIdx] || `Event ${startIndex + tableEvents.length + 1}`;
      const whenText = whenIdx >= 0 ? cells[whenIdx] : undefined;
      const probParts = [
        probIdx >= 0 ? cells[probIdx] : '',
        ratingIdx >= 0 && ratingIdx !== probIdx ? `Rating ${cells[ratingIdx]}` : '',
      ].filter(Boolean);
      const probText = probParts.join(' · ') || undefined;
      const howText =
        howIdx >= 0
          ? cells[howIdx]
          : cells
              .filter(
                (_, ci) =>
                  ci !== titleIdx && ci !== whenIdx && ci !== probIdx && ci !== ratingIdx,
              )
              .join(' — ');
      const { category, icon } = inferCategoryAndIcon(
        `${sectionHeading} ${title} ${howText}`,
        fallbackDomain,
      );
      tableEvents.push(
        normalizeEventCardItem(
          {
            id: `evt-${startIndex + tableEvents.length + 1}`,
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
          },
          startIndex + tableEvents.length,
        ),
      );
    }
  }

  return tableEvents;
}

function isExplicitBreakdownSectionHeading(heading: string): boolean {
  return (
    /(?:\bevent\s+cards?\b|\bevent\s+breakdown\b|detailed\s+.{0,48}\bevents?\b)/i.test(heading) &&
    !/\btimeline\s*(?:&|and)\s*rating\s*matrix\b/i.test(heading)
  );
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

  const nonEventHeadings = allHeadings.filter(
    (h) => !/^event\s*#?\s*\d+\b/i.test(h.text),
  );

  // 1. Collect all explicit Event Cards / Detailed <Domain> Event Breakdown sections,
  // preferring top-level "Event Cards" containers if they wrap nested domain breakdown headings.
  const explicitHeadings = nonEventHeadings.filter((h) =>
    isExplicitBreakdownSectionHeading(h.text),
  );

  const sectionSpan = (heading: HeadingEntry) => {
    const nextPeer = allHeadings.find(
      (h) =>
        h.lineIdx > heading.lineIdx &&
        h.level <= heading.level &&
        !/^event\s*#?\s*\d+\b/i.test(h.text),
    );
    return {
      startLine: heading.lineIdx + 1,
      endLine: nextPeer ? nextPeer.lineIdx : lines.length,
    };
  };

  const selectedTargets: Array<HeadingEntry & { startLine: number; endLine: number }> = [];
  for (const h of explicitHeadings) {
    const span = sectionSpan(h);
    const alreadyCovered = selectedTargets.some(
      (parent) => h.lineIdx >= parent.startLine && h.lineIdx < parent.endLine,
    );
    if (!alreadyCovered) {
      selectedTargets.push({ ...h, ...span });
    }
  }

  // 2. Fallback to the 3rd major section heading if no explicit Event Cards / Breakdown heading matched
  if (selectedTargets.length === 0 && nonEventHeadings.length >= 3) {
    const preferredLevel = nonEventHeadings.some((h) => h.level === 2)
      ? 2
      : nonEventHeadings.some((h) => h.level === 3)
        ? 3
        : nonEventHeadings[0].level;
    const levelSections = nonEventHeadings.filter((h) => h.level === preferredLevel);
    const thirdHeading = levelSections[2] ?? nonEventHeadings[2];
    if (
      thirdHeading &&
      !isCautionSectionHeading(thirdHeading.text) &&
      !isOverviewHeading(thirdHeading.text)
    ) {
      selectedTargets.push({ ...thirdHeading, ...sectionSpan(thirdHeading) });
    }
  }

  const collectedEvents: EventCardItem[] = [];
  const primarySectionHeading = selectedTargets[0]?.text || '';

  if (selectedTargets.length > 0) {
    for (const target of selectedTargets) {
      const slice = lines.slice(target.startLine, target.endLine);
      const parsed = parseEventsFromSectionSlice(
        slice,
        target.text,
        target.level,
        collectedEvents.length,
        fallbackDomain,
      );
      collectedEvents.push(...parsed);
    }
  } else {
    const parsed = parseEventsFromSectionSlice(
      lines,
      '',
      2,
      0,
      fallbackDomain,
    );
    collectedEvents.push(...parsed);
  }

  if (collectedEvents.length > 0) {
    return {
      events: collectedEvents.slice(0, 24),
      sectionHeading: primarySectionHeading,
    };
  }

  // 3. Fallback to Timeline & Rating Matrix table if Section 3 had no structured event blocks
  const matrixHeading = nonEventHeadings.find((h) => isTimelineMatrixHeading(h.text));
  if (matrixHeading) {
    const span = sectionSpan(matrixHeading);
    const matrixEvents = parseEventsFromSectionSlice(
      lines.slice(span.startLine, span.endLine),
      matrixHeading.text,
      matrixHeading.level,
      0,
      fallbackDomain,
    );
    if (matrixEvents.length > 0) {
      return {
        events: matrixEvents.slice(0, 24),
        sectionHeading: matrixHeading.text,
      };
    }
  }

  return { events: [], sectionHeading: primarySectionHeading };
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

function isCautionSectionHeading(heading: string): boolean {
  return /\b(careful\s+dates|caution\s+dates|dates\s+to\s+(?:watch(?:\s+out)?|avoid|be\s+(?:very\s+)?careful(?:\s+about)?|be\s+cautious)|specific\s+.{0,48}dates\s+to\s+(?:be\s+)?(?:very\s+)?(?:careful|watch|cautious)|dates\s+(?:you\s+need|not)\s+to\s+(?:be\s+careful|miss)|watch[\s-]*out\s+(?:dates|windows|for)|care\s+must\s+be\s+taken|warning\s+dates|risk\s+windows|sensitivity\s+dates|precaution(?:s)?)\b/i.test(
    heading,
  );
}

const ASTRO_CAUTION_LABEL_REGEX =
  /^\s*(?:[-*•+]\s*)?(?:astrolog(?:y|ical)|planetary|transit|aspect|chart|trigger|factor|reason\s*\(astrolog|nakshatra|dasha|horoscope)(?:\s+(?:context|reason|trigger|factor|basis|influence|cause|detail|summary|note))?\s*[:\-–—]/i;

function extractAvoidGuidanceText(rawText: string): string {
  const cleaned = cleanPlainSummary(rawText);
  if (!cleaned) return '';

  // 1. Prefer explicit "Avoid:" / "What to avoid:" / "Things to avoid:" / "Strictly avoid:" text
  const explicitAvoidMatch = cleaned.match(
    /(?:^|[\s.;,|•–—(])(?:what\s+to\s+|things\s+to\s+|actions?\s+to\s+|best\s+to\s+|strictly\s+|please\s+)?avoid(?:\s+(?:doing|actions?))?\s*[:\-–—]\s*([^|\n]+)$/i,
  );
  if (explicitAvoidMatch?.[1]) {
    const afterAvoid = explicitAvoidMatch[1].replace(/^[\s:–—-]+/, '').trim();
    if (afterAvoid) {
      const stripped = stripAstrologicalInfo(afterAvoid);
      if (stripped) {
        return stripped.charAt(0).toUpperCase() + stripped.slice(1);
      }
    }
  }

  // 2. Also support inline verb form: "... <astrological reason>, avoid <action>"
  const verbAvoidMatch = cleaned.match(
    /\b(?:what\s+to\s+|things\s+to\s+|strictly\s+|please\s+)?avoid\s+([^.;!\n|]{4,}(?:[.!?][^|\n]*)?)/i,
  );
  if (verbAvoidMatch?.[1]) {
    const candidate = verbAvoidMatch[1].replace(/^[:\-–—\s]+/, '').trim();
    const stripped = stripAstrologicalInfo(candidate);
    if (stripped) {
      return stripped.charAt(0).toUpperCase() + stripped.slice(1);
    }
  }

  return '';
}

function stripLeadingDateAndTime(text: string, matchedDateRaw: string, matchedTimeRaw: string): string {
  let out = text.trim();
  if (matchedDateRaw) {
    out = out.replace(matchedDateRaw, ' ');
  }
  if (matchedTimeRaw) {
    out = out.replace(matchedTimeRaw, ' ');
  }
  return out
    .replace(/^\s*\(\s*\)\s*/, ' ')
    .replace(/^[\s,:;·|()\[\]–—-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeCarefulDateItem(item: CarefulDateItem): CarefulDateItem {
  const combinedSource = `${item.date || ''} ${item.note || ''}`;
  const { dateLabel, matchedDateRaw, matchedTimeRaw } = extractDateAndTimeLabel(combinedSource);
  const finalDate = truncateText((dateLabel || item.date || 'Upcoming window').trim(), 68);

  const rawNote = cleanPlainSummary(item.note || '');
  const avoidFirst = extractAvoidGuidanceText(rawNote);
  let cleanNote = avoidFirst;

  if (!cleanNote) {
    const withoutDateTime = stripLeadingDateAndTime(rawNote, matchedDateRaw, matchedTimeRaw);
    cleanNote = stripAstrologicalInfo(withoutDateTime);
  }

  // Never fall back to raw astrological context
  if (!cleanNote || containsAstrologicalContent(cleanNote)) {
    const fallbackStripped = stripAstrologicalInfo(cleanNote);
    cleanNote =
      fallbackStripped && !containsAstrologicalContent(fallbackStripped)
        ? fallbackStripped
        : `Exercise extra care around ${finalDate}.`;
  }

  return {
    ...item,
    date: finalDate,
    note: truncateText(cleanNote, 180),
  };
}

function extractFallbackCautionDates(
  cleanMarkdown: string,
  fallbackDomain?: PromptDomain,
): CarefulDateItem[] {
  const explicitItems: CarefulDateItem[] = [];
  const heuristicItems: CarefulDateItem[] = [];
  const seen = new Set<string>();
  const lines = cleanMarkdown.split(/\r?\n/);
  let inCautionSection = false;
  let inExcludedProseSection = false;
  let cautionSectionHeadingLevel = 2;
  let cautionSectionHeadingText = '';

  const pushCautionItem = (
    rawDate: string,
    rawNote: string,
    severitySource: string,
  ) => {
    const { dateLabel, matchedDateRaw, matchedTimeRaw } = extractDateAndTimeLabel(
      `${rawDate} ${rawNote}`,
    );
    const cleanedDate = truncateText((dateLabel || rawDate).trim(), 68);
    if (!cleanedDate) return;

    const plainNote = cleanPlainSummary(rawNote);
    let cleanedNote = extractAvoidGuidanceText(plainNote);

    if (!cleanedNote) {
      const noteWithoutDate = stripLeadingDateAndTime(plainNote, matchedDateRaw, matchedTimeRaw);
      // Drop leading astrological clause before " — " if present
      const clauseParts = noteWithoutDate.split(/\s+[–—-]\s+|\s*\|\s*/);
      const nonAstroClauses = clauseParts
        .map((part) => stripAstrologicalInfo(part))
        .filter((part) => part && !containsAstrologicalContent(part));
      cleanedNote = nonAstroClauses.join(' — ').trim();
    }

    // Never fall back to raw unstripped astrological text
    if (!cleanedNote || containsAstrologicalContent(cleanedNote)) {
      return;
    }

    const finalNote = truncateText(
      cleanedNote.toLowerCase() !== cleanedDate.toLowerCase()
        ? cleanedNote
        : `Exercise extra care around ${cleanedDate}.`,
      180,
    );

    const severity: CarefulDateItem['severity'] =
      /\b(high|avoid|critical|severe|major|conflict|risk|danger)\b/i.test(severitySource)
        ? 'high'
        : /\b(watch|minor|mild)\b/i.test(severitySource)
          ? 'watch'
          : 'caution';

    const domain = inferDomainFromLine(
      `${cautionSectionHeadingText} ${severitySource} ${finalNote}`,
      fallbackDomain,
    );
    const dedupeKey = `${cleanedDate.toLowerCase()}|${finalNote.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const targetList = inCautionSection ? explicitItems : heuristicItems;
    targetList.push({
      id: `cd-fb-${targetList.length + 1}`,
      domain,
      date: cleanedDate,
      note: finalNote,
      severity,
    });
  };

  let activeTableHeaders: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const trimmedRaw = rawLine.trim();
    if (!trimmedRaw) {
      activeTableHeaders = [];
      continue;
    }

    const headingMatch = trimmedRaw.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      activeTableHeaders = [];
      const level = trimmedRaw.match(/^(#{1,6})/)?.[1].length ?? 2;
      const headingText = cleanLineKeepText(headingMatch[1]);
      if (isCautionSectionHeading(headingText)) {
        inCautionSection = true;
        inExcludedProseSection = false;
        cautionSectionHeadingLevel = level;
        cautionSectionHeadingText = headingText;
      } else if (
        inCautionSection &&
        level > cautionSectionHeadingLevel &&
        !/^(?:read[\s_-]*out|event\s+cards?|conclusion|month(?:ly)?\s+summary|answers?)/i.test(headingText)
      ) {
        // Check if subheading itself is a dated caution item (e.g., "#### Nov 14, 2026 (10:30 AM - 2:15 PM)")
        const headingDateInfo = extractDateAndTimeLabel(headingText);
        if (headingDateInfo.dateLabel) {
          const blockLines: string[] = [];
          let j = i + 1;
          while (j < lines.length) {
            const nextTrimmed = lines[j].trim();
            if (!nextTrimmed) {
              if (blockLines.length > 0) break;
              j += 1;
              continue;
            }
            if (/^#{1,6}\s+/.test(nextTrimmed)) break;
            if (!ASTRO_CAUTION_LABEL_REGEX.test(nextTrimmed)) {
              blockLines.push(nextTrimmed);
            }
            j += 1;
          }
          const combinedSub = cleanPlainSummary(blockLines.join(' '));
          const avoidTxt = extractAvoidGuidanceText(combinedSub) || combinedSub;
          if (avoidTxt) {
            pushCautionItem(headingDateInfo.dateLabel, avoidTxt, `${headingText} ${avoidTxt}`);
            if (explicitItems.length >= 16) break;
          }
          i = j - 1;
          continue;
        }
        cautionSectionHeadingText = headingText;
      } else {
        inCautionSection = false;
        cautionSectionHeadingText = '';
        inExcludedProseSection =
          isOverviewHeading(headingText) ||
          /\b(?:read[\s_-]*out|month(?:ly)?\s+summary|two[-\s]?months?\s+(?:summary|explanation|outlook)|answers?\b|conclusion)\b/i.test(
            headingText,
          );
      }
      continue;
    }

    // Bold standalone pseudo-headings inside reports (e.g., "**Specific Career Dates to Be Careful:**")
    const boldHeaderMatch = trimmedRaw.match(/^(?:\*\*|__)([^*\n_]{8,96})(?:\*\*|__)\s*:?\s*$/);
    if (boldHeaderMatch) {
      activeTableHeaders = [];
      const headingText = cleanLineKeepText(boldHeaderMatch[1]);
      if (isCautionSectionHeading(headingText)) {
        inCautionSection = true;
        inExcludedProseSection = false;
        cautionSectionHeadingText = headingText;
        continue;
      }
      if (/^(?:read[\s_-]*out|month(?:ly)?\s+summary|summary|answers?|event\s+cards?|overview)/i.test(headingText)) {
        inCautionSection = false;
        inExcludedProseSection = true;
        cautionSectionHeadingText = '';
        continue;
      }
    }

    if (inExcludedProseSection) continue;

    // Detect markdown table header & separator
    if (
      /^\|.*\|$/.test(trimmedRaw) &&
      i + 1 < lines.length &&
      /^\|[\s|:-]+\|$/.test(lines[i + 1].trim())
    ) {
      activeTableHeaders = trimmedRaw
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => cleanPlainSummary(c).toLowerCase());
      i += 1;
      continue;
    }

    if (/^\|[\s|:-]+\|$/.test(trimmedRaw)) continue;

    // Handle markdown table row cleanly when inside a caution section
    if (/^\|.*\|$/.test(trimmedRaw)) {
      const cells = trimmedRaw
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => cleanPlainSummary(c))
        .filter(Boolean);
      const joinedCells = cells.join(' — ');
      const dateColIdx = activeTableHeaders.findIndex((h) => /\b(date|when|day|window|period)\b/.test(h));
      const timeColIdx = activeTableHeaders.findIndex((h) => /\b(time|hours?|timing)\b/.test(h) && !/\bdate\b/.test(h));
      const avoidColIdx = activeTableHeaders.findIndex((h) =>
        /\b(avoid|precaution|watch\s*out|guidance|action|recommendation|what\s+to)\b/.test(h),
      );
      const astroColIdx = activeTableHeaders.findIndex((h) =>
        /\b(astro|planet|transit|aspect|dasha|chart|yoga|nakshatra|lagna|trigger|factor|reason)\b/.test(h),
      );

      const dateSource =
        dateColIdx >= 0 && cells[dateColIdx]
          ? `${cells[dateColIdx]}${timeColIdx >= 0 && cells[timeColIdx] ? ` · ${cells[timeColIdx]}` : ''}`
          : joinedCells;
      const dateInfo = extractDateAndTimeLabel(dateSource);
      const hasSignal =
        inCautionSection ||
        /\b(careful|caution|avoid|watch|sensitive|tension|friction|delay|risk|stress|conflict|misunderstanding|strain)\b/i.test(
          joinedCells,
        );

      if (dateInfo.dateLabel && hasSignal && !/^(?:date|dates|window|period)$/i.test(cells[0] || '')) {
        let noteCandidate = '';
        if (avoidColIdx >= 0 && cells[avoidColIdx]) {
          noteCandidate = extractAvoidGuidanceText(cells[avoidColIdx]) || cells[avoidColIdx];
        } else {
          const explicitAvoid = extractAvoidGuidanceText(joinedCells);
          if (explicitAvoid) {
            noteCandidate = explicitAvoid;
          } else {
            noteCandidate = cells
              .filter(
                (c, ci) =>
                  ci !== dateColIdx &&
                  ci !== timeColIdx &&
                  ci !== astroColIdx &&
                  (!DATE_RANGE_REGEX.test(c) || c.length > dateInfo.matchedDateRaw.length + 8) &&
                  !containsAstrologicalContent(c),
              )
              .join(' — ');
          }
        }

        if (noteCandidate) {
          pushCautionItem(dateInfo.dateLabel, noteCandidate, joinedCells);
          if (explicitItems.length >= 16) break;
        }
      }
      continue;
    }

    activeTableHeaders = [];

    // Skip lines that are purely an astrological context label (wait for Avoid line next)
    if (ASTRO_CAUTION_LABEL_REGEX.test(trimmedRaw) && !/\bavoid\b/i.test(trimmedRaw)) {
      continue;
    }

    let cleaned = cleanPlainSummary(rawLine);
    if (!cleaned) continue;

    const dateInfo = extractDateAndTimeLabel(cleaned);
    if (!dateInfo.dateLabel) continue;

    // Collect multi-line sub-bullets under a dated caution item (look ahead past astrological lines to grab "Avoid:" & "Time:")
    let extraTimeLabel = '';
    if (inCautionSection) {
      const subAvoidLines: string[] = [];
      const subOtherLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && subAvoidLines.length + subOtherLines.length < 6) {
        const nextRaw = lines[j];
        const nextTrimmed = nextRaw.trim();
        if (!nextTrimmed) break;
        if (/^#{1,6}\s+/.test(nextTrimmed)) break;
        if (/^\|/.test(nextTrimmed)) break;
        const nextPlain = cleanPlainSummary(nextTrimmed).replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, '');
        if (!nextPlain) {
          j += 1;
          continue;
        }
        // Stop if next line introduces a brand new date entry
        if (DATE_RANGE_REGEX.test(nextPlain)) break;

        if (/^(?:time|hours?|window|timing)\s*[:\-–—]/i.test(nextPlain)) {
          const tm = nextPlain.match(TIME_WINDOW_REGEX);
          if (tm && !dateInfo.matchedTimeRaw) {
            extraTimeLabel = tm[0].trim();
          }
          j += 1;
          continue;
        }

        const subAvoid = extractAvoidGuidanceText(nextPlain);
        if (subAvoid) {
          subAvoidLines.push(subAvoid);
        } else if (!ASTRO_CAUTION_LABEL_REGEX.test(nextPlain) && !containsAstrologicalContent(nextPlain)) {
          subOtherLines.push(nextPlain);
        }
        j += 1;
      }

      if (j > i + 1) {
        if (subAvoidLines.length > 0) {
          cleaned = `${dateInfo.dateLabel}${extraTimeLabel ? ` · ${extraTimeLabel}` : ''} — Avoid: ${subAvoidLines.join(' ')}`;
          i = j - 1;
        } else if (cleaned.length <= dateInfo.dateLabel.length + 18 && subOtherLines.length > 0) {
          cleaned = `${cleaned}${extraTimeLabel ? ` · ${extraTimeLabel}` : ''} — ${subOtherLines.join(' ')}`;
          i = j - 1;
        }
      }
    }

    if (cleaned.length < 10) continue;

    const hasCautionSignal =
      inCautionSection ||
      /\b(careful|caution|avoid|watch|sensitive|tension|friction|delay|risk|stress|conflict|misunderstanding|strain)\b/i.test(
        cleaned,
      );
    if (!hasCautionSignal) continue;

    const finalDateInput = extraTimeLabel
      ? `${dateInfo.dateLabel} · ${extraTimeLabel}`
      : dateInfo.dateLabel;
    pushCautionItem(finalDateInput, cleaned, cleaned);
    if (explicitItems.length >= 16) break;
  }

  return (explicitItems.length > 0 ? explicitItems : heuristicItems).slice(0, 16);
}

export function extractCarefulDatesFromHtml(
  html: string,
  fallbackDomain?: PromptDomain,
): CarefulDateItem[] {
  if (!html || !html.trim()) return [];
  if (typeof DOMParser === 'undefined') {
    const textOnly = html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, '\n');
    return extractFallbackCautionDates(textOnly, fallbackDomain);
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, noscript').forEach((el) => el.remove());

  const blocks = Array.from(
    doc.querySelectorAll('h1, h2, h3, h4, h5, h6, li, p, tr'),
  );
  const lines: string[] = [];

  for (const el of blocks) {
    if (/^H[1-6]$/i.test(el.tagName)) {
      const headingText = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (headingText) lines.push(`## ${headingText}`);
      continue;
    }
    if (el.tagName === 'TR') {
      const cells = Array.from(el.querySelectorAll('th, td'))
        .map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (cells.length > 0) lines.push(cells.join(' — '));
      continue;
    }
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
  }

  return extractFallbackCautionDates(lines.join('\n'), fallbackDomain);
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

  finalEvents = finalEvents.map((evt, idx) => normalizeEventCardItem(evt, idx));

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
            const rawDate =
              typeof item.date === 'string' && item.date.trim()
                ? item.date.trim()
                : 'Upcoming window';
            const rawTime =
              typeof item.time === 'string' && item.time.trim()
                ? item.time.trim()
                : '';
            const rawNote =
              typeof item.note === 'string' && item.note.trim()
                ? item.note.trim()
                : '';
            const rawSev =
              typeof item.severity === 'string' ? item.severity.trim().toLowerCase() : '';
            const severity: CarefulDateItem['severity'] =
              rawSev === 'high' || rawSev === 'watch' ? rawSev : 'caution';
            return sanitizeCarefulDateItem({
              id: `cd-${idx + 1}`,
              domain: truncateText(domain, 28),
              date: rawTime && !rawDate.includes(rawTime) ? `${rawDate} · ${rawTime}` : rawDate,
              note: rawNote,
              severity,
            });
          })
          .slice(0, 16);
      }
    } catch {
      // Fall through to fallback caution extractor
    }
  }

  const markdownCarefulDates = extractFallbackCautionDates(normalizedMarkdown, fallbackDomain);
  return {
    cleanMarkdown: normalizedMarkdown,
    events: finalEvents,
    carefulDates:
      markdownCarefulDates.length > 0
        ? markdownCarefulDates
        : parsedCarefulDates,
  };
}

export interface ReadOutSections {
  summary?: string;
  answer?: string;
}

function cleanReadOutBlockText(rawLines: string[]): string {
  const normalized = rawLines
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*[-*•+]\s+/, '• ')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~>]/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized;
}

export function extractReadOutSections(rawContent: string): ReadOutSections | null {
  if (!rawContent || !rawContent.trim()) return null;

  const cleanMarkdown = rawContent
    .replace(/<pa_events>[\s\S]*?<\/pa_events>/gi, '')
    .replace(/<pa_caution_dates>[\s\S]*?<\/pa_caution_dates>/gi, '')
    .trim();

  if (!cleanMarkdown) return null;

  const lines = cleanMarkdown.split(/\r?\n/);
  const readOutHeadingRegex =
    /^\s{0,3}(#{1,6})\s*(?:\d+[.)]\s*)?read[\s_-]*out\b(.*)$/i;
  const readOutLabelRegex =
    /^\s*(?:[-*•+]\s*|\d+[.)]\s*)?(?:\*\*|__)?read[\s_-]*out(?:\*\*|__)?\s*[:\-–—]?\s*(.*)$/i;

  let startLineIdx = -1;
  let readOutHeadingLevel = 0;
  let inlineAfterReadOut = '';
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const headingMatch = line.match(readOutHeadingRegex);
    if (headingMatch) {
      startLineIdx = i;
      readOutHeadingLevel = headingMatch[1].length;
      inlineAfterReadOut = (headingMatch[2] || '').replace(/^[\s:–—-]+/, '').trim();
      continue;
    }

    const labelMatch = line.match(readOutLabelRegex);
    if (labelMatch) {
      const cleanedLabelLine = line.replace(/[*_`~]/g, '').trim();
      if (/^(?:[-*•+]\s*|\d+[.)]\s*)?read[\s_-]*out\s*(?:[:\-–—]|$)/i.test(cleanedLabelLine)) {
        startLineIdx = i;
        readOutHeadingLevel = 2;
        inlineAfterReadOut = (labelMatch[1] || '').trim();
      }
    }
  }

  if (startLineIdx < 0) return null;

  const summaryNamePattern =
    '(?:(?:the\\s+)?(?:two|2)[\\s-]*(?:month|months)s?\\s*(?:summary|explanation|outlook|overview|recap)|(?:the\\s+)?month(?:ly)?\\s*(?:&|and)?\\s*(?:next\\s+month\\s+)?(?:summary|explanation|outlook|recap)|(?:executive|overall|brief|monthly)\\s+summary|summary|key\\s+takeaways?|overview)';
  const answerNamePattern =
    '(?:direct\\s+answers?|answers?(?:\\s+to\\b.*)?|questions?\\s*(?:&|and)\\s*answers?|questions?\\s+asked(?:\\s+in\\b.*)?|prompt\\s+questions?(?:\\s+answered)?|focus\\s+questions?(?:\\s+answered?)?|your\\s+questions?|q\\s*&\\s*a|response\\s+to\\b.*)';

  const internalReadOutHeadingRegex = new RegExp(
    `^(?:\\d+[.)]\\s*|[a-z][.)]\\s*)?(?:${summaryNamePattern}|${answerNamePattern})\\b`,
    'i',
  );

  const sectionLines: string[] = [];
  if (inlineAfterReadOut && !/^[\(\[]/.test(inlineAfterReadOut)) {
    sectionLines.push(inlineAfterReadOut);
  }

  for (let i = startLineIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = cleanLineKeepText(headingMatch[2]);
      if (
        level <= readOutHeadingLevel &&
        !internalReadOutHeadingRegex.test(headingText)
      ) {
        break;
      }
    }
    sectionLines.push(line);
  }

  const summaryHeadingRegex = new RegExp(
    `^\\s{0,3}#{1,6}\\s*(?:\\d+[.)]\\s*|[a-z][.)]\\s*)?${summaryNamePattern}\\b.*$`,
    'i',
  );
  const summaryLabelRegex = new RegExp(
    `^\\s*(?:[-*•+]\\s*|\\d+[.)]\\s*|[a-z][.)]\\s*)?(?:\\*\\*|__)?${summaryNamePattern}(?:\\*\\*|__)?\\s*[:\\-–—]\\s*(.*)$`,
    'i',
  );
  const answerHeadingRegex = new RegExp(
    `^\\s{0,3}#{1,6}\\s*(?:\\d+[.)]\\s*|[a-z][.)]\\s*)?${answerNamePattern}\\b.*$`,
    'i',
  );
  const answerLabelRegex = new RegExp(
    `^\\s*(?:[-*•+]\\s*|\\d+[.)]\\s*|[a-z][.)]\\s*)?(?:\\*\\*|__)?${answerNamePattern}(?:\\*\\*|__)?\\s*[:\\-–—]\\s*(.*)$`,
    'i',
  );

  const summaryLines: string[] = [];
  const answerLines: string[] = [];
  const unlabeledLines: string[] = [];
  let activeBucket: 'summary' | 'answer' | null = null;

  for (const rawLine of sectionLines) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) {
      if (activeBucket === 'summary' && summaryLines.length > 0) summaryLines.push('');
      else if (activeBucket === 'answer' && answerLines.length > 0) answerLines.push('');
      else if (unlabeledLines.length > 0) unlabeledLines.push('');
      continue;
    }

    if (summaryHeadingRegex.test(trimmed)) {
      activeBucket = 'summary';
      continue;
    }

    const summaryLabelMatch = trimmed.match(summaryLabelRegex);
    if (summaryLabelMatch) {
      activeBucket = 'summary';
      const remainder = summaryLabelMatch[1]?.trim();
      if (remainder) summaryLines.push(remainder);
      continue;
    }

    if (answerHeadingRegex.test(trimmed)) {
      activeBucket = 'answer';
      continue;
    }

    const answerLabelMatch = trimmed.match(answerLabelRegex);
    if (answerLabelMatch) {
      activeBucket = 'answer';
      const remainder = answerLabelMatch[1]?.trim();
      if (remainder) answerLines.push(remainder);
      continue;
    }

    // Secondary subheading inside Read Out flips smoothly between whichever bucket isn't populated yet
    const subHeadingMatch = trimmed.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (subHeadingMatch) {
      const subText = cleanLineKeepText(subHeadingMatch[1]);
      if (activeBucket === 'summary' && answerLines.length === 0) {
        activeBucket = 'answer';
        if (subText) answerLines.push(subText);
        continue;
      }
      if (activeBucket === 'answer' && summaryLines.length === 0 && /\b(month|summary|outlook|explanation|overview)\b/i.test(subText)) {
        activeBucket = 'summary';
        continue;
      }
    }

    if (activeBucket === 'summary') {
      summaryLines.push(rawLine);
    } else if (activeBucket === 'answer') {
      answerLines.push(rawLine);
    } else {
      unlabeledLines.push(rawLine);
    }
  }

  let summary = cleanReadOutBlockText(summaryLines);
  let answer = cleanReadOutBlockText(answerLines);

  if (!summary && !answer && unlabeledLines.length > 0) {
    const joined = cleanReadOutBlockText(unlabeledLines);
    const paragraphs = joined.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length >= 2) {
      summary = paragraphs[0];
      answer = paragraphs.slice(1).join('\n\n');
    } else if (paragraphs.length === 1) {
      summary = paragraphs[0];
    }
  } else if (unlabeledLines.length > 0) {
    const extra = cleanReadOutBlockText(unlabeledLines);
    if (extra) {
      if (!summary && answer) summary = extra;
      else if (!answer && summary) answer = extra;
    }
  }

  if (!summary && !answer) return null;
  return {
    ...(summary ? { summary } : {}),
    ...(answer ? { answer } : {}),
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
  const baseLabel = periodPrefix ? `${periodPrefix}-${reportName}` : reportName;
  const starPrefix =
    qTurn?.threadRating === 'red'
      ? '★ '
      : qTurn?.threadRating === 'yellow'
        ? '★★ '
        : qTurn?.threadRating === 'green'
          ? '★★★ '
          : '';
  return `${starPrefix}${baseLabel}`;
}

export interface ThreadHtmlExchangeInput {
  question: string;
  replies: ConversationTurn[];
  askedAt?: string;
}

export interface ReportMatrixTable {
  title: string;
  headers: string[];
  rows: string[][];
}

function isMarkdownTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function parseMarkdownTableCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cleanLineKeepText(cell));
}

function isSynthesisHeading(heading: string): boolean {
  return /\b(synthesis|overview|executive\s+summary|introduction|background|context\s+summary)\b/i.test(
    heading,
  );
}

function isBreakdownHeading(heading: string): boolean {
  return /(?:detailed\s+.{0,48}\bevent(?:s|\s+breakdown)|\bevent\s+breakdown\b|\bevent\s+cards?\b|^event\s*#?\s*\d+\b)/i.test(
    heading,
  );
}

function isCautionOrClosingHeading(heading: string): boolean {
  return (
    isCautionSectionHeading(heading) ||
    /\b(conclusion|final\s+notes|read[\s_-]*out)\b/i.test(heading)
  );
}

function isTimelineMatrixHeading(heading: string): boolean {
  return /\b(timeline|rating\s*matrix|matrix|schedule|event\s*table|milestone\s*table)\b/i.test(
    heading,
  );
}

export function extractReportTimelineTablesFromMarkdown(
  rawContent: string,
  fallbackDomain?: PromptDomain,
  fallbackEvents?: EventCardItem[],
): ReportMatrixTable[] {
  const { cleanMarkdown, events } = parseResponseEventsAndReport(rawContent, fallbackDomain);
  const lines = cleanMarkdown.split(/\r?\n/);

  interface TableCandidate {
    heading: string;
    sectionIndex: number;
    headers: string[];
    rows: string[][];
  }

  const candidates: TableCandidate[] = [];
  let currentHeading = '';
  let sectionIndex = 0;
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const nextHeading = cleanLineKeepText(headingMatch[2]);
      if (!/^event\s+\d+\b/i.test(nextHeading)) {
        sectionIndex += 1;
      }
      currentHeading = nextHeading;
      continue;
    }

    if (
      /^\s*\|.*\|\s*$/.test(line) &&
      i + 1 < lines.length &&
      isMarkdownTableSeparatorLine(lines[i + 1])
    ) {
      const headers = parseMarkdownTableCells(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        const parsedRow = parseMarkdownTableCells(lines[j]);
        if (parsedRow.some((cell) => cell.length > 0)) {
          const normalizedRow =
            parsedRow.length < headers.length
              ? [...parsedRow, ...Array(headers.length - parsedRow.length).fill('')]
              : parsedRow.slice(0, headers.length);
          rows.push(normalizedRow);
        }
        j += 1;
      }
      if (headers.some((h) => h.length > 0) && rows.length > 0) {
        candidates.push({
          heading: currentHeading,
          sectionIndex,
          headers,
          rows,
        });
      }
      i = j - 1;
    }
  }

  const nonExcluded = candidates.filter(
    (c) =>
      !isSynthesisHeading(c.heading) &&
      !isBreakdownHeading(c.heading) &&
      !isCautionOrClosingHeading(c.heading),
  );

  const matrixMatches = nonExcluded.filter((c) => isTimelineMatrixHeading(c.heading));
  const chosen = matrixMatches.length > 0 ? matrixMatches : nonExcluded;

  if (chosen.length > 0) {
    return chosen.map((c) => ({
      title: c.heading || 'Event Timeline & Rating Matrix',
      headers: c.headers,
      rows: c.rows,
    }));
  }

  const effectiveEvents = events.length > 0 ? events : fallbackEvents || [];
  if (effectiveEvents.length > 0) {
    return [
      {
        title: 'Event Timeline & Rating Matrix',
        headers: ['Event', 'When', 'Probability Rating', 'Details'],
        rows: effectiveEvents.map((evt) => [
          evt.title,
          evt.when || evt.dateRange || evt.timeframe || '—',
          evt.probability || evt.likelihood || '—',
          evt.how || evt.summary || '—',
        ]),
      },
    ];
  }

  return [];
}

export function extractReportTimelineTablesFromHtml(html: string): ReportMatrixTable[] {
  if (!html.trim() || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) return [];

  const getPrecedingHeading = (tableEl: Element): string => {
    let cursor: Element | null = tableEl;
    while (cursor) {
      let prev = cursor.previousElementSibling;
      while (prev) {
        if (/^H[1-6]$/i.test(prev.tagName)) {
          return cleanLineKeepText(prev.textContent || '');
        }
        const innerHeadings = prev.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (innerHeadings.length > 0) {
          return cleanLineKeepText(
            innerHeadings[innerHeadings.length - 1].textContent || '',
          );
        }
        prev = prev.previousElementSibling;
      }
      cursor = cursor.parentElement;
    }
    return '';
  };

  const candidates: Array<{ heading: string; headers: string[]; rows: string[][] }> = [];

  for (const table of tables) {
    const allRows = Array.from(table.querySelectorAll('tr'));
    if (allRows.length < 2) continue;

    const theadRows = Array.from(table.querySelectorAll('thead tr'));
    const headerTr = theadRows[0] ?? allRows[0];
    const headers = Array.from(headerTr.querySelectorAll('th, td')).map((cell) =>
      cleanLineKeepText(cell.textContent || ''),
    );
    const bodyTrs = theadRows.length > 0 ? Array.from(table.querySelectorAll('tbody tr')) : allRows.slice(1);
    const rows = bodyTrs
      .map((tr) =>
        Array.from(tr.querySelectorAll('td, th')).map((cell) =>
          cleanLineKeepText(cell.textContent || ''),
        ),
      )
      .filter((r) => r.some((cell) => cell.length > 0))
      .map((r) =>
        r.length < headers.length
          ? [...r, ...Array(headers.length - r.length).fill('')]
          : r.slice(0, headers.length),
      );

    if (headers.some((h) => h.length > 0) && rows.length > 0) {
      candidates.push({
        heading: getPrecedingHeading(table),
        headers,
        rows,
      });
    }
  }

  const nonExcluded = candidates.filter(
    (c) =>
      !isSynthesisHeading(c.heading) &&
      !isBreakdownHeading(c.heading) &&
      !isCautionOrClosingHeading(c.heading),
  );
  const matrixMatches = nonExcluded.filter((c) => isTimelineMatrixHeading(c.heading));
  const chosen =
    matrixMatches.length > 0
      ? matrixMatches
      : nonExcluded.length > 0
        ? nonExcluded
        : candidates;

  return chosen.map((c) => ({
    title: c.heading || 'Event Timeline & Rating Matrix',
    headers: c.headers,
    rows: c.rows,
  }));
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
                      : turn.adapterId === 'chatgpt'
                        ? 'ChatGPT'
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
