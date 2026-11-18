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
        var exchangeById = new Dictionary<string, ConversationExchange>();
        ConversationExchange? current = null;

        foreach (var turn in Turns)
        {
            if (turn.IsUser)
            {
                current = new ConversationExchange
                {
                    Id = turn.Id,
                    QuestionContent = turn.Content,
                    QuestionTimestamp = turn.Timestamp,
                    Scope = turn.Scope,
                    PromptDomain = turn.PromptDomain,
                    PromptStyle = turn.PromptStyle,
                    SystemInstruction = turn.SystemInstruction,
                    CachedContext = turn.CachedContext,
                    PrivateSystemInstruction = turn.PrivateSystemInstruction,
                    PublicSystemInstruction = turn.PublicSystemInstruction,
                    PrivateCachedContext = turn.PrivateCachedContext,
                    PublicCachedContext = turn.PublicCachedContext
                };
                current.ApplyAppearance(Config.Theme, Config.FontFamily, Config.ChatFontSize);
                if (turn.ResponseScopes.Distinct().Count() > 1)
                {
                    current.InitializeDualResponse(Config.PrivateLlm.SelectedModel, GetPublicModel());
                }
                Exchanges.Add(current);
                exchangeById[turn.Id] = current;
                continue;
            }

            var exchange = !string.IsNullOrWhiteSpace(turn.ExchangeId)
                && exchangeById.TryGetValue(turn.ExchangeId, out var savedExchange)
                    ? savedExchange
                    : current;
            if (exchange is null)
            {
                exchange = new ConversationExchange
                {
                    Id = turn.Id,
                    QuestionContent = string.Empty,
                    QuestionTimestamp = turn.Timestamp,
                    Scope = turn.Scope
                };
                exchange.ApplyAppearance(Config.Theme, Config.FontFamily, Config.ChatFontSize);
                Exchanges.Add(exchange);
            }

            if (exchange.IsDualResponse)
            {
                exchange.SetDualResponse(turn);
            }
            else if (turn.IsCanceled)
            {
                exchange.SetCanceled(turn.Timestamp, turn.DurationMs);
            }
            else
            {
                exchange.SetReply(
                    turn.Content,
                    turn.Timestamp,
                    turn.IsError,
                    responseDurationMs: turn.DurationMs,
                    promptTokenCount: turn.PromptTokenCount,
                    promptTokenCountIsEstimate: turn.PromptTokenCountIsEstimate,
                    referenceTokenEstimate: turn.ReferenceTokenEstimate,
                    responseTokenCount: turn.ResponseTokenCount,
                    responseTokenCountIsEstimate: turn.ResponseTokenCountIsEstimate,
                    qualifiedModelName: turn.QualifiedModelName);
            }
            if (string.IsNullOrWhiteSpace(turn.ExchangeId)) current = null;
        }

        foreach (var exchange in Exchanges.Where(exchange => exchange.IsDualResponse && exchange.IsWaitingReply))
        {
            exchange.MarkDualResponseInterrupted();
        }
        RefreshThreadNumbers();
    }

    private void RefreshThreadNumbers()
    {
        for (var index = 0; index < Exchanges.Count; index++)
        {
            Exchanges[index].ThreadNumber = index + 1;
        }
    }

    private string GetPublicModel() => Config.PublicLlm.ActiveAdapter switch
    {
        "claude" => Config.PublicLlm.Claude.Model,
        "fable" => Config.PublicLlm.Fable.Model,
        _ => Config.PublicLlm.Gemini.Model
    };

    public void RefreshExchangesAppearance()
    {
        foreach (var ex in Exchanges)
        {
            ex.ApplyAppearance(Config.Theme, Config.FontFamily, Config.ChatFontSize);
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

    public bool DeleteExchange(string exchangeId)
    {
        var exchange = Exchanges.FirstOrDefault(item => item.Id == exchangeId);
        if (exchange is null || exchange.IsWaitingReply) return false;

        foreach (var turn in Turns
                     .Where(turn => turn.Id == exchangeId || turn.ExchangeId == exchangeId)
                     .ToList())
        {
            Turns.Remove(turn);
        }
        Exchanges.Remove(exchange);
        RefreshThreadNumbers();
        ConfigStore.SaveHistory(Turns);
        AddContextLog("info", "Conversation thread deleted from the current session.");
        return true;
    }

    public string GetContextCacheText(ConversationScope scope) =>
        Config.ContextCache?.GetText(scope) ?? string.Empty;

    public void SetContextCacheText(ConversationScope scope, string text)
    {
        Config.ContextCache ??= new ContextCacheConfig();
        Config.ContextCache.SetText(scope, text);
        SaveConfig();
        AddContextLog("success", $"Applied {TokenEstimate.Count(text):N0} estimated reference tokens to {scope}.");
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
        if (Config.EffectiveScope == ConversationScope.Public)
        {
            return await SendDualMessageAsync(message, inputMode, ct);
        }

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
        var cachedContext = GetContextCacheText(activeScope);
        var maxHistory = Math.Clamp(Config.PrivateLlm.MaxHistoryTurns, 2, 32);
        var history = Turns
            .Where(t => t.Scope == activeScope && (t.IsUser || t.IsAssistant))
            .TakeLast(maxHistory)
            .Select(t => (t.Role, t.Content))
            .ToList();
        var systemInstruction = AppendCachedContext(
            GetBaseSystemInstruction(activeScope),
            cachedContext,
            history.Select(turn => turn.Content).Append(trimmedMessage));
        var userTurn = new ConversationTurn
        {
            Role = "user",
            Content = trimmedMessage,
            InputMode = inputMode,
            Scope = activeScope,
            ResponseScopes = [activeScope],
            AdapterId = adapter.AdapterId,
            Model = model,
            PromptDomain = Config.PromptBuilder.ActiveDomain,
            PromptStyle = Config.PromptBuilder.ActiveStyle,
            SystemInstruction = systemInstruction,
            CachedContext = cachedContext
        };

        var exchange = new ConversationExchange
        {
            Id = userTurn.Id,
            QuestionContent = trimmedMessage,
            QuestionTimestamp = userTurn.Timestamp,
            Scope = activeScope,
            PromptDomain = userTurn.PromptDomain,
            PromptStyle = userTurn.PromptStyle,
            SystemInstruction = userTurn.SystemInstruction,
            CachedContext = userTurn.CachedContext,
            IsWaitingReply = true
        };
        exchange.ApplyAppearance(Config.Theme, Config.FontFamily, Config.ChatFontSize);

        var promptText = string.Join(
            "\n",
            new[] { systemInstruction }
                .Concat(history.Select(turn => turn.Content))
                .Append(trimmedMessage));
        var estimatedPromptTokens = TokenEstimate.Count(promptText);
        var referenceTokenEstimate = TokenEstimate.Count(cachedContext);
        int? contextWindowTokenCount = activeScope == ConversationScope.Private
            && Config.PrivateLlm.ContextWindow > 0
                ? Config.PrivateLlm.ContextWindow
                : null;
        int promptChars = trimmedMessage.Length + history.Sum(h => h.Content.Length) + systemInstruction.Length;
        Turns.Add(userTurn);
        Exchanges.Add(exchange);
        exchange.ThreadNumber = Exchanges.Count;
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
        AddContextLog("info", $"Prompt sent · {promptChars:N0} chars · {history.Count} turns · {TokenEstimate.Count(cachedContext):N0} cache tokens est. · {modelDisplay} · timeout: {timeoutLabel}");

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
                new LlmChatRequest(trimmedMessage, history, Config, systemInstruction),
                effectiveCt);
            var promptTokenCount = reply.InputTokens ?? estimatedPromptTokens;
            var promptTokenCountIsEstimate = !reply.InputTokens.HasValue;
            var responseTokenCount = reply.OutputTokens ?? TokenEstimate.Count(reply.Text);
            var responseTokenCountIsEstimate = !reply.OutputTokens.HasValue;

            var assistantTurn = new ConversationTurn
            {
                Role = "assistant",
                Content = reply.Text,
                ExchangeId = userTurn.Id,
                Scope = reply.Scope,
                AdapterId = reply.AdapterId,
                Model = reply.Model,
                DurationMs = reply.DurationMs,
                PromptTokenCount = promptTokenCount,
                PromptTokenCountIsEstimate = promptTokenCountIsEstimate,
                ReferenceTokenEstimate = referenceTokenEstimate,
                ResponseTokenCount = responseTokenCount,
                ResponseTokenCountIsEstimate = responseTokenCountIsEstimate,
                ContextWindowTokenCount = contextWindowTokenCount
            };

            Turns.Add(assistantTurn);
            exchange.SetReply(
                assistantTurn.Content,
                assistantTurn.Timestamp,
                isError: false,
                responseDurationMs: reply.DurationMs,
                promptTokenCount: promptTokenCount,
                promptTokenCountIsEstimate: promptTokenCountIsEstimate,
                referenceTokenEstimate: referenceTokenEstimate,
                responseTokenCount: responseTokenCount,
                responseTokenCountIsEstimate: responseTokenCountIsEstimate,
                qualifiedModelName: assistantTurn.QualifiedModelName);
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
                await Speech.SpeakAsync(
                    assistantTurn.Content,
                    Config.Voice.SelectedVoiceId,
                    exchange.Id);
            }

            return assistantTurn;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            long? durationMs = Telemetry.ThinkingStartedAt.HasValue
                ? (long)(DateTimeOffset.UtcNow - Telemetry.ThinkingStartedAt.Value).TotalMilliseconds
                : null;
            var canceledTurn = new ConversationTurn
            {
                Role = "canceled",
                Content = "Response stopped by user.",
                ExchangeId = userTurn.Id,
                Scope = activeScope,
                AdapterId = adapter.AdapterId,
                Model = model,
                DurationMs = durationMs
            };
            Turns.Add(canceledTurn);
            exchange.SetCanceled(canceledTurn.Timestamp, durationMs);
            ConfigStore.SaveHistory(Turns);

            Telemetry.Phase = "Stopped";
            Telemetry.IsThinking = false;
            Telemetry.DurationMs = durationMs;
            Telemetry.ThinkingStartedAt = null;
            Telemetry.LastError = string.Empty;
            AddContextLog("info", "Response stopped by user.");

            return canceledTurn;
        }
        catch (OperationCanceledException) when (timeoutCts is not null && timeoutCts.IsCancellationRequested)
        {
            var errMsg = $"Configured query timeout of {timeoutSec}s elapsed. Set Request Timeout to 'No Timeout (Unlimited)' in Settings to run full-throttle queries.";
            var errTurn = new ConversationTurn
            {
                Role = "error",
                Content = errMsg,
                ExchangeId = userTurn.Id,
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
                ExchangeId = userTurn.Id,
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

    private async Task<ConversationTurn> SendDualMessageAsync(
        string message,
        string inputMode,
        CancellationToken ct)
    {
        var trimmedMessage = message.Trim();
        var privateAdapter = Adapters.Ollama;
        var publicAdapter = Adapters.Resolve(Config);
        var privateModel = Config.PrivateLlm.SelectedModel;
        var publicModel = GetPublicModel();
        var privateContext = GetContextCacheText(ConversationScope.Private);
        var publicContext = GetContextCacheText(ConversationScope.Public);
        var priorTurns = Turns.ToList();
        var maxHistory = Math.Clamp(Config.PrivateLlm.MaxHistoryTurns, 2, 32);
        var historyForScope = (ConversationScope targetScope) => priorTurns
            .Where(turn => turn.IsUser
                ? (turn.ResponseScopes.Count == 0
                    ? turn.Scope == targetScope
                    : turn.ResponseScopes.Contains(targetScope))
                : turn.IsAssistant && turn.Scope == targetScope)
            .TakeLast(maxHistory)
            .Select(turn => (turn.Role, turn.Content))
            .ToList();
        var privateHistory = historyForScope(ConversationScope.Private);
        var publicHistory = historyForScope(ConversationScope.Public);
        var privateInstruction = AppendCachedContext(
            GetBaseSystemInstruction(ConversationScope.Private),
            privateContext,
            privateHistory.Select(turn => turn.Content).Append(trimmedMessage));
        var publicInstruction = AppendCachedContext(
            GetBaseSystemInstruction(ConversationScope.Public),
            publicContext,
            publicHistory.Select(turn => turn.Content).Append(trimmedMessage));
        var responseScopes = new List<ConversationScope>
        {
            ConversationScope.Private,
            ConversationScope.Public
        };
        var userTurn = new ConversationTurn
        {
            Role = "user",
            Content = trimmedMessage,
            InputMode = inputMode,
            Scope = ConversationScope.Public,
            ResponseScopes = responseScopes,
            AdapterId = publicAdapter.AdapterId,
            Model = publicModel,
            PromptDomain = Config.PromptBuilder.ActiveDomain,
            PromptStyle = Config.PromptBuilder.ActiveStyle,
            PrivateSystemInstruction = privateInstruction,
            PublicSystemInstruction = publicInstruction,
            PrivateCachedContext = privateContext,
            PublicCachedContext = publicContext
        };
        var exchange = new ConversationExchange
        {
            Id = userTurn.Id,
            QuestionContent = trimmedMessage,
            QuestionTimestamp = userTurn.Timestamp,
            Scope = ConversationScope.Public,
            PromptDomain = userTurn.PromptDomain,
            PromptStyle = userTurn.PromptStyle,
            PrivateSystemInstruction = userTurn.PrivateSystemInstruction,
            PublicSystemInstruction = userTurn.PublicSystemInstruction,
            PrivateCachedContext = userTurn.PrivateCachedContext,
            PublicCachedContext = userTurn.PublicCachedContext
        };
        exchange.InitializeDualResponse(privateModel, publicModel);
        exchange.ApplyAppearance(Config.Theme, Config.FontFamily, Config.ChatFontSize);

        var privatePromptTokens = TokenEstimate.Count(string.Join(
            "\n",
            new[] { privateInstruction }
                .Concat(privateHistory.Select(turn => turn.Content))
                .Append(trimmedMessage)));
        var publicPromptTokens = TokenEstimate.Count(string.Join(
            "\n",
            new[] { publicInstruction }
                .Concat(publicHistory.Select(turn => turn.Content))
                .Append(trimmedMessage)));
        var privateReferenceTokens = TokenEstimate.Count(privateContext);
        var publicReferenceTokens = TokenEstimate.Count(publicContext);

        Turns.Add(userTurn);
        Exchanges.Add(exchange);
        exchange.ThreadNumber = Exchanges.Count;
        ConfigStore.SaveHistory(Turns);

        Telemetry.Phase = "Thinking";
        Telemetry.IsThinking = true;
        Telemetry.ThinkingStartedAt = DateTimeOffset.UtcNow;
        Telemetry.PromptChars = trimmedMessage.Length;
        Telemetry.HistoryTurnsUsed = Math.Max(privateHistory.Count, publicHistory.Count);
        Telemetry.LastError = string.Empty;
        Telemetry.InputTokens = null;
        Telemetry.OutputTokens = null;
        Telemetry.TokensPerSecond = null;
        Telemetry.DurationMs = null;

        var timeoutSec = Config.RequestTimeoutSeconds;
        var timeoutLabel = timeoutSec > 0 ? $"{timeoutSec}s" : "Unlimited";
        AddContextLog(
            "info",
            $"Prompt sent to Private Ollama and Public {Config.PublicLlm.ActiveAdapter} · timeout: {timeoutLabel}");

        using var timeoutCts = timeoutSec > 0
            ? CancellationTokenSource.CreateLinkedTokenSource(ct)
            : null;
        timeoutCts?.CancelAfter(TimeSpan.FromSeconds(timeoutSec));
        var effectiveCt = timeoutCts?.Token ?? ct;
        var requestStartedAt = DateTimeOffset.UtcNow;

        async Task<ConversationTurn> RequestOneAsync(
            ConversationScope targetScope,
            ILlmAdapter adapter,
            string targetModel,
            List<(string Role, string Content)> history,
            string systemInstruction,
            int promptTokenCount,
            int referenceTokenEstimate)
        {
            ConversationTurn result;
            try
            {
                if (targetScope == ConversationScope.Private && string.IsNullOrWhiteSpace(targetModel))
                {
                    throw new InvalidOperationException(
                        "Select a private Ollama model in Settings to get the Private response.");
                }

                var contextWindowTokenCount = targetScope == ConversationScope.Private
                    && Config.PrivateLlm.ContextWindow > 0
                        ? Config.PrivateLlm.ContextWindow
                        : (int?)null;
                var reply = await adapter.SendMessageAsync(
                    new LlmChatRequest(trimmedMessage, history, Config, systemInstruction),
                    effectiveCt);
                result = new ConversationTurn
                {
                    Role = "assistant",
                    Content = reply.Text,
                    ExchangeId = userTurn.Id,
                    Scope = targetScope,
                    AdapterId = reply.AdapterId,
                    Model = reply.Model,
                    DurationMs = reply.DurationMs,
                    TokensPerSecond = reply.TokensPerSecond,
                    PromptTokenCount = reply.InputTokens ?? promptTokenCount,
                    PromptTokenCountIsEstimate = !reply.InputTokens.HasValue,
                    ReferenceTokenEstimate = referenceTokenEstimate,
                    ResponseTokenCount = reply.OutputTokens ?? TokenEstimate.Count(reply.Text),
                    ResponseTokenCountIsEstimate = !reply.OutputTokens.HasValue,
                    ContextWindowTokenCount = contextWindowTokenCount
                };
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                result = new ConversationTurn
                {
                    Role = "canceled",
                    Content = "Response stopped by user.",
                    ExchangeId = userTurn.Id,
                    Scope = targetScope,
                    AdapterId = adapter.AdapterId,
                    Model = targetModel
                };
            }
            catch (OperationCanceledException) when (timeoutCts?.IsCancellationRequested == true)
            {
                result = new ConversationTurn
                {
                    Role = "error",
                    Content = $"Configured query timeout of {timeoutSec}s elapsed.",
                    ExchangeId = userTurn.Id,
                    Scope = targetScope,
                    AdapterId = adapter.AdapterId,
                    Model = targetModel
                };
            }
            catch (Exception ex)
            {
                result = new ConversationTurn
                {
                    Role = "error",
                    Content = ex.Message,
                    ExchangeId = userTurn.Id,
                    Scope = targetScope,
                    AdapterId = adapter.AdapterId,
                    Model = targetModel
                };
            }

            Turns.Add(result);
            exchange.SetDualResponse(result);
            ConfigStore.SaveHistory(Turns);
            AddContextLog(
                result.IsError ? "error" : result.IsCanceled ? "info" : "success",
                $"{targetScope} response · {result.Model} · " +
                (result.DurationMs.HasValue
                    ? $"{result.DurationMs.Value / 1000d:0.00}s"
                    : result.IsError ? result.Content : "complete"));
            return result;
        }

        var privateTask = RequestOneAsync(
            ConversationScope.Private,
            privateAdapter,
            privateModel,
            privateHistory,
            privateInstruction,
            privatePromptTokens,
            privateReferenceTokens);
        var publicTask = RequestOneAsync(
            ConversationScope.Public,
            publicAdapter,
            publicModel,
            publicHistory,
            publicInstruction,
            publicPromptTokens,
            publicReferenceTokens);
        var responses = await Task.WhenAll(privateTask, publicTask);
        var privateResponse = responses[0];
        var publicResponse = responses[1];
        var durationMs = (long)(DateTimeOffset.UtcNow - requestStartedAt).TotalMilliseconds;
        var successfulResponses = responses.Where(turn => turn.IsAssistant).ToList();
        var exactInputTokens = successfulResponses
            .Where(turn => turn.PromptTokenCount.HasValue && !turn.PromptTokenCountIsEstimate)
            .Sum(turn => turn.PromptTokenCount!.Value);
        var exactOutputTokens = successfulResponses
            .Where(turn => turn.ResponseTokenCount.HasValue && !turn.ResponseTokenCountIsEstimate)
            .Sum(turn => turn.ResponseTokenCount!.Value);
        Telemetry.Phase = responses.All(turn => !turn.IsError && !turn.IsCanceled) ? "Ready" : "Error";
        Telemetry.IsThinking = false;
        Telemetry.ThinkingStartedAt = null;
        Telemetry.DurationMs = durationMs;
        Telemetry.InputTokens = exactInputTokens > 0 ? exactInputTokens : null;
        Telemetry.OutputTokens = exactOutputTokens > 0 ? exactOutputTokens : null;
        Telemetry.TokensPerSecond = exactOutputTokens > 0 && durationMs > 0
            ? exactOutputTokens / (durationMs / 1000d)
            : null;
        Telemetry.LastError = string.Join(
            Environment.NewLine,
            responses.Where(turn => turn.IsError).Select(turn => $"{turn.Scope}: {turn.Content}"));

        var notificationResponse = publicResponse.IsError && privateResponse.IsAssistant
            ? privateResponse
            : publicResponse;
        if (Config.Notifications.SoundOnReply)
        {
            NotificationSoundService.PlayReplyChime(
                isError: responses.All(turn => turn.IsError || turn.IsCanceled));
        }
        ResponseArrived?.Invoke(this, new LlmResponseNotificationEventArgs(
            Scope: notificationResponse.Scope,
            PreviewText: notificationResponse.Content,
            IsError: notificationResponse.IsError));

        if (publicResponse.IsAssistant && Config.Voice.AutoSpeakPublic)
        {
            if (Config.Notifications.SoundOnReply)
            {
                await Task.Delay(220, ct);
            }
            await Speech.SpeakAsync(
                publicResponse.Content,
                Config.Voice.SelectedVoiceId,
                publicResponse.Id);
        }

        return publicResponse;
    }

    private static string AppendCachedContext(
        string instruction,
        string cachedContext,
        IEnumerable<string> existingContent)
    {
        var context = cachedContext.Trim();
        if (context.Length == 0 ||
            instruction.Contains(context, StringComparison.OrdinalIgnoreCase) ||
            existingContent.Any(content =>
                content.Contains(context, StringComparison.OrdinalIgnoreCase)))
        {
            return instruction;
        }

        return $"{instruction.Trim()}\n\n{context}";
    }

    private string GetBaseSystemInstruction(ConversationScope scope)
    {
        if (scope == ConversationScope.Private)
        {
            return Config.PrivateLlm.SystemInstruction;
        }

        return Config.PublicLlm.ActiveAdapter switch
        {
            "claude" => Config.PublicLlm.Claude.SystemInstruction,
            "fable" => Config.PublicLlm.Fable.SystemInstruction,
            _ => Config.PublicLlm.Gemini.SystemInstruction
        };
    }
}

public sealed record LlmResponseNotificationEventArgs(
    ConversationScope Scope,
    string PreviewText,
    bool IsError);
