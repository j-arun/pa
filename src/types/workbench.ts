export type ConversationScope = 'private' | 'public';

export type PrivateAdapterId = 'ollama';
export type PublicAdapterId = 'gemini' | 'claude' | 'fable';
export type AnyAdapterId = PrivateAdapterId | PublicAdapterId;

export type GeminiThinkingPreset = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  timestamp: string;
  inputMode?: 'text' | 'voice';
  scope: ConversationScope;
  adapterId: AnyAdapterId;
  model: string;
  durationMs?: number;
  tokenCount?: number;
  adapterProtocol?: string;
}

export interface OllamaModelInfo {
  name: string;
  model: string;
  sizeBytes: number;
  sizeFormatted: string;
  modifiedAt: string;
  family?: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface AdapterWireSummary {
  id: AnyAdapterId;
  scope: ConversationScope;
  displayName: string;
  protocol: string;
  endpointLabel: string;
  defaultModel: string;
  availableModels: string[];
  description: string;
  requestEnvelopePreview: string;
  responseEnvelopePreview: string;
  configuredOnServer: boolean;
}

export interface AdapterHealthResult {
  adapterId: AnyAdapterId;
  scope: ConversationScope;
  reachable: boolean;
  configured: boolean;
  statusLabel: string;
  detail: string;
  latencyMs: number;
  checkedAt: string;
}

export interface PrivateLlmConfig {
  activeAdapter: PrivateAdapterId;
  ollamaBaseUrl: string;
  selectedModel: string;
  systemInstruction: string;
  contextWindow: number;
  keepAlive: string;
}

export interface PublicAdapterConfig {
  model: string;
  systemInstruction: string;
  thinkingLevel?: GeminiThinkingPreset;
  endpointUrl?: string;
  maxTokens?: number;
}

export interface PublicLlmConfig {
  activeAdapter: PublicAdapterId;
  adapters: Record<PublicAdapterId, PublicAdapterConfig>;
}

export interface VoiceConfig {
  autoSpeakPublic: boolean;
  autoSpeakPrivate: boolean;
  selectedVoiceURI: string;
  rate: number;
  pitch: number;
}

export type ThemeMode =
  | 'system'
  | 'arctic-sky'
  | 'midnight-slate'
  | 'emerald-mist'
  | 'royal-amethyst'
  | 'light'
  | 'dark';

export interface UserProfileConfig {
  displayName: string;
  avatarDataUrl: string;
}

export interface WorkbenchSettings {
  theme: ThemeMode;
  profile: UserProfileConfig;
  privateLlm: PrivateLlmConfig;
  publicLlm: PublicLlmConfig;
  voice: VoiceConfig;
}
