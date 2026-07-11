# Налаштування бота @q_moviebot (разово, ~5 хвилин)

Домен апки: **https://quick-movie-wheat.vercel.app**

Після цього вхід у бот виглядатиме максимально нативно, як застосунок:
лого-заставка → одна кнопка «▶️ Почати пошук» → відкривається апка.

> Важливо: кнопку **START** для нового користувача прибрати неможливо — це обмеження самого Telegram.
> Але вона стає непомітною частиною флоу: ще ДО старту користувач бачить картинку-опис бота,
> а одразу після натискання START миттєво прилітає заставка з лого і кнопкою.
> Кнопка меню (зліва внизу чату) відкриває апку взагалі без /start.

## Крок 0. Задеплоїти проєкт

Спочатку задеплойте оновлений код на Vercel (git push або `vercel --prod`).

## Крок 1. Змінні оточення у Vercel

Project → Settings → Environment Variables:

| Змінна | Значення |
|---|---|
| `BOT_TOKEN` | токен бота від @BotFather |
| `WEBAPP_URL` | `https://quick-movie-wheat.vercel.app` |

Після додавання — Redeploy.

## Кроки 2–4 БЕЗ терміналу (просто в браузері)

Встав свій токен замість `ТОКЕН` і відкрий ці 3 посилання в браузері по черзі
(після кожного має з'явитись `{"ok":true...}`):

```
https://api.telegram.org/botТОКЕН/setWebhook?url=https://quick-movie-wheat.vercel.app/api/bot
```
```
https://api.telegram.org/botТОКЕН/setChatMenuButton?menu_button=%7B%22type%22%3A%22web_app%22%2C%22text%22%3A%22QuickMovie%22%2C%22web_app%22%3A%7B%22url%22%3A%22https%3A%2F%2Fquick-movie-wheat.vercel.app%22%7D%7D
```
```
https://api.telegram.org/botТОКЕН/setMyCommands?commands=%5B%5D
```

## Крок 2. Webhook (заставка при /start)

Виконайте в терміналі, підставивши лише токен:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://quick-movie-wheat.vercel.app/api/bot"
```

Перевірка: `curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"`

## Крок 3. Кнопка меню = відкриває апку (без /start)

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d '{"menu_button":{"type":"web_app","text":"QuickMovie","web_app":{"url":"https://quick-movie-wheat.vercel.app"}}}'
```

## Крок 4. Прибрати старе меню з командами

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setMyCommands" \
  -H "Content-Type: application/json" \
  -d '{"commands":[]}'
```

## Крок 5. BotFather — вигляд «як застосунок»

У @BotFather → `/mybots` → @q_moviebot:

1. **Edit Bot → Edit Description** — текст, який видно ДО натискання START:
   `🎬 Свайпай трейлери як TikTok. ШІ-пошук фільмів. Спільний вішліст з друзями. Тисни START ↓`
2. **Edit Bot → Edit Description Picture** — завантажте `public/logo.png` (це і є «заставка» до старту).
3. **Bot Settings → Configure Mini App → Enable Mini App** — вкажіть `https://quick-movie-wheat.vercel.app`.
   Це вмикає кнопку **«Відкрити додаток»** у профілі бота та посилання-запрошення
   виду `https://t.me/q_moviebot?startapp=...` (їх використовує кнопка «Надіслати запрошення» у профілі).

## Що вийде в результаті

- Профіль бота: лого + опис + кнопка «Відкрити додаток».
- Новий користувач: заставка з лого → START → миттєво лого + «▶️ Почати пошук».
- Будь-яке повідомлення боту → та сама заставка з кнопкою (бот ніколи не «мовчить»).
- Кнопка меню в чаті відкриває апку одним тапом, без жодних команд.
