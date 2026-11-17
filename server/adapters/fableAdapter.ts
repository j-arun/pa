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
  };
  error?: {
    message?: string;
  };
}

const FABLE_MODELS = ['fable-1-pro', 'fable-1-fast'] as const;

export class FableAdapter implements ILlmAdapter {
  readonly id = 'fable' as const;
  readonly scope = 'public' as const;
  readonly displayName = 'Fable';
  readonly protocol = 'Fable Chat Completions v1';

  private resolveEndpoint(options?: AdapterRuntimeOptions): string {
    return (
      options?.endpointUrl?.trim() ||
      process.env.FABLE_API_URL?.trim() ||
      'https://api.fable.ai/v1/chat/completions'
    );
  }

  getSummary(): AdapterWireSummary {
    const endpoint = this.resolveEndpoint();
    return {
      id: this.id,
      scope: this.scope,
      displayName: this.displayName,
      protocol: this.protocol,
      endpointLabel: endpoint,
      defaultModel: FABLE_MODELS[0],
      availableModels: [...FABLE_MODELS],
      description:
        'Adapts workbench turns to Fable OpenAI-compatible Chat Completions payloads with system role injection, configurable endpoint routing, and normalized output.',
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
      configuredOnServer: Boolean(process.env.FABLE_API_KEY),
    };
  }

  async healthCheck(options?: AdapterRuntimeOptions): Promise<AdapterHealthResult> {
    const started = Date.now();
    const apiKey = process.env.FABLE_API_KEY;
    const endpoint = this.resolveEndpoint(options);

    if (!apiKey) {
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: false,
        configured: false,
        statusLabel: 'Server Env Unset',
        detail: `Adapter contract ready (${endpoint}). Configure FABLE_API_KEY in server environment secrets to activate live calls.`,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options?.model || FABLE_MODELS[0],
          max_tokens: 16,
          messages: [{ role: 'user', content: 'Reply OK' }],
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as FableChatCompletionResponse;
        throw new Error(errBody.error?.message || `HTTP ${response.status}`);
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
    const apiKey = process.env.FABLE_API_KEY;
    const endpoint = this.resolveEndpoint(request.options);

    if (!apiKey) {
      throw new Error(
        'Fable Adapter is registered, but FABLE_API_KEY is not configured in the server environment. Switch to Gemini in Settings or configure FABLE_API_KEY on the server.',
      );
    }

    const model = request.options.model?.trim() || FABLE_MODELS[0];
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (request.options.systemInstruction?.trim()) {
      messages.push({ role: 'system', content: request.options.systemInstruction.trim() });
    }
    for (const turn of request.history) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: 'user', content: request.message });

    const timeoutSeconds = Math.max(0, Number(request.options.requestTimeoutSeconds) || 0);
    const { statusCode, bodyText } = await postJsonConfigurable(
      endpoint,
      {
        model,
        max_tokens: request.options.maxTokens || 2048,
        messages,
      },
      {
        Authorization: `Bearer ${apiKey}`,
      },
      timeoutSeconds,
    );

    let payload: FableChatCompletionResponse = {};
    try {
      payload = JSON.parse(bodyText) as FableChatCompletionResponse;
    } catch {
      payload = {};
    }
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(payload.error?.message || `Fable returned HTTP ${statusCode}.`);
    }

    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error('Fable returned an empty response payload.');
    }

    const durationMs = Date.now() - started;
    const inputTokens = payload.usage?.prompt_tokens;
    const outputTokens = payload.usage?.completion_tokens;
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
      tokenCount: payload.usage?.total_tokens,
      inputTokens,
      outputTokens,
      tokensPerSecond,
    };
  }
}
