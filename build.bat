@echo off
setlocal
echo ========================================
echo   Compilando SFTP Explorer (Wails)
echo ========================================

:: Verifica se o Wails está instalado
where wails >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Wails CLI nao encontrado. 
    echo Por favor, instale o Wails: https://wails.io/docs/introduction/installation
    pause
    exit /b 1
)

echo [1/1] Iniciando build do executavel...
wails build

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha na compilacao. Verifique as mensagens acima.
    pause
    exit /b %errorlevel%
)

echo.
echo [SUCESSO] Compilacao concluida!
echo O executavel foi gerado em: build\bin\explorer.exe
echo.
pause
