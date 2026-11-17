using Windows.Storage;
using Windows.System;

namespace FluentAssistantWorkbench.Services;

public static class WindowsUserProfileService
{
    public static async Task<(string DisplayName, string AvatarPath)> DetectLoggedInUserAsync()
    {
        string displayName = Environment.UserName;
        string avatarPath = string.Empty;

        try
        {
            var users = await User.FindAllAsync();
            var activeUser = users.FirstOrDefault(u => u.AuthenticationStatus == UserAuthenticationStatus.LocallyAuthenticated)
                             ?? users.FirstOrDefault();

            if (activeUser is not null)
            {
                var nameObj = await activeUser.GetPropertyAsync(KnownUserProperties.DisplayName);
                if (nameObj is string s && !string.IsNullOrWhiteSpace(s))
                {
                    displayName = s.Trim();
                }

                var pictureStreamRef = await activeUser.GetPictureAsync(UserPictureSize.Size208x208);
                if (pictureStreamRef is not null)
                {
                    var localDir = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "FluentAssistantWorkbench");
                    Directory.CreateDirectory(localDir);
                    var destPath = Path.Combine(localDir, "windows-account-avatar.png");

                    using var winStream = await pictureStreamRef.OpenReadAsync();
                    using var netStream = winStream.AsStreamForRead();
                    using var fileStream = File.Create(destPath);
                    await netStream.CopyToAsync(fileStream);
                    avatarPath = destPath;
                }
            }
        }
        catch
        {
            // Fall back to Environment.UserName and Windows AccountPictures folder
        }

        if (string.IsNullOrWhiteSpace(avatarPath))
        {
            avatarPath = TryFindLocalAccountPictureFile();
        }

        return (displayName, avatarPath);
    }

    public static string TryFindLocalAccountPictureFile()
    {
        try
        {
            var candidateDirs = new[]
            {
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                    "Microsoft", "Windows", "AccountPictures"),
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    "Microsoft", "User Account Pictures"),
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonDocuments),
                    "..", "AccountPictures")
            };

            foreach (var dir in candidateDirs)
            {
                var fullDir = Path.GetFullPath(dir);
                if (!Directory.Exists(fullDir)) continue;

                var latest = new DirectoryInfo(fullDir)
                    .GetFiles("*.*", SearchOption.AllDirectories)
                    .Where(f => (f.Extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
                              || f.Extension.Equals(".png", StringComparison.OrdinalIgnoreCase))
                              && !f.Name.Equals("guest.png", StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(f => f.Length)
                    .ThenByDescending(f => f.LastWriteTimeUtc)
                    .FirstOrDefault();

                if (latest is not null) return latest.FullName;
            }
        }
        catch
        {
            // Ignore access errors
        }

        return string.Empty;
    }

    public static string SaveCustomAvatarCopy(string sourceFilePath)
    {
        var localDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FluentAssistantWorkbench");
        Directory.CreateDirectory(localDir);

        var ext = Path.GetExtension(sourceFilePath);
        if (string.IsNullOrWhiteSpace(ext)) ext = ".png";

        var destPath = Path.Combine(localDir, $"user-avatar{ext}");
        File.Copy(sourceFilePath, destPath, overwrite: true);
        return destPath;
    }
}
