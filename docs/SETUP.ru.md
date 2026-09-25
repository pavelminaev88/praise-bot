# Запуск бота на Cloudflare — по шагам

Нужно один раз, ~10 минут. После этого каждый push в GitHub автоматически обновляет бота.

## 0. Что должно быть готово
- Бот в BotFather (у нас: @PohvalaChatBot). Токен: BotFather → /mybots → бот → **API Token**.
- В BotFather: /mybots → бот → **Bot Settings → Group Privacy → Turn off** (иначе в группах бот не видит @упоминания).
- Ключ Anthropic: https://console.anthropic.com → API Keys.
- Ключ OpenAI (для голосовых): https://platform.openai.com/api-keys.
- Аккаунт Cloudflare.

## 1. Подключить репозиторий
1. Открой https://dash.cloudflare.com/?to=/:account/workers-and-pages — откроется страница **Workers & Pages**.
2. **Create application** → **Get started** рядом с **Import a repository**.
3. **Git account** → подключи GitHub (GitHub спросит разрешение — разреши доступ к репозиторию `praise-bot`).
4. Выбери `praise-bot` → оставь настройки по умолчанию → **Save and Deploy**.
5. Дождись зелёного статуса сборки. База D1, хранилище KV и Workflow создадутся сами.

Если сборка упала с ошибкой про KV или D1 — напиши, создадим их вручную (2 минуты).

## 2. Ввести ключи
Worker `praise-bot` → **Settings** → **Variables and Secrets** → **Add**:

| Имя | Тип | Значение |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Secret | токен из BotFather |
| `ANTHROPIC_API_KEY` | Secret | ключ Anthropic |
| `OPENAI_API_KEY` | Secret | ключ OpenAI |
| `ADMIN_TELEGRAM_ID` | Text | твой Telegram ID (узнать: написать @userinfobot) — включает /stats |

→ **Deploy**.

## 3. Подключить Telegram
Открой в браузере `https://praise-bot.<твой-поддомен>.workers.dev/setup` (адрес Worker видно на его странице в Cloudflare).
Должно показать `"ok": true` и имя бота.

## 4. Проверить
- В личке: текст, голосовое, кнопка 🔥, /mydata, /forget, /privacy, /stats.
- В группе: добавь бота, напиши `@PohvalaChatBot я сегодня …`; ответь на чужое сообщение с тегом бота.

## 5. Выключить старого бота в n8n
Когда новый работает — выключи workflow «ПохвалаБот LIVE» в n8n.

## Если что-то не так
Worker → **Logs** (Observability). В логах нет текстов сообщений — только тип ошибки.
