@echo off
setlocal
title IoT Sensor Monitor

set "PROJECT_DIR=%~dp0"
set "FRONTEND_DIR=%PROJECT_DIR%frontend"
set "PYTHON=%PROJECT_DIR%.venv\Scripts\python.exe"
if not defined ARDUINO_PORT set "ARDUINO_PORT=COM5"

echo Checking localhost port 5000...
netstat -ano -p tcp | findstr /R /C:":5000 .*LISTENING" >nul
if not errorlevel 1 (
    powershell -NoProfile -Command "try { $api = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/sensor' -TimeoutSec 2; if ($api.api_version -eq 6 -and $api.configured_port -eq $env:ARDUINO_PORT) { exit 2 } } catch {}; exit 1"
    if errorlevel 2 (
        echo The current dashboard backend is already running on %ARDUINO_PORT%.
        start "" "http://localhost:5000/"
        exit /b 0
    )
    powershell -NoProfile -Command "$listener = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $listener) { exit 0 }; $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess); $expected = [IO.Path]::GetFullPath((Join-Path '%PROJECT_DIR%' 'backend\app.py')); if ($process.CommandLine -and $process.CommandLine.IndexOf($expected, [StringComparison]::OrdinalIgnoreCase) -ge 0) { Stop-Process -Id $listener.OwningProcess -Force; exit 0 }; exit 1"
    if errorlevel 1 (
        echo Port 5000 is occupied by an unrelated server.
        echo Close that server before running Solar Guard again.
        exit /b 1
    )
    echo Stopped the outdated Solar Guard backend. Restarting with the current version...
)

if not exist "%PYTHON%" (
    echo Project Python environment was not found: "%PYTHON%"
    echo Set up the project environment before running this app offline.
    exit /b 1
)
if not exist "%FRONTEND_DIR%\node_modules" (
    echo Frontend dependencies are not installed.
    echo Install them while online once, then this app can run offline.
    exit /b 1
)

echo Building frontend with locally installed packages...
pushd "%FRONTEND_DIR%"
call npm --offline run build
if errorlevel 1 (
    echo Offline frontend build failed. Check Node.js and the local dependencies.
    popd
    exit /b 1
)
popd

if not exist "%FRONTEND_DIR%\dist\index.html" (
    echo Frontend build did not create frontend\dist\index.html.
    exit /b 1
)

echo Starting the local sensor backend in this terminal...
echo The dashboard will open at http://localhost:5000/
"%PYTHON%" "%PROJECT_DIR%backend\app.py"
