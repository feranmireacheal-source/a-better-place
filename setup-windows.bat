@echo off
cd /d "%~dp0"
echo Installing packages (needs internet, takes a few minutes)...
call npm install
if errorlevel 1 (echo INSTALL FAILED & pause & exit /b 1)
if not exist .env copy .env.example .env
echo.
echo Done. Now open the .env file in VS Code, add your Supabase URL and anon key, then double-click run-dev.bat
pause
