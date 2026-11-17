import type {
  AdapterWireSummary,
  AnyAdapterId,
  ConversationScope,
} from '../../src/types/workbench.ts';
import { ClaudeAdapter } from './claudeAdapter.ts';
import { FableAdapter } from './fableAdapter.ts';
import { GeminiAdapter } from './geminiAdapter.ts';
import { OllamaAdapter } from './ollamaAdapter.ts';
import type { ILlmAdapter } from './types.ts';

class AdapterRegistry {
  private readonly adapters: Map<AnyAdapterId, ILlmAdapter>;
  readonly ollama: OllamaAdapter;

  constructor() {
    this.ollama = new OllamaAdapter();
    const list: ILlmAdapter[] = [
      this.ollama,
      new GeminiAdapter(),
      new ClaudeAdapter(),
      new FableAdapter(),
    ];
    this.adapters = new Map(list.map((adapter) => [adapter.id, adapter]));
  }

  get(adapterId: AnyAdapterId): ILlmAdapter {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Unknown LLM adapter "${adapterId}".`);
    }
    return adapter;
  }

  resolve(scope: ConversationScope, adapterId?: AnyAdapterId): ILlmAdapter {
    if (scope === 'private') {
      const targetId = adapterId === 'ollama' || !adapterId ? 'ollama' : adapterId;
      const adapter = this.get(targetId);
      if (adapter.scope !== 'private') {
        throw new Error(`Adapter "${targetId}" is not a Private LLM adapter.`);
      }
      return adapter;
    }

    const targetId = adapterId && adapterId !== 'ollama' ? adapterId : 'gemini';
    const adapter = this.get(targetId);
    if (adapter.scope !== 'public') {
      throw new Error(`Adapter "${targetId}" is not a Public LLM adapter.`);
    }
    return adapter;
  }

  listSummaries(): AdapterWireSummary[] {
    return Array.from(this.adapters.values()).map((adapter) => adapter.getSummary());
  }
}

export const adapterRegistry = new AdapterRegistry();
