using System.Runtime.InteropServices;

namespace FluentAssistantWorkbench.Services;

public static class NotificationSoundService
{
    private const uint SND_SYNC = 0x0000;
    private const uint SND_ASYNC = 0x0001;
    private const uint SND_NODEFAULT = 0x0002;
    private const uint SND_FILENAME = 0x00020000;

    private static readonly object SyncLock = new();
    private static string? _chimeWavPath;
    private static string? _errorWavPath;

    public static void PlayReplyChime(bool isError = false)
    {
        try
        {
            var path = EnsureWavFile(isError);
            if (!string.IsNullOrEmpty(path) && File.Exists(path))
            {
                PlaySoundW(path, 0, SND_FILENAME | SND_ASYNC | SND_NODEFAULT);
            }
        }
        catch
        {
            // Ignore audio playback errors if host has no audio device
        }
    }

    private static string EnsureWavFile(bool isError)
    {
        lock (SyncLock)
        {
            if (isError && !string.IsNullOrEmpty(_errorWavPath) && File.Exists(_errorWavPath))
            {
                return _errorWavPath;
            }
            if (!isError && !string.IsNullOrEmpty(_chimeWavPath) && File.Exists(_chimeWavPath))
            {
                return _chimeWavPath;
            }

            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FluentAssistantWorkbench");
            Directory.CreateDirectory(dir);

            var fileName = isError ? "reply-error.wav" : "reply-chime.wav";
            var fullPath = Path.Combine(dir, fileName);

            if (!File.Exists(fullPath))
            {
                var wavBytes = isError
                    ? BuildTwoToneChimeWav(392.00, 311.13, 0.24)   // Gentle G4 -> Eb4 notice
                    : BuildTwoToneChimeWav(523.25, 783.99, 0.28);  // Warm C5 -> G5 chime
                File.WriteAllBytes(fullPath, wavBytes);
            }

            if (isError)
                _errorWavPath = fullPath;
            else
                _chimeWavPath = fullPath;

            return fullPath;
        }
    }

    private static byte[] BuildTwoToneChimeWav(double freq1Hz, double freq2Hz, double totalSeconds)
    {
        const int sampleRate = 44100;
        const short channels = 1;
        const short bitsPerSample = 16;

        int totalSamples = (int)(sampleRate * totalSeconds);
        int noteSplitSample = (int)(sampleRate * (totalSeconds * 0.42));
        int dataSize = totalSamples * channels * (bitsPerSample / 8);

        using var ms = new MemoryStream(44 + dataSize);
        using var bw = new BinaryWriter(ms);

        // RIFF WAVE header
        bw.Write("RIFF"u8);
        bw.Write(36 + dataSize);
        bw.Write("WAVE"u8);
        bw.Write("fmt "u8);
        bw.Write(16); // PCM chunk size
        bw.Write((short)1); // PCM format
        bw.Write(channels);
        bw.Write(sampleRate);
        bw.Write(sampleRate * channels * (bitsPerSample / 8));
        bw.Write((short)(channels * (bitsPerSample / 8)));
        bw.Write(bitsPerSample);
        bw.Write("data"u8);
        bw.Write(dataSize);

        for (int i = 0; i < totalSamples; i++)
        {
            double t = (double)i / sampleRate;
            double sampleVal = 0.0;

            // Tone 1 with warm fundamental + soft octave harmonic
            double attack1 = Math.Min(1.0, t / 0.012);
            double decay1 = Math.Exp(-t * 14.0);
            double wave1 = (Math.Sin(2.0 * Math.PI * freq1Hz * t) * 0.85)
                         + (Math.Sin(2.0 * Math.PI * (freq1Hz * 2.0) * t) * 0.15);
            sampleVal += wave1 * attack1 * decay1 * 0.30;

            // Tone 2 overlapping cleanly after the split point
            if (i >= noteSplitSample)
            {
                double t2 = (double)(i - noteSplitSample) / sampleRate;
                double attack2 = Math.Min(1.0, t2 / 0.012);
                double decay2 = Math.Exp(-t2 * 11.5);
                double wave2 = (Math.Sin(2.0 * Math.PI * freq2Hz * t2) * 0.85)
                             + (Math.Sin(2.0 * Math.PI * (freq2Hz * 2.0) * t2) * 0.15);
                sampleVal += wave2 * attack2 * decay2 * 0.34;
            }

            short pcm = (short)Math.Clamp(sampleVal * short.MaxValue, short.MinValue, short.MaxValue);
            bw.Write(pcm);
        }

        bw.Flush();
        return ms.ToArray();
    }

    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    private static extern bool PlaySoundW(string? pszSound, nint hmod, uint fdwSound);
}
