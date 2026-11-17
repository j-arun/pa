import type {
  AdapterHealthResult,
  AdapterWireSummary,
  AnyAdapterId,
  ConversationScope,
  GeminiThinkingPreset,
  OllamaModelInfo,
} from '../../src/types/workbench.ts';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface AdapterRuntimeOptions {
  model?: string;
  systemInstruction?: string;
  ollamaBaseUrl?: string;
  endpointUrl?: string;
  thinkingLevel?: GeminiThinkingPreset;
  contextWindow?: number;
  keepAlive?: string;
  maxTokens?: number;
}

export interface AdapterChatRequest {
  message: string;
  history: ChatHistoryItem[];
  options: AdapterRuntimeOptions;
}

export interface AdapterChatResponse {
  text: string;
  adapterId: AnyAdapterId;
  scope: ConversationScope;
  model: string;
  protocol: string;
  durationMs: number;
  tokenCount?: number;
}

export interface ILlmAdapter {
  readonly id: AnyAdapterId;
  readonly scope: ConversationScope;
  readonly displayName: string;
  readonly protocol: string;
  getSummary(): AdapterWireSummary;
  healthCheck(options?: AdapterRuntimeOptions): Promise<AdapterHealthResult>;
  sendMessage(request: AdapterChatRequest): Promise<AdapterChatResponse>;
  listModels?(options?: AdapterRuntimeOptions): Promise<OllamaModelInfo[]>;
}
