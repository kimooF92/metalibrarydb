@echo off
title Meta Ad Tracker — Favorite Products Ad Status Verifier
cd /d "%~dp0"
echo ===================================================
echo   🌟 Meta Tracker — Favorite Products Ad Verifier  
echo      (Zero Firecrawl / Zero Apify Credits)         
echo ===================================================
echo.

set "MODE_ARGS=%*"

if "%~1"=="" (
    echo Select Verification Mode:
    echo  [1] Pending Only - Scan ONLY products queued from UI (Fastest, ~3s)
    echo  [2] Quick Check  - Routine favorites check (skips inactive products)
    echo  [3] Full Recheck - Check ALL ads from scratch (including stopped ones)
    echo.
    set /p choice="Enter choice [1, 2, or 3, default is 1]: "
    if "%choice%"=="1" set "MODE_ARGS=--pending"
    if "%choice%"=="2" set "MODE_ARGS="
    if "%choice%"=="3" set "MODE_ARGS=--force"
    if "%choice%"=="" set "MODE_ARGS=--pending"
)

echo.
echo Running verification with parameters: %MODE_ARGS%
echo.
npm run verify:favorites -- %MODE_ARGS%
echo.
echo ===================================================
echo Verification process completed.
echo ===================================================
pause
