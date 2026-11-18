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
    private const string AnthropicApiVersion = "2023-06-01";
    private const string RetiredFableEndpoint = "https://api.fable.ai/v1/chat/completions";
    private readonly HttpClient _http = LlmHttpClientFactory.CreateUnlimitedClient();

    public string AdapterId => "fable";
    public string DisplayName => "Fable (Public)";
    public ConversationScope Scope => ConversationScope.Public;

    private static string ResolveApiKey(PublicAdapterConfig cfg, string endpoint)
    {
        if (!string.IsNullOrWhiteSpace(cfg.ApiKey))
            return cfg.ApiKey.Trim();
        var fableKey = Environment.GetEnvironmentVariable("FABLE_API_KEY")?.Trim();
        if (!string.IsNullOrWhiteSpace(fableKey))
        {
            return fableKey;
        }
        return UsesAnthropicMessagesApi(endpoint)
            ? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")?.Trim() ?? string.Empty
            : string.Empty;
    }

    private static string ResolveEndpoint(PublicAdapterConfig cfg)
    {
        var endpoint = !string.IsNullOrWhiteSpace(cfg.EndpointUrl)
            ? cfg.EndpointUrl.Trim()
            : Environment.GetEnvironmentVariable("FABLE_API_URL")?.Trim() ?? string.Empty;
        return string.Equals(
            endpoint.TrimEnd('/'),
            RetiredFableEndpoint,
            StringComparison.OrdinalIgnoreCase)
                ? string.Empty
                : endpoint;
    }

    private static bool UsesAnthropicMessagesApi(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri)) return false;
        return string.Equals(uri.Host, "api.anthropic.com", StringComparison.OrdinalIgnoreCase)
            || uri.AbsolutePath.TrimEnd('/').EndsWith("/v1/messages", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<AdapterHealthStatus> CheckHealthAsync(
        WorkbenchConfig config,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var cfg = config.PublicLlm.Fable;
        var endpoint = ResolveEndpoint(cfg);
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                "Configure a current provider endpoint URL in Settings or set FABLE_API_URL; the former api.fable.ai default is unavailable.",
                sw.ElapsedMilliseconds);
        }
        var apiKey = ResolveApiKey(cfg, endpoint);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                "Configure the Fable API key, FABLE_API_KEY, or ANTHROPIC_API_KEY for Anthropic endpoints.",
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
        var endpoint = ResolveEndpoint(cfg);
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            throw new InvalidOperationException(
                "Fable endpoint URL is not configured. Set it in Settings or provide FABLE_API_URL.");
        }
        var apiKey = ResolveApiKey(cfg, endpoint);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException(
                "Fable API key is missing. Set it in Settings, use FABLE_API_KEY, or set ANTHROPIC_API_KEY for Anthropic endpoints.");
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
        var model = string.IsNullOrWhiteSpace(cfg.Model) ? "fable-1-pro" : cfg.Model.Trim();
        var endpoint = ResolveEndpoint(cfg);
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            throw new InvalidOperationException(
                "Fable endpoint URL is not configured. Set it in Settings or provide FABLE_API_URL.");
        }

        bool isAnthropic = UsesAnthropicMessagesApi(endpoint);
        var messages = new List<object>();
        var effectiveSystemInstruction = systemInstruction ?? cfg.SystemInstruction;
        foreach (var (role, content) in history)
        {
            messages.Add(new { role, content });
        }
        messages.Add(new { role = "user", content = userMessage });

        object body;
        if (isAnthropic)
        {
            body = string.IsNullOrWhiteSpace(effectiveSystemInstruction)
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
                    system = effectiveSystemInstruction.Trim(),
                    messages
                };
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(effectiveSystemInstruction))
            {
                messages.Insert(0, new { role = "system", content = effectiveSystemInstruction.Trim() });
            }
            body = new
            {
                model,
                max_tokens = cfg.MaxTokens > 0 ? cfg.MaxTokens : 2048,
                messages
            };
        }

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(body)
        };
        if (isAnthropic)
        {
            req.Headers.Add("x-api-key", apiKey);
            req.Headers.Add("anthropic-version", AnthropicApiVersion);
        }
        else
        {
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        }

        using var response = await _http.SendAsync(req, ct);
        var raw = await response.Content.ReadAsStringAsync(ct);
        var parsed = JsonSerializer.Deserialize<FableResponse>(raw);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(
                parsed?.Error?.Message ?? $"Fable returned {(int)response.StatusCode}: {raw}");
        }

        var text = isAnthropic
            ? string.Join(
                "\n",
                parsed?.Content?
                    .Where(block => block.Type == "text" && !string.IsNullOrWhiteSpace(block.Text))
                    .Select(block => block.Text!) ?? [])
                .Trim()
            : parsed?.Choices?.FirstOrDefault()?.Message?.Content?.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidOperationException("Fable returned an empty response.");
        }

        int? inputTokens = parsed?.Usage?.InputTokens ?? parsed?.Usage?.PromptTokens;
        int? outputTokens = parsed?.Usage?.OutputTokens ?? parsed?.Usage?.CompletionTokens;
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

        [JsonPropertyName("content")]
        public List<FableContentBlock>? Content { get; set; }

        [JsonPropertyName("usage")]
        public FableUsage? Usage { get; set; }

        [JsonPropertyName("error")]
        public FableError? Error { get; set; }
    }

    private sealed class FableContentBlock
    {
        [JsonPropertyName("type")]
        public string? Type { get; set; }

        [JsonPropertyName("text")]
        public string? Text { get; set; }
    }

    private sealed class FableError
    {
        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }

    private sealed class FableUsage
    {
        [JsonPropertyName("prompt_tokens")]
        public int? PromptTokens { get; set; }

        [JsonPropertyName("completion_tokens")]
        public int? CompletionTokens { get; set; }

        [JsonPropertyName("input_tokens")]
        public int? InputTokens { get; set; }

        [JsonPropertyName("output_tokens")]
        public int? OutputTokens { get; set; }
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
