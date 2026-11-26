param(
    [string]$RefAppHome = '',
    [string]$WorkbenchAppHome = '',
    [string]$AstroAiStudioHome = '',
    [switch]$CreateDevDesktopShortcut = $true
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)

if ([string]::IsNullOrWhiteSpace($WorkbenchAppHome)) {
    $existingWb = [Environment]::GetEnvironmentVariable('WORKBENCH_APP_HOME', 'User')
    if (-not [string]::IsNullOrWhiteSpace($existingWb) -and (Test-Path (Join-Path $existingWb 'package.json'))) {
        $WorkbenchAppHome = $existingWb.Trim()
    } else {
        $WorkbenchAppHome = $RepoRoot
    }
}

if ([string]::IsNullOrWhiteSpace($RefAppHome)) {
    $existingRef = [Environment]::GetEnvironmentVariable('REF_APP_HOME', 'User')
    if (-not [string]::IsNullOrWhiteSpace($existingRef) -and (Test-Path (Join-Path $existingRef 'package.json'))) {
        $RefAppHome = $existingRef.Trim()
    } else {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Select your Astro Star (Reference React App) folder (runs on port 3000) to save in REF_APP_HOME'
        $dialog.ShowNewFolderButton = $false
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $RefAppHome = $dialog.SelectedPath
        }
        $dialog.Dispose()
    }
}

if ([string]::IsNullOrWhiteSpace($AstroAiStudioHome)) {
    $existingStudio = [Environment]::GetEnvironmentVariable('ASTRO_AI_STUDIO_HOME', 'User')
    if (-not [string]::IsNullOrWhiteSpace($existingStudio) -and (Test-Path $existingStudio)) {
        $AstroAiStudioHome = $existingStudio.Trim()
    } else {
        $studioDialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $studioDialog.Description = 'Select your Astro AI Studio startup folder (runs on port 6001) to save in ASTRO_AI_STUDIO_HOME'
        $studioDialog.ShowNewFolderButton = $false
        if ($studioDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $AstroAiStudioHome = $studioDialog.SelectedPath
        }
        $studioDialog.Dispose()
    }
}

if (-not [string]::IsNullOrWhiteSpace($WorkbenchAppHome)) {
    [Environment]::SetEnvironmentVariable('WORKBENCH_APP_HOME', $WorkbenchAppHome, 'User')
    Write-Host "Set User env WORKBENCH_APP_HOME   = $WorkbenchAppHome" -ForegroundColor Green
}

if (-not [string]::IsNullOrWhiteSpace($RefAppHome)) {
    [Environment]::SetEnvironmentVariable('REF_APP_HOME', $RefAppHome, 'User')
    Write-Host "Set User env REF_APP_HOME         = $RefAppHome" -ForegroundColor Green
} else {
    Write-Warning "REF_APP_HOME was not selected yet. What's up will prompt you for it on first launch."
}

if (-not [string]::IsNullOrWhiteSpace($AstroAiStudioHome)) {
    [Environment]::SetEnvironmentVariable('ASTRO_AI_STUDIO_HOME', $AstroAiStudioHome, 'User')
    Write-Host "Set User env ASTRO_AI_STUDIO_HOME = $AstroAiStudioHome" -ForegroundColor Green
} else {
    Write-Warning "ASTRO_AI_STUDIO_HOME was not selected yet. What's up will prompt you for it on first launch."
}

function Save-IcoFromPng {
    param(
        [string]$PngPath,
        [string]$OutPath
    )
    $src = [System.Drawing.Image]::FromFile($PngPath)
    $bmp = New-Object System.Drawing.Bitmap(64, 64)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, 64, 64)

    $pngStream = New-Object System.IO.MemoryStream
    $bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngStream.ToArray()

    $fs = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([UInt16]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]1)
    $bw.Write([byte]64)
    $bw.Write([byte]64)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngBytes.Length)
    $bw.Write([UInt32]22)
    $bw.Write($pngBytes)
    $bw.Flush()
    $bw.Close()
    $fs.Dispose()
    $pngStream.Dispose()

    $g.Dispose()
    $bmp.Dispose()
    $src.Dispose()
}

$LauncherDataDir = Join-Path $env:LOCALAPPDATA 'FluentAssistantWorkbench\launcher'
New-Item -ItemType Directory -Force -Path $LauncherDataDir | Out-Null

$SourceHandIco = Join-Path $ScriptDir 'whatsup.ico'
$SourceHandPng = Join-Path $ScriptDir 'whatsup.png'
$InstalledHandIco = Join-Path $LauncherDataDir 'whatsup.ico'

if (Test-Path $SourceHandIco) {
    Copy-Item -Path $SourceHandIco -Destination $InstalledHandIco -Force
} elseif (Test-Path $SourceHandPng) {
    Save-IcoFromPng -PngPath $SourceHandPng -OutPath $InstalledHandIco
}

$ProdIco = $InstalledHandIco
$DevIco  = $InstalledHandIco

$VbsPath = Join-Path $ScriptDir 'launch-whatssup.vbs'
$WscriptExe = Join-Path $env:SystemRoot 'System32\wscript.exe'
$WshShell = New-Object -ComObject WScript.Shell

$DesktopDir   = [Environment]::GetFolderPath('Desktop')
$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'

function New-LauncherShortcut {
    param(
        [string]$ShortcutPath,
        [string]$ModeArg,
        [string]$IconPath,
        [string]$Description
    )
    $sc = $WshShell.CreateShortcut($ShortcutPath)
    $sc.TargetPath = $WscriptExe
    $sc.Arguments = "`"$VbsPath`" $ModeArg"
    $sc.WorkingDirectory = $ScriptDir
    $sc.IconLocation = "$IconPath,0"
    $sc.Description = $Description
    $sc.Save()
    Write-Host "Created shortcut: $ShortcutPath" -ForegroundColor Cyan
}

# Remove old legacy shortcuts if created earlier
foreach ($oldName in @('Whats-sup.lnk', 'Whats-sup (Dev).lnk')) {
    foreach ($dir in @($DesktopDir, $StartMenuDir)) {
        $oldPath = Join-Path $dir $oldName
        if (Test-Path $oldPath) { Remove-Item $oldPath -Force -ErrorAction SilentlyContinue }
    }
}

# Primary Desktop & Start Menu shortcut: What's up (Prod 5000 + Astro Star 3000 + Astro AI Studio 6001)
New-LauncherShortcut `
    -ShortcutPath (Join-Path $DesktopDir "What's up.lnk") `
    -ModeArg 'prod' `
    -IconPath $ProdIco `
    -Description "What's up (Prod 5000 + Astro Star 3000 + Astro AI Studio 6001)"

New-LauncherShortcut `
    -ShortcutPath (Join-Path $StartMenuDir "What's up.lnk") `
    -ModeArg 'prod' `
    -IconPath $ProdIco `
    -Description "What's up (Prod 5000 + Astro Star 3000 + Astro AI Studio 6001)"

# Optional Dev shortcuts (Port 4000 + Astro Star 3000 + Astro AI Studio 6001)
New-LauncherShortcut `
    -ShortcutPath (Join-Path $StartMenuDir "What's up (Dev).lnk") `
    -ModeArg 'dev' `
    -IconPath $DevIco `
    -Description "What's up Dev (4000 + Astro Star 3000 + Astro AI Studio 6001)"

if ($CreateDevDesktopShortcut) {
    New-LauncherShortcut `
        -ShortcutPath (Join-Path $DesktopDir "What's up (Dev).lnk") `
        -ModeArg 'dev' `
        -IconPath $DevIco `
        -Description "What's up Dev (4000 + Astro Star 3000 + Astro AI Studio 6001)"
}

Write-Host ''
Write-Host "What's up launcher installation complete!" -ForegroundColor Green
Write-Host "Click `"What's up`" on your Desktop to start Prod (5000) + Astro Star (3000) + Astro AI Studio (6001) in the background, or click the tray icon to toggle Start/Stop." -ForegroundColor Gray
