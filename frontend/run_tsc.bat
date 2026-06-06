@echo off
cd /d "C:\Users\priya\Forged-Final\frontend"
node node_modules\typescript\bin\tsc --noEmit
echo.
echo EXIT_CODE: %ERRORLEVEL%
