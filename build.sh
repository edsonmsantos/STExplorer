#!/bin/bash
set -e

echo "========================================"
echo "  Compilando SFTP Explorer (Wails)"
echo "========================================"

# Verifica se o Wails está instalado
if ! command -v wails &> /dev/null; then
    echo "[ERRO] Wails CLI nao encontrado."
    echo "Por favor, instale o Wails: https://wails.io/docs/introduction/installation"
    exit 1
fi

echo "[1/1] Iniciando build do executavel..."
wails build

echo ""
echo "[SUCESSO] Compilacao concluida!"
echo "O executavel foi gerado em: build/bin/STExplorer"
echo ""
