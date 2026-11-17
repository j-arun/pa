using FluentAssistantWorkbench.Contracts;
using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Adapters;

public sealed class AdapterRegistry
{
    public OllamaAdapter Ollama { get; } = new();
    public GeminiAdapter Gemini { get; } = new();
    public ClaudeAdapter Claude { get; } = new();
    public FableAdapter Fable { get; } = new();

    public ILlmAdapter Resolve(WorkbenchConfig config)
    {
        if (config.ActiveScope == ConversationScope.Private)
        {
            return Ollama;
        }

        return config.PublicLlm.ActiveAdapter?.ToLowerInvariant() switch
        {
            "claude" => Claude,
            "fable" => Fable,
            _ => Gemini
        };
    }

    public ILlmAdapter GetById(string adapterId) => adapterId.ToLowerInvariant() switch
    {
        "ollama" => Ollama,
        "claude" => Claude,
        "fable" => Fable,
        _ => Gemini
    };
}
