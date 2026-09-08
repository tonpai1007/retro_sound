@echo off
setlocal enabledelayedexpansion

:: ============================================================
:: Retro Sound - One-Click Server Launcher (CRT Edition)
:: ============================================================
:: Force UTF-8 so block characters render on the phosphor display

chcp 65001 >nul 2>&1

:: --- CRT color scheme: neon green phosphor on black ---
color 0A 2>nul

:: Clear screen
cls

:: --- ASCII art banner (amber phosphor style) ---
echo.
echo    =========================================================================
echo.
echo      ╔═══════════════════════════════════════════════════════════════╗
echo      ║                                                               ║
echo      ║   ██████╗ ███████╗██╗   ██╗    ███████╗ ██████╗  ██████╗       ║
echo      ║   ██╔══██╗██╔════╝██║   ██║    ██╔════╝██╔═══██╗██╔════╝       ║
echo      ║   ██████╔╝█████╗  ██║   ██║    ███████╗██║   ██║██║    ███     ║
echo      ║   ██╔══██╗██╔══╝  ╚██╗ ██╔╝    ╚════██║██║   ██║██║             ║
echo      ║   ██║  ██║███████╗ ╚████╔╝     ███████║╚██████╔╝╚███████╗      ║
echo      ║   ╚═╝  ╚═╝╚══════╝  ╚═══╝      ╚══════╝ ╚═════╝  ╚══════╝      ║
echo      ║                                                               ║
echo      ║              C R T   S I G N A L   v1.0               ║
echo      ║                                                               ║
echo      ╚═══════════════════════════════════════════════════════════════╝
echo.
echo       [CRT BOOT] Initializing workstation environment...
echo       [CHECK]   Scanning for Python 3...
python --version >nul 2>&1
if errorlevel 1 (
    echo       [FAIL]    Python not found on PATH. Install Python 3 and retry.
    echo.
    echo    Press any key to exit...
    pause >nul
    exit /b 1
)
for /f "delims=" %%v in ('python --version 2^>^&1') do echo       [OK]      %%v

echo       [CHECK]   Verifying Python dependencies...
python -c "import flask, requests" 2>nul
if errorlevel 1 (
    echo       [WARN]    Dependencies missing - installing from requirements.txt...
    echo       [INSTALL] pip install -r backend\requirements.txt
    pip install -r backend\requirements.txt >nul 2>&1
    if errorlevel 1 (
        echo       [FAIL]  pip install failed. Check your internet connection.
        echo.
        echo    Press any key to exit...
        pause >nul
        exit /b 1
    )
    echo       [OK]    Dependencies installed successfully.
) else (
    echo       [OK]    All dependencies present.
)

:: --- Check backend directory ---
if not exist "backend\server.py" (
    echo       [FAIL]  backend\server.py not found.
    echo       [HALT]  Cannot locate server. Aborting.
    echo.
    echo    Press any key to exit...
    pause >nul
    exit /b 1
)

:: --- Display configuration ---
echo.
echo       [CONFIG]   Server:      Flask API + Static file server
echo       [CONFIG]   Root:        %CD%
echo       [CONFIG]   Port:        5000 (override with PORT env var)
echo       [CONFIG]   Browser:     http://localhost:5000
echo.
echo       ------------------------------------------------------------------
echo.
echo       [BOOT]   Powering up CRT monitor...
echo       [SYNC]   Calibrating phosphor...
timeout /t 1 /nobreak >nul
echo       [SYNC]   Initializing audio subsystem...
timeout /t 1 /nobreak >nul
echo       [SYNC]   Mounting /dev/crt...
timeout /t 1 /nobreak >nul
echo       [SYNCH]  Warm.
echo.
echo       ------------------------------------------------------------------
echo.

:: --- Open browser ---
start http://localhost:5000

:: --- Launch server ---
echo       [RUN]    python backend\server.py
echo       [LOG]    Server output below:
echo.
echo    ================================================================
echo.
python backend\server.py

:: --- Handle shutdown ---
echo.
echo    ================================================================
echo       [SHUTDOWN] Server stopped.
echo                  CRT SIGNAL offline. Powering down CRT...
echo    ================================================================
pause
