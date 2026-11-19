import { postJsonConfigurable } from './httpClient.ts';
import {
  normalizeAnthropicEndpointUrl,
  resolveServerEnvSecret,
} from './envKeys.ts';
import type {
  AdapterHealthResult,
  AdapterWireSummary,
} from '../../src/types/workbench.ts';
import type {
  AdapterChatRequest,
  AdapterChatResponse,
  AdapterRuntimeOptions,
  ILlmAdapter,
} from './types.ts';

interface FableChatCompletionResponse {
  model?: string;
  content?: Array<{
    type?: string;
    text?: string;
    thinking?: string;
  }>;
  choices?: Array<{
    message?: {
      role?: string;
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

const FABLE_MODELS = [
  'claude-fable-5-1',
  'claude-fable-5-2',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-sonnet-4-20250514',
] as const;
const DEFAULT_ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const RETIRED_FABLE_ENDPOINT = 'https://api.fable.ai/v1/chat/completions';

function isPlaceholderApiKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized === 'my_anthropic_api_key' ||
    normalized === 'my_fable_api_key' ||
    normalized.includes('placeholder') ||
    normalized.includes('your_api_key')
  );
}

function normalizeAnthropicMessages(
  history: AdapterChatRequest['history'],
  userMessage: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const combined = [
    ...history
      .filter((turn) => typeof turn.content === 'string' && turn.content.trim().length > 0)
      .map((turn) => ({
        role: (turn.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: turn.content.trim(),
      })),
    { role: 'user' as const, content: userMessage.trim() },
  ];

  // Anthropic requires first message to be 'user' and roles to strictly alternate
  const normalized: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of combined) {
    if (!msg.content) continue;
    if (normalized.length === 0 && msg.role !== 'user') {
      continue;
    }
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = `${prev.content}\n\n${msg.content}`;
    } else {
      normalized.push({ role: msg.role, content: msg.content });
    }
  }
  return normalized;
}

export class FableAdapter implements ILlmAdapter {
  readonly id = 'fable' as const;
  readonly scope = 'public' as const;
  readonly displayName = 'Fable';
  readonly protocol = 'Anthropic Messages v1';

  private resolveApiKey(endpoint: string, options?: AdapterRuntimeOptions): string {
    const candidates = [
      options?.apiKey,
      ...(this.usesAnthropicMessagesApi(endpoint)
        ? [
            resolveServerEnvSecret(['ANTHROPIC_API_KEY']),
            resolveServerEnvSecret(['CLAUDE_API_KEY']),
            resolveServerEnvSecret(['FABLE_API_KEY']),
            resolveServerEnvSecret(['VITE_ANTHROPIC_API_KEY']),
            resolveServerEnvSecret(['VITE_CLAUDE_API_KEY']),
            resolveServerEnvSecret(['VITE_FABLE_API_KEY']),
          ]
        : [
            resolveServerEnvSecret(['FABLE_API_KEY']),
            resolveServerEnvSecret(['ANTHROPIC_API_KEY']),
            resolveServerEnvSecret(['CLAUDE_API_KEY']),
            resolveServerEnvSecret(['VITE_FABLE_API_KEY']),
            resolveServerEnvSecret(['VITE_ANTHROPIC_API_KEY']),
            resolveServerEnvSecret(['VITE_CLAUDE_API_KEY']),
          ]),
    ];

    for (const candidate of candidates) {
      const cleaned = (candidate || '').replace(/^Bearer\s+/i, '').trim();
      if (cleaned && !isPlaceholderApiKey(cleaned)) {
        return cleaned;
      }
    }
    return '';
  }

  private resolveEndpoint(options?: AdapterRuntimeOptions): string {
    const endpoint = (
      options?.endpointUrl?.trim() ||
      process.env.FABLE_API_URL?.trim() ||
      DEFAULT_ANTHROPIC_ENDPOINT
    ).trim();

    if (!endpoint) return DEFAULT_ANTHROPIC_ENDPOINT;

    if (endpoint.replace(/\/+$/, '').toLowerCase() === RETIRED_FABLE_ENDPOINT) {
      return DEFAULT_ANTHROPIC_ENDPOINT;
    }

    return normalizeAnthropicEndpointUrl(endpoint, DEFAULT_ANTHROPIC_ENDPOINT);
  }

  private usesAnthropicMessagesApi(endpoint: string): boolean {
    try {
      const url = new URL(endpoint);
      const cleanPath = url.pathname.replace(/\/+$/, '').toLowerCase();
      return (
        url.hostname.toLowerCase() === 'api.anthropic.com' ||
        cleanPath.endsWith('/v1/messages') ||
        cleanPath.endsWith('/messages')
      );
    } catch {
      return endpoint.toLowerCase().includes('api.anthropic.com');
    }
  }

  private resolveEffort(
    thinkingLevel?: AdapterRuntimeOptions['thinkingLevel'],
    isHealthPing = false,
  ): 'low' | 'medium' | 'high' {
    if (isHealthPing) return 'low';
    if (thinkingLevel === 'LOW') return 'low';
    if (thinkingLevel === 'MEDIUM') return 'medium';
    return 'high';
  }

  private buildRequest(
    endpoint: string,
    apiKey: string,
    model: string,
    maxTokens: number,
    history: AdapterChatRequest['history'],
    userMessage: string,
    systemInstruction?: string,
    thinkingLevel?: AdapterRuntimeOptions['thinkingLevel'],
    isHealthPing = false,
  ): { body: Record<string, unknown>; headers: Record<string, string>; isAnthropic: boolean } {
    const isAnthropic = this.usesAnthropicMessagesApi(endpoint);
    const messages = isAnthropic
      ? normalizeAnthropicMessages(history, userMessage)
      : [
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
          { role: 'user' as const, content: userMessage },
        ];
    const system = systemInstruction?.trim();
    const isFableModel = model.toLowerCase().includes('fable');
    const effectiveMaxTokens = isHealthPing
      ? Math.max(10, Math.min(maxTokens || 16, 64))
      : isAnthropic && isFableModel
        ? Math.max(maxTokens || 16000, 16000)
        : maxTokens || 8192;

    const body: Record<string, unknown> = {
      model,
      max_tokens: effectiveMaxTokens,
      messages: isAnthropic || !system
        ? messages
        : [{ role: 'system', content: system }, ...messages],
    };

    if (isAnthropic && system) {
      body.system = [
        {
          type: 'text',
          text: system,
          cache_control: { type: 'ephemeral' },
        },
      ];
    }

    if (isAnthropic && isFableModel) {
      body.thinking = { type: 'adaptive' };
      body.output_config = {
        effort: this.resolveEffort(thinkingLevel, isHealthPing),
      };
    }

    return {
      body,
      headers: isAnthropic
        ? {
            Accept: 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          }
        : {
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
      isAnthropic,
    };
  }

  private async postWithAnthropicRecovery(
    endpoint: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
    isAnthropic: boolean,
    timeoutSeconds: number,
  ): Promise<{ statusCode: number; bodyText: string; payload: FableChatCompletionResponse }> {
    let result = await postJsonConfigurable(endpoint, body, headers, timeoutSeconds);
    let payload = this.parseResponse(result.bodyText);

    if (
      isAnthropic &&
      (result.statusCode < 200 || result.statusCode >= 300) &&
      payload.error?.message
    ) {
      const errMsg = payload.error.message;
      const currentThinking = (body.thinking as { type?: string } | undefined)?.type;

      if (errMsg.includes('between_tools') && currentThinking !== 'between_tools') {
        const retryBody = { ...body, thinking: { type: 'between_tools' } };
        result = await postJsonConfigurable(endpoint, retryBody, headers, timeoutSeconds);
        payload = this.parseResponse(result.bodyText);
      } else if (errMsg.includes('"disabled"') && currentThinking !== 'disabled') {
        const retryBody = { ...body, thinking: { type: 'disabled' } };
        result = await postJsonConfigurable(endpoint, retryBody, headers, timeoutSeconds);
        payload = this.parseResponse(result.bodyText);
      } else if (
        (errMsg.includes('cache_control') || errMsg.includes('ephemeral')) &&
        Array.isArray(body.system)
      ) {
        const textSystem = body.system
          .map((item) =>
            item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string'
              ? (item as { text: string }).text
              : '',
          )
          .filter(Boolean)
          .join('\n\n');
        const retryBody = { ...body, system: textSystem || undefined };
        result = await postJsonConfigurable(endpoint, retryBody, headers, timeoutSeconds);
        payload = this.parseResponse(result.bodyText);
      }
    }

    return {
      statusCode: result.statusCode,
      bodyText: result.bodyText,
      payload,
    };
  }

  private parseResponse(bodyText: string): FableChatCompletionResponse {
    try {
      return JSON.parse(bodyText) as FableChatCompletionResponse;
    } catch {
      return {};
    }
  }

  private formatHttpError(
    statusCode: number,
    payload: FableChatCompletionResponse,
    bodyText: string,
  ): string {
    const apiMsg = payload.error?.message?.trim();
    if (apiMsg) {
      return `Fable HTTP ${statusCode}: ${apiMsg}`;
    }
    const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 220);
    return snippet
      ? `Fable returned HTTP ${statusCode}: ${snippet}`
      : `Fable returned HTTP ${statusCode}.`;
  }

  private getResponseText(payload: FableChatCompletionResponse, isAnthropic: boolean): string {
    if (isAnthropic || Array.isArray(payload.content)) {
      const blocks = payload.content || [];
      const text = blocks
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
        .trim();
      if (text) return text;

      const thinkingFallback = blocks
        .filter((block) => block.type === 'thinking')
        .map((block) => block.thinking || block.text || '')
        .join('\n')
        .trim();
      if (thinkingFallback) return thinkingFallback;
    }
    return payload.choices?.[0]?.message?.content?.trim() || '';
  }

  getSummary(): AdapterWireSummary {
    const configuredEndpoint = this.resolveEndpoint();
    const endpoint = configuredEndpoint || 'Not configured';
    const protocol = configuredEndpoint
      ? this.usesAnthropicMessagesApi(configuredEndpoint)
        ? 'Anthropic Messages v1'
        : 'OpenAI-compatible Chat Completions'
      : this.protocol;
    return {
      id: this.id,
      scope: this.scope,
      displayName: this.displayName,
      protocol,
      endpointLabel: endpoint,
      defaultModel: FABLE_MODELS[0],
      availableModels: [...FABLE_MODELS],
      description:
        'Routes Claude Fable 5.1 prompts through Anthropic Messages v1 with adaptive thinking, effort output config, and ephemeral system caching.',
      requestEnvelopePreview: JSON.stringify(
        {
          model: FABLE_MODELS[0],
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high' },
          system: [{ type: 'text', text: '<publicSystemInstruction>', cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: '<userPrompt>' }],
        },
        null,
        2,
      ),
      responseEnvelopePreview: JSON.stringify(
        {
          model: FABLE_MODELS[0],
          content: [{ type: 'text', text: '<assistantReply>' }],
          usage: { input_tokens: 140, output_tokens: 214 },
        },
        null,
        2,
      ),
      configuredOnServer: Boolean(
        configuredEndpoint && this.resolveApiKey(configuredEndpoint),
      ),
    };
  }

  async healthCheck(options?: AdapterRuntimeOptions): Promise<AdapterHealthResult> {
    const started = Date.now();
    const endpoint = this.resolveEndpoint(options);
    const apiKey = this.resolveApiKey(endpoint, options);

    if (!endpoint) {
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: false,
        configured: false,
        statusLabel: 'Endpoint URL Missing',
        detail: 'Configure a current provider endpoint URL in Settings or with FABLE_API_URL.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }

    if (!apiKey) {
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: false,
        configured: false,
        statusLabel: 'Server Env Unset',
        detail:
          'ANTHROPIC_API_KEY (or CLAUDE_API_KEY / FABLE_API_KEY) is unset or still a placeholder. Set a valid Anthropic sk-ant-... key in AI Studio Secrets or .env and restart.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const model = options?.model?.trim() || FABLE_MODELS[0];
      const request = this.buildRequest(
        endpoint,
        apiKey,
        model,
        16,
        [],
        'hi',
        undefined,
        options?.thinkingLevel,
        true,
      );
      const { statusCode, bodyText, payload } = await this.postWithAnthropicRecovery(
        endpoint,
        request.body,
        request.headers,
        request.isAnthropic,
        20,
      );
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(this.formatHttpError(statusCode, payload, bodyText));
      }
      if (!this.getResponseText(payload, request.isAnthropic)) {
        throw new Error('Fable returned an empty response payload.');
      }

      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: true,
        configured: true,
        statusLabel: 'Ready',
        detail: `Fable adapter verified (${payload.model || model}) at ${endpoint}.`,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: false,
        configured: true,
        statusLabel: 'Error',
        detail: err instanceof Error ? err.message : 'Fable health check failed.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async sendMessage(request: AdapterChatRequest): Promise<AdapterChatResponse> {
    const started = Date.now();
    const endpoint = this.resolveEndpoint(request.options);
    const apiKey = this.resolveApiKey(endpoint, request.options);

    if (!endpoint) {
      throw new Error(
        'Fable endpoint URL is not configured. Set it in Settings or provide FABLE_API_URL in the server environment.',
      );
    }

    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured (or is still a placeholder). Set ANTHROPIC_API_KEY / CLAUDE_API_KEY / FABLE_API_KEY in server secrets.',
      );
    }

    const model = request.options.model?.trim() || FABLE_MODELS[0];
    const protocolRequest = this.buildRequest(
      endpoint,
      apiKey,
      model,
      request.options.maxTokens || 16000,
      request.history,
      request.message,
      request.options.systemInstruction,
      request.options.thinkingLevel,
      false,
    );

    const timeoutSeconds = Math.max(0, Number(request.options.requestTimeoutSeconds) || 0);
    const { statusCode, bodyText, payload } = await this.postWithAnthropicRecovery(
      endpoint,
      protocolRequest.body,
      protocolRequest.headers,
      protocolRequest.isAnthropic,
      timeoutSeconds,
    );

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(this.formatHttpError(statusCode, payload, bodyText));
    }

    const text = this.getResponseText(payload, protocolRequest.isAnthropic);
    if (!text) {
      throw new Error('Fable returned an empty response payload.');
    }

    const durationMs = Math.max(1, Date.now() - started);
    const promptCharCount =
      (request.options.systemInstruction?.length ?? 0) +
      request.history.reduce((sum, turn) => sum + turn.content.length, 0) +
      request.message.length;
    const rawInput =
      typeof payload.usage?.input_tokens === 'number' ||
      typeof payload.usage?.cache_creation_input_tokens === 'number' ||
      typeof payload.usage?.cache_read_input_tokens === 'number'
        ? Number(payload.usage?.input_tokens ?? 0) +
          Number(payload.usage?.cache_creation_input_tokens ?? 0) +
          Number(payload.usage?.cache_read_input_tokens ?? 0)
        : payload.usage?.prompt_tokens;
    const rawOutput = payload.usage?.output_tokens ?? payload.usage?.completion_tokens;
    const inputTokens =
      typeof rawInput === 'number' && rawInput > 0
        ? rawInput
        : Math.max(1, Math.round(promptCharCount / 4));
    const outputTokens =
      typeof rawOutput === 'number' && rawOutput > 0
        ? rawOutput
        : Math.max(1, Math.round(text.length / 4));
    const tokenCount =
      typeof payload.usage?.total_tokens === 'number' && payload.usage.total_tokens > 0
        ? payload.usage.total_tokens
        : inputTokens + outputTokens;
    const tokensPerSecond =
      outputTokens > 0 && durationMs > 0
        ? Number((outputTokens / (durationMs / 1000)).toFixed(1))
        : undefined;

    return {
      text,
      adapterId: this.id,
      scope: this.scope,
      model: payload.model || model,
      protocol: protocolRequest.isAnthropic
        ? 'Anthropic Messages v1'
        : 'OpenAI-compatible Chat Completions',
      durationMs,
      tokenCount,
      inputTokens,
      outputTokens,
      tokensPerSecond,
    };
  }
}
