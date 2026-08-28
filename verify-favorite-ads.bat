@echo off
title Meta Ad Tracker — Favorite Products Ad Status Verifier
cd /d "%~dp0"
echo ===================================================
echo   🌟 Meta Tracker — Favorite Products Ad Verifier  
echo      (Zero Firecrawl / Zero Apify Credits)         
echo ===================================================
echo Checking active Meta ads for favorite products...
echo.
npm run verify:favorites -- %*
echo.
echo ===================================================
echo Verification process completed.
echo ===================================================
pause
