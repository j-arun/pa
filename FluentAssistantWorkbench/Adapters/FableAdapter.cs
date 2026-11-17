using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentAssistantWorkbench.Contracts;
using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Adapters;

public sealed class FableAdapter : ILlmAdapter
{
    private readonly HttpClient _http = new() { Timeout = Timeout.InfiniteTimeSpan };

    public string AdapterId => "fable";
    public string DisplayName => "Fable (Public)";
    public ConversationScope Scope => ConversationScope.Public;

    private static string ResolveApiKey(PublicAdapterConfig cfg)
    {
        if (!string.IsNullOrWhiteSpace(cfg.ApiKey))
            return cfg.ApiKey.Trim();
        return Environment.GetEnvironmentVariable("FABLE_API_KEY")?.Trim() ?? string.Empty;
    }

    public async Task<AdapterHealthStatus> CheckHealthAsync(
        WorkbenchConfig config,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var cfg = config.PublicLlm.Fable;
        var apiKey = ResolveApiKey(cfg);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                "Configure Fable API Key in Settings or FABLE_API_KEY environment variable.",
                sw.ElapsedMilliseconds);
        }

        try
        {
            using var probeCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            probeCts.CancelAfter(TimeSpan.FromSeconds(15));
            var reply = await SendInternalAsync(cfg, apiKey, [], "Reply with OK.", probeCts.Token);
            return new AdapterHealthStatus(
                AdapterId,
                true,
                $"Fable adapter verified ({reply.Text}).",
                sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                $"Fable health check failed: {ex.Message}",
                sw.ElapsedMilliseconds);
        }
    }

    public Task<LlmChatResponse> SendMessageAsync(
        LlmChatRequest request,
        CancellationToken ct = default)
    {
        var cfg = request.Config.PublicLlm.Fable;
        var apiKey = ResolveApiKey(cfg);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "Fable API key is missing. Set it in Settings -> Public LLM (Fable) or via FABLE_API_KEY.");
        }

        return SendInternalAsync(cfg, apiKey, request.History, request.Message, ct);
    }

    private async Task<LlmChatResponse> SendInternalAsync(
        PublicAdapterConfig cfg,
        string apiKey,
        IReadOnlyList<(string Role, string Content)> history,
        string userMessage,
        CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var model = string.IsNullOrWhiteSpace(cfg.Model) ? "fable-1-pro" : cfg.Model.Trim();
        var endpoint = string.IsNullOrWhiteSpace(cfg.EndpointUrl)
            ? "https://api.fable.ai/v1/chat/completions"
            : cfg.EndpointUrl.Trim();

        var messages = new List<object>();
        if (!string.IsNullOrWhiteSpace(cfg.SystemInstruction))
        {
            messages.Add(new { role = "system", content = cfg.SystemInstruction.Trim() });
        }
        foreach (var (role, content) in history)
        {
            messages.Add(new { role, content });
        }
        messages.Add(new { role = "user", content = userMessage });

        var body = new
        {
            model,
            max_tokens = cfg.MaxTokens > 0 ? cfg.MaxTokens : 2048,
            messages
        };

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(body)
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var response = await _http.SendAsync(req, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Fable returned {(int)response.StatusCode}: {raw}");
        }

        var parsed = JsonSerializer.Deserialize<FableResponse>(raw);
        var text = parsed?.Choices?.FirstOrDefault()?.Message?.Content?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException("Fable returned an empty response.");
        }

        int? inputTokens = parsed?.Usage?.PromptTokens;
        int? outputTokens = parsed?.Usage?.CompletionTokens;
        double? tokPerSec = (outputTokens is > 0 && sw.ElapsedMilliseconds > 0)
            ? Math.Round(outputTokens.Value / (sw.ElapsedMilliseconds / 1000.0), 1)
            : null;

        return new LlmChatResponse(
            text,
            AdapterId,
            Scope,
            parsed?.Model ?? model,
            sw.ElapsedMilliseconds,
            inputTokens,
            outputTokens,
            tokPerSec);
    }

    private sealed class FableResponse
    {
        [JsonPropertyName("model")]
        public string? Model { get; set; }

        [JsonPropertyName("choices")]
        public List<FableChoice>? Choices { get; set; }

        [JsonPropertyName("usage")]
        public FableUsage? Usage { get; set; }
    }

    private sealed class FableUsage
    {
        [JsonPropertyName("prompt_tokens")]
        public int? PromptTokens { get; set; }

        [JsonPropertyName("completion_tokens")]
        public int? CompletionTokens { get; set; }
    }

    private sealed class FableChoice
    {
        [JsonPropertyName("message")]
        public FableMessage? Message { get; set; }
    }

    private sealed class FableMessage
    {
        [JsonPropertyName("content")]
        public string? Content { get; set; }
    }
}
