#!/bin/bash
set -e

# Inclui diretórios padrão de instalação do Go e Wails no PATH
export PATH="$PATH:$HOME/go/bin:/usr/local/go/bin"

echo "========================================"
echo "  Compilando ST Explorer (Wails)"
echo "========================================"

# Verifica se o Go está instalado
if ! command -v go &> /dev/null; then
    echo "[ERRO] Go CLI não encontrado no PATH."
    echo "Por favor, instale o Go: https://go.dev/dl/"
    exit 1
fi

# Verifica se o Wails está instalado
if ! command -v wails &> /dev/null; then
    echo "[ERRO] Wails CLI não encontrado."
    echo "Instale o Wails com:"
    echo "  go install github.com/wailsapp/wails/v2/cmd/wails@latest"
    echo "E certifique-se de que '\$HOME/go/bin' está no seu PATH."
    exit 1
fi

# Detecta se está no Linux e se requer a tag webkit2_41
BUILD_TAGS=""
if [ "$(uname -s)" = "Linux" ]; then
    if pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
        echo "[INFO] webkit2gtk-4.1 detectado. Ativando tag -tags webkit2_41"
        BUILD_TAGS="-tags webkit2_41"
    fi
fi

echo "[1/1] Iniciando build do executável..."
wails build $BUILD_TAGS "$@"

echo ""
echo "[SUCESSO] Compilação concluída!"
echo "O executável foi gerado em: build/bin/STExplorer"
echo ""
