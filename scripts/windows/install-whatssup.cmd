@echo off
setlocal
echo Installing What's up launcher (Astro Star + Workbench + Astro AI Studio)...
powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-whatssup-launcher.ps1" %*
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Setup encountered an error.
  pause
  exit /b %ERRORLEVEL%
)
echo.
pause
endlocal
