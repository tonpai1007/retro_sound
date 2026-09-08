@echo off
setlocal

:: ============================================================
:: Retro Sound - CRT SIGNAL Terminal Launcher
:: ============================================================
:: Starts a local static server from the project root and opens
:: the browser directly into the CRT SIGNAL Terminal.

:: Force UTF-8 so block characters render in the terminal
chcp 65001 >nul 2>&1

:: --- CRT color scheme: amber phosphor on black ---
color 0E 2>nul
title CRT SIGNAL TERMINAL

:: Always run from the project root (the dir containing this .bat)
cd /d "%~dp0"

cls
echo.
echo    =========================================================================
echo.
echo      ████████╗██╗   ██╗██╗    ███████╗██╗  ██╗███████╗██╗     ██╗
echo      ╚══██╔══╝██║   ██║██║    ██╔════╝██║  ██║██╔════╝██║     ██║
echo         ██║   ██║   ██║██║    ███████╗███████║█████╗  ██║     ██║
echo         ██║   ██║   ██║██║    ╚════██║██╔══██║██╔══╝  ██║     ██║
echo         ██║   ╚██████╔╝██║    ███████║██║  ██║███████╗███████╗██║
echo         ╚═╝    ╚═════╝ ╚═╝    ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝
echo.
echo               C R T   S I G N A L   T U I   S H E L L   v1.0
echo.
echo    =========================================================================
echo.
echo    [CHECK] Scanning for Python 3...
python --version >nul 2>&1
if errorlevel 1 (
    echo    [FAIL] Python not found on PATH. Install Python 3 and retry.
    echo.
    echo    Press any key to exit...
    pause >nul
    exit /b 1
)
for /f "delims=" %%v in ('python --version 2^>^&1') do echo    [OK]   %%v

:: --- Native mode: run the Python terminal instead of the browser ---
if /i "%~1"=="native" goto native
if /i "%~1"=="--native" goto native
if /i "%~1"=="/native" goto native

:: --- Pick the first free port: 8080, else 8081, else 8082 ---
set PORT=8080
netstat -an | findstr /C:":8080 " | findstr /C:"LISTENING" >nul 2>&1
if not errorlevel 1 (
    set PORT=8081
    netstat -an | findstr /C:":8081 " | findstr /C:"LISTENING" >nul 2>&1
    if not errorlevel 1 set PORT=8082
)

echo.
echo    [CONFIG]  Root:    %CD%
echo    [CONFIG]  Port:    %PORT%
echo    [CONFIG]  Browser: http://localhost:%PORT%/#tui
echo.
echo    [BOOT]    Mounting ttys0...
echo    [BOOT]    Calibrating phosphor (amber)...
:: ping-based delay: works even when console input is redirected
ping -n 2 127.0.0.1 >nul
echo.

:: --- Open the browser straight into the TUI Shell ---
start "" "http://localhost:%PORT%/#tui"

echo    [RUN]     Serving CRT SIGNAL - press Ctrl+C to stop the server.
echo.
echo    ================================================================
echo.
python -m http.server %PORT%

echo.
echo    ================================================================
echo    [SHUTDOWN] TUI shell server stopped.
echo               CRT SIGNAL offline. Powering down CRT...
echo    ================================================================
pause
exit /b 0

:: ---------------- NATIVE MODE ----------------
:native
title CRT SIGNAL TERMINAL (native)
echo    [BOOT]    Mounting native ttys0 (python tui.py)...
echo    [TIP]     Type HELP inside the terminal. EXIT to detach.
echo.
python tui.py
echo.
echo    ================================================================
echo    [SHUTDOWN] Native TUI detached.
echo    ================================================================
pause
