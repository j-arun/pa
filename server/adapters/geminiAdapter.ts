import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  AdapterHealthResult,
  AdapterWireSummary,
  GeminiThinkingPreset,
} from '../../src/types/workbench.ts';
import type {
  AdapterChatRequest,
  AdapterChatResponse,
  ILlmAdapter,
} from './types.ts';

const ALLOWED_GEMINI_MODELS = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;

function resolveThinkingLevel(preset?: GeminiThinkingPreset): ThinkingLevel {
  switch (preset) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'HIGH':
    default:
      return ThinkingLevel.HIGH;
  }
}

function getGeminiClient(timeoutSeconds = 0): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in the server environment. Set it in Settings > Secrets.',
    );
  }
  const timeoutMs = timeoutSeconds > 0 ? Math.round(timeoutSeconds * 1000) : 86_400_000;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class GeminiAdapter implements ILlmAdapter {
  readonly id = 'gemini' as const;
  readonly scope = 'public' as const;
  readonly displayName = 'Gemini';
  readonly protocol = '@google/genai generateContent';

  getSummary(): AdapterWireSummary {
    return {
      id: this.id,
      scope: this.scope,
      displayName: this.displayName,
      protocol: this.protocol,
      endpointLabel: 'Google GenAI Server Proxy',
      defaultModel: 'gemini-4-hydrogen',
      availableModels: [...ALLOWED_GEMINI_MODELS],
      description:
        'Routes public assistant turns through the server-side @google/genai SDK with multi-turn context, configurable reasoning depth, and unified response normalization.',
      requestEnvelopePreview: JSON.stringify(
        {
          model: 'gemini-4-hydrogen',
          contents: [
            { role: 'user', parts: [{ text: '<historyTurn>' }] },
            { role: 'model', parts: [{ text: '<assistantReply>' }] },
            { role: 'user', parts: [{ text: '<userPrompt>' }] },
          ],
          config: {
            systemInstruction: '<publicSystemInstruction>',
            thinkingConfig: { thinkingLevel: 'HIGH' },
          },
        },
        null,
        2,
      ),
      responseEnvelopePreview: JSON.stringify(
        {
          text: '<response.text>',
          usageMetadata: { totalTokenCount: 318 },
        },
        null,
        2,
      ),
      configuredOnServer: Boolean(process.env.GEMINI_API_KEY),
    };
  }

  async healthCheck(): Promise<AdapterHealthResult> {
    const started = Date.now();
    const hasKey = Boolean(process.env.GEMINI_API_KEY);
    if (!hasKey) {
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: false,
        configured: false,
        statusLabel: 'Key Missing',
        detail: 'GEMINI_API_KEY is not set in server secrets.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }

    try {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: 'Reply with OK.',
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const okText = response.text?.trim() || 'OK';
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: true,
        configured: true,
        statusLabel: 'Ready',
        detail: `Gemini adapter verified (${okText.slice(0, 32)}).`,
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
        detail: err instanceof Error ? err.message : 'Failed to verify Gemini adapter.',
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async sendMessage(request: AdapterChatRequest): Promise<AdapterChatResponse> {
    const started = Date.now();
    const timeoutSeconds = Math.max(0, Number(request.options.requestTimeoutSeconds) || 0);
    const ai = getGeminiClient(timeoutSeconds);

    const requestedModel = request.options.model?.trim();
    const model =
      requestedModel &&
      (ALLOWED_GEMINI_MODELS as readonly string[]).includes(requestedModel)
        ? requestedModel
        : 'gemini-4-hydrogen';

    const contents = [
      ...request.history.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      {
        role: 'user',
        parts: [{ text: request.message }],
      },
    ];

    const config: Record<string, unknown> = {};
    if (request.options.systemInstruction?.trim()) {
      config.systemInstruction = request.options.systemInstruction.trim();
    }
    if (model === 'gemini-4-hydrogen') {
      config.thinkingConfig = {
        thinkingLevel: resolveThinkingLevel(request.options.thinkingLevel),
      };
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }

    const durationMs = Date.now() - started;
    const inputTokens = response.usageMetadata?.promptTokenCount;
    const outputTokens = response.usageMetadata?.candidatesTokenCount;
    const tokensPerSecond =
      typeof outputTokens === 'number' && outputTokens > 0 && durationMs > 0
        ? Number((outputTokens / (durationMs / 1000)).toFixed(1))
        : undefined;

    return {
      text,
      adapterId: this.id,
      scope: this.scope,
      model,
      protocol: this.protocol,
      durationMs,
      tokenCount: response.usageMetadata?.totalTokenCount,
      inputTokens,
      outputTokens,
      tokensPerSecond,
    };
  }
}
