import type {
  PromptBuilderSettings,
  PromptDomain,
  PromptStyle,
  PromptTemplates,
  ThreadRating,
} from '../types/workbench';

export const PROMPT_DOMAINS: PromptDomain[] = [
  'astrology',
  'health',
  'finance',
  'general',
];

export const PROMPT_DOMAIN_SHORT_LABELS: Record<PromptDomain, string> = {
  astrology: 'Career',
  health: 'Health',
  finance: 'Family',
  general: 'Love',
};

export const PROMPT_STYLES: PromptStyle[] = ['formal', 'classic'];

export const THREAD_MONTHS: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const THREAD_YEAR_START = 1993;
export const THREAD_YEAR_END = 2090;
export const THREAD_YEARS: readonly number[] = Array.from(
  { length: THREAD_YEAR_END - THREAD_YEAR_START + 1 },
  (_, index) => THREAD_YEAR_START + index,
);

export const THREAD_RATING_OPTIONS: ReadonlyArray<{
  id: ThreadRating;
  label: string;
  description: string;
}> = [
  { id: 'green', label: 'Green', description: 'Very good period' },
  { id: 'yellow', label: 'Yellow', description: 'Here and there' },
  { id: 'red', label: 'Red', description: 'Period of difficulties' },
];

export function getPromptDomainShortLabel(domain?: PromptDomain): string {
  if (!domain) return 'General';
  return PROMPT_DOMAIN_SHORT_LABELS[domain] ?? 'General';
}

export function formatThreadDisplayTitle({
  domain,
  month,
  year,
  fallbackNumber,
}: {
  domain?: PromptDomain;
  month?: string;
  year?: number;
  fallbackNumber: number;
}): string {
  const domainLabel = domain ? getPromptDomainShortLabel(domain) : '';
  const hasMonth = Boolean(month && month.trim());
  const hasYear = typeof year === 'number' && Number.isFinite(year);

  if (domainLabel && hasMonth && hasYear) {
    return `${domainLabel} of ${month!.trim()} ${year}`;
  }
  if (hasMonth && hasYear) {
    return `${month!.trim()} ${year}`;
  }
  if (domainLabel) {
    return `${domainLabel} · Thread #${fallbackNumber}`;
  }
  return `Thread #${fallbackNumber}`;
}

export function estimateTokens(text?: string | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplates = {
  astrology: {
    formal:
      'Respond in clear, neutral, professional language. Address the request directly, organize the answer where useful, and distinguish astrological interpretation from established facts. State assumptions and uncertainty clearly.\n\nRequest:\n{{prompt}}',
    classic:
      'Consider the astrological context provided in the request. Give a thoughtful, well-organized interpretation with useful headings and a practical timeline. Include specific dates or date ranges in YYYY-MM-DD format when the available context supports them; do not invent missing birth details or dates. Clearly distinguish interpretation, assumptions, and facts.\n\nAstrological request:\n{{prompt}}',
  },
  health: {
    formal:
      'Respond in clear, neutral, professional language. Provide general information, explain uncertainty, and do not diagnose or replace advice from a qualified health professional.\n\nRequest:\n{{prompt}}',
    classic:
      'Review the health-related context carefully. Organize general information into relevant points and practical next steps. Identify important unknowns, avoid making a diagnosis, and recommend a qualified health professional when appropriate.\n\nHealth request:\n{{prompt}}',
  },
  finance: {
    formal:
      'Respond in clear, neutral, professional language. Explain assumptions and risks, and do not present general information as personalized financial advice.\n\nRequest:\n{{prompt}}',
    classic:
      'Analyze the financial context and organize the response into key considerations, assumptions, risks, and possible next steps. Use specific amounts and dates only when supplied or supportable, and clearly identify uncertainty.\n\nFinancial request:\n{{prompt}}',
  },
  general: {
    formal:
      'Respond clearly and professionally. Address the request directly, organize details where useful, and identify any important assumptions.\n\nRequest:\n{{prompt}}',
    classic:
      'Use the context in the request to prepare a thoughtful, well-structured response. Use useful headings, specific details, and an actionable sequence where appropriate. Identify assumptions and unknowns.\n\nRequest:\n{{prompt}}',
  },
};

export const DEFAULT_PROMPT_BUILDER_SETTINGS: PromptBuilderSettings = {
  activeDomain: 'astrology',
  activeStyle: 'formal',
  templates: DEFAULT_PROMPT_TEMPLATES,
};

export function normalizePromptBuilderSettings(
  raw: unknown,
  fallback: PromptBuilderSettings = DEFAULT_PROMPT_BUILDER_SETTINGS,
): PromptBuilderSettings {
  const parsed =
    raw && typeof raw === 'object'
      ? (raw as Partial<PromptBuilderSettings>)
      : {};
  const rawTemplates =
    parsed.templates && typeof parsed.templates === 'object'
      ? (parsed.templates as Partial<Record<PromptDomain, Partial<Record<PromptStyle, unknown>>>>)
      : {};

  const templates = Object.fromEntries(
    PROMPT_DOMAINS.map((domain) => [
      domain,
      Object.fromEntries(
        PROMPT_STYLES.map((style) => [
          style,
          typeof rawTemplates[domain]?.[style] === 'string'
            ? rawTemplates[domain][style]
            : fallback.templates[domain][style],
        ]),
      ),
    ]),
  ) as PromptTemplates;

  return {
    activeDomain: PROMPT_DOMAINS.includes(parsed.activeDomain as PromptDomain)
      ? (parsed.activeDomain as PromptDomain)
      : fallback.activeDomain,
    activeStyle: PROMPT_STYLES.includes(parsed.activeStyle as PromptStyle)
      ? (parsed.activeStyle as PromptStyle)
      : fallback.activeStyle,
    templates,
  };
}
