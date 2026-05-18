set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

CERT_FILE="$ROOT_DIR/localhost.pem"
KEY_FILE="$ROOT_DIR/localhost-key.pem"

if [[ -f "$CERT_FILE" || -f "$KEY_FILE" ]]; then
    echo "Файлы $CERT_FILE / $KEY_FILE уже существуют. Перезаписать? (y/N)"
    read -r answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
        echo "Отменено."
        exit 0
    fi
fi

if command -v mkcert >/dev/null 2>&1; then
    echo "Найден mkcert — генерируем доверенный сертификат."
    cd "$ROOT_DIR"
    mkcert -install
    mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 ::1
    echo "Готово: $CERT_FILE и $KEY_FILE"
    exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
    echo "Нужен mkcert или openssl. Ни тот, ни другой не найден в PATH." >&2
    exit 1
fi

echo "mkcert не найден — генерируем самоподписанный сертификат через openssl."
echo "В браузере будет предупреждение, нажмите 'Дополнительно → Перейти на сайт'."

openssl req -newkey rsa:2048 -nodes -x509 -days 365 \
    -keyout "$KEY_FILE" \
    -out    "$CERT_FILE" \
    -subj "//C=RU/ST=Local/L=Local/O=Notes App/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1"

echo ""
echo "Готово."
echo "  Сертификат: $CERT_FILE"
echo "  Ключ:       $KEY_FILE"
echo "Запуск:  cd notes-app && npm run start:https"
