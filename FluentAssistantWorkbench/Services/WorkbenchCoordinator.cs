using System.Collections.ObjectModel;
using FluentAssistantWorkbench.Adapters;
using FluentAssistantWorkbench.Contracts;
using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Services;

public sealed class WorkbenchCoordinator
{
    public LocalConfigStore ConfigStore { get; } = new();
    public AdapterRegistry Adapters { get; } = new();
    public WindowsSpeechService Speech { get; } = new();

    public WorkbenchConfig Config { get; private set; }
    public ObservableCollection<ConversationTurn> Turns { get; } = [];
    public ObservableCollection<ConversationExchange> Exchanges { get; } = [];
    public ObservableCollection<LlmContextLogEntry> ContextLogs { get; } = [];
    public LlmContextTelemetry Telemetry { get; } = new();
    public bool IsMuted { get; set; }

    public event EventHandler? ConfigChanged;
    public event EventHandler? ContextTelemetryChanged;
    public event EventHandler<LlmResponseNotificationEventArgs>? ResponseArrived;

    public WorkbenchCoordinator()
    {
        Config = ConfigStore.LoadConfig();
        foreach (var turn in ConfigStore.LoadHistory())
        {
            Turns.Add(turn);
        }
        RebuildExchangesFromTurns();
    }

    private void RebuildExchangesFromTurns()
    {
        Exchanges.Clear();
        ConversationExchange? current = null;

        foreach (var turn in Turns)
        {
            if (turn.IsUser || current is null)
            {
                current = new ConversationExchange
                {
                    Id = turn.Id,
                    QuestionContent = turn.IsUser ? turn.Content : string.Empty,
                    QuestionTimestamp = turn.Timestamp,
                    Scope = turn.Scope
                };
                current.ApplyAppearance(Config.Theme, Config.FontFamily);
                if (!turn.IsUser)
                {
                    current.SetReply(turn.Content, turn.Timestamp, turn.IsError);
                }
                Exchanges.Add(current);
            }
            else
            {
                current.SetReply(turn.Content, turn.Timestamp, turn.IsError);
                current = null;
            }
        }
    }

    public void RefreshExchangesAppearance()
    {
        foreach (var ex in Exchanges)
        {
            ex.ApplyAppearance(Config.Theme, Config.FontFamily);
        }
    }

    public async Task InitializeProfileAsync()
    {
        bool needsName = string.IsNullOrWhiteSpace(Config.UserProfile.DisplayName);
        bool needsAvatar = string.IsNullOrWhiteSpace(Config.UserProfile.AvatarPath)
                           || !File.Exists(Config.UserProfile.AvatarPath);

        if (!needsName && !needsAvatar) return;

        var (detectedName, detectedAvatar) = await WindowsUserProfileService.DetectLoggedInUserAsync();
        bool changed = false;

        if (needsName && !string.IsNullOrWhiteSpace(detectedName))
        {
            Config.UserProfile.DisplayName = detectedName;
            changed = true;
        }
        if (needsAvatar && !string.IsNullOrWhiteSpace(detectedAvatar))
        {
            Config.UserProfile.AvatarPath = detectedAvatar;
            changed = true;
        }

        if (changed)
        {
            SaveConfig();
        }
    }

    public void ReloadConfig()
    {
        Config = ConfigStore.LoadConfig();
        RefreshExchangesAppearance();
        ConfigChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SaveConfig()
    {
        ConfigStore.SaveConfig(Config);
        RefreshExchangesAppearance();
        ConfigChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SetScope(ConversationScope scope)
    {
        var usePublicOverride = scope == ConversationScope.Public;
        if (Config.UsePublicLlmOverride == usePublicOverride && Config.ActiveScope == scope) return;
        Config.UsePublicLlmOverride = usePublicOverride;
        Config.ActiveScope = scope;
        SaveConfig();
    }

    private void AddContextLog(string level, string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;
        ContextLogs.Insert(0, new LlmContextLogEntry
        {
            TimestampText = DateTime.Now.ToString("HH:mm:ss"),
            Level = level,
            Message = message
        });
        while (ContextLogs.Count > 12)
        {
            ContextLogs.RemoveAt(ContextLogs.Count - 1);
        }
        ContextTelemetryChanged?.Invoke(this, EventArgs.Empty);
    }

    public void ClearHistory()
    {
        Turns.Clear();
        Exchanges.Clear();
        ConfigStore.SaveHistory(Turns);
        Telemetry.Phase = "Idle";
        Telemetry.IsThinking = false;
        Telemetry.LastError = string.Empty;
        AddContextLog("info", "Session context cleared (0 history turns).");
    }

    public string ClearAppCache()
    {
        Turns.Clear();
        Exchanges.Clear();
        NotificationSoundService.ClearCachedAudioFiles();
        var (filesRemoved, bytesFreed) = ConfigStore.ClearCache();
        GC.Collect(2, GCCollectionMode.Aggressive, blocking: true, compacting: true);
        GC.WaitForPendingFinalizers();
        var kb = bytesFreed > 0 ? Math.Max(1, bytesFreed / 1024) : 0;
        var msg = filesRemoved > 0
            ? $"Cleared app cache ({filesRemoved} file(s), ~{kb} KB) and compacted memory."
            : "Cleared in-memory conversation cache and compacted app memory.";
        Telemetry.LastError = string.Empty;
        AddContextLog("info", "App cache cleared & context history reset.");
        return msg;
    }

    public async Task<string> RelievePrivateLlmAsync(CancellationToken ct = default)
    {
        var (_, summary) = await Adapters.Ollama.UnloadModelsAsync(
            Config.PrivateLlm.OllamaBaseUrl,
            Config.PrivateLlm.SelectedModel,
            ct);
        GC.Collect(2, GCCollectionMode.Aggressive, blocking: false, compacting: true);
        AddContextLog("info", summary);
        return summary;
    }

    public async Task<ConversationTurn> SendMessageAsync(
        string message,
        string inputMode,
        CancellationToken ct = default)
    {
        var activeScope = Config.EffectiveScope;
        var adapter = Adapters.Resolve(Config);
        var model = activeScope == ConversationScope.Private
            ? Config.PrivateLlm.SelectedModel
            : Config.PublicLlm.ActiveAdapter switch
            {
                "claude" => Config.PublicLlm.Claude.Model,
                "fable" => Config.PublicLlm.Fable.Model,
                _ => Config.PublicLlm.Gemini.Model
            };

        var trimmedMessage = message.Trim();
        var userTurn = new ConversationTurn
        {
            Role = "user",
            Content = trimmedMessage,
            InputMode = inputMode,
            Scope = activeScope,
            AdapterId = adapter.AdapterId,
            Model = model
        };

        var exchange = new ConversationExchange
        {
            Id = userTurn.Id,
            QuestionContent = trimmedMessage,
            QuestionTimestamp = userTurn.Timestamp,
            Scope = activeScope,
            IsWaitingReply = true
        };
        exchange.ApplyAppearance(Config.Theme, Config.FontFamily);

        var maxHistory = Math.Clamp(Config.PrivateLlm.MaxHistoryTurns, 2, 32);
        var history = Turns
            .Where(t => t.IsUser || t.IsAssistant)
            .TakeLast(maxHistory)
            .Select(t => (t.Role, t.Content))
            .ToList();

        int promptChars = trimmedMessage.Length + history.Sum(h => h.Content.Length);
        Turns.Add(userTurn);
        Exchanges.Add(exchange);
        ConfigStore.SaveHistory(Turns);

        Telemetry.Phase = "Thinking";
        Telemetry.IsThinking = true;
        Telemetry.ThinkingStartedAt = DateTimeOffset.UtcNow;
        Telemetry.PromptChars = promptChars;
        Telemetry.HistoryTurnsUsed = history.Count;
        Telemetry.LastError = string.Empty;
        Telemetry.InputTokens = null;
        Telemetry.OutputTokens = null;
        Telemetry.TokensPerSecond = null;
        Telemetry.DurationMs = null;

        var timeoutSec = Config.RequestTimeoutSeconds;
        var timeoutLabel = timeoutSec > 0 ? $"{timeoutSec}s" : "Unlimited";
        var modelDisplay = string.IsNullOrWhiteSpace(model) ? adapter.AdapterId : model;
        AddContextLog("info", $"Prompt sent · {promptChars:N0} chars · {history.Count} turns · {modelDisplay} · timeout: {timeoutLabel}");

        using var timeoutCts = timeoutSec > 0
            ? CancellationTokenSource.CreateLinkedTokenSource(ct)
            : null;
        if (timeoutCts is not null)
        {
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(timeoutSec));
        }
        var effectiveCt = timeoutCts?.Token ?? ct;

        try
        {
            var reply = await adapter.SendMessageAsync(
                new LlmChatRequest(trimmedMessage, history, Config),
                effectiveCt);

            var assistantTurn = new ConversationTurn
            {
                Role = "assistant",
                Content = reply.Text,
                Scope = reply.Scope,
                AdapterId = reply.AdapterId,
                Model = reply.Model,
                DurationMs = reply.DurationMs
            };

            Turns.Add(assistantTurn);
            exchange.SetReply(assistantTurn.Content, assistantTurn.Timestamp, isError: false);
            ConfigStore.SaveHistory(Turns);

            Telemetry.Phase = "Ready";
            Telemetry.IsThinking = false;
            Telemetry.ThinkingStartedAt = null;
            Telemetry.InputTokens = reply.InputTokens;
            Telemetry.OutputTokens = reply.OutputTokens;
            Telemetry.TokensPerSecond = reply.TokensPerSecond;
            Telemetry.DurationMs = reply.DurationMs;
            Telemetry.LastError = string.Empty;

            var tokSummary = reply.InputTokens.HasValue || reply.OutputTokens.HasValue
                ? $"{reply.InputTokens?.ToString() ?? "?"} in · {reply.OutputTokens?.ToString() ?? "?"} out"
                : $"{reply.Text.Length:N0} chars";
            var speedSummary = reply.TokensPerSecond.HasValue ? $" · {reply.TokensPerSecond:0.0} tok/s" : string.Empty;
            var durSummary = reply.DurationMs >= 1000 ? $"{reply.DurationMs / 1000.0:0.00}s" : $"{reply.DurationMs}ms";
            AddContextLog("success", $"Reply · {tokSummary}{speedSummary} · {durSummary}");

            if (Config.Notifications.SoundOnReply)
            {
                NotificationSoundService.PlayReplyChime(isError: false);
            }

            ResponseArrived?.Invoke(this, new LlmResponseNotificationEventArgs(
                Scope: assistantTurn.Scope,
                PreviewText: assistantTurn.Content,
                IsError: false));

            var shouldAutoSpeak =
                (assistantTurn.Scope == ConversationScope.Public && Config.Voice.AutoSpeakPublic) ||
                (assistantTurn.Scope == ConversationScope.Private && Config.Voice.AutoSpeakPrivate);

            if (shouldAutoSpeak)
            {
                if (Config.Notifications.SoundOnReply)
                {
                    await Task.Delay(220, ct);
                }
                await Speech.SpeakAsync(assistantTurn.Content, Config.Voice.SelectedVoiceId);
            }

            return assistantTurn;
        }
        catch (OperationCanceledException) when (timeoutCts is not null && timeoutCts.IsCancellationRequested && !ct.IsCancellationRequested)
        {
            var errMsg = $"Configured query timeout of {timeoutSec}s elapsed. Set Request Timeout to 'No Timeout (Unlimited)' in Settings to run full-throttle queries.";
            var errTurn = new ConversationTurn
            {
                Role = "error",
                Content = errMsg,
                Scope = activeScope,
                AdapterId = adapter.AdapterId,
                Model = model
            };
            Turns.Add(errTurn);
            exchange.SetReply(errTurn.Content, errTurn.Timestamp, isError: true);
            ConfigStore.SaveHistory(Turns);

            Telemetry.Phase = "Error";
            Telemetry.IsThinking = false;
            Telemetry.ThinkingStartedAt = null;
            Telemetry.LastError = errMsg;
            AddContextLog("error", $"Error: {errMsg}");

            if (Config.Notifications.SoundOnReply)
            {
                NotificationSoundService.PlayReplyChime(isError: true);
            }

            return errTurn;
        }
        catch (Exception ex)
        {
            var errTurn = new ConversationTurn
            {
                Role = "error",
                Content = ex.Message,
                Scope = activeScope,
                AdapterId = adapter.AdapterId,
                Model = model
            };
            Turns.Add(errTurn);
            exchange.SetReply(errTurn.Content, errTurn.Timestamp, isError: true);
            ConfigStore.SaveHistory(Turns);

            Telemetry.Phase = "Error";
            Telemetry.IsThinking = false;
            Telemetry.DurationMs = Telemetry.ThinkingStartedAt.HasValue
                ? (long)(DateTimeOffset.UtcNow - Telemetry.ThinkingStartedAt.Value).TotalMilliseconds
                : null;
            Telemetry.ThinkingStartedAt = null;
            Telemetry.LastError = ex.Message;
            AddContextLog("error", $"Error · {ex.Message}");

            if (Config.Notifications.SoundOnReply)
            {
                NotificationSoundService.PlayReplyChime(isError: true);
            }

            ResponseArrived?.Invoke(this, new LlmResponseNotificationEventArgs(
                Scope: errTurn.Scope,
                PreviewText: errTurn.Content,
                IsError: true));

            return errTurn;
        }
    }
}

public sealed record LlmResponseNotificationEventArgs(
    ConversationScope Scope,
    string PreviewText,
    bool IsError);
