using FluentAssistantWorkbench.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace FluentAssistantWorkbench.Views;

public sealed partial class PromptBuilderPage : Page
{
    private bool _updatingControls;

    public PromptBuilderPage()
    {
        _updatingControls = true;
        InitializeComponent();
        _updatingControls = false;
        Loaded += (_, _) => SyncTemplateFields();
        SyncTemplateFields();
    }

    private void SyncTemplateFields()
    {
        _updatingControls = true;
        try
        {
            var promptBuilder = App.Coordinator.Config.PromptBuilder;
            DomainTabs.SelectedItem = promptBuilder.ActiveDomain switch
            {
                PromptDomain.Health => HealthTab,
                PromptDomain.Finance => FinanceTab,
                PromptDomain.General => GeneralTab,
                _ => AstrologyTab
            };
            AstrologyActiveCheckBox.IsChecked = promptBuilder.ActiveDomain == PromptDomain.Astrology;
            HealthActiveCheckBox.IsChecked = promptBuilder.ActiveDomain == PromptDomain.Health;
            FinanceActiveCheckBox.IsChecked = promptBuilder.ActiveDomain == PromptDomain.Finance;
            GeneralActiveCheckBox.IsChecked = promptBuilder.ActiveDomain == PromptDomain.General;
            ActiveDomainStatusText.Text = $"Active domain for this session: {promptBuilder.ActiveDomain}";
            FormalTemplateTextBox.Text = promptBuilder.GetTemplate(
                promptBuilder.ActiveDomain,
                PromptStyle.Formal);
            ClassicTemplateTextBox.Text = promptBuilder.GetTemplate(
                promptBuilder.ActiveDomain,
                PromptStyle.Classic);
        }
        finally
        {
            _updatingControls = false;
        }
    }

    private void DomainTabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_updatingControls || DomainTabs.SelectedItem is not TabViewItem selectedTab) return;
        if (!Enum.TryParse(selectedTab.Tag?.ToString(), out PromptDomain domain)) return;

        App.Coordinator.Config.PromptBuilder.ActiveDomain = domain;
        SyncTemplateFields();
        SaveConfigSafely();
    }

    private void DomainCheckBox_Click(object sender, RoutedEventArgs e)
    {
        if (_updatingControls || sender is not CheckBox checkBox) return;
        if (checkBox.IsChecked != true)
        {
            SyncTemplateFields();
            return;
        }
        if (!Enum.TryParse(checkBox.Tag?.ToString(), out PromptDomain domain)) return;

        App.Coordinator.Config.PromptBuilder.ActiveDomain = domain;
        SyncTemplateFields();
        SaveConfigSafely();
    }

    private void TemplateTextBox_TextChanged(object sender, TextChangedEventArgs e)
    {
        if (_updatingControls || sender is not TextBox textBox) return;
        var style = textBox == ClassicTemplateTextBox
            ? PromptStyle.Classic
            : PromptStyle.Formal;
        App.Coordinator.Config.PromptBuilder.SetTemplate(
            App.Coordinator.Config.PromptBuilder.ActiveDomain,
            style,
            textBox.Text);
        SaveConfigSafely();
    }

    private void ResetTemplate_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: string styleName } ||
            !Enum.TryParse(styleName, out PromptStyle style))
        {
            return;
        }

        var domain = App.Coordinator.Config.PromptBuilder.ActiveDomain;
        var defaults = new PromptBuilderConfig();
        App.Coordinator.Config.PromptBuilder.SetTemplate(
            domain,
            style,
            defaults.GetTemplate(domain, style));
        SyncTemplateFields();
        SaveConfigSafely();
    }

    private void SaveButton_Click(object sender, RoutedEventArgs e)
    {
        SaveConfigSafely(showSuccess: true);
    }

    private void SaveConfigSafely(bool showSuccess = false)
    {
        try
        {
            App.Coordinator.SaveConfig();
            if (showSuccess)
            {
                SaveStatusInfoBar.Severity = InfoBarSeverity.Success;
                SaveStatusInfoBar.Title = "Prompt Builder settings saved";
                SaveStatusInfoBar.Message = "Changes have been applied and saved to the application settings file.";
                SaveStatusInfoBar.IsOpen = true;
            }
            else
            {
                SaveStatusInfoBar.IsOpen = false;
            }
        }
        catch (Exception ex)
        {
            SaveStatusInfoBar.Severity = InfoBarSeverity.Error;
            SaveStatusInfoBar.Title = "Unable to save prompt templates";
            SaveStatusInfoBar.Message = ex.Message;
            SaveStatusInfoBar.IsOpen = true;
        }
    }
}
