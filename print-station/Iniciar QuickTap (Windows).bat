@echo off
setlocal
cd /d "%~dp0"

rem --- Arranca el mini-servidor local (oculto) si no esta corriendo ya ---
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0serve.ps1"

rem --- Crea un acceso directo en el Escritorio la primera vez que se abre ---
set SHORTCUT=%USERPROFILE%\Desktop\QuickTap - Estacion de Impresion.lnk
if not exist "%SHORTCUT%" (
    powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0icon.ico'; $s.WindowStyle=7; $s.Description='Estacion de Impresion QuickTap'; $s.Save()"
)

timeout /t 1 /nobreak >nul

rem --- Busca Chrome o Edge para abrir en "modo app" (sin barra de direcciones) ---
set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"

set EDGE="%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist %EDGE% set EDGE="%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

rem --kiosk-printing imprime directo en la impresora predeterminada de Windows,
rem sin mostrar el dialogo de "Imprimir". Necesita un --user-data-dir aparte:
rem con el perfil normal de Chrome, si ya hay una ventana abierta, el navegador
rem ignora estos flags en la ventana nueva.
set PROFILE_DIR=%LocalAppData%\QuickTapPrintStation

if exist %CHROME% (
    start "" %CHROME% --app=http://localhost:5500 --kiosk-printing --user-data-dir="%PROFILE_DIR%"
) else if exist %EDGE% (
    start "" %EDGE% --app=http://localhost:5500 --kiosk-printing --user-data-dir="%PROFILE_DIR%"
) else (
    start "" http://localhost:5500
)
