export const WINUI3_SKELETON_SNIPPETS: Array<{
  title: string;
  filename: string;
  description: string;
  code: string;
}> = [
  {
    title: 'Unified LLM Adapter Contract',
    filename: 'Contracts/ILlmAdapter.cs',
    description:
      'Shared C# adapter contract implemented by both Private (Ollama) and Public (Gemini, Claude, Fable) adapters.',
    code: `public enum ConversationScope { Private, Public }

public sealed record LlmRequest(
    string Message,
    IReadOnlyList<(string Role, string Content)> History,
    string SystemInstruction,
    string ModelId
);

public sealed record LlmResponse(
    string Text,
    string AdapterName,
    string ModelId,
    long DurationMs
);

public interface ILlmAdapter
{
    string AdapterId { get; }
    ConversationScope Scope { get; }
    Task<LlmResponse> SendAsync(LlmRequest request, CancellationToken ct = default);
}`,
  },
  {
    title: 'Private Windows Ollama Adapter',
    filename: 'Adapters/OllamaAdapter.cs',
    description:
      'Discovers locally running Windows Ollama models (/api/tags) and sends multi-turn chat completions (/api/chat).',
    code: `public sealed class OllamaAdapter : ILlmAdapter
{
    private readonly HttpClient _http;
    public string AdapterId => "ollama";
    public ConversationScope Scope => ConversationScope.Private;

    public OllamaAdapter(string baseUrl = "http://127.0.0.1:11434")
        => _http = new HttpClient { BaseAddress = new Uri(baseUrl) };

    public async Task<IReadOnlyList<string>> DiscoverModelsAsync(CancellationToken ct = default)
    {
        var tags = await _http.GetFromJsonAsync<OllamaTagsDto>("/api/tags", ct);
        return tags?.Models.Select(m => m.Name).ToList() ?? [];
    }

    public async Task<LlmResponse> SendAsync(LlmRequest req, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var payload = new {
            model = req.ModelId,
            stream = false,
            messages = BuildMessages(req)
        };
        var res = await _http.PostAsJsonAsync("/api/chat", payload, ct);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<OllamaChatDto>(ct);
        return new LlmResponse(body?.Message.Content ?? "", "Ollama", req.ModelId, sw.ElapsedMilliseconds);
    }
}`,
  },
  {
    title: 'Windows Native Speech & Speaker Service',
    filename: 'Services/WindowsSpeechService.cs',
    description:
      'Uses Windows.Media.SpeechRecognition for microphone input and Windows.Media.SpeechSynthesis for native Windows speaker output.',
    code: `using Windows.Media.SpeechRecognition;
using Windows.Media.SpeechSynthesis;
using Windows.Media.Playback;
using Windows.Media.Core;

public sealed class WindowsSpeechService
{
    private readonly SpeechSynthesizer _synthesizer = new();
    private readonly MediaPlayer _player = new();

    public async Task<string> ListenOnceAsync()
    {
        using var recognizer = new SpeechRecognizer();
        await recognizer.CompileConstraintsAsync();
        var result = await recognizer.RecognizeAsync();
        return result.Text ?? string.Empty;
    }

    public async Task SpeakAsync(string text)
    {
        var stream = await _synthesizer.SynthesizeTextToStreamAsync(text);
        _player.Source = MediaSource.CreateFromStream(stream, stream.ContentType);
        _player.Play();
    }
}`,
  },
];
