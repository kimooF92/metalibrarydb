@echo off
title Meta Ad Tracker — Product Scraper Worker
cd /d "%~dp0"
echo ===================================================
echo   Meta Ad Tracker — Bulk Product Scraper Worker   
echo ===================================================
echo Starting batch product scraping across landing pages...
echo.
npm run scrape:products
echo.
echo Process finished.
pause
