param(
    [ValidateSet('prod', 'dev')]
    [string]$Mode = 'prod',
    [switch]$HiddenChild
)

$ErrorActionPreference = 'Stop'

# Ensure WinForms / Drawing are available (Windows PowerShell 5.1 & PowerShell 7)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRootFallback = Split-Path -Parent (Split-Path -Parent $ScriptDir)

$DataRoot = Join-Path $env:LOCALAPPDATA 'FluentAssistantWorkbench\launcher'
$LogsDir = Join-Path $DataRoot 'logs'
$CmdFile = Join-Path $DataRoot 'command.txt'
$PidFile = Join-Path $DataRoot 'tray.pid'
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null

# Single-instance mutex so clicking Desktop/Start Menu shortcuts delegates to active tray
$CreatedNew = $false
$Mutex = New-Object System.Threading.Mutex($false, 'Local\WhatssupLauncherTrayMutex', [ref]$CreatedNew)

if (-not $CreatedNew) {
    try {
        Set-Content -Path $CmdFile -Value "toggle:$Mode" -Encoding UTF8
    } catch {
        # Ignore transient file contention
    }
    if ($Mutex) { $Mutex.Dispose() }
    exit 0
}

try {
    Set-Content -Path $PidFile -Value "$PID" -Encoding ASCII
} catch {}

function Get-EnvHome {
    param(
        [string]$VarName,
        [string]$FallbackPath = ''
    )
    $userVal = [Environment]::GetEnvironmentVariable($VarName, 'User')
    if (-not [string]::IsNullOrWhiteSpace($userVal)) {
        return $userVal.Trim()
    }
    $procVal = [Environment]::GetEnvironmentVariable($VarName, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($procVal)) {
        return $procVal.Trim()
    }
    $machVal = [Environment]::GetEnvironmentVariable($VarName, 'Machine')
    if (-not [string]::IsNullOrWhiteSpace($machVal)) {
        return $machVal.Trim()
    }
    return $FallbackPath
}

function Select-FolderDialog {
    param(
        [string]$Description,
        [string]$InitialPath = ''
    )
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Description
    $dialog.ShowNewFolderButton = $false
    if (-not [string]::IsNullOrWhiteSpace($InitialPath) -and (Test-Path $InitialPath)) {
        $dialog.SelectedPath = $InitialPath
    }
    $result = $dialog.ShowDialog()
    $selected = $null
    if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
        $selected = $dialog.SelectedPath
    }
    $dialog.Dispose()
    return $selected
}

function Ensure-AppHomes {
    param([switch]$ForcePrompt)

    $wbDefault = ''
    if (Test-Path (Join-Path $RepoRootFallback 'package.json')) {
        $wbDefault = $RepoRootFallback
    }

    $refHome = Get-EnvHome -VarName 'REF_APP_HOME'
    $wbHome = Get-EnvHome -VarName 'WORKBENCH_APP_HOME' -FallbackPath $wbDefault
    $studioHome = Get-EnvHome -VarName 'ASTRO_AI_STUDIO_HOME'

    if ($ForcePrompt -or [string]::IsNullOrWhiteSpace($refHome) -or -not (Test-Path (Join-Path $refHome 'package.json'))) {
        $chosenRef = Select-FolderDialog -Description 'Select your Astro Star (Reference React App) folder (runs on port 3000) - saved to REF_APP_HOME' -InitialPath $refHome
        if ([string]::IsNullOrWhiteSpace($chosenRef) -or -not (Test-Path (Join-Path $chosenRef 'package.json'))) {
            [System.Windows.Forms.MessageBox]::Show(
                "REF_APP_HOME is missing or does not contain a package.json.`n`nSet the User Environment Variable REF_APP_HOME to your Astro Star folder and try again.",
                "What's up Launcher",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            ) | Out-Null
            return $null
        }
        $refHome = $chosenRef
        [Environment]::SetEnvironmentVariable('REF_APP_HOME', $refHome, 'User')
        $env:REF_APP_HOME = $refHome
    }

    if ($ForcePrompt -or [string]::IsNullOrWhiteSpace($wbHome) -or -not (Test-Path (Join-Path $wbHome 'package.json'))) {
        $chosenWb = Select-FolderDialog -Description "Select your What's up / Workbench App folder (ports 4000/5000) - saved to WORKBENCH_APP_HOME" -InitialPath $wbHome
        if ([string]::IsNullOrWhiteSpace($chosenWb) -or -not (Test-Path (Join-Path $chosenWb 'package.json'))) {
            [System.Windows.Forms.MessageBox]::Show(
                "WORKBENCH_APP_HOME is missing or does not contain a package.json.`n`nSet the User Environment Variable WORKBENCH_APP_HOME to your Workbench folder and try again.",
                "What's up Launcher",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            ) | Out-Null
            return $null
        }
        $wbHome = $chosenWb
        [Environment]::SetEnvironmentVariable('WORKBENCH_APP_HOME', $wbHome, 'User')
        $env:WORKBENCH_APP_HOME = $wbHome
    } elseif ([string]::IsNullOrWhiteSpace((Get-EnvHome -VarName 'WORKBENCH_APP_HOME'))) {
        # Persist discovered repo root into User env var for convenience
        [Environment]::SetEnvironmentVariable('WORKBENCH_APP_HOME', $wbHome, 'User')
        $env:WORKBENCH_APP_HOME = $wbHome
    }

    if ($ForcePrompt -or [string]::IsNullOrWhiteSpace($studioHome) -or -not (Test-Path $studioHome)) {
        $chosenStudio = Select-FolderDialog -Description 'Select your Astro AI Studio startup folder (runs on port 6001) - saved to ASTRO_AI_STUDIO_HOME' -InitialPath $studioHome
        if ([string]::IsNullOrWhiteSpace($chosenStudio) -or -not (Test-Path $chosenStudio)) {
            [System.Windows.Forms.MessageBox]::Show(
                "ASTRO_AI_STUDIO_HOME is missing or does not exist.`n`nSet the User Environment Variable ASTRO_AI_STUDIO_HOME to your Astro AI Studio folder and try again.",
                "What's up Launcher",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            ) | Out-Null
            return $null
        }
        $studioHome = $chosenStudio
        [Environment]::SetEnvironmentVariable('ASTRO_AI_STUDIO_HOME', $studioHome, 'User')
        $env:ASTRO_AI_STUDIO_HOME = $studioHome
    }

    return @{
        RefHome    = $refHome
        WbHome     = $wbHome
        StudioHome = $studioHome
    }
}

function Resolve-NpmPlan {
    param(
        [string]$AppDir,
        [string]$TargetMode,
        [string]$OverrideEnvVar = ''
    )
    $selected = $TargetMode
    $overrideUsed = $false

    if (-not [string]::IsNullOrWhiteSpace($OverrideEnvVar)) {
        $overrideVal = [Environment]::GetEnvironmentVariable($OverrideEnvVar, 'User')
        if ([string]::IsNullOrWhiteSpace($overrideVal)) {
            $overrideVal = [Environment]::GetEnvironmentVariable($OverrideEnvVar, 'Process')
        }
        if (-not [string]::IsNullOrWhiteSpace($overrideVal)) {
            $selected = $overrideVal.Trim()
            $overrideUsed = $true
        }
    }

    $pkgPath = Join-Path $AppDir 'package.json'
    if (-not (Test-Path $pkgPath)) {
        return @{ Script = $selected; PreBuild = $false }
    }

    try {
        $pkg = Get-Content -Path $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $scriptNames = @()
        if ($pkg -and $pkg.scripts) {
            $scriptNames = $pkg.scripts.PSObject.Properties | ForEach-Object { $_.Name }
        }

        if (-not $overrideUsed) {
            if ($TargetMode -eq 'prod') {
                foreach ($candidate in @('prod', 'start', 'dev')) {
                    if ($scriptNames -contains $candidate) {
                        $selected = $candidate
                        break
                    }
                }
            } else {
                foreach ($candidate in @('dev', 'start', 'prod')) {
                    if ($scriptNames -contains $candidate) {
                        $selected = $candidate
                        break
                    }
                }
            }
        }

        $preBuild = $false
        if ($TargetMode -eq 'prod' -and ($selected -eq 'prod' -or $selected -eq 'start') -and ($scriptNames -contains 'build')) {
            $scriptCmd = ''
            try { $scriptCmd = [string]($pkg.scripts.$selected) } catch {}
            $alreadyBuilds = ($scriptCmd -match '\bbuild\b')
            $isDevCommand  = ($scriptCmd -match 'react-scripts\s+start') -or ($scriptCmd -match '^\s*vite(\s|$)')
            $hasDist  = Test-Path (Join-Path $AppDir 'dist\index.html')
            $hasBuild = Test-Path (Join-Path $AppDir 'build\index.html')

            if (-not $alreadyBuilds -and -not $isDevCommand -and -not $hasDist -and -not $hasBuild) {
                $preBuild = $true
            }
        }

        return @{ Script = $selected; PreBuild = $preBuild }
    } catch {
        return @{ Script = $selected; PreBuild = $false }
    }
}

function Test-LocalPort {
    param([int]$Port)
    foreach ($addr in @('127.0.0.1', '::1')) {
        $client = $null
        try {
            $ip = [System.Net.IPAddress]::Parse($addr)
            $client = New-Object System.Net.Sockets.TcpClient($ip.AddressFamily)
            $iar = $client.BeginConnect($ip, $Port, $null, $null)
            $connected = $iar.AsyncWaitHandle.WaitOne(160, $false)
            if ($connected -and $client.Connected) {
                $client.EndConnect($iar)
                return $true
            }
        } catch {
            # Try next loopback family
        } finally {
            if ($client) { $client.Dispose() }
        }
    }
    return $false
}

function Test-HttpAlive {
    param([string]$Url)
    try {
        $req = [System.Net.WebRequest]::Create($Url)
        $req.Timeout = 350
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        return ($code -ge 200 -and $code -lt 500)
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            $_.Exception.Response.Close()
            return $true
        }
        return $false
    } catch {
        return $false
    }
}

function Stop-ProcessTree {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return }
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'taskkill.exe'
        $psi.Arguments = "/PID $ProcessId /T /F"
        $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        $psi.CreateNoWindow = $true
        $psi.UseShellExecute = $false
        $p = [System.Diagnostics.Process]::Start($psi)
        if ($p) {
            $p.WaitForExit(4000) | Out-Null
            $p.Dispose()
        }
    } catch {
        # Ignore if already exited
    }
}

function Stop-PortListeners {
    param([int[]]$Ports)
    foreach ($p in $Ports) {
        try {
            $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
            if ($conns) {
                $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
                foreach ($ownerPid in $pids) {
                    if ($ownerPid -gt 4) {
                        Stop-ProcessTree -ProcessId ([int]$ownerPid)
                    }
                }
            }
        } catch {
            # Fallback to netstat parsing if Get-NetTCPConnection is restricted
            try {
                $lines = netstat.exe -ano -p tcp | Select-String -Pattern "LISTENING\s+(\d+)$"
                foreach ($line in $lines) {
                    $txt = $line.ToString()
                    if ($txt -match "[:\.]$p\s+.*LISTENING\s+(\d+)$") {
                        $ownerPid = [int]$Matches[1]
                        if ($ownerPid -gt 4) {
                            Stop-ProcessTree -ProcessId $ownerPid
                        }
                    }
                }
            } catch {
                # Ignore fallback errors
            }
        }
    }
}

function Start-HiddenNpmApp {
    param(
        [string]$AppDir,
        [string]$NpmScript,
        [string]$OutLog,
        [string]$ErrLog,
        [bool]$PreBuild = $false
    )
    if (Test-Path $OutLog) { Remove-Item $OutLog -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ErrLog) { Remove-Item $ErrLog -Force -ErrorAction SilentlyContinue }

    # Unset PORT inside cmd session so dev=4000, prod=5000, and reference=3000 use their own defaults
    $cmdBody = if ($PreBuild) {
        "set PORT=& npm.cmd run build && npm.cmd run $NpmScript"
    } else {
        "set PORT=& npm.cmd run $NpmScript"
    }
    $cmdLine = "/c $cmdBody"
    $proc = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList $cmdLine `
        -WorkingDirectory $AppDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog `
        -PassThru
    return $proc
}

function Resolve-StudioPlan {
    param(
        [string]$AppDir,
        [string]$TargetMode
    )
    $port = 0
    $portRaw = Get-EnvHome -VarName 'ASTRO_AI_STUDIO_PORT'
    if (-not [string]::IsNullOrWhiteSpace($portRaw)) {
        $parsedPort = 0
        if ([int]::TryParse($portRaw.Trim(), [ref]$parsedPort) -and $parsedPort -gt 0 -and $parsedPort -le 65535) {
            $port = $parsedPort
        }
    }

    $cmdOverride = Get-EnvHome -VarName 'ASTRO_AI_STUDIO_CMD'
    if (-not [string]::IsNullOrWhiteSpace($cmdOverride)) {
        if ($port -le 0) { $port = 6001 }
        return @{
            Command = $cmdOverride.Trim()
            Port    = $port
        }
    }

    $pkgPath = Join-Path $AppDir 'package.json'
    if (Test-Path $pkgPath) {
        $plan = Resolve-NpmPlan -AppDir $AppDir -TargetMode $TargetMode -OverrideEnvVar 'ASTRO_AI_STUDIO_SCRIPT'
        if ($port -le 0) {
            try {
                $pkg = Get-Content -Path $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json
                $scriptCmd = [string]($pkg.scripts.($plan.Script))
                if ($scriptCmd -match '(?:--port|-p|PORT=)\s*=?\s*(\d{2,5})') {
                    $detected = [int]$Matches[1]
                    if ($detected -gt 0 -and $detected -le 65535) {
                        $port = $detected
                    }
                }
            } catch {}
        }
        if ($port -le 0) { $port = 6001 }
        $cmdBody = if ($plan.PreBuild) {
            "set PORT=& npm.cmd run build && npm.cmd run $($plan.Script)"
        } else {
            "set PORT=& npm.cmd run $($plan.Script)"
        }
        return @{
            Command = $cmdBody
            Port    = $port
        }
    }

    if ($port -le 0) { $port = 6001 }

    foreach ($candidateName in @('start.cmd', 'start.bat', 'run.cmd', 'run.bat', 'dev.cmd', 'dev.bat')) {
        $candidatePath = Join-Path $AppDir $candidateName
        if (Test-Path $candidatePath) {
            return @{
                Command = "`"$candidatePath`""
                Port    = $port
            }
        }
    }

    $anyBatch = Get-ChildItem -Path $AppDir -Filter '*.cmd' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $anyBatch) {
        $anyBatch = Get-ChildItem -Path $AppDir -Filter '*.bat' -File -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($anyBatch) {
        return @{
            Command = "`"$($anyBatch.FullName)`""
            Port    = $port
        }
    }

    return @{
        Command = ''
        Port    = $port
    }
}

function Start-StudioApp {
    param(
        [string]$AppDir,
        [string]$CommandBody,
        [string]$OutLog,
        [string]$ErrLog
    )
    if ([string]::IsNullOrWhiteSpace($CommandBody)) {
        return $null
    }

    if (Test-Path $OutLog) { Remove-Item $OutLog -Force -ErrorAction SilentlyContinue }
    if (Test-Path $ErrLog) { Remove-Item $ErrLog -Force -ErrorAction SilentlyContinue }

    return Start-Process -FilePath 'cmd.exe' `
        -ArgumentList "/c $CommandBody" `
        -WorkingDirectory $AppDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog `
        -PassThru
}

$HandIconPng = Join-Path $ScriptDir 'whatsup.png'

function New-HandTrayIcon {
    param(
        [ValidateSet('running', 'starting', 'stopped', 'dev')]
        [string]$VisualState = 'running'
    )

    $bmp = New-Object System.Drawing.Bitmap(32, 32)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    if (Test-Path $HandIconPng) {
        $srcImg = [System.Drawing.Image]::FromFile($HandIconPng)
        $ia = New-Object System.Drawing.Imaging.ImageAttributes
        $cm = New-Object System.Drawing.Imaging.ColorMatrix

        if ($VisualState -eq 'stopped') {
            # Desaturated muted hand alone when stopped
            $cm.Matrix00 = 0.30; $cm.Matrix01 = 0.30; $cm.Matrix02 = 0.30
            $cm.Matrix10 = 0.59; $cm.Matrix11 = 0.59; $cm.Matrix12 = 0.59
            $cm.Matrix20 = 0.11; $cm.Matrix21 = 0.11; $cm.Matrix22 = 0.11
            $cm.Matrix33 = 0.65
        } elseif ($VisualState -eq 'starting') {
            $cm.Matrix00 = 1.0; $cm.Matrix11 = 1.0; $cm.Matrix22 = 1.0
            $cm.Matrix33 = 0.72
        } else {
            $cm.Matrix00 = 1.0; $cm.Matrix11 = 1.0; $cm.Matrix22 = 1.0
            $cm.Matrix33 = 1.0
        }

        $ia.SetColorMatrix($cm)
        $destRect = New-Object System.Drawing.Rectangle(1, 1, 30, 30)
        $g.DrawImage($srcImg, $destRect, 0, 0, $srcImg.Width, $srcImg.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)
        $ia.Dispose()
        $srcImg.Dispose()
    } else {
        $fallbackColor = if ($VisualState -eq 'stopped') { [System.Drawing.Color]::Gray } else { [System.Drawing.Color]::Gold }
        $brush = New-Object System.Drawing.SolidBrush($fallbackColor)
        $g.FillEllipse($brush, 4, 4, 24, 24)
        $brush.Dispose()
    }

    $hIcon = $bmp.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($hIcon)
    $g.Dispose()
    $bmp.Dispose()
    return $icon
}

$IconStopped  = New-HandTrayIcon -VisualState 'stopped'
$IconStarting = New-HandTrayIcon -VisualState 'starting'
$IconRunning  = New-HandTrayIcon -VisualState 'running'
$IconDevRun   = New-HandTrayIcon -VisualState 'dev'

$State = @{
    Status      = 'Stopped'   # Stopped | Starting | Running
    ActiveMode  = $Mode       # prod | dev
    RefPort     = 3000
    WbPort      = $(if ($Mode -eq 'dev') { 4000 } else { 5000 })
    StudioPort  = 6001
    RefProc     = $null
    WbProc      = $null
    StudioProc  = $null
    StartTime   = [DateTime]::MinValue
    BrowserOpened = $false
}

$NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
$NotifyIcon.Visible = $true

$Menu = New-Object System.Windows.Forms.ContextMenuStrip
$ItemStatus    = New-Object System.Windows.Forms.ToolStripMenuItem("What's up: Stopped")
$ItemStatus.Enabled = $false
$ItemToggle    = New-Object System.Windows.Forms.ToolStripMenuItem("Start What's up (Prod - 5000)")
$ItemOpenHome  = New-Object System.Windows.Forms.ToolStripMenuItem('Open Homepage')
$ItemLaunchProd = New-Object System.Windows.Forms.ToolStripMenuItem('Launch in Prod (Port 5000)')
$ItemLaunchDev  = New-Object System.Windows.Forms.ToolStripMenuItem('Launch in Dev (Port 4000)')
$ItemViewLogs  = New-Object System.Windows.Forms.ToolStripMenuItem('Open Logs Folder')
$ItemConfigEnv = New-Object System.Windows.Forms.ToolStripMenuItem('Configure App Folders (Env Vars)...')
$ItemExit      = New-Object System.Windows.Forms.ToolStripMenuItem('Stop All & Exit Tray')

$Menu.Items.Add($ItemStatus) | Out-Null
$Menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$Menu.Items.Add($ItemToggle) | Out-Null
$Menu.Items.Add($ItemOpenHome) | Out-Null
$Menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$Menu.Items.Add($ItemLaunchProd) | Out-Null
$Menu.Items.Add($ItemLaunchDev) | Out-Null
$Menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$Menu.Items.Add($ItemViewLogs) | Out-Null
$Menu.Items.Add($ItemConfigEnv) | Out-Null
$Menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$Menu.Items.Add($ItemExit) | Out-Null

$NotifyIcon.ContextMenuStrip = $Menu

function Update-TrayUI {
    $modeLabel = if ($State.ActiveMode -eq 'dev') { 'Dev' } else { 'Prod' }
    $wbPort = if ($State.ActiveMode -eq 'dev') { 4000 } else { 5000 }
    $State.WbPort = $wbPort

    if ($State.Status -eq 'Running') {
        $NotifyIcon.Icon = if ($State.ActiveMode -eq 'dev') { $IconDevRun } else { $IconRunning }
        $tip = "What's up ($modeLabel) - Running ($($State.RefPort), $wbPort, $($State.StudioPort))."
        $NotifyIcon.Text = $tip.Substring(0, [Math]::Min(63, $tip.Length))
        $ItemStatus.Text = "What's up: Running ($modeLabel $wbPort + Star $($State.RefPort) + Studio $($State.StudioPort))"
        $ItemToggle.Text = "Stop What's up ($modeLabel)"
        $ItemOpenHome.Enabled = $true
    } elseif ($State.Status -eq 'Starting') {
        $NotifyIcon.Icon = $IconStarting
        $tip = "What's up ($modeLabel) - Starting ($($State.RefPort), $wbPort, $($State.StudioPort))..."
        $NotifyIcon.Text = $tip.Substring(0, [Math]::Min(63, $tip.Length))
        $ItemStatus.Text = "What's up: Starting ($modeLabel $wbPort + Star $($State.RefPort) + Studio $($State.StudioPort))..."
        $ItemToggle.Text = 'Cancel & Stop'
        $ItemOpenHome.Enabled = $false
    } else {
        $NotifyIcon.Icon = $IconStopped
        $tip = "What's up ($modeLabel) - Stopped. Click to start."
        $NotifyIcon.Text = $tip.Substring(0, [Math]::Min(63, $tip.Length))
        $ItemStatus.Text = "What's up: Stopped"
        $ItemToggle.Text = "Start What's up ($modeLabel - $wbPort)"
        $ItemOpenHome.Enabled = $false
    }

    $ItemLaunchProd.Checked = ($State.ActiveMode -eq 'prod')
    $ItemLaunchDev.Checked  = ($State.ActiveMode -eq 'dev')
}

function Open-Homepage {
    $url = "http://localhost:$($State.WbPort)/"
    Start-Process $url
}

function Stop-BothApps {
    param([switch]$Silent)
    if ($State.RefProc) {
        try {
            if (-not $State.RefProc.HasExited) {
                Stop-ProcessTree -ProcessId $State.RefProc.Id
            }
            $State.RefProc.Dispose()
        } catch {}
        $State.RefProc = $null
    }
    if ($State.WbProc) {
        try {
            if (-not $State.WbProc.HasExited) {
                Stop-ProcessTree -ProcessId $State.WbProc.Id
            }
            $State.WbProc.Dispose()
        } catch {}
        $State.WbProc = $null
    }
    if ($State.StudioProc) {
        try {
            if (-not $State.StudioProc.HasExited) {
                Stop-ProcessTree -ProcessId $State.StudioProc.Id
            }
            $State.StudioProc.Dispose()
        } catch {}
        $State.StudioProc = $null
    }

    $portsToFree = @(3000, 4000, 5000, 6001)
    if ($State.StudioPort -gt 0 -and ($portsToFree -notcontains $State.StudioPort)) {
        $portsToFree += $State.StudioPort
    }
    Stop-PortListeners -Ports $portsToFree

    $State.Status = 'Stopped'
    $State.BrowserOpened = $false
    Update-TrayUI

    if (-not $Silent) {
        $NotifyIcon.ShowBalloonTip(2500, "What's up", 'Stopped Astro Star, Workbench, and Astro AI Studio.', [System.Windows.Forms.ToolTipIcon]::Info)
    }
}

function Start-BothApps {
    param([ValidateSet('prod', 'dev')][string]$TargetMode = $State.ActiveMode)

    if ($State.Status -ne 'Stopped') {
        Stop-BothApps -Silent
        Start-Sleep -Milliseconds 300
    }

    $homes = Ensure-AppHomes
    if (-not $homes) {
        $State.Status = 'Stopped'
        Update-TrayUI
        return
    }

    $State.ActiveMode = $TargetMode
    $State.WbPort = if ($TargetMode -eq 'dev') { 4000 } else { 5000 }
    $State.BrowserOpened = $false

    $refPlan = Resolve-NpmPlan -AppDir $homes.RefHome -TargetMode $TargetMode -OverrideEnvVar 'REF_APP_SCRIPT'
    $wbPlan  = Resolve-NpmPlan -AppDir $homes.WbHome  -TargetMode $TargetMode
    $studioPlan = Resolve-StudioPlan -AppDir $homes.StudioHome -TargetMode $TargetMode
    $State.StudioPort = $studioPlan.Port

    $refOut    = Join-Path $LogsDir 'reference.out.log'
    $refErr    = Join-Path $LogsDir 'reference.err.log'
    $wbOut     = Join-Path $LogsDir 'workbench.out.log'
    $wbErr     = Join-Path $LogsDir 'workbench.err.log'
    $studioOut = Join-Path $LogsDir 'astro-ai-studio.out.log'
    $studioErr = Join-Path $LogsDir 'astro-ai-studio.err.log'

    if (-not (Test-LocalPort -Port $State.RefPort)) {
        $State.RefProc = Start-HiddenNpmApp -AppDir $homes.RefHome -NpmScript $refPlan.Script -OutLog $refOut -ErrLog $refErr -PreBuild $refPlan.PreBuild
    }
    if (-not (Test-LocalPort -Port $State.WbPort)) {
        $State.WbProc = Start-HiddenNpmApp -AppDir $homes.WbHome -NpmScript $wbPlan.Script -OutLog $wbOut -ErrLog $wbErr -PreBuild $wbPlan.PreBuild
    }
    if ($studioPlan.Command -and ($State.StudioPort -le 0 -or -not (Test-LocalPort -Port $State.StudioPort))) {
        $State.StudioProc = Start-StudioApp -AppDir $homes.StudioHome -CommandBody $studioPlan.Command -OutLog $studioOut -ErrLog $studioErr
    }

    $State.Status = 'Starting'
    $State.StartTime = Get-Date
    Update-TrayUI
}

function Toggle-WhatsSup {
    param([string]$RequestedMode = '')

    if ($State.Status -eq 'Running' -or $State.Status -eq 'Starting') {
        if (-not [string]::IsNullOrWhiteSpace($RequestedMode) -and $RequestedMode -ne $State.ActiveMode) {
            Start-BothApps -TargetMode $RequestedMode
        } else {
            Stop-BothApps
        }
    } else {
        $modeToRun = if ([string]::IsNullOrWhiteSpace($RequestedMode)) { $State.ActiveMode } else { $RequestedMode }
        Start-BothApps -TargetMode $modeToRun
    }
}

# Non-blocking timer checks server readiness and external shortcut commands
$PollTimer = New-Object System.Windows.Forms.Timer
$PollTimer.Interval = 400
$PollTimer.Add_Tick({
    try {
        # Check shortcut commands delegated from secondary invocations
        if (Test-Path $CmdFile) {
            $cmdText = ''
            try {
                $cmdText = (Get-Content -Path $CmdFile -Raw -Encoding UTF8).Trim()
                Remove-Item -Path $CmdFile -Force -ErrorAction SilentlyContinue
            } catch {}

            if ($cmdText -eq 'exit') {
                $PollTimer.Stop()
                Stop-BothApps -Silent
                $NotifyIcon.Visible = $false
                [System.Windows.Forms.Application]::Exit()
                return
            } elseif ($cmdText -match '^toggle:(prod|dev)$') {
                Toggle-WhatsSup -RequestedMode $Matches[1]
                return
            } elseif ($cmdText -eq 'toggle') {
                Toggle-WhatsSup
                return
            }
        }

        if ($State.Status -eq 'Starting') {
            $elapsed = ((Get-Date) - $State.StartTime).TotalSeconds

            # Detect premature exit of launched child processes
            $refExited = ($State.RefProc -ne $null -and $State.RefProc.HasExited -and -not (Test-LocalPort -Port $State.RefPort))
            $wbExited  = ($State.WbProc  -ne $null -and $State.WbProc.HasExited  -and -not (Test-LocalPort -Port $State.WbPort))
            $studioExited = ($State.StudioProc -ne $null -and $State.StudioProc.HasExited -and ($State.StudioPort -le 0 -or -not (Test-LocalPort -Port $State.StudioPort)))

            if ($refExited -or $wbExited -or $studioExited) {
                $which = if ($wbExited) { 'Workbench' } elseif ($studioExited) { 'Astro AI Studio' } else { 'Astro Star' }
                Stop-BothApps -Silent
                $NotifyIcon.ShowBalloonTip(4000, "What's up Startup Error", "$which exited unexpectedly. Opening logs folder...", [System.Windows.Forms.ToolTipIcon]::Error)
                Start-Process explorer.exe $LogsDir
                return
            }

            $refReady = Test-LocalPort -Port $State.RefPort
            $wbReady  = Test-HttpAlive -Url "http://127.0.0.1:$($State.WbPort)/api/health"
            $studioReady = if ($State.StudioPort -gt 0) {
                Test-LocalPort -Port $State.StudioPort
            } else {
                ($State.StudioProc -eq $null -or -not $State.StudioProc.HasExited)
            }

            if ($refReady -and $wbReady -and $studioReady) {
                $State.Status = 'Running'
                Update-TrayUI
                if (-not $State.BrowserOpened) {
                    $State.BrowserOpened = $true
                    $modeLabel = if ($State.ActiveMode -eq 'dev') { 'Dev' } else { 'Prod' }
                    $NotifyIcon.ShowBalloonTip(2500, "What's up", "Started Workbench ($modeLabel $($State.WbPort)), Astro Star ($($State.RefPort)), and Astro AI Studio ($($State.StudioPort)). Opening homepage...", [System.Windows.Forms.ToolTipIcon]::Info)
                    Open-Homepage
                }
            } elseif ($elapsed -gt 120) {
                Stop-BothApps -Silent
                $NotifyIcon.ShowBalloonTip(4000, "What's up Timeout", 'Servers took too long to respond. Check logs folder.', [System.Windows.Forms.ToolTipIcon]::Error)
                Start-Process explorer.exe $LogsDir
            }
        } elseif ($State.Status -eq 'Running') {
            # If user stopped servers externally, reflect Stopped state in tray
            $refUp = Test-LocalPort -Port $State.RefPort
            $wbUp  = Test-LocalPort -Port $State.WbPort
            $studioUp = if ($State.StudioPort -gt 0) {
                Test-LocalPort -Port $State.StudioPort
            } else {
                ($State.StudioProc -ne $null -and -not $State.StudioProc.HasExited)
            }
            if (-not $refUp -and -not $wbUp -and -not $studioUp) {
                $State.Status = 'Stopped'
                $State.BrowserOpened = $false
                Update-TrayUI
            }
        }
    } catch {
        # Keep UI message loop resilient
    }
})

$NotifyIcon.Add_MouseClick({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        Toggle-WhatsSup
    }
})

$ItemToggle.Add_Click({ Toggle-WhatsSup })
$ItemOpenHome.Add_Click({ Open-Homepage })
$ItemLaunchProd.Add_Click({ Start-BothApps -TargetMode 'prod' })
$ItemLaunchDev.Add_Click({ Start-BothApps -TargetMode 'dev' })
$ItemViewLogs.Add_Click({ Start-Process explorer.exe $LogsDir })
$ItemConfigEnv.Add_Click({ Ensure-AppHomes -ForcePrompt | Out-Null })
$ItemExit.Add_Click({
    $PollTimer.Stop()
    Stop-BothApps -Silent
    $NotifyIcon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})

Update-TrayUI
$PollTimer.Start()

# Start immediately on launch in the requested mode (defaults to prod)
Start-BothApps -TargetMode $Mode

try {
    [System.Windows.Forms.Application]::Run()
} finally {
    $PollTimer.Dispose()
    Stop-BothApps -Silent
    $NotifyIcon.Visible = $false
    $NotifyIcon.Dispose()
    $Menu.Dispose()
    $IconStopped.Dispose()
    $IconStarting.Dispose()
    $IconRunning.Dispose()
    $IconDevRun.Dispose()
    if (Test-Path $PidFile) { Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue }
    if ($Mutex) {
        try { $Mutex.ReleaseMutex() } catch {}
        $Mutex.Dispose()
    }
}
