param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\PersonalAssistant",
    [switch]$EnableStartup = $true,
    [switch]$LaunchAfterDeploy = $true
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Join-Path $RepoRoot "FluentAssistantWorkbench"
$ProjectPath = Join-Path $ProjectDir "FluentAssistantWorkbench.csproj"

# Stop any running background/tray instance so files in $InstallDir can be replaced cleanly
Get-Process -Name "FluentAssistantWorkbench" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 350

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
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
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

    # Build first (Visual Studio F5 layout: ensures all .pri, .xbf, WinUI3 native DLLs & Assets are generated cleanly)
    Write-Host "Building Personal Assistant (Release | x64)..." -ForegroundColor Cyan
    & $MsBuildPath $ProjectPath `
        -t:Build `
        -p:Configuration=Release `
        -p:Platform=x64 `
        -p:RuntimeIdentifier=win-x64 `
        -p:SelfContained=true `
        -p:WindowsAppSDKSelfContained=true `
        -m `
        -v:minimal
    if ($LASTEXITCODE -ne 0) {
        throw "MSBuild Build failed with exit code $LASTEXITCODE"
    }

    # Publish self-contained win-x64 into $InstallDir
    Write-Host "Publishing Personal Assistant to $InstallDir..." -ForegroundColor Cyan
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

    # Ensure all WinUI 3 unpacked runtime artifacts (.pri, .xbf, WinAppSDK native files, Assets) from Release bin exist in $InstallDir
    $ReleaseBinDir = Join-Path $ProjectDir "bin\x64\Release\net8.0-windows10.0.19041.0\win-x64"
    if (Test-Path $ReleaseBinDir) {
        Write-Host "Syncing WinUI 3 runtime & XBF/PRI resources..." -ForegroundColor DarkGray
        robocopy $ReleaseBinDir $InstallDir /E /XO /XC /XN /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
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
$PriPath = Join-Path $InstallDir "FluentAssistantWorkbench.pri"

if (-not (Test-Path $ExePath)) {
    throw "Deploy completed but executable was not found at $ExePath"
}
if (-not (Test-Path $PriPath)) {
    Write-Warning "FluentAssistantWorkbench.pri not found in $InstallDir — copying Assets explicitly."
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

# 3. Windows Startup Tray Shortcut
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
Write-Host "Deployment complete! No PC restart is required." -ForegroundColor Cyan

if ($LaunchAfterDeploy) {
    Write-Host "Launching Personal Assistant from $ExePath..." -ForegroundColor Cyan
    Start-Process -FilePath $ExePath -WorkingDirectory $InstallDir
    Start-Sleep -Seconds 2
    $running = Get-Process -Name "FluentAssistantWorkbench" -ErrorAction SilentlyContinue
    if ($running) {
        Write-Host "Personal Assistant is running (PID: $($running[0].Id))." -ForegroundColor Green
    }
    else {
        $logFile = Join-Path $env:LOCALAPPDATA "FluentAssistantWorkbench\startup.log"
        Write-Warning "Process exited right after launch. Check $logFile if present."
    }
}
