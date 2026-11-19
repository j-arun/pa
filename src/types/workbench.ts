export type ConversationScope = 'private' | 'public';
export type PromptDomain = 'astrology' | 'health' | 'finance' | 'general';
export type PromptStyle = 'formal' | 'classic';

export type ThreadRating = 'green' | 'yellow' | 'red';

export type PromptTemplates = Record<PromptDomain, Record<PromptStyle, string>>;

export interface PromptBuilderSettings {
  activeDomain: PromptDomain;
  activeStyle: PromptStyle;
  templates: PromptTemplates;
}

export type PrivateAdapterId = 'ollama';
export type PublicAdapterId = 'gemini' | 'claude' | 'fable';
export type AnyAdapterId = PrivateAdapterId | PublicAdapterId;

export type GeminiThinkingPreset = 'LOW' | 'MEDIUM' | 'HIGH';

export type EventCardIconType =
  | 'layers'
  | 'calendar'
  | 'compass'
  | 'sparkles'
  | 'briefcase'
  | 'heart'
  | 'shield';

export interface EventCardItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  dateRange?: string;
  likelihood?: string;
  timeframe?: string;
  when?: string;
  probability?: string;
  how?: string;
  icon: EventCardIconType;
}

export interface CarefulDateItem {
  id: string;
  domain: string;
  date: string;
  note: string;
  severity?: 'high' | 'caution' | 'watch';
}

export interface ConversationTurn {
  id: string;
  exchangeId?: string;
  responseScopes?: ConversationScope[];
  promptDomain?: PromptDomain;
  promptStyle?: PromptStyle;
  threadName?: string;
  threadMonth?: string;
  threadYear?: number;
  threadRating?: ThreadRating;
  threadComment?: string;
  isFinalized?: boolean;
  systemInstruction?: string;
  cachedContext?: string;
  privateSystemInstruction?: string;
  publicSystemInstruction?: string;
  privateCachedContext?: string;
  publicCachedContext?: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  eventCards?: EventCardItem[];
  carefulDates?: CarefulDateItem[];
  htmlReport?: string;
  timestamp: string;
  inputMode?: 'text' | 'voice';
  scope: ConversationScope;
  adapterId: AnyAdapterId;
  model: string;
  durationMs?: number;
  tokenCount?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  tokensPerSecond?: number;
  adapterProtocol?: string;
}

export interface RatedThreadRecord {
  id: string;
  turns: ConversationTurn[];
  ratedAt: string;
  fileName?: string;
  filePath?: string;
  relativePath?: string;
  isExternalFile?: boolean;
  isFinalized?: boolean;
  comment?: string;
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
  maxHistoryTurns: number;
}

export interface ContextCacheConfig {
  privateText: string;
  publicText: string;
  activeMonth?: number;
  activeYear?: number;
  lastSyncedAt?: string;
}

export interface ReferenceContextApiConfig {
  hostname: string;
  port: number;
  path: string;
  queryTemplate: string;
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

export type FontOption = 'segoe' | 'calibri' | 'georgia' | 'cascadia';

export interface UserProfileConfig {
  displayName: string;
  avatarDataUrl: string;
}

export interface NotificationConfig {
  soundOnReply: boolean;
  desktopNotificationOnReply: boolean;
}

export interface WorkbenchSettings {
  theme: ThemeMode;
  fontFamily: FontOption;
  reportsDir?: string;
  profile: UserProfileConfig;
  privateLlm: PrivateLlmConfig;
  contextCache: ContextCacheConfig;
  referenceContextApi: ReferenceContextApiConfig;
  publicLlm: PublicLlmConfig;
  voice: VoiceConfig;
  notifications: NotificationConfig;
  promptBuilder: PromptBuilderSettings;
  requestTimeoutSeconds: number;
}

export interface LlmContextLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'error';
  message: string;
}

export interface LlmContextTelemetry {
  phase: 'Idle' | 'Thinking' | 'Ready' | 'Error';
  isThinking: boolean;
  startedAtMs?: number;
  promptChars: number;
  historyTurnsUsed: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  tokensPerSecond?: number;
  durationMs?: number;
  lastError: string;
}
