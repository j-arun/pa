import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WorkbenchSettings } from '../src/types/workbench.ts';

function detectOsUserName(): string {
  try {
    const name = os.userInfo().username;
    return name || process.env.USERNAME || process.env.USER || 'Local User';
  } catch {
    return process.env.USERNAME || process.env.USER || 'Local User';
  }
}

export function detectWindowsAccountProfile(): {
  displayName: string;
  avatarDataUrl: string;
  source: string;
} {
  const displayName = detectOsUserName();
  let avatarDataUrl = '';
  let source = 'os-username';

  if (process.platform === 'win32') {
    const candidateDirs = [
      process.env.APPDATA
        ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'AccountPictures')
        : '',
      process.env.PROGRAMDATA
        ? path.join(process.env.PROGRAMDATA, 'Microsoft', 'User Account Pictures')
        : '',
      'C:\\Users\\Public\\AccountPictures',
    ].filter(Boolean);

    for (const dir of candidateDirs) {
      try {
        if (!fs.existsSync(dir)) continue;
        const found: string[] = [];
        const walk = (current: string) => {
          for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
              walk(full);
            } else if (
              /\.(png|jpe?g)$/i.test(entry.name) &&
              entry.name.toLowerCase() !== 'guest.png'
            ) {
              found.push(full);
            }
          }
        };
        walk(dir);

        if (found.length > 0) {
          found.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
          const best = found[0];
          const bytes = fs.readFileSync(best);
          if (bytes.length > 0 && bytes.length <= 512 * 1024) {
            const mime = /\.png$/i.test(best) ? 'image/png' : 'image/jpeg';
            avatarDataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
            source = best;
            break;
          }
        }
      } catch {
        // Ignore directory permission errors
      }
    }
  }

  return { displayName, avatarDataUrl, source };
}

function normalizeServerTheme(raw?: string): WorkbenchSettings['theme'] {
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

function normalizeServerFont(raw?: string): WorkbenchSettings['fontFamily'] {
  if (raw === 'calibri' || raw === 'georgia' || raw === 'cascadia') {
    return raw;
  }
  return 'segoe';
}

const initialProfile = detectWindowsAccountProfile();

export const DEFAULT_WORKBENCH_CONFIG: WorkbenchSettings = {
  theme: 'arctic-sky',
  fontFamily: 'segoe',
  profile: {
    displayName: initialProfile.displayName,
    avatarDataUrl: initialProfile.avatarDataUrl,
  },
  privateLlm: {
    activeAdapter: 'ollama',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
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
        endpointUrl:
          process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages',
        systemInstruction:
          'You are a helpful personal assistant responding through the Public Claude Adapter.',
      },
      fable: {
        model: 'fable-1-pro',
        maxTokens: 2048,
        endpointUrl:
          process.env.FABLE_API_URL || 'https://api.fable.ai/v1/chat/completions',
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

export function resolveConfigDir(): string {
  if (process.env.WORKBENCH_DATA_DIR?.trim()) {
    return path.resolve(process.env.WORKBENCH_DATA_DIR.trim());
  }
  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'FluentAssistantWorkbench');
  }
  return path.join(process.cwd(), '.workbench-local');
}

export function resolveConfigFilePath(): string {
  return path.join(resolveConfigDir(), 'workbench.config.json');
}

export function mergeConfigWithDefaults(
  raw: Partial<WorkbenchSettings> | null | undefined,
): WorkbenchSettings {
  const parsed = raw || {};
  const theme = normalizeServerTheme(parsed.theme);
  const fontFamily = normalizeServerFont(parsed.fontFamily);

  return {
    theme,
    fontFamily,
    profile: {
      ...DEFAULT_WORKBENCH_CONFIG.profile,
      ...(parsed.profile || {}),
      displayName: parsed.profile?.displayName?.trim() || DEFAULT_WORKBENCH_CONFIG.profile.displayName,
      avatarDataUrl: parsed.profile?.avatarDataUrl || DEFAULT_WORKBENCH_CONFIG.profile.avatarDataUrl,
    },
    privateLlm: {
      ...DEFAULT_WORKBENCH_CONFIG.privateLlm,
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
          ...DEFAULT_WORKBENCH_CONFIG.publicLlm.adapters.gemini,
          ...(parsed.publicLlm?.adapters?.gemini || {}),
        },
        claude: {
          ...DEFAULT_WORKBENCH_CONFIG.publicLlm.adapters.claude,
          ...(parsed.publicLlm?.adapters?.claude || {}),
        },
        fable: {
          ...DEFAULT_WORKBENCH_CONFIG.publicLlm.adapters.fable,
          ...(parsed.publicLlm?.adapters?.fable || {}),
        },
      },
    },
    voice: {
      ...DEFAULT_WORKBENCH_CONFIG.voice,
      ...(parsed.voice || {}),
    },
  };
}

export function readLocalConfigFile(): {
  config: WorkbenchSettings;
  filePath: string;
  platform: string;
} {
  const filePath = resolveConfigFilePath();
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(DEFAULT_WORKBENCH_CONFIG, null, 2),
      'utf-8',
    );
    return {
      config: DEFAULT_WORKBENCH_CONFIG,
      filePath,
      platform: process.platform,
    };
  }

  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(text) as Partial<WorkbenchSettings>;
    return {
      config: mergeConfigWithDefaults(parsed),
      filePath,
      platform: process.platform,
    };
  } catch {
    return {
      config: DEFAULT_WORKBENCH_CONFIG,
      filePath,
      platform: process.platform,
    };
  }
}

export function writeLocalConfigFile(next: Partial<WorkbenchSettings>): {
  config: WorkbenchSettings;
  filePath: string;
  savedAt: string;
} {
  const filePath = resolveConfigFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const merged = mergeConfigWithDefaults(next);
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  return {
    config: merged,
    filePath,
    savedAt: new Date().toISOString(),
  };
}
