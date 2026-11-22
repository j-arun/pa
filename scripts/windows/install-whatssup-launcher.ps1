param(
    [string]$RefAppHome = '',
    [string]$WorkbenchAppHome = '',
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
        $dialog.Description = 'Select your Reference React App folder (runs on port 3000) to save in REF_APP_HOME'
        $dialog.ShowNewFolderButton = $false
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $RefAppHome = $dialog.SelectedPath
        }
        $dialog.Dispose()
    }
}

if (-not [string]::IsNullOrWhiteSpace($WorkbenchAppHome)) {
    [Environment]::SetEnvironmentVariable('WORKBENCH_APP_HOME', $WorkbenchAppHome, 'User')
    Write-Host "Set User env WORKBENCH_APP_HOME = $WorkbenchAppHome" -ForegroundColor Green
}

if (-not [string]::IsNullOrWhiteSpace($RefAppHome)) {
    [Environment]::SetEnvironmentVariable('REF_APP_HOME', $RefAppHome, 'User')
    Write-Host "Set User env REF_APP_HOME       = $RefAppHome" -ForegroundColor Green
} else {
    Write-Warning "REF_APP_HOME was not selected yet. What's up will prompt you for it on first launch."
}

function Save-ShortcutIco {
    param(
        [string]$OutPath,
        [System.Drawing.Color]$BgColor,
        [string]$Letter = 'W'
    )
    $bmp = New-Object System.Drawing.Bitmap(64, 64)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $brush = New-Object System.Drawing.SolidBrush($BgColor)
    $g.FillEllipse($brush, 4, 4, 56, 56)

    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 255, 255, 255), 3)
    $g.DrawEllipse($pen, 4, 4, 56, 56)

    $font = New-Object System.Drawing.Font('Segoe UI', 28, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString($Letter, $font, $textBrush, (New-Object System.Drawing.RectangleF(4, 4, 56, 56)), $sf)

    # Write PNG-encoded ICO container (supported by Windows Vista+)
    $pngStream = New-Object System.IO.MemoryStream
    $bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngStream.ToArray()

    $fs = [System.IO.File]::Open($OutPath, [System.IO.FileMode]::Create)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([UInt16]0)          # Reserved
    $bw.Write([UInt16]1)          # Type: Icon
    $bw.Write([UInt16]1)          # Image count
    $bw.Write([byte]64)           # Width
    $bw.Write([byte]64)           # Height
    $bw.Write([byte]0)            # Color count
    $bw.Write([byte]0)            # Reserved
    $bw.Write([UInt16]1)          # Color planes
    $bw.Write([UInt16]32)         # Bits per pixel
    $bw.Write([UInt32]$pngBytes.Length) # Image data size
    $bw.Write([UInt32]22)         # Offset of image data (6 + 16)
    $bw.Write($pngBytes)
    $bw.Flush()
    $bw.Close()
    $fs.Dispose()
    $pngStream.Dispose()

    $sf.Dispose()
    $textBrush.Dispose()
    $font.Dispose()
    $pen.Dispose()
    $brush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

$LauncherDataDir = Join-Path $env:LOCALAPPDATA 'FluentAssistantWorkbench\launcher'
New-Item -ItemType Directory -Force -Path $LauncherDataDir | Out-Null

$ProdIco = Join-Path $LauncherDataDir 'whatssup-prod.ico'
$DevIco  = Join-Path $LauncherDataDir 'whatssup-dev.ico'
Save-ShortcutIco -OutPath $ProdIco -BgColor ([System.Drawing.Color]::FromArgb(255, 22, 163, 74)) -Letter 'W'
Save-ShortcutIco -OutPath $DevIco  -BgColor ([System.Drawing.Color]::FromArgb(255, 14, 116, 144)) -Letter 'W'

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

# Primary Desktop & Start Menu shortcut: What's up (Prod - Port 5000 + Reference Port 3000)
New-LauncherShortcut `
    -ShortcutPath (Join-Path $DesktopDir "What's up.lnk") `
    -ModeArg 'prod' `
    -IconPath $ProdIco `
    -Description "What's up (Prod 5000 + Reference 3000)"

New-LauncherShortcut `
    -ShortcutPath (Join-Path $StartMenuDir "What's up.lnk") `
    -ModeArg 'prod' `
    -IconPath $ProdIco `
    -Description "What's up (Prod 5000 + Reference 3000)"

# Optional Dev shortcuts (Port 4000 + Reference Port 3000)
New-LauncherShortcut `
    -ShortcutPath (Join-Path $StartMenuDir "What's up (Dev).lnk") `
    -ModeArg 'dev' `
    -IconPath $DevIco `
    -Description "What's up Dev (4000 + Reference 3000)"

if ($CreateDevDesktopShortcut) {
    New-LauncherShortcut `
        -ShortcutPath (Join-Path $DesktopDir "What's up (Dev).lnk") `
        -ModeArg 'dev' `
        -IconPath $DevIco `
        -Description "What's up Dev (4000 + Reference 3000)"
}

Write-Host ''
Write-Host "What's up launcher installation complete!" -ForegroundColor Green
Write-Host "Click `"What's up`" on your Desktop to start Prod (5000) + Reference (3000), or click the tray icon to toggle Start/Stop." -ForegroundColor Gray
