<#
.SYNOPSIS
    Retro Sound - One-Click CRT Server Launcher
.DESCRIPTION
    Boots the Flame backend with a retro CRT terminal aesthetic.
    Features ANSI-colored boot sequence, dependency checks, and auto-browser.
#>
param(
    [int]$Port = 5000,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$PWD = Split-Path $PSScriptRoot -Parent

# Enable VT100 / ANSI processing for true color
[void][System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('unused')]
Add-Type -AssemblyName PSReadLine -ErrorAction SilentlyContinue
$Host.UI.RawUI.CursorSize = 100

# ANSI escape codes
$esc = [char]27
$bold   = "$esc[1m"
$dim    = "$esc[2m"
$cyan   = "$esc[36m"
$green  = "$esc[32m"
$yellow = "$esc[33m"
$amber  = "$esc[38;5;208m"
$orange = "$esc[38;5;208m"
$red    = "$esc[31m"
$magenta= "$esc[35m"
$reset  = "$esc[0m"
$hline   = "$esc[2m" + ("─" * 72) + "$reset"

function Write-Line([string]$Color, [string]$Symbol, [string]$Message) {
    Write-Host "$Color$bold[$Symbol]$reset $dim$Color$Message$reset"
}

function Write-Phosphor([string]$Text) {
    Write-Host "$amber$bold$Text$reset"
}

function Write-Status([string]$Color, [string]$Symbol, [string]$Message) {
    Write-Host "        $Color$bold[$Symbol]$reset $Color$Message$reset"
}

function Write-Spinner([string]$Message, [int]$DurationMs = 800) {
    $frames = @('|', '/', '-', '\')
    $end = [System.Environment]::TickCount + $DurationMs
    $i = 0
    $width = $Message.Length + 4
    do {
        $frame = $frames[$i % $frames.Length]
        Write-Host -NoNewline "$green$bold$frame$reset $green$Message$reset"
        Start-Sleep -Milliseconds 80
        Write-Host -NoNewline (" " * $width) -NoNewline
        Write-Host -NoNewline "`r"
        $i++
    } while ([System.Environment]::TickCount -lt $end)
}

function Write-ProgressBar([string]$Message, [int]$DurationMs = 1500) {
    $width = 40
    $end = [System.Environment]::TickCount + $DurationMs
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    do {
        $pct = [math]::Min(100, [int](($DurationMs - ($end - [System.Environment]::TickCount)) * 100 / $DurationMs))
        $filled = [math]::Floor($pct / 100 * $width)
        $bar = "█" * $filled + "░" * ($width - $filled)
        $pctStr = "$pct%".PadLeft(3)
        Write-Host -NoNewline "$dim  $hline`r$green[$bar]$reset $yellow$bold$pctStr$reset $green$Message$reset"
        Start-Sleep -Milliseconds 30
        Write-Host -NoNewline "$(" " * 60)"
        Write-Host -NoNewline "`r"
    } while ($sw.ElapsedMilliseconds -lt $DurationMs)
    $bar = "█" * $width
    Write-Host "$green[$bar]$reset $yellow$bold100%$reset $green$Message$reset"
}

# Clear screen
Clear-Host

# --- Banner ---
$phosphor = "$amber$bold"
Write-Host ""
Write-Host "    ╔═══════════════════════════════════════════════════════════════════╗"
Write-Host "    ║$reset                                                                    ║"
Write-Host "    ║  $phosphor╔╗ ┌─┐┌─┐┬┌─┐┌┐ ┌┐┌┐  $reset$amber RETRO SOUND $reset                            ║"
Write-Host "    ║  $phosphor║╚╦╝┌─┘│  │├┤ ║║║║  $reset$amber CRT SIGNAL $reset                            ║"
Write-Host "    ║  $phosphor╚╗╩╝└─┘└─┘┴└─�┘┚═╝╚╩╝  $reset$amber WORKSTATION v1.0 $reset                            ║"
Write-Host "    ║$reset                                                                    ║"
Write-Host "    ║$amber$bold   ██████╗ ███████╗██╗   ██╗  ███╗   ██╗ ██████╗  $reset" + " " * 12 + "║"
Write-Host "    ║$amber$bold   ██╔══██╗██╔════╝██║   ██║  ████╗  ██║██╔═══██╗ $reset" + " " * 12 + "║"
Write-Host "    ║$amber$bold   ██████╔╝█████╗  ██║   ██║  ██╔██╗ ██║██║   ██║ $reset" + " " * 12 + "║"
Write-Host "    ║$amber$bold   ██╔══██╗██╔══╝  ╚██╗ ██╔╝  ██║╚██╗██║██║   ██║ $reset" + " " * 12 + "║"
Write-Host "    ║$amber$bold   ██║  ██║███████╗ ╚████╔╝   ██║ ╚████║╚██████╔╝ $reset" + " " * 12 + "║"
Write-Host "    ║$amber$bold   ╚═╝  ╚═╝╚══════╝  ╚═══╝    ╚═╝  ╚═══╝ ╚═════╝  $reset" + " " * 12 + "║"
Write-Host "    ║$reset" + (" " * 71) + "║"
Write-Host "    ║$amber$bold" + (" " * 15) + "SYSTEM READY - CRT TERMINAL EDITION" + (" " * 15) + "$reset║"

Write-Host "    ╚═══════════════════════════════════════════════════════════════════╝$reset"
Write-Host ""

# --- Boot sequence ---
Write-Host ""
Write-Status $cyan "BOOT" "Initializing workstation environment..."

Write-Status $cyan "CHECK" "Scanning for Python 3..."
$pyVer = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Status $red "FAIL" "Python not found on PATH. Install Python 3 and retry."
    pause
    exit 1
}
Write-Status $green "OK" $pyVer

Write-Status $cyan "CHECK" "Verifying Python dependencies..."
$depCheck = python -c "import flask, requests" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Status $yellow "WARN" "Dependencies missing - installing from requirements.txt..."
    Write-ProgressBar "Installing pip dependencies" 3000
    pip install -r "$PWD\backend\requirements.txt" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Status $red "FAIL" "pip install failed. Check your internet connection."
        pause
        exit 1
    }
    Write-Status $green "OK" "Dependencies installed successfully."
} else {
    Write-Status $green "OK" "flask, requests present"
}

if (-not (Test-Path "$PWD\backend\server.py")) {
    Write-Status $red "FAIL" "backend\server.py not found."
    pause
    exit 1
}

# --- Configuration display ---
Write-Host ""
Write-Host "$dim        $hline"
Write-Status $magenta "CONFIG" "Server:      Flask API + Static file server"
Write-Status $magenta "CONFIG" "Root:        $PWD"
Write-Status $magenta "CONFIG" "Port:        $Port (override with -Port or PORT env)"
Write-Status $magenta "CONFIG" "Browser:     http://localhost:$Port"
Write-Host "$dim        $hline$reset"
Write-Host ""

# --- Boot countdown ---
Write-Host "        $amber$bold[BOOT]  $reset$amber Powering up CRT monitor...$reset"
Write-ProgressBar "Calibrating phosphor array" 1000
Write-ProgressBar "Initializing audio subsystem" 1000
Write-ProgressBar "Mounting /dev/crt" 1000
Write-Host ""
Write-Host "        $green$bold[SYNC]  $reset$green Warm - all systems nominal$reset"
Write-Host ""
Write-Host "$dim        $hline$reset"
Write-Host ""

# --- Open browser ---
if (-not $NoBrowser) {
    Write-Host "        $cyan$bold[BROWSE] $reset$cyan Launching browser...$reset"
    Start-Process "http://localhost:$Port"
}

# --- Launch server ---
Write-Host "        $yellow$bold[RUN]    $reset$yellow python backend\server.py$reset"
Write-Host "        $yellow$bold[LOG]    $reset$yellow Server output below:$reset"
Write-Host ""
Write-Host "$dim    ================================================================$reset"
Write-Host ""

try {
    Push-Location "$PWD\backend"
    $env:PORT = $Port
    & python server.py
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "$dim    ================================================================$reset"
Write-Host "        $red$bold[SHUTDOWN] $reset$red Server stopped.$reset"
Write-Host "                  $red Retro Sound offline. Powering down CRT...$reset"
Write-Host "$dim    ================================================================$reset"
Write-Host ""
pause
