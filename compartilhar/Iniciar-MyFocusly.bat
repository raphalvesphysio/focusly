@echo off
setlocal
set "APP_URL=https://myfocusly.netlify.app/legacy/"
set "PROFILE_DIR=%LOCALAPPDATA%\MyFocusly\BrowserProfile"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

rem Perfil proprio = pasta de backup lembrada entre aberturas (IndexedDB do navegador).
rem Na 1a vez: clique em Escolher pasta de backup. Depois disso, abre ja sincronizado.

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --user-data-dir="%PROFILE_DIR%" --app="%APP_URL%"
  exit /b 0
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --user-data-dir="%PROFILE_DIR%" --app="%APP_URL%"
  exit /b 0
)

rem Fallback: navegador padrao
start "" "%APP_URL%"
