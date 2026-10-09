@echo off
setlocal
title IoT Sensor Monitor

set "PROJECT_DIR=%~dp0"
set "FRONTEND_DIR=%PROJECT_DIR%frontend"
set "PYTHON=%PROJECT_DIR%.venv\Scripts\python.exe"

echo Checking localhost port 5000...
netstat -ano -p tcp | findstr /R /C:":5000 .*LISTENING" >nul
if not errorlevel 1 (
    powershell -NoProfile -Command "try { $api = Invoke-RestMethod -Uri 'http://127.0.0.1:5000/api/sensor' -TimeoutSec 2; if ($api.api_version -eq 3) { exit 2 } } catch {}; exit 1"
    if errorlevel 2 (
        echo The current dashboard backend is already running.
        start "" "http://localhost:5000/"
        exit /b 0
    )
    echo Port 5000 is occupied by an outdated or unrelated server.
    echo Close that server with Ctrl+C, then run this command again.
    exit /b 1
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
