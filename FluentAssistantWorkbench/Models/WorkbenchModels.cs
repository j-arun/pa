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
    CascadiaMono
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
    public string Role { get; set; } = "user"; // "user" | "assistant" | "error"
    public string Content { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.Now;
    public string InputMode { get; set; } = "Typed";
    public ConversationScope Scope { get; set; } = ConversationScope.Private;
    public string AdapterId { get; set; } = "ollama";
    public string Model { get; set; } = string.Empty;
    public long? DurationMs { get; set; }

    [JsonIgnore]
    public bool IsUser => string.Equals(Role, "user", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public bool IsAssistant => string.Equals(Role, "assistant", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public bool IsError => string.Equals(Role, "error", StringComparison.OrdinalIgnoreCase);

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
    private bool _isReplyError;
    private bool _isWaitingReply;
    private AppThemeMode _themeMode = AppThemeMode.ArcticSky;
    private AppFontFamily _fontMode = AppFontFamily.SegoeUI;

    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string QuestionContent { get; init; } = string.Empty;
    public DateTimeOffset QuestionTimestamp { get; init; } = DateTimeOffset.Now;
    public ConversationScope Scope { get; init; } = ConversationScope.Private;

    public string QuestionHeaderLabel => $"You · {QuestionTimestamp:t}";

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
            return IsReplyError ? $"Error · {ts:t}" : $"{Scope} · {ts:t}";
        }
    }

    public Visibility WaitingVisibility =>
        IsWaitingReply ? Visibility.Visible : Visibility.Collapsed;

    public Visibility DividerVisibility =>
        IsWaitingReply || !string.IsNullOrWhiteSpace(ReplyContent)
            ? Visibility.Visible
            : Visibility.Collapsed;

    public Visibility ReplyVisibility =>
        !IsReplyError && !string.IsNullOrWhiteSpace(ReplyContent)
            ? Visibility.Visible
            : Visibility.Collapsed;

    public Visibility ErrorVisibility =>
        IsReplyError && !string.IsNullOrWhiteSpace(ReplyContent)
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

    public void ApplyAppearance(AppThemeMode theme, AppFontFamily font)
    {
        _themeMode = theme;
        _fontMode = font;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(QuestionBackgroundBrush)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(QuestionAccentBrush)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(AnswerBackgroundBrush)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(AnswerAccentBrush)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(BubbleFontFamily)));
    }

    public void SetReply(string content, DateTimeOffset timestamp, bool isError)
    {
        _replyTimestamp = timestamp;
        _isWaitingReply = false;
        _isReplyError = isError;
        _replyContent = content;
        NotifyAllReplyProperties();
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    private void NotifyAllReplyProperties([CallerMemberName] string? _ = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyContent)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyHeaderLabel)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsReplyError)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(IsWaitingReply)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(WaitingVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(DividerVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ReplyVisibility)));
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(ErrorVisibility)));
    }
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
    public int ContextWindow { get; set; } = 8192;
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

public sealed class WorkbenchConfig
{
    public AppThemeMode Theme { get; set; } = AppThemeMode.ArcticSky;
    public AppFontFamily FontFamily { get; set; } = AppFontFamily.SegoeUI;
    public ConversationScope ActiveScope { get; set; } = ConversationScope.Private;
    public UserProfileConfig UserProfile { get; set; } = new();
    public PrivateLlmConfig PrivateLlm { get; set; } = new();
    public PublicLlmConfig PublicLlm { get; set; } = new();
    public VoiceConfig Voice { get; set; } = new();
}
