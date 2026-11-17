import fs from 'fs';
import os from 'os';
import path from 'path';
import type { WorkbenchSettings } from '../src/types/workbench.ts';

export const DEFAULT_WORKBENCH_CONFIG: WorkbenchSettings = {
  theme: 'light',
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
  return {
    theme: parsed.theme === 'dark' ? 'dark' : 'light',
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
