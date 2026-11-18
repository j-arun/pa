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
            var config = JsonSerializer.Deserialize<WorkbenchConfig>(json, JsonOptions) ?? new WorkbenchConfig();
            if (config.PrivateLlm.ContextWindow == 8192)
            {
                config.PrivateLlm.ContextWindow = 32768;
                SaveConfig(config);
            }

            return config;
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

    public (int FilesRemoved, long BytesFreed) ClearCache()
    {
        int removed = 0;
        long bytes = 0;

        try
        {
            if (!Directory.Exists(StorageDirectory))
            {
                return (0, 0);
            }

            foreach (var file in Directory.EnumerateFiles(StorageDirectory))
            {
                if (string.Equals(file, ConfigFilePath, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                try
                {
                    var info = new FileInfo(file);
                    long len = info.Exists ? info.Length : 0;
                    File.Delete(file);
                    removed++;
                    bytes += len;
                }
                catch
                {
                    // Skip locked files
                }
            }
        }
        catch
        {
            // Ignore directory enumeration failures
        }

        return (removed, bytes);
    }
}
