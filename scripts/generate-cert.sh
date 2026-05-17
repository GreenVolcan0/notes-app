#!/usr/bin/env bash
# =====================================================================
# generate-cert.sh — генератор самоподписанного TLS-сертификата для localhost.
# Практическое занятие №15. HTTPS + App Shell.
# =====================================================================
#
# Зачем нужен сертификат:
#   Service Worker и многие современные API (геолокация, push, камеры)
#   работают ТОЛЬКО по HTTPS. На localhost браузеры делают исключение
#   (можно по http), но методичка требует именно HTTPS — это ближе
#   к реальной production-конфигурации, и Lighthouse PWA-аудит даёт
#   высокие баллы только при HTTPS.
#
# Какой сертификат лучше использовать:
#   1. ИДЕАЛЬНО — mkcert (https://github.com/FiloSottile/mkcert):
#      создаёт локальный CA и устанавливает его в системное хранилище,
#      браузер ему ДОВЕРЯЕТ → нет жёлтого предупреждения "не защищено".
#      Установка:
#        Windows: choco install mkcert  (или scoop install mkcert)
#        macOS:   brew install mkcert
#        Linux:   apt install libnss3-tools && скачать бинарь с GitHub
#      Использование:
#        mkcert -install                       # один раз — добавить CA
#        mkcert localhost 127.0.0.1 ::1        # выпустить сертификат
#
#   2. ЕСЛИ mkcert НЕ УСТАНОВЛЕН — этот скрипт. Он использует openssl,
#      который идёт в Git for Windows и стандартен на macOS/Linux.
#      Минус: сертификат самоподписанный, браузер покажет предупреждение
#      "Ваше подключение не защищено". Нужно нажать
#      "Дополнительно → Перейти на сайт (небезопасно)" — для разработки ОК.
#
# Запуск:
#   bash notes-app/scripts/generate-cert.sh
#
# Результат:
#   В корне проекта появятся localhost.pem (сертификат)
#   и localhost-key.pem (приватный ключ).
#   Они уже включены в .gitignore — в репозиторий НЕ попадут.
# =====================================================================

set -euo pipefail

# Папка, куда складывать ключи: корень репозитория (на уровень выше папки notes-app).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

CERT_FILE="$ROOT_DIR/localhost.pem"
KEY_FILE="$ROOT_DIR/localhost-key.pem"

# Если уже есть — спрашиваем, перезаписывать ли.
if [[ -f "$CERT_FILE" || -f "$KEY_FILE" ]]; then
    echo "Файлы $CERT_FILE / $KEY_FILE уже существуют. Перезаписать? (y/N)"
    read -r answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
        echo "Отменено."
        exit 0
    fi
fi

# Если есть mkcert — используем его (доверенный сертификат).
if command -v mkcert >/dev/null 2>&1; then
    echo "Найден mkcert — генерируем доверенный сертификат."
    cd "$ROOT_DIR"
    mkcert -install
    mkcert -cert-file localhost.pem -key-file localhost-key.pem localhost 127.0.0.1 ::1
    echo "Готово: $CERT_FILE и $KEY_FILE"
    exit 0
fi

# Иначе — fallback на openssl.
if ! command -v openssl >/dev/null 2>&1; then
    echo "Нужен mkcert или openssl. Ни тот, ни другой не найден в PATH." >&2
    exit 1
fi

echo "mkcert не найден — генерируем самоподписанный сертификат через openssl."
echo "В браузере будет предупреждение, нажмите 'Дополнительно → Перейти на сайт'."

# -newkey rsa:2048   — генерируем новую RSA-пару 2048 бит.
# -nodes             — не шифровать приватный ключ паролем (для localhost ОК).
# -x509              — создать самоподписанный сертификат, а не CSR.
# -days 365          — срок действия 1 год.
# -subj              — поля сертификата (Common Name = localhost).
# -addext            — Subject Alternative Name: важно, без него современные
#                      браузеры считают сертификат недействительным.
# ДВОЙНОЙ слэш в начале -subj — это обход магической конвертации путей
# в Git Bash на Windows: одиночный `/C=RU/...` подсистема MSYS видит как
# unix-путь и подменяет на `C:/Program Files/Git/C=RU/...`. Двойной `//`
# для MSYS — это уже не unix-путь, и аргумент уходит в openssl как есть.
# На Linux/macOS лишний слэш «съедается» openssl без побочных эффектов.
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
