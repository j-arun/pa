using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Media.SpeechSynthesis;

namespace FluentAssistantWorkbench.Services;

public sealed class WindowsSpeechService : IDisposable
{
    private SpeechSynthesizer? _synthesizer;
    private MediaPlayer? _player;
    private int _playbackGeneration;

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

    public bool IsSpeaking { get; private set; }
    public string? CurrentTurnId { get; private set; }
    public event EventHandler? PlaybackStateChanged;

    private SpeechSynthesizer EnsureSynthesizer()
    {
        return _synthesizer ??= new SpeechSynthesizer();
    }

    private MediaPlayer EnsurePlayer()
    {
        if (_player is null)
        {
            _player = new MediaPlayer();
            _player.MediaEnded += (_, _) =>
            {
                if (_player.PlaybackSession.PlaybackState != MediaPlaybackState.Playing)
                {
                    SetPlaybackState(false, null);
                }
            };
        }
        return _player;
    }

    public async Task SpeakAsync(string text, string? voiceId = null, string? turnId = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return;

        StopSpeaking();
        var playbackGeneration = _playbackGeneration;
        SetPlaybackState(true, turnId);

        try
        {
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
            if (playbackGeneration != _playbackGeneration) return;

            var player = EnsurePlayer();
            player.Source = MediaSource.CreateFromStream(stream, stream.ContentType);
            player.Play();
        }
        catch
        {
            if (playbackGeneration == _playbackGeneration)
            {
                SetPlaybackState(false, null);
            }
            throw;
        }
    }

    public void StopSpeaking()
    {
        _playbackGeneration++;
        if (_player is not null)
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
        SetPlaybackState(false, null);
    }

    private void SetPlaybackState(bool isSpeaking, string? turnId)
    {
        if (IsSpeaking == isSpeaking && CurrentTurnId == turnId) return;
        IsSpeaking = isSpeaking;
        CurrentTurnId = turnId;
        PlaybackStateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void Dispose()
    {
        StopSpeaking();
        _player?.Dispose();
        _synthesizer?.Dispose();
    }
}
