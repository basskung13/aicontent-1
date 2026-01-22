@echo off
:: Install Custom URL Protocol for Desktop Agent
:: Run as Administrator

echo ========================================
echo   Installing AutoPost URL Protocol
echo ========================================

set "AGENT_PATH=%~dp0start_agent.bat"

:: Add Registry entries for autopost:// protocol
reg add "HKCU\Software\Classes\autopost" /ve /d "URL:AutoPost Protocol" /f
reg add "HKCU\Software\Classes\autopost" /v "URL Protocol" /d "" /f
reg add "HKCU\Software\Classes\autopost\shell\open\command" /ve /d "\"%AGENT_PATH%\"" /f

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo Now you can click the button in Extension
echo to start Desktop Agent automatically.
echo.
pause
