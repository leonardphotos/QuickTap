@echo off
REM Lanzador del diagnostico paso a paso. Mismo motivo que el otro .bat:
REM Windows bloquea los .ps1 descargados y la DLL necesita el PowerShell de 32 bits.
setlocal
cd /d "%~dp0"
set "PS32=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS32%" set "PS32=powershell.exe"
"%PS32%" -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0' -Recurse | Unblock-File -ErrorAction SilentlyContinue"
"%PS32%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0DIAGNOSTICO.ps1" %*
if errorlevel 1 (
  echo.
  echo No se pudo ejecutar PowerShell.
  pause
)
endlocal
