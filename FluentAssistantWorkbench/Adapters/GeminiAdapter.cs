using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentAssistantWorkbench.Contracts;
using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Adapters;

public sealed class GeminiAdapter : ILlmAdapter
{
    private readonly HttpClient _http = LlmHttpClientFactory.CreateUnlimitedClient();

    public string AdapterId => "gemini";
    public string DisplayName => "Gemini Pro (Public)";
    public ConversationScope Scope => ConversationScope.Public;

    private static string ResolveApiKey(PublicAdapterConfig cfg)
    {
        if (!string.IsNullOrWhiteSpace(cfg.ApiKey))
            return cfg.ApiKey.Trim();
        return Environment.GetEnvironmentVariable("GEMINI_API_KEY")?.Trim() ?? string.Empty;
    }

    public async Task<AdapterHealthStatus> CheckHealthAsync(
        WorkbenchConfig config,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var cfg = config.PublicLlm.Gemini;
        var apiKey = ResolveApiKey(cfg);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                "Configure Gemini API Key in Settings or GEMINI_API_KEY environment variable.",
                sw.ElapsedMilliseconds);
        }

        try
        {
            using var probeCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            probeCts.CancelAfter(TimeSpan.FromSeconds(15));
            var reply = await SendInternalAsync(
                cfg,
                apiKey,
                [],
                "Reply with OK.",
                probeCts.Token);
            return new AdapterHealthStatus(
                AdapterId,
                true,
                $"Gemini adapter verified ({reply.Text}).",
                sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                $"Gemini health check failed: {ex.Message}",
                sw.ElapsedMilliseconds);
        }
    }

    public Task<LlmChatResponse> SendMessageAsync(
        LlmChatRequest request,
        CancellationToken ct = default)
    {
        var cfg = request.Config.PublicLlm.Gemini;
        var apiKey = ResolveApiKey(cfg);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "Gemini API key is missing. Set it in Settings -> Public LLM (Gemini) or via GEMINI_API_KEY.");
        }

        return SendInternalAsync(cfg, apiKey, request.History, request.Message, ct, request.SystemInstruction);
    }

    private async Task<LlmChatResponse> SendInternalAsync(
        PublicAdapterConfig cfg,
        string apiKey,
        IReadOnlyList<(string Role, string Content)> history,
        string userMessage,
        CancellationToken ct,
        string? systemInstruction = null)
    {
        var sw = Stopwatch.StartNew();
        var model = string.IsNullOrWhiteSpace(cfg.Model) ? "gemini-2.5-pro" : cfg.Model.Trim();
        var baseEndpoint = string.IsNullOrWhiteSpace(cfg.EndpointUrl)
            ? "https://generativelanguage.googleapis.com/v1beta"
            : cfg.EndpointUrl.Trim().TrimEnd('/');

        var contents = new List<object>();
        foreach (var (role, content) in history)
        {
            contents.Add(new
            {
                role = string.Equals(role, "assistant", StringComparison.OrdinalIgnoreCase) ? "model" : "user",
                parts = new[] { new { text = content } }
            });
        }
        contents.Add(new
        {
            role = "user",
            parts = new[] { new { text = userMessage } }
        });

        var effectiveSystemInstruction = systemInstruction ?? cfg.SystemInstruction;
        object body = string.IsNullOrWhiteSpace(effectiveSystemInstruction)
            ? new { contents }
            : new
            {
                systemInstruction = new { parts = new[] { new { text = effectiveSystemInstruction.Trim() } } },
                contents
            };

        var url = $"{baseEndpoint}/models/{Uri.EscapeDataString(model)}:generateContent?key={Uri.EscapeDataString(apiKey)}";
        using var response = await _http.PostAsJsonAsync(url, body, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Gemini returned {(int)response.StatusCode}: {raw}");
        }

        var parsed = JsonSerializer.Deserialize<GeminiGenerateResponse>(raw);
        var text = parsed?.Candidates?
            .FirstOrDefault()?.Content?.Parts?
            .Select(p => p.Text)
            .FirstOrDefault(t => !string.IsNullOrWhiteSpace(t))?
            .Trim();

        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException("Gemini returned an empty response.");
        }

        int? inputTokens = parsed?.UsageMetadata?.PromptTokenCount;
        int? outputTokens = parsed?.UsageMetadata?.CandidatesTokenCount;
        double? tokPerSec = (outputTokens is > 0 && sw.ElapsedMilliseconds > 0)
            ? Math.Round(outputTokens.Value / (sw.ElapsedMilliseconds / 1000.0), 1)
            : null;

        return new LlmChatResponse(
            text,
            AdapterId,
            Scope,
            model,
            sw.ElapsedMilliseconds,
            inputTokens,
            outputTokens,
            tokPerSec);
    }

    private sealed class GeminiGenerateResponse
    {
        [JsonPropertyName("candidates")]
        public List<GeminiCandidate>? Candidates { get; set; }

        [JsonPropertyName("usageMetadata")]
        public GeminiUsageMetadata? UsageMetadata { get; set; }
    }

    private sealed class GeminiUsageMetadata
    {
        [JsonPropertyName("promptTokenCount")]
        public int? PromptTokenCount { get; set; }

        [JsonPropertyName("candidatesTokenCount")]
        public int? CandidatesTokenCount { get; set; }
    }

    private sealed class GeminiCandidate
    {
        [JsonPropertyName("content")]
        public GeminiContent? Content { get; set; }
    }

    private sealed class GeminiContent
    {
        [JsonPropertyName("parts")]
        public List<GeminiPart>? Parts { get; set; }
    }

    private sealed class GeminiPart
    {
        [JsonPropertyName("text")]
        public string? Text { get; set; }
    }
}
