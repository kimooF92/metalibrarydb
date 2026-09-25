@echo off
title Meta Ad Library Tracker Worker
cd /d "%~dp0"
echo Starting Meta Ad Library Tracker Worker...
set ENQUEUE_SPY=true
npm run worker
pause
