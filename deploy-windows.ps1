param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\PersonalAssistant",
    [switch]$EnableStartup = $true
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectPath = Join-Path $RepoRoot "FluentAssistantWorkbench\FluentAssistantWorkbench.csproj"

Write-Host "Publishing Personal Assistant (Release, self-contained win-x64)..." -ForegroundColor Cyan
dotnet publish $ProjectPath `
    -c Release `
    -p:Platform=x64 `
    -r win-x64 `
    --self-contained true `
    -o $InstallDir

$ExePath = Join-Path $InstallDir "FluentAssistantWorkbench.exe"
$IconPath = Join-Path $InstallDir "Assets\PersonalAssistant.ico"

if (-not (Test-Path $ExePath)) {
    throw "Publish succeeded but executable was not found at $ExePath"
}

$WshShell = New-Object -ComObject WScript.Shell

# 1. Start Menu Shortcut (lets you search "Personal Assistant" and Pin to Taskbar)
$StartMenuShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Personal Assistant.lnk"
$Shortcut = $WshShell.CreateShortcut($StartMenuShortcut)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.IconLocation = "$IconPath,0"
$Shortcut.Description = "Personal Assistant (Private Ollama & Public LLM)"
$Shortcut.Save()
Write-Host "Created Start Menu shortcut: $StartMenuShortcut" -ForegroundColor Green

# 2. Desktop Shortcut
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Personal Assistant.lnk"
$DShortcut = $WshShell.CreateShortcut($DesktopShortcut)
$DShortcut.TargetPath = $ExePath
$DShortcut.WorkingDirectory = $InstallDir
$DShortcut.IconLocation = "$IconPath,0"
$DShortcut.Description = "Personal Assistant"
$DShortcut.Save()
Write-Host "Created Desktop shortcut: $DesktopShortcut" -ForegroundColor Green

# 3. Optional Windows Startup entry (launches directly into the Windows System Tray)
if ($EnableStartup) {
    $StartupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Personal Assistant.lnk"
    $SShortcut = $WshShell.CreateShortcut($StartupShortcut)
    $SShortcut.TargetPath = $ExePath
    $SShortcut.Arguments = "--tray"
    $SShortcut.WorkingDirectory = $InstallDir
    $SShortcut.IconLocation = "$IconPath,0"
    $SShortcut.Description = "Personal Assistant (System Tray)"
    $SShortcut.Save()
    Write-Host "Added Windows Startup tray shortcut: $StartupShortcut" -ForegroundColor Green
}

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Cyan
Write-Host " - Open Start Menu, search 'Personal Assistant', right-click -> 'Pin to taskbar' to keep it on your Windows taskbar."
Write-Host " - Look in the bottom-right Windows system tray (near the clock) to click and invoke Personal Assistant anytime."
