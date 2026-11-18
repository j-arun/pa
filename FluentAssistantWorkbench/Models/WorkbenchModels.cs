using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace FluentAssistantWorkbench.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ConversationScope
{
    Private,
    Public
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AppThemeMode
{
    System,
    ArcticSky,
    MidnightSlate,
    EmeraldMist,
    RoyalAmethyst,
    Light,
    Dark
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AppFontFamily
{
    SegoeUI,
    Calibri,
    Georgia,
    CascadiaMono,
    Arial,
    Verdana,
    Tahoma,
    TimesNewRoman
}

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AppChatFontSize
{
    Small,
    Medium,
    Large
}

public static class WorkbenchThemeHelper
{
    public static AppThemeMode NormalizeTheme(AppThemeMode mode) => mode switch
    {
        AppThemeMode.Light => AppThemeMode.ArcticSky,
        AppThemeMode.Dark => AppThemeMode.MidnightSlate,
        _ => mode
    };

    public static string GetFontFamilyName(AppFontFamily font) => font switch
    {
        AppFontFamily.Calibri => "Calibri",
        AppFontFamily.Georgia => "Georgia",
        AppFontFamily.CascadiaMono => "Cascadia Code, Consolas",
        AppFontFamily.Arial => "Arial",
        AppFontFamily.Verdana => "Verdana",
        AppFontFamily.Tahoma => "Tahoma",
        AppFontFamily.TimesNewRoman => "Times New Roman",
        _ => "Segoe UI Variable Text, Segoe UI"
    };

    public static (Color QuestionBg, Color QuestionAccent, Color AnswerBg, Color AnswerAccent) GetBubblePalette(AppThemeMode theme)
    {
        return NormalizeTheme(theme) switch
        {
            AppThemeMode.EmeraldMist => (
                ColorHelper.FromArgb(26, 5, 150, 105),    // Question: soft emerald tint
                ColorHelper.FromArgb(255, 4, 120, 87),    // Question accent: emerald-700
                ColorHelper.FromArgb(22, 2, 132, 199),    // Answer: crisp sky-blue tint
                ColorHelper.FromArgb(255, 3, 105, 161)    // Answer accent: sky-700
            ),
            AppThemeMode.MidnightSlate => (
                ColorHelper.FromArgb(38, 56, 189, 248),   // Question: luminous sky tint
                ColorHelper.FromArgb(255, 56, 189, 248),  // Question accent: sky-400
                ColorHelper.FromArgb(34, 16, 185, 129),   // Answer: distinct emerald-teal tint
                ColorHelper.FromArgb(255, 52, 211, 153)   // Answer accent: emerald-400
            ),
            AppThemeMode.RoyalAmethyst => (
                ColorHelper.FromArgb(42, 168, 85, 247),   // Question: royal amethyst tint
                ColorHelper.FromArgb(255, 192, 132, 252), // Question accent: purple-300
                ColorHelper.FromArgb(34, 45, 212, 191),   // Answer: contrasting teal tint
                ColorHelper.FromArgb(255, 45, 212, 191)   // Answer accent: teal-400
            ),
            _ => (
                // ArcticSky / System default: clear Sky Question vs Warm Teal/Mint Answer
                ColorHelper.FromArgb(24, 2, 132, 199),    // Question: soft sky-blue tint
                ColorHelper.FromArgb(255, 2, 132, 199),   // Question accent: sky-600
                ColorHelper.FromArgb(22, 13, 148, 136),   // Answer: distinct soft teal tint
                ColorHelper.FromArgb(255, 15, 118, 110)   // Answer accent: teal-700
            )
        };
    }
}

public sealed class ConversationTurn
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Role { get; set; } = "user"; // "user" | "assistant" | "error" | "canceled"
    public string Content { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.Now;
    public string InputMode { get; set; } = "Typed";
    public ConversationScope Scope { get; set; } = ConversationScope.Private;
    public string AdapterId { get; set; } = "ollama";
    public string Model { get; set; } = string.Empty;
    public long? DurationMs { get; set; }
    public int? PromptTokenCount { get; set; }
    public bool PromptTokenCountIsEstimate { get; set; }
    public int? ReferenceTokenEstimate { get; set; }
    public int? ResponseTokenCount { get; set; }
    public bool ResponseTokenCountIsEstimate { get; set; }
    public int? ContextWindowTokenCount { get; set; }

    [JsonIgnore]
    public bool IsUser => string.Equals(Role, "user", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public bool IsAssistant => string.Equals(Role, "assistant", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public bool IsError => string.Equals(Role, "error", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public bool IsCanceled => string.Equals(Role, "canceled", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public Visibility UserVisibility => IsUser ? Visibility.Visible : Visibility.Collapsed;

    [JsonIgnore]
    public Visibility AssistantVisibility => IsAssistant ? Visibility.Visible : Visibility.Collapsed;

    [JsonIgnore]
    public Visibility ErrorVisibility => IsError ? Visibility.Visible : Visibility.Collapsed;

    [JsonIgnore]
    public string HeaderLabel => IsUser
        ? $"You · {Timestamp:t}"
        : IsError
            ? $"Error · {Timestamp:t}"
            : $"{Scope} · {Timestamp:t}";
}

public sealed class ConversationExchange : INotifyPropertyChanged
{
    private string _replyContent = string.Empty;
    private DateTimeOffset? _replyTimestamp;
    private bool _isReplyCanceled;
    private bool _isReplySpeaking;
    private long? _responseDurationMs;
    private int? _promptTokenCount;
    private bool _promptTokenCountIsEstimate;
    private int? _referenceTokenEstimate;
    private int? _responseTokenCount;
    private bool _responseTokenCountIsEstimate;
    private int? _contextWindowTokenCount;
    private bool _isReplyError;
    private bool _isWaitingReply;
    private bool _isQuestionExpanded = true;
    private bool _isReplyExpanded = true;
    private AppThemeMode _themeMode = AppThemeMode.ArcticSky;
    private AppFontFamily _fontMode = AppFontFamily.SegoeUI;
    private AppChatFontSize _chatFontSize = AppChatFontSize.Small;

    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string QuestionContent { get; init; } = string.Empty;
    public DateTimeOffset QuestionTimestamp { get; init; } = DateTimeOffset.Now;
    public ConversationScope Scope { get; init; } = ConversationScope.Private;

    public string QuestionHeaderLabel => $"U · {QuestionTimestamp:t}";

    public string ReplyContent
    {
        get => _replyContent;
        private set
        {
            if (_replyContent == value) return;
            _replyContent = value;
            NotifyAllReplyProperties();
        }
    }

    public bool IsReplyError
    {
        get => _isReplyError;
        private set
        {
            if (_isReplyError == value) return;
            _isReplyError = value;
            NotifyAllReplyProperties();
        }
    }

    public bool IsWaitingReply
    {
        get => _isWaitingReply;
        set
        {
            if (_isWaitingReply == value) return;
            _isWaitingReply = value;
            NotifyAllReplyProperties();
        }
    }

    public string ReplyHeaderLabel
    {
        get
        {
            var ts = _replyTimestamp ?? QuestionTimestamp;
            return _isReplyCanceled
                ? $"Stopped · {ts:t}"
                : IsReplyError ? $"Error · {ts:t}" : $"{Scope} · {ts:t}";
        }
    }

    public string ReplyMetricsText
    {
        get
        {
            var parts = new List<string>();
            if (_responseDurationMs.HasValue)
            {
                var elapsedLabel = _isReplyCanceled ? "Stopped after" : "Responded in";
                parts.Add($"{elapsedLabel} {FormatDuration(_responseDurationMs.Value)}");
            }

            if (_promptTokenCount.HasValue)
            {
                var prompt = FormatTokenCount(_promptTokenCount.Value, _promptTokenCountIsEstimate);
                var reference = _referenceTokenEstimate > 0
                    ? $" (reference ~{_referenceTokenEstimate.Value:N0})"
                    : string.Empty;
                parts.Add($"{prompt} prompt{reference}");
            }

            if (_responseTokenCount.HasValue)
            {
                parts.Add($"{FormatTokenCount(_responseTokenCount.Value, _responseTokenCountIsEstimate)} response");
            }

            if (_promptTokenCount.HasValue && _contextWindowTokenCount is > 0)
            {
                var remaining = _contextWindowTokenCount.Value
                    - _promptTokenCount.Value
                    - (_responseTokenCount ?? 0);
                var isEstimate = _promptTokenCountIsEstimate || _responseTokenCountIsEstimate;
                parts.Add(remaining >= 0
                    ? $"{(isEstimate ? "~" : string.Empty)}{remaining:N0} tokens remaining"
                    : $"{(isEstimate ? "~" : string.Empty)}{Math.Abs(remaining):N0} over context");
            }
            else if (_promptTokenCount.HasValue)
            {
                parts.Add("remaining provider-defined");
            }

            return string.Join(" · ", parts);
        }
    }

    public Visibility WaitingVisibility =>
        IsWaitingReply ? Visibility.Visible : Visibility.Collapsed;

    public Visibility QuestionContentVisibility =>
        _isQuestionExpanded ? Visibility.Visible : Visibility.Collapsed;

    public string QuestionToggleGlyph => _isQuestionExpanded ? "\uE70E" : "\uE70D";

    public string QuestionToggleToolTip =>
        _isQuestionExpanded ? "Collapse your message" : "Expand your message";

    public Visibility DividerVisibility =>
        IsWaitingReply || !string.IsNullOrWhiteSpace(ReplyContent)
            ? Visibility.Visible
            : Visibility.Collapsed;

    public Visibility ReplyContentVisibility =>
        _isReplyExpanded ? Visibility.Visible : Visibility.Collapsed;

    public string ReplyToggleGlyph => _isReplyExpanded ? "\uE70E" : "\uE70D";

    public string ReplyToggleToolTip =>
        _isReplyExpanded ? "Collapse AI response" : "Expand AI response";

    public string ReplySpeakerGlyph => _isReplySpeaking ? "\uE74F" : "\uE767";

    public string ReplySpeakerButtonText => _isReplySpeaking ? "Mute" : "Play";

    public string ReplySpeakerToolTip =>
        _isReplySpeaking ? "Mute Windows Speaker" : "Play response in Windows Speaker";

    public Visibility ReplyVisibility =>
        !IsReplyError && !_isReplyCanceled && !string.IsNullOrWhiteSpace(ReplyContent)
            ? Visibility.Visible
            : Visibility.Collapsed;

    public Visibility ErrorVisibility =>
        IsReplyError && !string.IsNullOrWhiteSpace(ReplyContent)
            ? Visibility.Visible
            : Visibility.Collapsed;

    public Visibility CanceledVisibility =>
        _isReplyCanceled && !string.IsNullOrWhiteSpace(ReplyContent)
            ? Visibility.Visible
            : Visibility.Collapsed;

    public Brush QuestionBackgroundBrush =>
        new SolidColorBrush(WorkbenchThemeHelper.GetBubblePalette(_themeMode).QuestionBg);

    public Brush QuestionAccentBrush =>
        new SolidColorBrush(WorkbenchThemeHelper.GetBubblePalette(_themeMode).QuestionAccent);

    public Brush AnswerBackgroundBrush =>
        new SolidColorBrush(WorkbenchThemeHelper.GetBubblePalette(_themeMode).AnswerBg);

    public Brush AnswerAccentBrush =>
        new SolidColorBrush(WorkbenchThemeHelper.GetBubblePalette(_themeMode).AnswerAccent);

    public FontFamily BubbleFontFamily =>
        new(WorkbenchThemeHelper.GetFontFamilyName(_fontMode));

    public double QuestionFontSize => _chatFontSize switch
    {
        AppChatFontSize.Medium => 15,
        AppChatFontSize.Large => 17,
        _ => 13
    };

    public double ReplyFontSize => _chatFontSize switch
    {
        AppChatFontSize.Medium => 14,
        AppChatFontSize.Large => 16,
        _ => 12
    };

    public void ApplyAppearance(AppThemeMode theme, AppFontFamily font, AppChatFontSize chatFontSize)
    {
        _themeMode = theme;
        _fontMode = font;
        _chatFontSize = chatFontSize;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(QuestionBackgroundBrush)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(QuestionAccentBrush)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(AnswerBackgroundBrush)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(AnswerAccentBrush)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(BubbleFontFamily)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(QuestionFontSize)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyFontSize)));
    }

    public void ToggleQuestion()
    {
        _isQuestionExpanded = !_isQuestionExpanded;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(QuestionContentVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(QuestionToggleGlyph)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(QuestionToggleToolTip)));
    }

    public void ToggleReply()
    {
        _isReplyExpanded = !_isReplyExpanded;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyContentVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyToggleGlyph)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyToggleToolTip)));
    }

    public void SetReplySpeaking(bool isSpeaking)
    {
        if (_isReplySpeaking == isSpeaking) return;
        _isReplySpeaking = isSpeaking;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplySpeakerGlyph)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplySpeakerButtonText)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplySpeakerToolTip)));
    }

    public void SetReply(
        string content,
        DateTimeOffset timestamp,
        bool isError,
        long? responseDurationMs = null,
        int? promptTokenCount = null,
        bool promptTokenCountIsEstimate = false,
        int? referenceTokenEstimate = null,
        int? responseTokenCount = null,
        bool responseTokenCountIsEstimate = false,
        int? contextWindowTokenCount = null)
    {
        _replyTimestamp = timestamp;
        _responseDurationMs = responseDurationMs;
        _promptTokenCount = promptTokenCount;
        _promptTokenCountIsEstimate = promptTokenCountIsEstimate;
        _referenceTokenEstimate = referenceTokenEstimate;
        _responseTokenCount = responseTokenCount;
        _responseTokenCountIsEstimate = responseTokenCountIsEstimate;
        _contextWindowTokenCount = contextWindowTokenCount;
        _isWaitingReply = false;
        _isReplyCanceled = false;
        _isReplyError = isError;
        _replyContent = content;
        NotifyAllReplyProperties();
    }

    public void SetCanceled(DateTimeOffset timestamp, long? durationMs)
    {
        _replyTimestamp = timestamp;
        _responseDurationMs = durationMs;
        _isWaitingReply = false;
        _isReplyCanceled = true;
        _isReplyError = false;
        _replyContent = "Response stopped by user.";
        NotifyAllReplyProperties();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void NotifyAllReplyProperties([CallerMemberName] string? _ = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyContent)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyHeaderLabel)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyMetricsText)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsReplyError)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(CanceledVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsWaitingReply)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(WaitingVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(DividerVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ErrorVisibility)));
    }

    private static string FormatDuration(long milliseconds) => milliseconds switch
    {
        >= 60_000 => $"{milliseconds / 60_000}m {milliseconds % 60_000 / 1_000}s",
        >= 1_000 => $"{milliseconds / 1_000d:0.#}s",
        _ => $"{milliseconds}ms"
    };

    private static string FormatTokenCount(int count, bool isEstimate) =>
        $"{(isEstimate ? "~" : string.Empty)}{count:N0}";
}

public sealed class OllamaModelInfo
{
    public string Name { get; set; } = string.Empty;
    public string Family { get; set; } = string.Empty;
    public string ParameterSize { get; set; } = string.Empty;
    public string QuantizationLevel { get; set; } = string.Empty;
    public long SizeBytes { get; set; }

    public string SizeFormatted
    {
        get
        {
            if (SizeBytes <= 0) return "—";
            double size = SizeBytes;
            string[] units = ["B", "KB", "MB", "GB", "TB"];
            int idx = 0;
            while (size >= 1024 && idx < units.Length - 1)
            {
                size /= 1024;
                idx++;
            }
            return $"{size:0.0} {units[idx]}";
        }
    }

    public string SummaryLine =>
        $"{Name}  ({(string.IsNullOrWhiteSpace(ParameterSize) ? "local" : ParameterSize)} · {SizeFormatted})";
}

public sealed class PrivateLlmConfig
{
    public string OllamaBaseUrl { get; set; } = "http://127.0.0.1:11434";
    public string SelectedModel { get; set; } = string.Empty;
    public string SystemInstruction { get; set; } =
        "You are a private, local Windows personal assistant running on Ollama. Be concise, accurate, and practical.";
    public int ContextWindow { get; set; } = 32768;
    public int MaxOutputTokens { get; set; } = 2000;
    public double Temperature { get; set; } = 0.2;
    public string KeepAlive { get; set; } = "10m";
    public int MaxHistoryTurns { get; set; } = 16;
}

public sealed class PublicAdapterConfig
{
    public string Model { get; set; } = string.Empty;
    public string EndpointUrl { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string SystemInstruction { get; set; } = string.Empty;
    public int MaxTokens { get; set; } = 2048;
}

public sealed class PublicLlmConfig
{
    public string ActiveAdapter { get; set; } = "gemini"; // "gemini" | "claude" | "fable"

    public PublicAdapterConfig Gemini { get; set; } = new()
    {
        Model = "gemini-2.5-pro",
        EndpointUrl = "https://generativelanguage.googleapis.com/v1beta",
        SystemInstruction = "You are a helpful personal assistant responding through the Public Gemini Pro Adapter."
    };

    public PublicAdapterConfig Claude { get; set; } = new()
    {
        Model = "claude-sonnet-4-20250514",
        EndpointUrl = "https://api.anthropic.com/v1/messages",
        SystemInstruction = "You are a helpful personal assistant responding through the Public Claude Adapter."
    };

    public PublicAdapterConfig Fable { get; set; } = new()
    {
        Model = "fable-1-pro",
        EndpointUrl = "https://api.fable.ai/v1/chat/completions",
        SystemInstruction = "You are a helpful personal assistant responding through the Public Fable Adapter."
    };
}

public sealed class UserProfileConfig
{
    public string DisplayName { get; set; } = Environment.UserName;
    public string AvatarPath { get; set; } = string.Empty;
}

public sealed class VoiceConfig
{
    public bool AutoSpeakPublic { get; set; }
    public bool AutoSpeakPrivate { get; set; }
    public string SelectedVoiceId { get; set; } = string.Empty;
}

public sealed class NotificationConfig
{
    public bool SoundOnReply { get; set; } = true;
    public bool DesktopNotificationOnReply { get; set; } = true;
}

public sealed class WorkbenchConfig
{
    public AppThemeMode Theme { get; set; } = AppThemeMode.ArcticSky;
    public AppFontFamily FontFamily { get; set; } = AppFontFamily.SegoeUI;
    public AppChatFontSize ChatFontSize { get; set; } = AppChatFontSize.Small;
    public bool UsePublicLlmOverride { get; set; }
    public ConversationScope ActiveScope { get; set; } = ConversationScope.Private;

    [JsonIgnore]
    public ConversationScope EffectiveScope =>
        UsePublicLlmOverride ? ConversationScope.Public : ConversationScope.Private;

    public UserProfileConfig UserProfile { get; set; } = new();
    public PrivateLlmConfig PrivateLlm { get; set; } = new();
    public PublicLlmConfig PublicLlm { get; set; } = new();
    public VoiceConfig Voice { get; set; } = new();
    public NotificationConfig Notifications { get; set; } = new();
    public ContextCacheConfig ContextCache { get; set; } = new();
    public int RequestTimeoutSeconds { get; set; } = 0; // 0 = No timeout (Unlimited / Full Throttle)
}

public sealed class ContextCacheConfig
{
    public string PrivateText { get; set; } = string.Empty;
    public string PublicText { get; set; } = string.Empty;

    public string GetText(ConversationScope scope) =>
        scope == ConversationScope.Private ? PrivateText : PublicText;

    public void SetText(ConversationScope scope, string text)
    {
        if (scope == ConversationScope.Private)
        {
            PrivateText = text;
        }
        else
        {
            PublicText = text;
        }
    }
}

public static class TokenEstimate
{
    public static int Count(string? text) =>
        string.IsNullOrEmpty(text) ? 0 : (int)Math.Ceiling(text.Length / 4d);
}

public sealed class LlmContextLogEntry
{
    public string TimestampText { get; init; } = DateTime.Now.ToString("HH:mm:ss");
    public string Level { get; init; } = "info"; // "info" | "success" | "error"
    public string Message { get; init; } = string.Empty;

    public Brush IndicatorBrush => Level switch
    {
        "error" => new SolidColorBrush(ColorHelper.FromArgb(255, 220, 38, 38)),
        "success" => new SolidColorBrush(ColorHelper.FromArgb(255, 16, 185, 129)),
        _ => new SolidColorBrush(ColorHelper.FromArgb(255, 14, 165, 233))
    };

    public string FormattedLine => $"[{TimestampText}] {Message}";
}

public sealed class LlmContextTelemetry
{
    public string Phase { get; set; } = "Idle"; // "Idle" | "Thinking" | "Ready" | "Error"
    public bool IsThinking { get; set; }
    public DateTimeOffset? ThinkingStartedAt { get; set; }
    public int PromptChars { get; set; }
    public int HistoryTurnsUsed { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public int? TotalTokens =>
        InputTokens.HasValue || OutputTokens.HasValue
            ? (InputTokens ?? 0) + (OutputTokens ?? 0)
            : null;
    public double? TokensPerSecond { get; set; }
    public long? DurationMs { get; set; }
    public string LastError { get; set; } = string.Empty;
}
