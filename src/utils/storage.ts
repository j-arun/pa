import type {
  ConversationTurn,
  PromptBuilderSettings,
  PromptDomain,
  PromptStyle,
  PromptTemplates,
  RatedThreadRecord,
  WorkbenchSettings,
} from '../types/workbench';
import {
  DEFAULT_PROMPT_BUILDER_SETTINGS,
  DEFAULT_PROMPT_TEMPLATES,
  PROMPT_DOMAINS,
  PROMPT_STYLES,
  normalizePromptBuilderSettings,
} from './promptTemplates';

const SETTINGS_KEY = 'fluent_paw_settings_v1';
const CONVERSATION_KEY = 'fluent_paw_conversation_v1';
const RATED_THREADS_KEY = 'fluent_paw_rated_threads_v1';
const SCOPE_KEY = 'fluent_paw_scope_v1';
function isPromptDomain(raw: unknown): raw is PromptDomain {
  return typeof raw === 'string' && PROMPT_DOMAINS.includes(raw as PromptDomain);
}

function isPromptStyle(raw: unknown): raw is PromptStyle {
  return typeof raw === 'string' && PROMPT_STYLES.includes(raw as PromptStyle);
}

export function loadPromptTemplates(): PromptTemplates {
  try {
    const PROMPT_TEMPLATES_KEY = 'fluent_paw_prompt_templates_v1';
    const raw = window.localStorage.getItem(PROMPT_TEMPLATES_KEY);
    if (!raw) return DEFAULT_PROMPT_TEMPLATES;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PROMPT_TEMPLATES;
    const saved = parsed as Partial<Record<PromptDomain, Partial<Record<PromptStyle, unknown>>>>;

    return Object.fromEntries(
      PROMPT_DOMAINS.map((domain) => [
        domain,
        Object.fromEntries(
          PROMPT_STYLES.map((style) => [
            style,
            typeof saved[domain]?.[style] === 'string'
              ? saved[domain][style]
              : DEFAULT_PROMPT_TEMPLATES[domain][style],
          ]),
        ),
      ]),
    ) as PromptTemplates;
  } catch {
    return DEFAULT_PROMPT_TEMPLATES;
  }
}

export function savePromptTemplates(templates: PromptTemplates): void {
  try {
    const PROMPT_TEMPLATES_KEY = 'fluent_paw_prompt_templates_v1';
    window.localStorage.setItem(PROMPT_TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadPromptDomain(): PromptDomain {
  try {
    const PROMPT_DOMAIN_KEY = 'fluent_paw_prompt_domain_v1';
    const raw = window.localStorage.getItem(PROMPT_DOMAIN_KEY);
    return isPromptDomain(raw) ? raw : 'astrology';
  } catch {
    return 'astrology';
  }
}

export function savePromptDomain(domain: PromptDomain): void {
  try {
    const PROMPT_DOMAIN_KEY = 'fluent_paw_prompt_domain_v1';
    window.localStorage.setItem(PROMPT_DOMAIN_KEY, domain);
  } catch {
    // Ignore storage quota errors
  }
}

export function loadPromptStyle(): PromptStyle {
  try {
    const PROMPT_STYLE_KEY = 'fluent_paw_prompt_style_v1';
    const raw = window.localStorage.getItem(PROMPT_STYLE_KEY);
    return isPromptStyle(raw) ? raw : 'formal';
  } catch {
    return 'formal';
  }
}

export function savePromptStyle(style: PromptStyle): void {
  try {
    const PROMPT_STYLE_KEY = 'fluent_paw_prompt_style_v1';
    window.localStorage.setItem(PROMPT_STYLE_KEY, style);
  } catch {
    // Ignore storage quota errors
  }
}

function loadLegacyPromptBuilderSettings(): PromptBuilderSettings {
  return normalizePromptBuilderSettings(
    undefined,
    {
      ...DEFAULT_PROMPT_BUILDER_SETTINGS,
      activeDomain: loadPromptDomain(),
      activeStyle: loadPromptStyle(),
      templates: loadPromptTemplates(),
    },
  );
}

export const DEFAULT_SETTINGS: WorkbenchSettings = {
  theme: 'arctic-sky',
  fontFamily: 'segoe',
  profile: {
    displayName: 'Local User',
    avatarDataUrl: '',
  },
  privateLlm: {
    activeAdapter: 'ollama',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    selectedModel: '',
    systemInstruction:
      'You are a private, local Windows personal assistant running on Ollama. Be concise, accurate, and practical.',
    contextWindow: 8192,
    keepAlive: '10m',
    maxHistoryTurns: 16,
  },
  contextCache: {
    privateText: '',
    publicText: '',
  },
  publicLlm: {
    activeAdapter: 'gemini',
    adapters: {
      gemini: {
        model: 'gemini-4-hydrogen',
        thinkingLevel: 'HIGH',
        systemInstruction:
          'You are a helpful, articulate personal assistant responding through the Public Gemini Adapter. Keep answers clear and well-structured.',
      },
      claude: {
        model: 'claude-sonnet-4-20250514',
        maxTokens: 2048,
        endpointUrl: 'https://api.anthropic.com/v1/messages',
        systemInstruction:
          'You are a helpful personal assistant responding through the Public Claude Adapter.',
      },
      fable: {
        model: 'claude-fable-5-1',
        maxTokens: 2048,
        endpointUrl: 'https://api.anthropic.com/v1/messages',
        systemInstruction:
          'You are a helpful personal assistant responding through the Public Fable Adapter.',
      },
    },
  },
  voice: {
    autoSpeakPublic: false,
    autoSpeakPrivate: false,
    selectedVoiceURI: '',
    rate: 1.0,
    pitch: 1.0,
  },
  notifications: {
    soundOnReply: true,
    desktopNotificationOnReply: true,
  },
  promptBuilder: DEFAULT_PROMPT_BUILDER_SETTINGS,
  requestTimeoutSeconds: 0,
};

export function normalizeThemeMode(raw?: string): WorkbenchSettings['theme'] {
  if (raw === 'light') return 'arctic-sky';
  if (raw === 'dark') return 'midnight-slate';
  if (
    raw === 'arctic-sky' ||
    raw === 'midnight-slate' ||
    raw === 'emerald-mist' ||
    raw === 'royal-amethyst' ||
    raw === 'system'
  ) {
    return raw;
  }
  return 'system';
}

export function normalizeFontOption(raw?: string): WorkbenchSettings['fontFamily'] {
  if (raw === 'calibri' || raw === 'georgia' || raw === 'cascadia') {
    return raw;
  }
  return 'segoe';
}

export function loadSettings(): WorkbenchSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        ...DEFAULT_SETTINGS,
        promptBuilder: loadLegacyPromptBuilderSettings(),
      };
    }
    const parsed = JSON.parse(raw) as Partial<WorkbenchSettings>;

    const theme = normalizeThemeMode(parsed.theme);
    const fontFamily = normalizeFontOption(parsed.fontFamily);

    return {
      theme,
      fontFamily,
      profile: {
        ...DEFAULT_SETTINGS.profile,
        ...(parsed.profile || {}),
      },
      privateLlm: {
        ...DEFAULT_SETTINGS.privateLlm,
        ...(parsed.privateLlm || {}),
      },
      contextCache: {
        privateText:
          typeof parsed.contextCache?.privateText === 'string'
            ? parsed.contextCache.privateText
            : DEFAULT_SETTINGS.contextCache.privateText,
        publicText:
          typeof parsed.contextCache?.publicText === 'string'
            ? parsed.contextCache.publicText
            : DEFAULT_SETTINGS.contextCache.publicText,
      },
      publicLlm: {
        activeAdapter:
          parsed.publicLlm?.activeAdapter === 'claude' ||
          parsed.publicLlm?.activeAdapter === 'fable'
            ? parsed.publicLlm.activeAdapter
            : 'gemini',
        adapters: {
          gemini: {
            ...DEFAULT_SETTINGS.publicLlm.adapters.gemini,
            ...(parsed.publicLlm?.adapters?.gemini || {}),
          },
          claude: {
            ...DEFAULT_SETTINGS.publicLlm.adapters.claude,
            ...(parsed.publicLlm?.adapters?.claude || {}),
          },
          fable: (() => {
            const mergedFable = {
              ...DEFAULT_SETTINGS.publicLlm.adapters.fable,
              ...(parsed.publicLlm?.adapters?.fable || {}),
            };
            const normalizedEndpoint = (mergedFable.endpointUrl || '')
              .trim()
              .replace(/\/+$/, '')
              .toLowerCase();
            return {
              ...mergedFable,
              model:
                !mergedFable.model || mergedFable.model === 'fable-1-pro'
                  ? 'claude-fable-5-1'
                  : mergedFable.model,
              endpointUrl:
                !normalizedEndpoint ||
                normalizedEndpoint === 'https://api.fable.ai/v1/chat/completions'
                  ? 'https://api.anthropic.com/v1/messages'
                  : mergedFable.endpointUrl,
            };
          })(),
        },
      },
      voice: {
        ...DEFAULT_SETTINGS.voice,
        ...(parsed.voice || {}),
      },
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...(parsed.notifications || {}),
      },
      promptBuilder: normalizePromptBuilderSettings(
        parsed.promptBuilder,
        loadLegacyPromptBuilderSettings(),
      ),
      requestTimeoutSeconds:
        typeof parsed.requestTimeoutSeconds === 'number' && parsed.requestTimeoutSeconds >= 0
          ? Math.round(parsed.requestTimeoutSeconds)
          : 0,
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      promptBuilder: loadLegacyPromptBuilderSettings(),
    };
  }
}

export async function resizeAvatarToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function saveSettings(settings: WorkbenchSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota errors
  }
}

export function loadConversation(): ConversationTurn[] {
  try {
    const raw = window.localStorage.getItem(CONVERSATION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ConversationTurn[]) : [];
  } catch {
    return [];
  }
}

export function saveConversation(turns: ConversationTurn[]): void {
  try {
    window.localStorage.setItem(CONVERSATION_KEY, JSON.stringify(turns));
  } catch {
    // Ignore quota errors
  }
}

export function loadScope(): 'private' | 'public' {
  try {
    const raw = window.localStorage.getItem(SCOPE_KEY);
    return raw === 'private' ? 'private' : 'public';
  } catch {
    return 'public';
  }
}

export function saveScope(scope: 'private' | 'public'): void {
  try {
    window.localStorage.setItem(SCOPE_KEY, scope);
  } catch {
    // Ignore quota errors
  }
}

export function loadRatedThreads(): RatedThreadRecord[] {
  try {
    const raw = window.localStorage.getItem(RATED_THREADS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RatedThreadRecord =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as RatedThreadRecord).id === 'string' &&
        Array.isArray((item as RatedThreadRecord).turns),
    );
  } catch {
    return [];
  }
}

export function saveRatedThreads(records: RatedThreadRecord[]): void {
  try {
    window.localStorage.setItem(RATED_THREADS_KEY, JSON.stringify(records));
  } catch {
    // Ignore quota errors
  }
}
