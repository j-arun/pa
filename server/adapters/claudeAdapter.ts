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

interface AnthropicMessageResponse {
  id?: string;
  model?: string;
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

const CLAUDE_MODELS = [
  'claude-fable-5-1',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-latest',
  'claude-3-5-haiku-latest',
] as const;

export class ClaudeAdapter implements ILlmAdapter {
  readonly id = 'claude' as const;
  readonly scope = 'public' as const;
  readonly displayName = 'Claude (Anthropic)';
  readonly protocol = 'Anthropic Messages v1';

  private resolveEndpoint(options?: AdapterRuntimeOptions): string {
    return (
      options?.endpointUrl?.trim() ||
      process.env.ANTHROPIC_API_URL?.trim() ||
      'https://api.anthropic.com/v1/messages'
    );
  }

  private resolveApiKey(options?: AdapterRuntimeOptions): string {
    return (
      options?.apiKey?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.CLAUDE_API_KEY?.trim() ||
      ''
    );
  }

  getSummary(): AdapterWireSummary {
    return {
      id: this.id,
      scope: this.scope,
      displayName: this.displayName,
      protocol: this.protocol,
      endpointLabel: 'https://api.anthropic.com/v1/messages',
      defaultModel: CLAUDE_MODELS[0],
      availableModels: [...CLAUDE_MODELS],
      description:
        'Transforms workbench conversation turns into Anthropic Messages API envelopes (system prompt + alternating user/assistant messages) and normalizes text content blocks.',
      requestEnvelopePreview: JSON.stringify(
        {
          model: CLAUDE_MODELS[0],
          max_tokens: 1024,
          system: '<publicSystemInstruction>',
          messages: [
            { role: 'user', content: '<historyTurn>' },
            { role: 'assistant', content: '<assistantReply>' },
            { role: 'user', content: '<userPrompt>' },
          ],
        },
        null,
        2,
      ),
      responseEnvelopePreview: JSON.stringify(
        {
          model: CLAUDE_MODELS[0],
          content: [{ type: 'text', text: '<assistantReply>' }],
          usage: { input_tokens: 94, output_tokens: 128 },
        },
        null,
        2,
      ),
      configuredOnServer: Boolean(
        process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API_KEY?.trim(),
      ),
    };
  }

  async healthCheck(options?: AdapterRuntimeOptions): Promise<AdapterHealthResult> {
    const started = Date.now();
    const apiKey = this.resolveApiKey(options);
    const endpoint = this.resolveEndpoint(options);

    if (!apiKey) {
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: false,
        configured: false,
        statusLabel: 'Server Env Unset',
        detail: `Adapter contract ready (${endpoint}). Provide apiKey or x-api-key per request, or configure ANTHROPIC_API_KEY or CLAUDE_API_KEY on the server.`,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options?.model || CLAUDE_MODELS[0],
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Reply OK' }],
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as AnthropicMessageResponse;
        throw new Error(errBody.error?.message || `HTTP ${response.status}`);
      }

      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: true,
        configured: true,
        statusLabel: 'Ready',
        detail: `Claude adapter verified at ${endpoint}.`,
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
        detail: err instanceof Error ? err.message : 'Claude health check failed.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async sendMessage(request: AdapterChatRequest): Promise<AdapterChatResponse> {
    const started = Date.now();
    const apiKey = this.resolveApiKey(request.options);
    const endpoint = this.resolveEndpoint(request.options);

    if (!apiKey) {
      throw new Error(
        'Claude API key is missing. Provide apiKey or x-api-key per request, or configure ANTHROPIC_API_KEY or CLAUDE_API_KEY on the server.',
      );
    }

    const model = request.options.model?.trim() || CLAUDE_MODELS[0];
    const messages = [
      ...request.history.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      { role: 'user' as const, content: request.message },
    ];

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.options.maxTokens || 2048,
      messages,
    };
    if (request.options.systemInstruction?.trim()) {
      body.system = request.options.systemInstruction.trim();
    }

    const timeoutSeconds = Math.max(0, Number(request.options.requestTimeoutSeconds) || 0);
    const { statusCode, bodyText } = await postJsonConfigurable(
      endpoint,
      body,
      {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      timeoutSeconds,
    );

    let payload: AnthropicMessageResponse = {};
    try {
      payload = JSON.parse(bodyText) as AnthropicMessageResponse;
    } catch {
      payload = {};
    }
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(payload.error?.message || `Claude returned HTTP ${statusCode}.`);
    }

    const text = (payload.content || [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new Error('Claude returned an empty response payload.');
    }

    const durationMs = Date.now() - started;
    const inputTokens = payload.usage?.input_tokens;
    const outputTokens = payload.usage?.output_tokens;
    const tokenCount =
      typeof inputTokens === 'number' || typeof outputTokens === 'number'
        ? (inputTokens || 0) + (outputTokens || 0)
        : undefined;
    const tokensPerSecond =
      typeof outputTokens === 'number' && outputTokens > 0 && durationMs > 0
        ? Number((outputTokens / (durationMs / 1000)).toFixed(1))
        : undefined;

    return {
      text,
      adapterId: this.id,
      scope: this.scope,
      model: payload.model || model,
      protocol: this.protocol,
      durationMs,
      tokenCount,
      inputTokens,
      outputTokens,
      tokensPerSecond,
    };
  }
}
