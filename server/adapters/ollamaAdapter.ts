import { postOllamaStreamConfigurable } from './httpClient.ts';
import type {
  AdapterHealthResult,
  AdapterWireSummary,
  OllamaModelInfo,
} from '../../src/types/workbench.ts';
import type {
  AdapterChatRequest,
  AdapterChatResponse,
  AdapterRuntimeOptions,
  ILlmAdapter,
} from './types.ts';

interface OllamaTagResponse {
  models?: Array<{
    name?: string;
    model?: string;
    size?: number;
    modified_at?: string;
    details?: {
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

interface OllamaChatApiResponse {
  model?: string;
  message?: {
    role?: string;
    content?: string;
  };
  eval_count?: number;
  prompt_eval_count?: number;
  eval_duration?: number;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 1 : 2)} ${units[idx]}`;
}

export function normalizeOllamaBaseUrl(rawUrl?: string): string {
  const candidate = (rawUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim();
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Ollama endpoint must use http:// or https:// protocol.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

export class OllamaAdapter implements ILlmAdapter {
  readonly id = 'ollama' as const;
  readonly scope = 'private' as const;
  readonly displayName = 'Windows Ollama (Local)';
  readonly protocol = 'Ollama REST /api/chat';

  getSummary(): AdapterWireSummary {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    return {
      id: this.id,
      scope: this.scope,
      displayName: this.displayName,
      protocol: this.protocol,
      endpointLabel: baseUrl,
      defaultModel: 'llama3.2',
      availableModels: [],
      description:
        'Connects directly to the local Ollama daemon running on your Windows workstation via /api/tags and /api/chat so private prompts never leave your machine.',
      requestEnvelopePreview: JSON.stringify(
        {
          model: 'llama3.2',
          stream: false,
          keep_alive: '10m',
          options: { num_ctx: 8192 },
          messages: [
            { role: 'system', content: '<privateSystemInstruction>' },
            { role: 'user', content: '<userPrompt>' },
          ],
        },
        null,
        2,
      ),
      responseEnvelopePreview: JSON.stringify(
        {
          model: 'llama3.2',
          message: { role: 'assistant', content: '<assistantReply>' },
          prompt_eval_count: 142,
          eval_count: 86,
        },
        null,
        2,
      ),
      configuredOnServer: true,
    };
  }

  async listModels(options?: AdapterRuntimeOptions): Promise<OllamaModelInfo[]> {
    const baseUrl = normalizeOllamaBaseUrl(options?.ollamaBaseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama returned HTTP ${response.status} from ${baseUrl}/api/tags.`);
      }

      const payload = (await response.json()) as OllamaTagResponse;
      const rawModels = Array.isArray(payload.models) ? payload.models : [];

      return rawModels
        .filter((item) => Boolean(item.name || item.model))
        .map((item) => {
          const name = item.name || item.model || 'unknown';
          const sizeBytes = typeof item.size === 'number' ? item.size : 0;
          return {
            name,
            model: item.model || name,
            sizeBytes,
            sizeFormatted: formatBytes(sizeBytes),
            modifiedAt: item.modified_at || '',
            family: item.details?.family,
            parameterSize: item.details?.parameter_size,
            quantizationLevel: item.details?.quantization_level,
          };
        });
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `Timed out connecting to Windows Ollama at ${baseUrl}. Ensure Ollama is running (ollama serve).`
          : err instanceof Error
            ? `Unable to reach Windows Ollama at ${baseUrl}: ${err.message}`
            : `Unable to reach Windows Ollama at ${baseUrl}.`;
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(options?: AdapterRuntimeOptions): Promise<AdapterHealthResult> {
    const started = Date.now();
    const baseUrl = normalizeOllamaBaseUrl(options?.ollamaBaseUrl);

    try {
      const models = await this.listModels({ ollamaBaseUrl: baseUrl });
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: true,
        configured: true,
        statusLabel: 'Connected',
        detail: `${models.length} local model${models.length === 1 ? '' : 's'} discovered at ${baseUrl}.`,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        adapterId: this.id,
        scope: this.scope,
        reachable: false,
        configured: true,
        statusLabel: 'Unreachable',
        detail: err instanceof Error ? err.message : `Ollama is not reachable at ${baseUrl}.`,
        latencyMs: Date.now() - started,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  async sendMessage(request: AdapterChatRequest): Promise<AdapterChatResponse> {
    const started = Date.now();
    const baseUrl = normalizeOllamaBaseUrl(request.options.ollamaBaseUrl);
    const model = request.options.model?.trim();

    if (!model) {
      throw new Error(
        'No Private Ollama model is selected. Open Settings -> Private LLM to discover and choose an installed model.',
      );
    }

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (request.options.systemInstruction?.trim()) {
      messages.push({
        role: 'system',
        content: request.options.systemInstruction.trim(),
      });
    }

    for (const turn of request.history) {
      messages.push({
        role: turn.role,
        content: turn.content,
      });
    }

    messages.push({
      role: 'user',
      content: request.message,
    });

    try {
      const timeoutSeconds = Math.max(0, Number(request.options.requestTimeoutSeconds) || 0);
      const streamed = await postOllamaStreamConfigurable(
        `${baseUrl}/api/chat`,
        {
          model,
          stream: true,
          keep_alive:
            request.options.keepAlive === '0'
              ? 0
              : request.options.keepAlive || '10m',
          options: {
            num_ctx: request.options.contextWindow || 8192,
          },
          messages,
        },
        timeoutSeconds,
      );

      if (streamed.statusCode < 200 || streamed.statusCode >= 300 || streamed.error) {
        throw new Error(
          streamed.error || `Ollama returned HTTP ${streamed.statusCode} while querying "${model}".`,
        );
      }

      const replyText = streamed.text.trim();
      if (!replyText) {
        throw new Error(`Ollama model "${model}" returned an empty message payload.`);
      }

      const durationMs = Math.max(1, Date.now() - started);
      const promptCharCount =
        (request.options.systemInstruction?.length ?? 0) +
        request.history.reduce((sum, turn) => sum + turn.content.length, 0) +
        request.message.length;
      const inputTokens =
        typeof streamed.promptEvalCount === 'number' && streamed.promptEvalCount > 0
          ? streamed.promptEvalCount
          : Math.max(1, Math.round(promptCharCount / 4));
      const outputTokens =
        typeof streamed.evalCount === 'number' && streamed.evalCount > 0
          ? streamed.evalCount
          : Math.max(1, Math.round(replyText.length / 4));
      const tokenCount = inputTokens + outputTokens;
      let tokensPerSecond: number | undefined;
      if (outputTokens > 0) {
        if (
          typeof streamed.evalCount === 'number' &&
          streamed.evalCount > 0 &&
          typeof streamed.evalDuration === 'number' &&
          streamed.evalDuration > 0
        ) {
          tokensPerSecond = Number((outputTokens / (streamed.evalDuration / 1e9)).toFixed(1));
        } else if (durationMs > 0) {
          tokensPerSecond = Number((outputTokens / (durationMs / 1000)).toFixed(1));
        }
      }

      return {
        text: replyText,
        adapterId: this.id,
        scope: this.scope,
        model: streamed.model || model,
        protocol: this.protocol,
        durationMs,
        tokenCount,
        inputTokens,
        outputTokens,
        tokensPerSecond,
      };
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(`Failed to communicate with Ollama at ${baseUrl}.`);
    }
  }

  async unloadModels(options?: AdapterRuntimeOptions): Promise<{
    unloadedModels: string[];
    message: string;
  }> {
    const baseUrl = normalizeOllamaBaseUrl(options?.ollamaBaseUrl);
    const targets = new Set<string>();

    const psController = new AbortController();
    const psTimer = setTimeout(() => psController.abort(), 4500);
    try {
      const psRes = await fetch(`${baseUrl}/api/ps`, {
        method: 'GET',
        signal: psController.signal,
      });
      if (psRes.ok) {
        const psData = (await psRes.json().catch(() => ({}))) as {
          models?: Array<{ name?: string; model?: string }>;
        };
        for (const item of psData.models || []) {
          const modelName = (item.name || item.model || '').trim();
          if (modelName) targets.add(modelName);
        }
      }
    } catch {
      // Fall back to configured model if /api/ps is unavailable
    } finally {
      clearTimeout(psTimer);
    }

    if (targets.size === 0 && options?.model?.trim()) {
      targets.add(options.model.trim());
    }

    if (targets.size === 0) {
      return {
        unloadedModels: [],
        message: 'No running Ollama models found in memory.',
      };
    }

    const unloadedModels: string[] = [];
    for (const modelName of targets) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            prompt: '',
            stream: false,
            keep_alive: 0,
          }),
          signal: controller.signal,
        });
        if (res.ok) {
          unloadedModels.push(modelName);
        }
      } catch {
        // Ignore individual unload failures
      } finally {
        clearTimeout(timer);
      }
    }

    if (unloadedModels.length === 0) {
      throw new Error(
        `Unable to unload models from Ollama at ${baseUrl}. Ensure Ollama is running.`,
      );
    }

    return {
      unloadedModels,
      message: `Unloaded ${unloadedModels.length} model(s) from Ollama RAM/VRAM: ${unloadedModels.join(', ')}.`,
    };
  }
}
