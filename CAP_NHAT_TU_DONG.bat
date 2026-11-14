@echo off
setlocal
cd /d "%~dp0"
echo.
echo ================================================
echo   MikroTik Auto Config Studio - Auto Update
echo ================================================
echo This updater requires Internet to check GitHub Releases.
echo.
rem Do NOT pass -AppDir "%%~dp0": the trailing backslash may escape the quote in Windows argument parsing.
rem The PowerShell script determines its own folder through $PSScriptRoot.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CAP_NHAT_TU_DONG.ps1"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo Update failed. No update should be applied before backup. Code: %RESULT%
echo.
if not defined CI pause
endlocal & exit /b %RESULT%