@echo off
title Meta Ad Library Tracker Worker
cd /d "%~dp0"
set ENQUEUE_SPY=true

if not "%~1"=="" goto RUN_WITH_ARGS

:SHOW_MENU
echo ========================================================
echo        Meta Ad Library Tracker — Worker Runner          
echo ========================================================
echo.
echo Select Worker and Browser Execution Mode:
echo.
echo  [1] Headless Mode          - Runs silently in background (Default)
echo  [2] Visible Window (Normal)- Watch Chromium browser GUI live
echo  [3] Creative Spy (Headless)- Only scan ad creatives in background
echo  [4] Creative Spy (Visible) - Only scan ad creatives with browser GUI
echo  [5] Count Only Mode        - Fast ad count refresh (no creatives)
echo.
set "choice=1"
set /p "choice=Enter choice [1-5, default is 1]: "

if "%choice%"=="1" goto MODE_1
if "%choice%"=="2" goto MODE_2
if "%choice%"=="3" goto MODE_3
if "%choice%"=="4" goto MODE_4
if "%choice%"=="5" goto MODE_5
goto MODE_1

:MODE_1
set "CMD_TO_RUN=npm run worker:headless"
set "LABEL=Headless Mode (Background)"
goto EXECUTE

:MODE_2
set "CMD_TO_RUN=npm run worker:head"
set "LABEL=Normal Window Mode (Visible Browser)"
goto EXECUTE

:MODE_3
set "CMD_TO_RUN=npm run worker:headless -- --creative-only"
set "LABEL=Creative Spy (Headless Mode)"
goto EXECUTE

:MODE_4
set "CMD_TO_RUN=npm run worker:head -- --creative-only"
set "LABEL=Creative Spy (Visible Window Mode)"
goto EXECUTE

:MODE_5
set "CMD_TO_RUN=npm run worker:count"
set "LABEL=Count Only Mode"
goto EXECUTE

:RUN_WITH_ARGS
set "CMD_TO_RUN=npm run worker -- %*"
set "LABEL=Custom Arguments (%*)"
goto EXECUTE

:EXECUTE
echo.
echo --------------------------------------------------------
echo Starting: %LABEL%
echo Command : %CMD_TO_RUN%
echo --------------------------------------------------------
echo.

call %CMD_TO_RUN%

echo.
echo ========================================================
echo Worker process has finished or was stopped.
echo ========================================================
pause

