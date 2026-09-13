@echo off
REM ============================================================
REM  run.cmd  -  serve this folder over http:// and open browser
REM  Double-click me. Keep the server window open.
REM ============================================================
setlocal
cd /d "%~dp0"
set "PORT=8000"

REM --- find a Python (py launcher, or python on PATH) ---
set "PY="
where py >nul 2>nul && set "PY=py"
if not defined PY ( where python >nul 2>nul && set "PY=python" )

if not defined PY (
  echo.
  echo   Python not found. Make sure "py" or "python" is on your PATH.
  echo   Or just open this folder in VS Code and use the Live Server extension.
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   Serving:  http://localhost:%PORT%/
echo   Stopping: close the minimized window named
echo             "scareware-local-server"  ^(or Ctrl+C in it^)
echo ============================================================
echo.

where node >nul 2>nul && set "NODE=node"
if defined NODE ( start "scareware-local-server" /min %NODE% server.js ) else ( start "scareware-local-server" /min %PY% -m http.server %PORT% )
timeout /t 2 /nobreak >nul
start "" "http://localhost:%PORT%/"

echo   Browser opened. This little window can be closed safely;
echo   the server keeps running in its own minimized window.
echo.
pause
