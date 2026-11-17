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
    public bool IsMuted { get; set; }

    public event EventHandler? ConfigChanged;
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
        if (Config.ActiveScope == scope) return;
        Config.ActiveScope = scope;
        SaveConfig();
    }

    public void ClearHistory()
    {
        Turns.Clear();
        Exchanges.Clear();
        ConfigStore.SaveHistory(Turns);
    }

    public async Task<ConversationTurn> SendMessageAsync(
        string message,
        string inputMode,
        CancellationToken ct = default)
    {
        var adapter = Adapters.Resolve(Config);
        var model = Config.ActiveScope == ConversationScope.Private
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
            Scope = Config.ActiveScope,
            AdapterId = adapter.AdapterId,
            Model = model
        };

        var exchange = new ConversationExchange
        {
            Id = userTurn.Id,
            QuestionContent = trimmedMessage,
            QuestionTimestamp = userTurn.Timestamp,
            Scope = Config.ActiveScope,
            IsWaitingReply = true
        };
        exchange.ApplyAppearance(Config.Theme, Config.FontFamily);

        var history = Turns
            .Where(t => t.IsUser || t.IsAssistant)
            .TakeLast(16)
            .Select(t => (t.Role, t.Content))
            .ToList();

        Turns.Add(userTurn);
        Exchanges.Add(exchange);
        ConfigStore.SaveHistory(Turns);

        try
        {
            var reply = await adapter.SendMessageAsync(
                new LlmChatRequest(trimmedMessage, history, Config),
                ct);

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
        catch (Exception ex)
        {
            var errTurn = new ConversationTurn
            {
                Role = "error",
                Content = ex.Message,
                Scope = Config.ActiveScope,
                AdapterId = adapter.AdapterId,
                Model = model
            };
            Turns.Add(errTurn);
            exchange.SetReply(errTurn.Content, errTurn.Timestamp, isError: true);
            ConfigStore.SaveHistory(Turns);

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
