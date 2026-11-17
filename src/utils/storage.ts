import type { ConversationTurn, WorkbenchSettings } from '../types/workbench';

const SETTINGS_KEY = 'fluent_paw_settings_v1';
const CONVERSATION_KEY = 'fluent_paw_conversation_v1';
const SCOPE_KEY = 'fluent_paw_scope_v1';

export const DEFAULT_SETTINGS: WorkbenchSettings = {
  theme: 'light',
  privateLlm: {
    activeAdapter: 'ollama',
    ollamaBaseUrl: 'http://127.0.0.1:11434',
    selectedModel: '',
    systemInstruction:
      'You are a private, local Windows personal assistant running on Ollama. Be concise, accurate, and practical.',
    contextWindow: 8192,
    keepAlive: '10m',
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
        model: 'fable-1-pro',
        maxTokens: 2048,
        endpointUrl: 'https://api.fable.ai/v1/chat/completions',
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
};

export function loadSettings(): WorkbenchSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WorkbenchSettings>;

    return {
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      privateLlm: {
        ...DEFAULT_SETTINGS.privateLlm,
        ...(parsed.privateLlm || {}),
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
          fable: {
            ...DEFAULT_SETTINGS.publicLlm.adapters.fable,
            ...(parsed.publicLlm?.adapters?.fable || {}),
          },
        },
      },
      voice: {
        ...DEFAULT_SETTINGS.voice,
        ...(parsed.voice || {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
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
