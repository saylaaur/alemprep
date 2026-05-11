#!/bin/bash
# Двойной клик по этому файлу = установка зависимостей + запуск dev-сервера.
set -e

cd "$(dirname "$0")"

echo ""
echo "================================================"
echo "  AlemPrep — локальный запуск"
echo "================================================"
echo ""

# Проверяем Node
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Не найден Node.js."
  echo "   Установи его: https://nodejs.org/ (LTS)"
  echo ""
  read -n 1 -s -r -p "Нажми любую клавишу, чтобы закрыть…"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Нужен Node.js 18 или новее. Сейчас: $(node -v)"
  read -n 1 -s -r -p "Нажми любую клавишу, чтобы закрыть…"
  exit 1
fi

echo "✓ Node.js $(node -v)"
echo ""

# Создаём .env.local из примера, если его нет
if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
  echo "✓ Создан .env.local (пока с заглушками — авторизация не заработает,"
  echo "  но UI откроется. Заполни ключи Supabase, чтобы включить логин.)"
  echo ""
fi

# Устанавливаем зависимости, если node_modules нет
if [ ! -d node_modules ]; then
  echo "→ Устанавливаю зависимости (это занимает ~1–2 минуты)…"
  echo ""
  npm install
  echo ""
fi

echo "→ Запускаю dev-сервер на http://localhost:3000"
echo "  Когда увидишь 'Ready in …' — открой ссылку в браузере."
echo "  Чтобы остановить: Ctrl+C в этом окне."
echo ""

# Откроем браузер автоматически через 4 секунды
( sleep 4 && open "http://localhost:3000" ) &

npm run dev
