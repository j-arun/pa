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
    public bool IsMuted { get; set; }

    public event EventHandler? ConfigChanged;

    public WorkbenchCoordinator()
    {
        Config = ConfigStore.LoadConfig();
        foreach (var turn in ConfigStore.LoadHistory())
        {
            Turns.Add(turn);
        }
    }

    public void ReloadConfig()
    {
        Config = ConfigStore.LoadConfig();
        ConfigChanged?.Invoke(this, EventArgs.Empty);
    }

    public void SaveConfig()
    {
        ConfigStore.SaveConfig(Config);
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

        var userTurn = new ConversationTurn
        {
            Role = "user",
            Content = message.Trim(),
            InputMode = inputMode,
            Scope = Config.ActiveScope,
            AdapterId = adapter.AdapterId,
            Model = model
        };

        var history = Turns
            .Where(t => t.IsUser || t.IsAssistant)
            .TakeLast(16)
            .Select(t => (t.Role, t.Content))
            .ToList();

        Turns.Add(userTurn);
        ConfigStore.SaveHistory(Turns);

        try
        {
            var reply = await adapter.SendMessageAsync(
                new LlmChatRequest(message.Trim(), history, Config),
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
            ConfigStore.SaveHistory(Turns);

            var shouldAutoSpeak =
                (assistantTurn.Scope == ConversationScope.Public && Config.Voice.AutoSpeakPublic) ||
                (assistantTurn.Scope == ConversationScope.Private && Config.Voice.AutoSpeakPrivate);

            if (shouldAutoSpeak)
            {
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
            ConfigStore.SaveHistory(Turns);
            return errTurn;
        }
    }
}
