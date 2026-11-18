import { postJsonConfigurable } from './httpClient.ts';
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

const FABLE_MODELS = ['claude-fable-5-1', 'claude-sonnet-4-20250514'] as const;
const RETIRED_FABLE_ENDPOINT = 'https://api.fable.ai/v1/chat/completions';

export class FableAdapter implements ILlmAdapter {
  readonly id = 'fable' as const;
  readonly scope = 'public' as const;
  readonly displayName = 'Fable';
  readonly protocol = 'Anthropic Messages / OpenAI-compatible Chat Completions';

  private resolveApiKey(endpoint: string, options?: AdapterRuntimeOptions): string {
    return (
      options?.apiKey?.trim() ||
      process.env.FABLE_API_KEY?.trim() ||
      (endpoint && this.usesAnthropicMessagesApi(endpoint)
        ? process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API_KEY?.trim()
        : '') ||
      ''
    );
  }

  private resolveEndpoint(options?: AdapterRuntimeOptions): string {
    const endpoint =
      options?.endpointUrl?.trim() ||
      process.env.FABLE_API_URL?.trim() ||
      'https://api.anthropic.com/v1/messages';
    return endpoint.replace(/\/+$/, '').toLowerCase() === RETIRED_FABLE_ENDPOINT
      ? 'https://api.anthropic.com/v1/messages'
      : endpoint;
  }

  private usesAnthropicMessagesApi(endpoint: string): boolean {
    const url = new URL(endpoint);
    return (
      url.hostname.toLowerCase() === 'api.anthropic.com' ||
      url.pathname.replace(/\/+$/, '').endsWith('/v1/messages')
    );
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
    const messages = [
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
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          }
        : { Authorization: `Bearer ${apiKey}` },
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

  private getResponseText(payload: FableChatCompletionResponse, isAnthropic: boolean): string {
    return isAnthropic
      ? (payload.content || [])
          .filter((block) => block.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('\n')
          .trim()
      : payload.choices?.[0]?.message?.content?.trim() || '';
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
        'Uses Anthropic Messages for /v1/messages endpoints and OpenAI-compatible Chat Completions for other configured endpoints.',
      requestEnvelopePreview: JSON.stringify(
        {
          model: FABLE_MODELS[0],
          max_tokens: 2048,
          messages: [
            { role: 'system', content: '<publicSystemInstruction>' },
            { role: 'user', content: '<userPrompt>' },
          ],
        },
        null,
        2,
      ),
      responseEnvelopePreview: JSON.stringify(
        {
          model: FABLE_MODELS[0],
          choices: [{ message: { role: 'assistant', content: '<assistantReply>' } }],
          usage: { total_tokens: 214 },
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
        detail: 'Configure a current provider endpoint URL in Settings or with FABLE_API_URL; the former api.fable.ai default is unavailable.',
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
        detail: 'Provide apiKey or x-api-key per request, or configure FABLE_API_KEY, ANTHROPIC_API_KEY, or CLAUDE_API_KEY on the server.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const request = this.buildRequest(
        endpoint,
        apiKey,
        options?.model || FABLE_MODELS[0],
        16,
        [],
        'Reply OK',
      );
      const { statusCode, bodyText } = await postJsonConfigurable(
        endpoint,
        request.body,
        request.headers,
        15,
      );
      const payload = this.parseResponse(bodyText);
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(payload.error?.message || `HTTP ${statusCode}`);
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
        detail: `Fable adapter verified at ${endpoint}.`,
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
        'Fable API key is missing. Provide apiKey or x-api-key per request, or configure FABLE_API_KEY, ANTHROPIC_API_KEY, or CLAUDE_API_KEY on the server.',
      );
    }

    const model = request.options.model?.trim() || FABLE_MODELS[0];
    const protocolRequest = this.buildRequest(
      endpoint,
      apiKey,
      model,
      request.options.maxTokens || 2048,
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
      throw new Error(payload.error?.message || `Fable returned HTTP ${statusCode}.`);
    }

    const text = this.getResponseText(payload, protocolRequest.isAnthropic);
    if (!text) {
      throw new Error('Fable returned an empty response payload.');
    }

    const durationMs = Date.now() - started;
    const inputTokens = payload.usage?.input_tokens ?? payload.usage?.prompt_tokens;
    const outputTokens = payload.usage?.output_tokens ?? payload.usage?.completion_tokens;
    const tokensPerSecond =
      typeof outputTokens === 'number' && outputTokens > 0 && durationMs > 0
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
      tokenCount:
        payload.usage?.total_tokens ??
        (inputTokens !== undefined || outputTokens !== undefined
          ? (inputTokens ?? 0) + (outputTokens ?? 0)
          : undefined),
      inputTokens,
      outputTokens,
      tokensPerSecond,
    };
  }
}
