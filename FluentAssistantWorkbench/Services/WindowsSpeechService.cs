using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Media.SpeechSynthesis;

namespace FluentAssistantWorkbench.Services;

public sealed class WindowsSpeechService : IDisposable
{
    private SpeechSynthesizer? _synthesizer;
    private MediaPlayer? _player;

    public IReadOnlyList<VoiceInformation> InstalledVoices
    {
        get
        {
            try
            {
                return SpeechSynthesizer.AllVoices;
            }
            catch
            {
                return [];
            }
        }
    }

    public event EventHandler? PlaybackEnded;

    private SpeechSynthesizer EnsureSynthesizer()
    {
        return _synthesizer ??= new SpeechSynthesizer();
    }

    private MediaPlayer EnsurePlayer()
    {
        if (_player is null)
        {
            _player = new MediaPlayer();
            _player.MediaEnded += (_, _) => PlaybackEnded?.Invoke(this, EventArgs.Empty);
        }
        return _player;
    }

    public async Task SpeakAsync(string text, string? voiceId = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        StopSpeaking();

        var synthesizer = EnsureSynthesizer();
        if (!string.IsNullOrWhiteSpace(voiceId))
        {
            var matched = SpeechSynthesizer.AllVoices.FirstOrDefault(v => v.Id == voiceId);
            if (matched is not null)
            {
                synthesizer.Voice = matched;
            }
        }

        var stream = await synthesizer.SynthesizeTextToStreamAsync(text);
        var player = EnsurePlayer();
        player.Source = MediaSource.CreateFromStream(stream, stream.ContentType);
        player.Play();
    }

    public void StopSpeaking()
    {
        if (_player is null) return;
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
        _player?.Dispose();
        _synthesizer?.Dispose();
    }
}
