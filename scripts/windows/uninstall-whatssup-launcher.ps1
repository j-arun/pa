param(
    [switch]$KeepEnvVars
)

$ErrorActionPreference = 'Stop'

$LauncherDataDir = Join-Path $env:LOCALAPPDATA 'FluentAssistantWorkbench\launcher'
$CmdFile = Join-Path $LauncherDataDir 'command.txt'
$PidFile = Join-Path $LauncherDataDir 'tray.pid'

Write-Host "Uninstalling What's up shortcuts and tray launcher (source code and saved reports will NOT be touched)..." -ForegroundColor Cyan

# 1. Gracefully exit active What's up tray controller if running
if (Test-Path $LauncherDataDir) {
    try {
        Set-Content -Path $CmdFile -Value 'exit' -Encoding UTF8
        Start-Sleep -Milliseconds 1200
    } catch {}
}

# Fallback: stop any remaining PowerShell tray process running launch-whatssup.ps1
if (Test-Path $PidFile) {
    try {
        $trayPidText = (Get-Content -Path $PidFile -Raw -Encoding ASCII).Trim()
        $trayPid = 0
        if ([int]::TryParse($trayPidText, [ref]$trayPid) -and $trayPid -gt 0) {
            $proc = Get-Process -Id $trayPid -ErrorAction SilentlyContinue
            if ($proc) {
                Stop-Process -Id $trayPid -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

try {
    $trayProcs = Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*launch-whatssup.ps1*' -and $_.ProcessId -ne $PID }
    foreach ($tp in $trayProcs) {
        Stop-Process -Id ([int]$tp.ProcessId) -Force -ErrorAction SilentlyContinue
    }
} catch {}

# 2. Free ports 3000, 4000, 5000 if still listening
foreach ($port in @(3000, 4000, 5000)) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($ownerPid in $pids) {
                if ($ownerPid -gt 4) {
                    & taskkill.exe /PID $ownerPid /T /F 2>$null | Out-Null
                }
            }
        }
    } catch {}
}

# 3. Remove Desktop, Start Menu, and Startup shortcuts created by install-whatssup
$DesktopDir   = [Environment]::GetFolderPath('Desktop')
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$StartupDir   = Join-Path $StartMenuDir 'Startup'

$ShortcutNames = @(
    "What's up.lnk",
    "What's up (Dev).lnk",
    'Whats-sup.lnk',
    'Whats-sup (Dev).lnk'
)

$RemovedShortcuts = 0
foreach ($dir in @($DesktopDir, $StartMenuDir, $StartupDir)) {
    foreach ($name in $ShortcutNames) {
        $target = Join-Path $dir $name
        if (Test-Path $target) {
            Remove-Item -Path $target -Force -ErrorAction SilentlyContinue
            Write-Host "Removed shortcut: $target" -ForegroundColor Yellow
            $RemovedShortcuts += 1
        }
    }
}

# 4. Remove launcher cache folder (icons, logs, pid) only — keeps workbench.config.json & reports intact
if (Test-Path $LauncherDataDir) {
    Remove-Item -Path $LauncherDataDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Removed launcher cache: $LauncherDataDir" -ForegroundColor Yellow
}

# 5. Optionally clear User Environment Variables added by installer
if (-not $KeepEnvVars) {
    foreach ($varName in @('WORKBENCH_APP_HOME', 'REF_APP_HOME')) {
        $existing = [Environment]::GetEnvironmentVariable($varName, 'User')
        if (-not [string]::IsNullOrWhiteSpace($existing)) {
            [Environment]::SetEnvironmentVariable($varName, $null, 'User')
            Write-Host "Cleared User env variable: $varName" -ForegroundColor Yellow
        }
    }
}

Write-Host ''
if ($RemovedShortcuts -eq 0) {
    Write-Host "No Desktop/Start Menu shortcuts were found, and launcher/tray state has been cleaned." -ForegroundColor Green
} else {
    Write-Host "What's up shortcuts and tray launcher uninstalled cleanly." -ForegroundColor Green
}
Write-Host 'Your project source code, .env, workbench.config.json, and saved reports were not modified.' -ForegroundColor Gray
