@echo off
setlocal
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-whatssup-launcher.ps1"
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Setup encountered an error.
  pause
)
endlocal
