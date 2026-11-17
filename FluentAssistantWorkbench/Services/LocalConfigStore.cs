using System.Text.Json;
using FluentAssistantWorkbench.Models;

namespace FluentAssistantWorkbench.Services;

public sealed class LocalConfigStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public string StorageDirectory { get; }
    public string ConfigFilePath { get; }
    public string HistoryFilePath { get; }

    public LocalConfigStore()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        StorageDirectory = Path.Combine(localAppData, "FluentAssistantWorkbench");
        ConfigFilePath = Path.Combine(StorageDirectory, "workbench.config.json");
        HistoryFilePath = Path.Combine(StorageDirectory, "conversation.json");
    }

    public WorkbenchConfig LoadConfig()
    {
        try
        {
            Directory.CreateDirectory(StorageDirectory);
            if (!File.Exists(ConfigFilePath))
            {
                var defaults = new WorkbenchConfig();
                SaveConfig(defaults);
                return defaults;
            }

            var json = File.ReadAllText(ConfigFilePath);
            return JsonSerializer.Deserialize<WorkbenchConfig>(json, JsonOptions) ?? new WorkbenchConfig();
        }
        catch
        {
            return new WorkbenchConfig();
        }
    }

    public void SaveConfig(WorkbenchConfig config)
    {
        Directory.CreateDirectory(StorageDirectory);
        var json = JsonSerializer.Serialize(config, JsonOptions);
        File.WriteAllText(ConfigFilePath, json);
    }

    public List<ConversationTurn> LoadHistory()
    {
        try
        {
            if (!File.Exists(HistoryFilePath)) return [];
            var json = File.ReadAllText(HistoryFilePath);
            return JsonSerializer.Deserialize<List<ConversationTurn>>(json, JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
    }

    public void SaveHistory(IEnumerable<ConversationTurn> turns)
    {
        try
        {
            Directory.CreateDirectory(StorageDirectory);
            var json = JsonSerializer.Serialize(turns, JsonOptions);
            File.WriteAllText(HistoryFilePath, json);
        }
        catch
        {
            // Ignore IO errors when saving local history
        }
    }
}
