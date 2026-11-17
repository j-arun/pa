param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\PersonalAssistant",
    [switch]$EnableStartup = $true
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectPath = Join-Path $RepoRoot "FluentAssistantWorkbench\FluentAssistantWorkbench.csproj"

# Stop running tray instance if active so executables/DLLs can be replaced cleanly
Get-Process -Name "FluentAssistantWorkbench" -ErrorAction SilentlyContinue | Stop-Process -Force

function Find-VisualStudioMsBuild {
    $vsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $found = & $vsWhere -latest -prerelease -products * -requires Microsoft.Component.MSBuild -find "MSBuild\Current\Bin\MSBuild.exe" | Select-Object -First 1
        if ($found -and (Test-Path $found)) {
            return $found
        }
        $foundAny = & $vsWhere -latest -prerelease -products * -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" | Select-Object -First 1
        if ($foundAny -and (Test-Path $foundAny)) {
            return $foundAny
        }
    }

    $candidates = @(
        "$env:ProgramFiles\Microsoft Visual Studio\18\Preview\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\18\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\18\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
        "$env:ProgramFiles\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    return $null
}

$MsBuildPath = Find-VisualStudioMsBuild
$PublishDirArg = ($InstallDir.TrimEnd('\') + "/")

if ($MsBuildPath) {
    Write-Host "Using Visual Studio MSBuild: $MsBuildPath" -ForegroundColor DarkGray
    Write-Host "Restoring NuGet packages (win-x64)..." -ForegroundColor Cyan
    & $MsBuildPath $ProjectPath `
        -t:Restore `
        -p:Configuration=Release `
        -p:Platform=x64 `
        -p:RuntimeIdentifier=win-x64 `
        -v:minimal
    if ($LASTEXITCODE -ne 0) {
        throw "MSBuild Restore failed with exit code $LASTEXITCODE"
    }

    Write-Host "Publishing Personal Assistant (Release, self-contained win-x64)..." -ForegroundColor Cyan
    & $MsBuildPath $ProjectPath `
        -t:Publish `
        -p:Configuration=Release `
        -p:Platform=x64 `
        -p:RuntimeIdentifier=win-x64 `
        -p:SelfContained=true `
        -p:WindowsAppSDKSelfContained=true `
        "-p:PublishDir=$PublishDirArg" `
        -m `
        -v:minimal
    if ($LASTEXITCODE -ne 0) {
        throw "MSBuild Publish failed with exit code $LASTEXITCODE"
    }
}
else {
    Write-Host "Visual Studio MSBuild not found; falling back to dotnet publish..." -ForegroundColor Yellow
    dotnet publish $ProjectPath `
        -c Release `
        -p:Platform=x64 `
        -r win-x64 `
        --self-contained true `
        -o $InstallDir
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed with exit code $LASTEXITCODE"
    }
}

$ExePath = Join-Path $InstallDir "FluentAssistantWorkbench.exe"
$IconPath = Join-Path $InstallDir "Assets\PersonalAssistant.ico"

if (-not (Test-Path $ExePath)) {
    throw "Publish completed but executable was not found at $ExePath"
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
