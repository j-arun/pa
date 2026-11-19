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
  };
  error?: {
    message?: string;
  };
}

const FABLE_MODELS = [
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-sonnet-4-20250514',
] as const;
const DEFAULT_ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const RETIRED_FABLE_ENDPOINT = 'https://api.fable.ai/v1/chat/completions';

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
  readonly protocol = 'Anthropic Messages / OpenAI-compatible Chat Completions';

  private resolveApiKey(endpoint: string, options?: AdapterRuntimeOptions): string {
    const raw =
      options?.apiKey?.trim() ||
      resolveServerEnvSecret(
        endpoint && this.usesAnthropicMessagesApi(endpoint)
          ? [
              'FABLE_API_KEY',
              'ANTHROPIC_API_KEY',
              'CLAUDE_API_KEY',
              'VITE_FABLE_API_KEY',
              'VITE_ANTHROPIC_API_KEY',
              'VITE_CLAUDE_API_KEY',
            ]
          : [
              'FABLE_API_KEY',
              'ANTHROPIC_API_KEY',
              'CLAUDE_API_KEY',
              'VITE_FABLE_API_KEY',
              'VITE_ANTHROPIC_API_KEY',
              'VITE_CLAUDE_API_KEY',
            ],
      );
    return raw.replace(/^Bearer\s+/i, '').trim();
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

  private buildRequest(
    endpoint: string,
    apiKey: string,
    model: string,
    maxTokens: number,
    history: AdapterChatRequest['history'],
    userMessage: string,
    systemInstruction?: string,
  ): { body: Record<string, unknown>; headers: Record<string, string>; isAnthropic: boolean } {
    const isAnthropic = this.usesAnthropicMessagesApi(endpoint);
    const messages = isAnthropic
      ? normalizeAnthropicMessages(history, userMessage)
      : [
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
          { role: 'user' as const, content: userMessage },
        ];
    const system = systemInstruction?.trim();
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: isAnthropic || !system
        ? messages
        : [{ role: 'system', content: system }, ...messages],
    };

    if (isAnthropic && system) {
      body.system = system;
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
      const text = (payload.content || [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
        .trim();
      if (text) return text;
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
        'Routes Fable prompts through Anthropic Messages v1 (claude-fable-5-2) or an OpenAI-compatible Chat Completions endpoint.',
      requestEnvelopePreview: JSON.stringify(
        {
          model: FABLE_MODELS[0],
          max_tokens: 8192,
          system: '<publicSystemInstruction>',
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
          'Not found in server process.env (FABLE_API_KEY, ANTHROPIC_API_KEY, or CLAUDE_API_KEY). Add them in AI Studio Secrets if using the cloud preview, or restart the local server after setting Windows/.env variables.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const request = this.buildRequest(
        endpoint,
        apiKey,
        options?.model?.trim() || FABLE_MODELS[0],
        64,
        [],
        'Reply OK',
      );
      const { statusCode, bodyText } = await postJsonConfigurable(
        endpoint,
        request.body,
        request.headers,
        20,
      );
      const payload = this.parseResponse(bodyText);
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
        detail: `Fable adapter verified (${payload.model || options?.model || FABLE_MODELS[0]}) at ${endpoint}.`,
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
        'Fable API key is missing. Configure FABLE_API_KEY, ANTHROPIC_API_KEY, or CLAUDE_API_KEY in server secrets.',
      );
    }

    const model = request.options.model?.trim() || FABLE_MODELS[0];
    const protocolRequest = this.buildRequest(
      endpoint,
      apiKey,
      model,
      request.options.maxTokens || 8192,
      request.history,
      request.message,
      request.options.systemInstruction,
    );

    const timeoutSeconds = Math.max(0, Number(request.options.requestTimeoutSeconds) || 0);
    const { statusCode, bodyText } = await postJsonConfigurable(
      endpoint,
      protocolRequest.body,
      protocolRequest.headers,
      timeoutSeconds,
    );

    const payload = this.parseResponse(bodyText);
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
    const rawInput = payload.usage?.input_tokens ?? payload.usage?.prompt_tokens;
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
