using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Media.SpeechRecognition;
using Windows.Media.SpeechSynthesis;

namespace FluentAssistantWorkbench.Services;

public sealed class WindowsSpeechService : IDisposable
{
    private readonly SpeechSynthesizer _synthesizer = new();
    private readonly MediaPlayer _player = new();

    public IReadOnlyList<VoiceInformation> InstalledVoices => SpeechSynthesizer.AllVoices;

    public event EventHandler? PlaybackEnded;

    public WindowsSpeechService()
    {
        _player.MediaEnded += (_, _) => PlaybackEnded?.Invoke(this, EventArgs.Empty);
    }

    public async Task<string> ListenOnceAsync(CancellationToken ct = default)
    {
        using var recognizer = new SpeechRecognizer();
        await recognizer.CompileConstraintsAsync();

        using var reg = ct.Register(async () =>
        {
            try
            {
                await recognizer.StopRecognitionAsync();
            }
            catch
            {
                // Ignore cancellation stop errors
            }
        });

        var result = await recognizer.RecognizeAsync();
        return result?.Text?.Trim() ?? string.Empty;
    }

    public async Task SpeakAsync(string text, string? voiceId = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        StopSpeaking();

        if (!string.IsNullOrWhiteSpace(voiceId))
        {
            var matched = SpeechSynthesizer.AllVoices.FirstOrDefault(v => v.Id == voiceId);
            if (matched is not null)
            {
                _synthesizer.Voice = matched;
            }
        }

        var stream = await _synthesizer.SynthesizeTextToStreamAsync(text);
        _player.Source = MediaSource.CreateFromStream(stream, stream.ContentType);
        _player.Play();
    }

    public void StopSpeaking()
    {
        try
        {
            _player.Pause();
            _player.Source = null;
        }
        catch
        {
            // Ignore player reset errors
        }
    }

    public void Dispose()
    {
        _player.Dispose();
        _synthesizer.Dispose();
    }
}
