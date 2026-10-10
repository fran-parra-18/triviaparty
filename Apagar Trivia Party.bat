@echo off
chcp 65001 >nul
title Apagar Trivia Party
cd /d "%~dp0"

set "PORT=3001"
if not "%TRIVIA_PORT%"=="" set "PORT=%TRIVIA_PORT%"

rem Busca el proceso de Node que escucha en el puerto del juego y lo detiene.
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; $p = $c | ForEach-Object { Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue } | Where-Object { $_.ProcessName -eq 'node' } | Select-Object -Unique; if ($p) { $p | Stop-Process -Force; exit 0 } else { exit 1 }"
if %errorlevel%==0 (
  echo.
  echo   Trivia Party se apago correctamente.
) else (
  echo.
  echo   Trivia Party no estaba funcionando.
)
ping -n 4 127.0.0.1 >nul
