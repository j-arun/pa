using System.Text.Json.Serialization;
using Microsoft.UI.Xaml;

namespace FluentAssistantWorkbench.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ConversationScope
{
    Private,
    Public
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
        ? $"You · {InputMode} · {Scope} · {Timestamp:t}"
        : IsError
            ? $"Adapter Error · {AdapterId} · {Timestamp:t}"
            : $"{Scope} · {AdapterId} · {Model}{(DurationMs.HasValue ? $" · {DurationMs} ms" : "")} · {Timestamp:t}";
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

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AppThemeMode
{
    System,
    Light,
    Dark
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
    public AppThemeMode Theme { get; set; } = AppThemeMode.System;
    public ConversationScope ActiveScope { get; set; } = ConversationScope.Private;
    public UserProfileConfig UserProfile { get; set; } = new();
    public PrivateLlmConfig PrivateLlm { get; set; } = new();
    public PublicLlmConfig PublicLlm { get; set; } = new();
    public VoiceConfig Voice { get; set; } = new();
}
