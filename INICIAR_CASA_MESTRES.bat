@echo off
cd /d "%~dp0"
if not exist .env (
  echo FALTA CONFIGURAR L'APP.
  echo Copia .env.example amb el nom .env i escriu ADMIN_USER i ADMIN_PASSWORD.
  pause
  exit /b 1
)
node server.js
if errorlevel 1 pause
