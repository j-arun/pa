import type {
  ConversationTurn,
  EventCardIconType,
  EventCardItem,
  PromptDomain,
  ThreadRating,
} from '../types/workbench';
import { renderMarkdownToHtml } from './markdownExport';
import { getPromptDomainShortLabel, THREAD_RATING_OPTIONS } from './promptTemplates';

export const EVENT_EXTRACTION_SYSTEM_DIRECTIVE = [
  'Response formatting rule:',
  '1. Write your complete, thorough report in clean Markdown first.',
  '2. At the very end of your response, append a <pa_events>...</pa_events> tag containing a valid JSON array of 3 to 6 concise event cards summarizing the key events, transitions, or actionable highlights.',
  '3. Keep each event card free of raw astrological tables or heavy technical notation; phrase each summary in clear, everyday language.',
  '4. Schema for each JSON item: {"title":"Short event headline","summary":"2 concise sentences describing what happens or what to focus on.","category":"Short 1-2 word footer label like Planning, Career, Health, Family, Love, Finance, or Milestone","timeframe":"Optional date or period","icon":"layers|calendar|compass|sparkles|briefcase|heart|shield"}.',
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

function inferIconFromText(text: string, fallbackIndex: number): EventCardIconType {
  const lower = text.toLowerCase();
  if (/(date|month|year|schedule|plan|timeline|quarter|week|transition|period)/.test(lower)) {
    return 'calendar';
  }
  if (/(career|work|job|project|business|team|lead|promotion|role)/.test(lower)) {
    return 'briefcase';
  }
  if (/(health|wellness|energy|rest|vital|fitness|medical|sleep)/.test(lower)) {
    return 'shield';
  }
  if (/(love|relationship|family|partner|marriage|home|friend)/.test(lower)) {
    return 'heart';
  }
  if (/(money|finance|income|budget|invest|saving|expense)/.test(lower)) {
    return 'layers';
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

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > 48 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

function normalizeIcon(rawIcon: unknown, hintText: string, index: number): EventCardIconType {
  if (typeof rawIcon === 'string') {
    const cleaned = rawIcon.trim().toLowerCase() as EventCardIconType;
    if (VALID_ICONS.includes(cleaned)) return cleaned;
  }
  return inferIconFromText(hintText, index);
}

function extractFallbackEvents(
  cleanMarkdown: string,
  fallbackDomain?: PromptDomain,
): EventCardItem[] {
  const defaultCategory = getPromptDomainShortLabel(fallbackDomain);
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

  const cards: EventCardItem[] = [];

  for (const sec of sections) {
    const rawJoined = sec.body.join(' ');
    const summaryText = cleanPlainSummary(rawJoined);
    if (!summaryText && !sec.heading) continue;

    // If section contains bulleted items and no strong summary yet, promote top bullets
    const bullets = sec.body
      .filter((line) => /^\s*(?:[-*•]|\d+\.)\s+/.test(line))
      .map((line) => cleanPlainSummary(line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '')))
      .filter((text) => text.length >= 24);

    if (bullets.length >= 2 && cards.length < 4 && !sec.heading) {
      for (const bullet of bullets.slice(0, 4)) {
        const colonSplit = bullet.split(/:\s+/, 2);
        const hasPrefixTitle = colonSplit.length === 2 && colonSplit[0].length <= 42;
        const title = hasPrefixTitle ? colonSplit[0] : truncateText(bullet, 44);
        const body = hasPrefixTitle ? colonSplit[1] : bullet;
        const dateMatch = bullet.match(
          /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\b\d{4}-\d{2}(?:-\d{2})?\b/i,
        );
        cards.push({
          id: `evt-fb-${cards.length + 1}`,
          title,
          summary: truncateText(body, 170),
          category: sec.heading ? truncateText(sec.heading, 24) : defaultCategory,
          timeframe: dateMatch?.[0],
          icon: inferIconFromText(`${title} ${body}`, cards.length),
        });
      }
      continue;
    }

    const title = sec.heading || truncateText(summaryText, 46);
    const body = summaryText || sec.heading;
    const dateMatch = `${title} ${body}`.match(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\b\d{4}-\d{2}(?:-\d{2})?\b/i,
    );

    cards.push({
      id: `evt-fb-${cards.length + 1}`,
      title: truncateText(title, 54),
      summary: truncateText(body, 175),
      category: defaultCategory,
      timeframe: dateMatch?.[0],
      icon: inferIconFromText(`${title} ${body}`, cards.length),
    });

    if (cards.length >= 6) break;
  }

  // If everything landed in one paragraph, split into sentences
  if (cards.length <= 1) {
    const fullPlain = cleanPlainSummary(cleanMarkdown);
    const sentences = fullPlain
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20);
    if (sentences.length >= 2) {
      const grouped: EventCardItem[] = [];
      for (let i = 0; i < sentences.length && grouped.length < 6; i += 2) {
        const chunk = sentences.slice(i, i + 2).join(' ');
        const dateMatch = chunk.match(
          /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\b\d{4}-\d{2}(?:-\d{2})?\b/i,
        );
        grouped.push({
          id: `evt-sent-${grouped.length + 1}`,
          title: truncateText(sentences[i], 48),
          summary: truncateText(chunk, 175),
          category: defaultCategory,
          timeframe: dateMatch?.[0],
          icon: inferIconFromText(chunk, grouped.length),
        });
      }
      if (grouped.length > 0) return grouped;
    }
  }

  if (cards.length === 0 && cleanMarkdown.trim()) {
    return [
      {
        id: 'evt-1',
        title: `${defaultCategory} Overview`,
        summary: truncateText(cleanPlainSummary(cleanMarkdown), 175),
        category: defaultCategory,
        icon: 'sparkles',
      },
    ];
  }

  return cards.slice(0, 8);
}

export function parseResponseEventsAndReport(
  rawContent: string,
  fallbackDomain?: PromptDomain,
): { cleanMarkdown: string; events: EventCardItem[] } {
  const tagPattern = /<pa_events>([\s\S]*?)<\/pa_events>/i;
  const match = rawContent.match(tagPattern);
  const cleanMarkdown = rawContent
    .replace(/<pa_events>[\s\S]*?<\/pa_events>/gi, '')
    .trim();

  if (match && match[1]) {
    try {
      const jsonCandidate = match[1]
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
      const parsed: unknown = JSON.parse(jsonCandidate);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const events: EventCardItem[] = parsed
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item, idx) => {
            const title =
              typeof item.title === 'string' && item.title.trim()
                ? item.title.trim()
                : `Event ${idx + 1}`;
            const summary =
              typeof item.summary === 'string' && item.summary.trim()
                ? cleanPlainSummary(item.summary.trim())
                : title;
            const category =
              typeof item.category === 'string' && item.category.trim()
                ? item.category.trim()
                : getPromptDomainShortLabel(fallbackDomain);
            const timeframe =
              typeof item.timeframe === 'string' && item.timeframe.trim()
                ? item.timeframe.trim()
                : undefined;
            return {
              id: `evt-${idx + 1}`,
              title: truncateText(title, 60),
              summary: truncateText(summary, 185),
              category: truncateText(category, 28),
              timeframe: timeframe ? truncateText(timeframe, 28) : undefined,
              icon: normalizeIcon(item.icon, `${title} ${summary} ${category}`, idx),
            };
          })
          .slice(0, 8);

        if (events.length > 0) {
          return { cleanMarkdown: cleanMarkdown || rawContent.trim(), events };
        }
      }
    } catch {
      // Fall through to deterministic parser
    }
  }

  return {
    cleanMarkdown: cleanMarkdown || rawContent.trim(),
    events: extractFallbackEvents(cleanMarkdown || rawContent, fallbackDomain),
  };
}

export function deriveThreadTitleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Assistant Thread';
  const words = cleaned.split(' ').slice(0, 6);
  const joined = words.join(' ').replace(/[?!.,:;]+$/, '');
  return joined.length > 42 ? `${joined.slice(0, 39)}...` : joined;
}

export function buildThreadHtmlDocument({
  title,
  question,
  replies,
  domain,
  month,
  year,
  rating,
  createdAt,
}: {
  title: string;
  question: string;
  replies: ConversationTurn[];
  domain?: PromptDomain;
  month?: string;
  year?: number;
  rating?: ThreadRating;
  createdAt?: string;
}): string {
  const ratingMeta = rating
    ? THREAD_RATING_OPTIONS.find((item) => item.id === rating)
    : undefined;
  const metaParts = [
    domain ? `Domain: ${getPromptDomainShortLabel(domain)}` : '',
    month && year ? `Period: ${month} ${year}` : '',
    ratingMeta ? `Rating: ${ratingMeta.starGlyphs} (${ratingMeta.label})` : '',
    createdAt ? `Generated: ${new Date(createdAt).toLocaleString()}` : '',
  ].filter(Boolean);

  const answerSections = replies
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => {
      const provider =
        turn.scope === 'private'
          ? 'Private · Ollama'
          : `Public · ${turn.adapterId === 'claude' ? 'Claude' : turn.adapterId === 'fable' ? 'Fable' : 'Gemini'}`;
      const { cleanMarkdown } = parseResponseEventsAndReport(turn.content, domain);
      return `<section class="report-card">
        <div class="provider-line">${escapeHtml(`${provider} · ${turn.model}`)}</div>
        <div class="markdown-content">${renderMarkdownToHtml(cleanMarkdown)}</div>
      </section>`;
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
    .question-box {
      background: #f0f7ff;
      border: 1px solid #bae6fd;
      border-radius: 14px;
      padding: 1rem 1.25rem;
      margin-bottom: 1.75rem;
    }
    .question-label {
      font-size: 0.75rem;
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
    <section class="question-box">
      <div class="question-label">Question</div>
      <p class="question-text">${escapeHtml(question)}</p>
    </section>
    ${answerSections}
  </main>
</body>
</html>`;
}
