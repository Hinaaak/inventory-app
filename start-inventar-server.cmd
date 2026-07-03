@echo off
setlocal
cd /d "%~dp0"

set "BUNDLED_PY=C:\Users\Daniel\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%BUNDLED_PY%" (
  "%BUNDLED_PY%" server.py
  exit /b %ERRORLEVEL%
)

where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py server.py
  exit /b %ERRORLEVEL%
)

where python >nul 2>nul
if %ERRORLEVEL%==0 (
  python server.py
  exit /b %ERRORLEVEL%
)

echo Python wurde nicht gefunden.
pause
