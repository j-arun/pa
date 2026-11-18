using System.Diagnostics;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using FluentAssistantWorkbench.Contracts;
using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Adapters;

public sealed class OllamaAdapter : ILlmAdapter
{
    private readonly HttpClient _http = LlmHttpClientFactory.CreateUnlimitedClient();

    public string AdapterId => "ollama";
    public string DisplayName => "Windows Ollama (Private)";
    public ConversationScope Scope => ConversationScope.Private;

    public async Task<IReadOnlyList<OllamaModelInfo>> DiscoverModelsAsync(
        string baseUrl,
        CancellationToken ct = default)
    {
        var normalized = NormalizeUrl(baseUrl);
        using var probeCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        probeCts.CancelAfter(TimeSpan.FromSeconds(8));

        using var response = await _http.GetAsync($"{normalized}/api/tags", probeCts.Token);
        response.EnsureSuccessStatusCode();

        var dto = await response.Content.ReadFromJsonAsync<OllamaTagsResponse>(cancellationToken: probeCts.Token);
        if (dto?.Models is null) return [];

        return dto.Models
            .Where(m => !string.IsNullOrWhiteSpace(m.Name))
            .Select(m => new OllamaModelInfo
            {
                Name = m.Name!,
                SizeBytes = m.Size,
                Family = m.Details?.Family ?? string.Empty,
                ParameterSize = m.Details?.ParameterSize ?? string.Empty,
                QuantizationLevel = m.Details?.QuantizationLevel ?? string.Empty
            })
            .ToList();
    }

    public async Task<AdapterHealthStatus> CheckHealthAsync(
        WorkbenchConfig config,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var models = await DiscoverModelsAsync(config.PrivateLlm.OllamaBaseUrl, ct);
            return new AdapterHealthStatus(
                AdapterId,
                true,
                $"Connected to Windows Ollama ({models.Count} model(s) deployed).",
                sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            return new AdapterHealthStatus(
                AdapterId,
                false,
                $"Unable to reach Ollama: {ex.Message}",
                sw.ElapsedMilliseconds);
        }
    }

    public async Task<LlmChatResponse> SendMessageAsync(
        LlmChatRequest request,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var cfg = request.Config.PrivateLlm;
        var model = cfg.SelectedModel?.Trim();
        if (string.IsNullOrWhiteSpace(model))
        {
            throw new InvalidOperationException(
                "No Private Ollama model is selected. Open Settings -> Private LLM to discover and choose a Windows Ollama model.");
        }

        var normalized = NormalizeUrl(cfg.OllamaBaseUrl);
        var messages = new List<object>();

        if (!string.IsNullOrWhiteSpace(request.SystemInstruction))
        {
            messages.Add(new { role = "system", content = request.SystemInstruction.Trim() });
        }

        foreach (var (role, content) in request.History)
        {
            messages.Add(new { role, content });
        }

        messages.Add(new { role = "user", content = request.Message });

        object keepAliveValue = string.Equals(cfg.KeepAlive?.Trim(), "0", StringComparison.Ordinal)
            ? 0
            : string.IsNullOrWhiteSpace(cfg.KeepAlive)
                ? "10m"
                : cfg.KeepAlive.Trim();

        var payload = new
        {
            model,
            stream = true,
            keep_alive = keepAliveValue,
            options = new
            {
                num_ctx = cfg.ContextWindow > 0 ? cfg.ContextWindow : 32768,
                num_predict = cfg.MaxOutputTokens == 0 ? 2000 : cfg.MaxOutputTokens,
                temperature = cfg.Temperature
            },
            messages
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{normalized}/api/chat")
        {
            Content = JsonContent.Create(payload)
        };

        using var response = await _http.SendAsync(httpRequest, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
        {
            var errBody = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Ollama returned {(int)response.StatusCode}: {errBody}");
        }

        var replyBuilder = new StringBuilder();
        string? resolvedModel = null;
        int? inputTokens = null;
        int? outputTokens = null;
        long? evalDurationNs = null;

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        while (true)
        {
            var line = await reader.ReadLineAsync(ct);
            if (line is null) break;
            if (string.IsNullOrWhiteSpace(line)) continue;

            OllamaChatResponse? chunk;
            try
            {
                chunk = JsonSerializer.Deserialize<OllamaChatResponse>(line);
            }
            catch
            {
                continue;
            }

            if (chunk is null) continue;
            if (!string.IsNullOrWhiteSpace(chunk.Error))
            {
                throw new InvalidOperationException($"Ollama error: {chunk.Error}");
            }

            if (!string.IsNullOrEmpty(chunk.Message?.Content))
            {
                replyBuilder.Append(chunk.Message.Content);
            }

            if (!string.IsNullOrWhiteSpace(chunk.Model))
            {
                resolvedModel = chunk.Model;
            }
            if (chunk.PromptEvalCount.HasValue) inputTokens = chunk.PromptEvalCount;
            if (chunk.EvalCount.HasValue) outputTokens = chunk.EvalCount;
            if (chunk.EvalDuration.HasValue) evalDurationNs = chunk.EvalDuration;
        }

        var reply = replyBuilder.ToString().Trim();
        if (string.IsNullOrWhiteSpace(reply))
        {
            throw new InvalidOperationException($"Ollama model '{model}' returned an empty response.");
        }

        double? tokPerSec = null;
        if (outputTokens is > 0)
        {
            if (evalDurationNs is > 0)
            {
                tokPerSec = Math.Round(outputTokens.Value / (evalDurationNs.Value / 1_000_000_000.0), 1);
            }
            else if (sw.ElapsedMilliseconds > 0)
            {
                tokPerSec = Math.Round(outputTokens.Value / (sw.ElapsedMilliseconds / 1000.0), 1);
            }
        }

        return new LlmChatResponse(
            reply,
            AdapterId,
            Scope,
            resolvedModel ?? model,
            sw.ElapsedMilliseconds,
            inputTokens,
            outputTokens,
            tokPerSec);
    }

    private static string NormalizeUrl(string raw)
    {
        var candidate = string.IsNullOrWhiteSpace(raw) ? "http://127.0.0.1:11434" : raw.Trim();
        return candidate.TrimEnd('/');
    }

    private sealed class OllamaTagsResponse
    {
        [JsonPropertyName("models")]
        public List<OllamaTagItem>? Models { get; set; }
    }

    private sealed class OllamaTagItem
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("size")]
        public long Size { get; set; }

        [JsonPropertyName("details")]
        public OllamaTagDetails? Details { get; set; }
    }

    private sealed class OllamaTagDetails
    {
        [JsonPropertyName("family")]
        public string? Family { get; set; }

        [JsonPropertyName("parameter_size")]
        public string? ParameterSize { get; set; }

        [JsonPropertyName("quantization_level")]
        public string? QuantizationLevel { get; set; }
    }

    private sealed class OllamaChatResponse
    {
        [JsonPropertyName("model")]
        public string? Model { get; set; }

        [JsonPropertyName("message")]
        public OllamaChatMessage? Message { get; set; }

        [JsonPropertyName("done")]
        public bool Done { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }

        [JsonPropertyName("prompt_eval_count")]
        public int? PromptEvalCount { get; set; }

        [JsonPropertyName("eval_count")]
        public int? EvalCount { get; set; }

        [JsonPropertyName("eval_duration")]
        public long? EvalDuration { get; set; }
    }

    public async Task<(int UnloadedCount, string Summary)> UnloadModelsAsync(
        string baseUrl,
        string? configuredModel,
        CancellationToken ct = default)
    {
        var normalized = NormalizeUrl(baseUrl);
        using var probeCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        probeCts.CancelAfter(TimeSpan.FromSeconds(10));

        var targets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            using var psResponse = await _http.GetAsync($"{normalized}/api/ps", probeCts.Token);
            if (psResponse.IsSuccessStatusCode)
            {
                var ps = await psResponse.Content.ReadFromJsonAsync<OllamaPsResponse>(cancellationToken: probeCts.Token);
                if (ps?.Models is not null)
                {
                    foreach (var m in ps.Models)
                    {
                        var name = !string.IsNullOrWhiteSpace(m.Name) ? m.Name : m.Model;
                        if (!string.IsNullOrWhiteSpace(name))
                        {
                            targets.Add(name.Trim());
                        }
                    }
                }
            }
        }
        catch
        {
            // Fall back to configured model if /api/ps is unavailable
        }

        if (targets.Count == 0 && !string.IsNullOrWhiteSpace(configuredModel))
        {
            targets.Add(configuredModel.Trim());
        }

        if (targets.Count == 0)
        {
            return (0, "No running Ollama models found in memory.");
        }

        var unloaded = new List<string>();
        foreach (var modelName in targets)
        {
            try
            {
                var unloadPayload = new
                {
                    model = modelName,
                    prompt = string.Empty,
                    stream = false,
                    keep_alive = 0
                };
                using var res = await _http.PostAsJsonAsync($"{normalized}/api/generate", unloadPayload, probeCts.Token);
                if (res.IsSuccessStatusCode)
                {
                    unloaded.Add(modelName);
                }
            }
            catch
            {
                // Continue trying remaining loaded models
            }
        }

        if (unloaded.Count == 0)
        {
            return (0, $"Could not unload models from Ollama at {normalized}. Ensure Ollama is running.");
        }

        return (
            unloaded.Count,
            $"Unloaded {unloaded.Count} model(s) from Ollama RAM/VRAM: {string.Join(", ", unloaded)}.");
    }

    private sealed class OllamaPsResponse
    {
        [JsonPropertyName("models")]
        public List<OllamaPsModel>? Models { get; set; }
    }

    private sealed class OllamaPsModel
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("model")]
        public string? Model { get; set; }
    }

    private sealed class OllamaChatMessage
    {
        [JsonPropertyName("content")]
        public string? Content { get; set; }
    }
}
