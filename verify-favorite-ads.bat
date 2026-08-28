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
    echo Select Check Mode:
    echo  [1] Quick Check  - Check active ads (skips already inactive products)
    echo  [2] Full Recheck - Check ALL ads (re-checks inactive/archived to restore them)
    echo.
    set /p choice="Enter choice [1 or 2, default is 1]: "
    if "%choice%"=="2" set "MODE_ARGS=--force"
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
