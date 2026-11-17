using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Contracts;

public sealed record LlmChatRequest(
    string Message,
    IReadOnlyList<(string Role, string Content)> History,
    WorkbenchConfig Config
);

public sealed record LlmChatResponse(
    string Text,
    string AdapterId,
    ConversationScope Scope,
    string Model,
    long DurationMs,
    int? InputTokens = null,
    int? OutputTokens = null,
    double? TokensPerSecond = null
);

public sealed record AdapterHealthStatus(
    string AdapterId,
    bool IsReady,
    string Summary,
    long LatencyMs
);

public interface ILlmAdapter
{
    string AdapterId { get; }
    string DisplayName { get; }
    ConversationScope Scope { get; }
    Task<AdapterHealthStatus> CheckHealthAsync(WorkbenchConfig config, CancellationToken ct = default);
    Task<LlmChatResponse> SendMessageAsync(LlmChatRequest request, CancellationToken ct = default);
}
