@echo off
setlocal
cd /d "%~dp0"
echo.
echo ================================================
echo   MikroTik Auto Config Studio - Auto Update
 echo ================================================
echo This updater requires Internet to check GitHub Releases.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CAP_NHAT_TU_DONG.ps1" -AppDir "%~dp0"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" echo Update failed, original files should be preserved. Code: %RESULT%
echo.
pause
endlocal