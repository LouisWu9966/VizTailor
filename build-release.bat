@echo off
setlocal
rem VizTailor - build release exe (double-click to run). Needs Node, Rust and VS Build Tools on THIS dev machine only.
chcp 65001 >nul
cd /d "%~dp0"

echo [1/4] Checking tools...
where node  >nul 2>nul || (echo ERROR: node not found. Install Node.js 20+ first.& goto :fail)
where npm   >nul 2>nul || (echo ERROR: npm not found.& goto :fail)
where cargo >nul 2>nul || (echo ERROR: cargo not found. Install Rust ^(rustup^) first.& goto :fail)

echo [2/4] Installing npm packages (skipped if node_modules exists)...
if not exist node_modules (
  call npm install || goto :fail
)

echo [3/4] Building release exe (first time takes several minutes)...
call npm run tauri build -- --no-bundle || goto :fail

set "EXE=%~dp0src-tauri\target\release\viztailor.exe"
if not exist "%EXE%" (echo ERROR: %EXE% not found.& goto :fail)

echo [4/4] Copying to release\VizTailor.exe ...
if not exist release mkdir release
copy /y "%EXE%" "release\VizTailor.exe" >nul || goto :fail

echo.
echo DONE. Output: %~dp0release\VizTailor.exe
powershell -NoProfile -Command "'Size: {0:N1} MB' -f ((Get-Item '%~dp0release\VizTailor.exe').Length/1MB)"
echo Copy this single exe to the target PC. It needs Windows 10/11 with WebView2 (built into Win11 and updated Win10).
echo Test it on a clean PC before sharing.
echo.
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. See the messages above.
pause
exit /b 1
