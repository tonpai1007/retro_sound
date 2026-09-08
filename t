@echo off
setlocal

:: ============================================================
:: CRT SIGNAL - Native Terminal Launcher (double-click)
:: ============================================================
:: Runs the zero-dependency Python TUI directly in this console.

chcp 65001 >nul 2>&1
color 0E 2>nul
title CRT SIGNAL TERMINAL (native)
cd /d "%~dp0"

cls
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
echo    [BOOT]  Mounting native ttys0...
echo.

python tui.py

echo.
echo    ================================================================
echo    [SHUTDOWN] Native TUI detached.
echo    ================================================================
pause