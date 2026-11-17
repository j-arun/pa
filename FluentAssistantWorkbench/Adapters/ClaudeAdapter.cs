using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentAssistantWorkbench.Contracts;
using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Adapters;

public sealed class ClaudeAdapter : ILlmAdapter
{
    private readonly HttpClient _http = LlmHttpClientFactory.CreateUnlimitedClient();

    public string AdapterId => "claude";
    public string DisplayName => "Claude (Public)";
    public ConversationScope Scope => ConversationScope.Public;

    private static string ResolveApiKey(PublicAdapterConfig cfg)
    {
        if (!string.IsNullOrWhiteSpace(cfg.ApiKey))
            return cfg.ApiKey.Trim();
        return Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")?.Trim() ?? string.Empty;
    }

    public async Task<AdapterHealthStatus> CheckHealthAsync(
        WorkbenchConfig config,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var cfg = config.PublicLlm.Claude;
        var apiKey = ResolveApiKey(cfg);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                "Configure Claude API Key in Settings or ANTHROPIC_API_KEY environment variable.",
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
                $"Claude adapter verified ({reply.Text}).",
                sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                $"Claude health check failed: {ex.Message}",
                sw.ElapsedMilliseconds);
        }
    }

    public Task<LlmChatResponse> SendMessageAsync(
        LlmChatRequest request,
        CancellationToken ct = default)
    {
        var cfg = request.Config.PublicLlm.Claude;
        var apiKey = ResolveApiKey(cfg);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "Claude API key is missing. Set it in Settings -> Public LLM (Claude) or via ANTHROPIC_API_KEY.");
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
        var model = string.IsNullOrWhiteSpace(cfg.Model) ? "claude-sonnet-4-20250514" : cfg.Model.Trim();
        var endpoint = string.IsNullOrWhiteSpace(cfg.EndpointUrl)
            ? "https://api.anthropic.com/v1/messages"
            : cfg.EndpointUrl.Trim();

        var messages = history.Select(h => new { role = h.Role, content = h.Content }).ToList();
        messages.Add(new { role = "user", content = userMessage });

        object body = string.IsNullOrWhiteSpace(cfg.SystemInstruction)
            ? new
            {
                model,
                max_tokens = cfg.MaxTokens > 0 ? cfg.MaxTokens : 2048,
                messages
            }
            : new
            {
                model,
                max_tokens = cfg.MaxTokens > 0 ? cfg.MaxTokens : 2048,
                system = cfg.SystemInstruction.Trim(),
                messages
            };

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(body)
        };
        req.Headers.Add("x-api-key", apiKey);
        req.Headers.Add("anthropic-version", "2023-06-01");

        using var response = await _http.SendAsync(req, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Claude returned {(int)response.StatusCode}: {raw}");
        }

        var parsed = JsonSerializer.Deserialize<AnthropicResponse>(raw);
        var text = string.Join("\n", parsed?.Content?
            .Where(c => c.Type == "text" && !string.IsNullOrWhiteSpace(c.Text))
            .Select(c => c.Text!) ?? []).Trim();

        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException("Claude returned an empty response.");
        }

        int? inputTokens = parsed?.Usage?.InputTokens;
        int? outputTokens = parsed?.Usage?.OutputTokens;
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

    private sealed class AnthropicResponse
    {
        [JsonPropertyName("model")]
        public string? Model { get; set; }

        [JsonPropertyName("content")]
        public List<AnthropicContentBlock>? Content { get; set; }

        [JsonPropertyName("usage")]
        public AnthropicUsage? Usage { get; set; }
    }

    private sealed class AnthropicUsage
    {
        [JsonPropertyName("input_tokens")]
        public int? InputTokens { get; set; }

        [JsonPropertyName("output_tokens")]
        public int? OutputTokens { get; set; }
    }

    private sealed class AnthropicContentBlock
    {
        [JsonPropertyName("type")]
        public string? Type { get; set; }

        [JsonPropertyName("text")]
        public string? Text { get; set; }
    }
}
