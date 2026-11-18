using FluentAssistantWorkbench.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.Storage;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace FluentAssistantWorkbench.Views;

public sealed partial class ContextCachePage : Page
{
    private bool _isRefreshing;

    public ContextCachePage()
    {
        InitializeComponent();
        Loaded += ContextCachePage_Loaded;
        Unloaded += ContextCachePage_Unloaded;
    }

    private ConversationScope ActiveScope => App.Coordinator.Config.EffectiveScope;

    private int? ActiveContextWindow =>
        ActiveScope == ConversationScope.Private
            ? App.Coordinator.Config.PrivateLlm.ContextWindow
            : null;

    private string ActiveSystemInstruction
    {
        get
        {
            var config = App.Coordinator.Config;
            if (ActiveScope == ConversationScope.Private)
            {
                return config.PrivateLlm.SystemInstruction;
            }

            return config.PublicLlm.ActiveAdapter switch
            {
                "claude" => config.PublicLlm.Claude.SystemInstruction,
                "fable" => config.PublicLlm.Fable.SystemInstruction,
                _ => config.PublicLlm.Gemini.SystemInstruction
            };
        }
    }

    private void ContextCachePage_Loaded(object sender, RoutedEventArgs e)
    {
        App.Coordinator.ConfigChanged += Coordinator_ConfigChanged;
        RefreshFromConfig();
    }

    private void ContextCachePage_Unloaded(object sender, RoutedEventArgs e)
    {
        App.Coordinator.ConfigChanged -= Coordinator_ConfigChanged;
    }

    private void Coordinator_ConfigChanged(object? sender, EventArgs e)
    {
        DispatcherQueue.TryEnqueue(RefreshFromConfig);
    }

    private void RefreshFromConfig()
    {
        _isRefreshing = true;
        try
        {
            CacheTextBox.Text = App.Coordinator.GetContextCacheText(ActiveScope);
            CacheTargetText.Text = GetTargetLabel();
            ContextWindowText.Text = ActiveContextWindow.HasValue
                ? $"{ActiveContextWindow.Value:N0} tokens"
                : "Provider-defined";
            UpdateCacheEstimates();
        }
        finally
        {
            _isRefreshing = false;
        }
    }

    private string GetTargetLabel()
    {
        var config = App.Coordinator.Config;
        if (ActiveScope == ConversationScope.Private)
        {
            return $"Private · Windows Ollama · {config.PrivateLlm.SelectedModel}";
        }

        var adapter = config.PublicLlm.ActiveAdapter;
        var model = adapter switch
        {
            "claude" => config.PublicLlm.Claude.Model,
            "fable" => config.PublicLlm.Fable.Model,
            _ => config.PublicLlm.Gemini.Model
        };
        return $"Public · {adapter} · {model}";
    }

    private void UpdateCacheEstimates()
    {
        var draftText = CacheTextBox.Text ?? string.Empty;
        var draftTokens = TokenEstimate.Count(draftText);
        var cachedTokens = TokenEstimate.Count(App.Coordinator.GetContextCacheText(ActiveScope));
        var estimatedContextTokens = EstimateContextTokens(draftText);
        AppliedCacheEstimateText.Text = $"{cachedTokens:N0} tokens";
        DraftCacheEstimateText.Text = $"{draftTokens:N0} tokens";
        CacheCharacterCountText.Text = $"{draftText.Length:N0} characters · approximate token count";

        var contextWindow = ActiveContextWindow;
        RemainingContextEstimateText.Text = contextWindow is int limit
            ? FormatRemainingTokens(limit, estimatedContextTokens)
            : "Provider-defined";
        var exceedsWindow = contextWindow is int window && estimatedContextTokens > window;
        ApplyContextButton.IsEnabled = !string.IsNullOrWhiteSpace(draftText) && !exceedsWindow;
        ClearCacheButton.IsEnabled =
            !string.IsNullOrEmpty(draftText) || !string.IsNullOrEmpty(App.Coordinator.GetContextCacheText(ActiveScope));

        if (exceedsWindow)
        {
            ShowFeedback(
                InfoBarSeverity.Warning,
                "Text is larger than the context window",
                "The draft, system instruction, and recent conversation exceed the configured context window.");
        }
        else if (!_isRefreshing)
        {
            CacheInfoBar.IsOpen = false;
        }
    }

    private int EstimateContextTokens(string referenceText)
    {
        var config = App.Coordinator.Config;
        var recentHistory = App.Coordinator.Turns
            .Where(turn => turn.Scope == ActiveScope && (turn.IsUser || turn.IsAssistant))
            .TakeLast(Math.Clamp(config.PrivateLlm.MaxHistoryTurns, 2, 32))
            .Select(turn => turn.Content);
        return TokenEstimate.Count(string.Join(
            "\n",
            new[] { ActiveSystemInstruction, referenceText }.Concat(recentHistory)));
    }

    private static string FormatRemainingTokens(int limit, int used)
    {
        var remaining = limit - used;
        return remaining >= 0
            ? $"{remaining:N0} tokens"
            : $"Over by {-remaining:N0}";
    }

    private void CacheTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        UpdateCacheEstimates();
    }

    private async void OpenTextFile_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var picker = new FileOpenPicker
            {
                SuggestedStartLocation = PickerLocationId.DocumentsLibrary
            };
            foreach (var extension in new[] { ".txt", ".md", ".csv", ".json", ".log" })
            {
                picker.FileTypeFilter.Add(extension);
            }

            if (MainWindow.CurrentWindow is not null)
            {
                var hwnd = WindowNative.GetWindowHandle(MainWindow.CurrentWindow);
                InitializeWithWindow.Initialize(picker, hwnd);
            }

            var file = await picker.PickSingleFileAsync();
            if (file is null) return;

            CacheTextBox.Text = await FileIO.ReadTextAsync(file);
            if (ActiveContextWindow is int limit && EstimateContextTokens(CacheTextBox.Text) > limit)
            {
                ShowFeedback(
                    InfoBarSeverity.Warning,
                    "Text loaded but exceeds the context window",
                    $"{file.Name} was loaded. The draft, system instruction, and recent conversation exceed the configured window.");
            }
            else
            {
                ShowFeedback(InfoBarSeverity.Informational, "Text loaded", $"{file.Name} is ready to apply.");
            }
        }
        catch (Exception ex)
        {
            ShowFeedback(InfoBarSeverity.Error, "Could not read text file", ex.Message);
        }
    }

    private void ApplyContext_Click(object sender, RoutedEventArgs e)
    {
        var text = CacheTextBox.Text ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text))
        {
            ShowFeedback(InfoBarSeverity.Warning, "No text to apply", "Paste or upload text first.");
            return;
        }

        var estimatedContextTokens = EstimateContextTokens(text);
        if (ActiveContextWindow is int limit && estimatedContextTokens > limit)
        {
            ShowFeedback(
                InfoBarSeverity.Warning,
                "Text is larger than the context window",
                "The draft, system instruction, and recent conversation exceed the configured window.");
            return;
        }

        try
        {
            App.Coordinator.SetContextCacheText(ActiveScope, text);
            UpdateCacheEstimates();
            ShowFeedback(
                InfoBarSeverity.Success,
                "Reference context saved",
                $"{TokenEstimate.Count(text):N0} estimated tokens saved locally. It will be included with each future prompt; no model request is sent until you chat.");
        }
        catch (Exception ex)
        {
            ShowFeedback(InfoBarSeverity.Error, "Could not save context", ex.Message);
        }
    }

    private void ClearContext_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            App.Coordinator.SetContextCacheText(ActiveScope, string.Empty);
            CacheTextBox.Text = string.Empty;
            ShowFeedback(InfoBarSeverity.Success, "Context cleared", "The applied reference text was removed for this connection.");
        }
        catch (Exception ex)
        {
            ShowFeedback(InfoBarSeverity.Error, "Could not clear context", ex.Message);
        }
    }

    private void ShowFeedback(InfoBarSeverity severity, string title, string message)
    {
        CacheInfoBar.Severity = severity;
        CacheInfoBar.Title = title;
        CacheInfoBar.Message = message;
        CacheInfoBar.IsOpen = true;
    }
}
