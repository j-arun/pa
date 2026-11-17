using System.Globalization;
using System.Runtime.InteropServices;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Media.SpeechRecognition;
using Windows.Media.SpeechSynthesis;
using SapiRecognition = System.Speech.Recognition;

namespace FluentAssistantWorkbench.Services;

public enum SpeechSetupIssue
{
    SpeechPrivacyPolicy,
    MicrophoneAccess
}

public sealed class SpeechSetupException : Exception
{
    public SpeechSetupIssue Issue { get; }

    public SpeechSetupException(SpeechSetupIssue issue, string message, Exception? inner = null)
        : base(message, inner)
    {
        Issue = issue;
    }
}

public sealed class WindowsSpeechService : IDisposable
{
    private const int HResultPrivacyPolicyNotAccepted = unchecked((int)0x80045509);
    private const int HResultAccessDenied = unchecked((int)0x80070005);

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

    public async Task<string> ListenOnceAsync(CancellationToken ct = default)
    {
        try
        {
            return await ListenViaWinRtAsync(ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (SpeechSetupException)
        {
            throw;
        }
        catch (Exception ex) when (IsPrivacyPolicyError(ex))
        {
            // Windows Online Speech Recognition is disabled; fall back to 100% local offline SAPI dictation.
            try
            {
                return await ListenViaOfflineSapiAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception sapiEx) when (IsMicrophoneAccessError(sapiEx))
            {
                throw new SpeechSetupException(
                    SpeechSetupIssue.MicrophoneAccess,
                    "Microphone access is blocked or no default recording device is available in Windows Settings.",
                    sapiEx);
            }
            catch (Exception sapiEx)
            {
                throw new SpeechSetupException(
                    SpeechSetupIssue.SpeechPrivacyPolicy,
                    "Windows Online Speech Recognition is turned off in Windows Privacy settings, and no offline Windows desktop speech pack was ready.",
                    sapiEx);
            }
        }
        catch (Exception ex) when (IsMicrophoneAccessError(ex))
        {
            throw new SpeechSetupException(
                SpeechSetupIssue.MicrophoneAccess,
                "Allow desktop apps to access your microphone in Windows Privacy settings and verify your mic is connected.",
                ex);
        }
    }

    private static async Task<string> ListenViaWinRtAsync(CancellationToken ct)
    {
        using var recognizer = new SpeechRecognizer();
        await recognizer.CompileConstraintsAsync();

        using var reg = ct.Register(() =>
        {
            _ = Task.Run(async () =>
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
        });

        var result = await recognizer.RecognizeAsync();
        if (result is null)
        {
            return string.Empty;
        }

        if (result.Status == SpeechRecognitionResultStatus.MicrophoneUnavailable)
        {
            throw new SpeechSetupException(
                SpeechSetupIssue.MicrophoneAccess,
                "No usable microphone was detected or microphone access is disabled in Windows Privacy settings.");
        }

        if (result.Status == SpeechRecognitionResultStatus.UserCanceled)
        {
            return string.Empty;
        }

        return result.Text?.Trim() ?? string.Empty;
    }

    private static async Task<string> ListenViaOfflineSapiAsync(CancellationToken ct)
    {
        var installed = SapiRecognition.SpeechRecognitionEngine.InstalledRecognizers();
        if (installed.Count == 0)
        {
            throw new InvalidOperationException("No offline Windows desktop speech recognizer is installed.");
        }

        var preferred = installed.FirstOrDefault(r =>
            string.Equals(
                r.Culture.TwoLetterISOLanguageName,
                CultureInfo.CurrentUICulture.TwoLetterISOLanguageName,
                StringComparison.OrdinalIgnoreCase))
            ?? installed[0];

        return await Task.Run(async () =>
        {
            using var engine = new SapiRecognition.SpeechRecognitionEngine(preferred);
            engine.LoadGrammar(new SapiRecognition.DictationGrammar());
            engine.SetInputToDefaultAudioDevice();
            engine.InitialSilenceTimeout = TimeSpan.FromSeconds(8);
            engine.BabbleTimeout = TimeSpan.FromSeconds(4);
            engine.EndSilenceTimeout = TimeSpan.FromSeconds(1.2);

            var tcs = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            var recognizedText = string.Empty;

            void OnRecognized(object? _, SapiRecognition.SpeechRecognizedEventArgs e)
            {
                if (!string.IsNullOrWhiteSpace(e.Result?.Text))
                {
                    recognizedText = e.Result.Text.Trim();
                }
            }

            void OnCompleted(object? _, SapiRecognition.RecognizeCompletedEventArgs e)
            {
                if (e.Error is not null)
                {
                    tcs.TrySetException(e.Error);
                }
                else if (e.Cancelled)
                {
                    tcs.TrySetCanceled(ct);
                }
                else
                {
                    var final = !string.IsNullOrWhiteSpace(e.Result?.Text)
                        ? e.Result.Text.Trim()
                        : recognizedText;
                    tcs.TrySetResult(final);
                }
            }

            engine.SpeechRecognized += OnRecognized;
            engine.RecognizeCompleted += OnCompleted;

            using var reg = ct.Register(() =>
            {
                try
                {
                    engine.RecognizeAsyncCancel();
                }
                catch
                {
                    // Ignore cancellation errors
                }
            });

            try
            {
                engine.RecognizeAsync(SapiRecognition.RecognizeMode.Single);
                return await tcs.Task.ConfigureAwait(false);
            }
            finally
            {
                engine.SpeechRecognized -= OnRecognized;
                engine.RecognizeCompleted -= OnCompleted;
                try
                {
                    engine.RecognizeAsyncStop();
                }
                catch
                {
                    // Ignore stop errors during cleanup
                }
            }
        }, ct).ConfigureAwait(false);
    }

    private static bool IsPrivacyPolicyError(Exception ex)
    {
        if (ex is COMException com && com.HResult == HResultPrivacyPolicyNotAccepted)
        {
            return true;
        }

        return ex.HResult == HResultPrivacyPolicyNotAccepted
            || ex.Message.Contains("privacy policy", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsMicrophoneAccessError(Exception ex)
    {
        if (ex is UnauthorizedAccessException)
        {
            return true;
        }

        if (ex.HResult == HResultAccessDenied)
        {
            return true;
        }

        return ex.Message.Contains("microphone", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("audio device", StringComparison.OrdinalIgnoreCase)
            || ex.Message.Contains("access is denied", StringComparison.OrdinalIgnoreCase);
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
