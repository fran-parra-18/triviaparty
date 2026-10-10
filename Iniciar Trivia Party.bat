@echo off
chcp 65001 >nul
title Trivia Party
cd /d "%~dp0"

set "PORT=3001"
if not "%TRIVIA_PORT%"=="" set "PORT=%TRIVIA_PORT%"
set "URL=http://localhost:%PORT%/host"

echo.
echo   ==========================================
echo              TRIVIA PARTY
echo   ==========================================
echo.

rem --- Si el juego ya esta funcionando, solo abrimos el navegador ---
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/api/health | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  echo   El juego ya esta en marcha. Abriendo el navegador...
  if not "%TRIVIA_NO_BROWSER%"=="1" start "" "%URL%"
  ping -n 4 127.0.0.1 >nul
  exit /b 0
)

rem --- Node.js es imprescindible ---
where node >nul 2>nul
if errorlevel 1 (
  echo   [ERROR] No se encontro Node.js.
  echo   Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a hacer doble clic.
  echo.
  pause
  exit /b 1
)

rem --- Dependencias (solo la primera vez) ---
if not exist "node_modules\" (
  echo   [1/4] Instalando dependencias ^(solo la primera vez, puede tardar unos minutos^)...
  call npm install
  if errorlevel 1 goto :fallo
) else (
  echo   [1/4] Dependencias ya instaladas.
)

rem --- Compilar si no hay compilacion o si el codigo cambio desde la ultima ---
set "STAMP="
for /f %%i in ('git rev-parse HEAD 2^>nul') do set "STAMP=%%i"
set "OLDSTAMP="
if exist ".build-stamp" set /p OLDSTAMP=<".build-stamp"
set "NEEDBUILD=0"
if not exist "client\dist\index.html" set "NEEDBUILD=1"
if not exist "server\dist\index.js" set "NEEDBUILD=1"
if not "%STAMP%"=="" if not "%STAMP%"=="%OLDSTAMP%" set "NEEDBUILD=1"
if "%NEEDBUILD%"=="1" (
  echo   [2/4] Compilando el juego...
  call npm run build -w client
  if errorlevel 1 goto :fallo
  rem El cliente de Prisma solo se genera si falta (regenerarlo con un servidor abierto falla en Windows).
  if not exist "node_modules\.prisma\client\index.js" (
    pushd server
    call node scripts\prisma.mjs generate
    popd
  )
  pushd server
  call npx tsup
  if errorlevel 1 (popd & goto :fallo)
  popd
  if not "%STAMP%"=="" (echo %STAMP%)>".build-stamp"
) else (
  echo   [2/4] Compilacion al dia.
)

rem --- Base de datos y banco de preguntas (no repite lo que ya existe) ---
echo   [3/4] Preparando la base de datos y las preguntas...
pushd server
call node scripts\prisma.mjs migrate deploy >nul
if errorlevel 1 (popd & goto :fallo)
call node dist\cli\import.js data\questions --quiet
if errorlevel 1 (popd & goto :fallo)
popd

rem --- Arrancar el servidor en su propia ventana ---
echo   [4/4] Iniciando el servidor...
start "Trivia Party - servidor (cierra esta ventana para apagar el juego)" /D "%~dp0server" cmd /k "set NODE_ENV=production&& set PORT=%PORT%&& node dist\index.js"

rem --- Esperar a que responda y abrir el navegador ---
powershell -NoProfile -Command "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/api/health | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; exit 1"
if errorlevel 1 (
  echo   [ERROR] El servidor no respondio. Revisa la ventana "Trivia Party - servidor".
  pause
  exit /b 1
)

echo.
echo   Listo. Abriendo %URL%
echo   Los celulares deben estar en la misma red Wi-Fi y escanear el QR de la pantalla.
echo   Para apagar el juego, cierra la ventana "Trivia Party - servidor".
if not "%TRIVIA_NO_BROWSER%"=="1" start "" "%URL%"
ping -n 6 127.0.0.1 >nul
exit /b 0

:fallo
echo.
echo   [ERROR] Algo fallo. Revisa los mensajes de arriba.
pause
exit /b 1
