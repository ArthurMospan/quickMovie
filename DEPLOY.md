# Як деплоїти (єдиний правильний спосіб)

```
npm run deploy
```

Це робить `git add + commit + push`. Vercel підхоплює push з GitHub і сам
викочує на **https://quick-movie-wheat.vercel.app** за 1–2 хвилини.

## ⚠️ НЕ використовуй `vercel --prod`

Ця папка була прив'язана до ІНШОГО Vercel-проєкту («quickmovie»), тому
`vercel --prod` деплоїть не туди, куди треба, і виникає плутанина
(на сайті «нічого не змінилось»). Прод оновлюється ТІЛЬКИ через git push.

## Перевірка після деплою

- https://quick-movie-wheat.vercel.app/api/bot → `{"ok":true...}`
- Vercel Dashboard → проєкт з доменом quick-movie-wheat → Deployments → останній має бути з твого коміта.

## Змінні оточення

Мають бути у проєкті з доменом quick-movie-wheat (Settings → Environment Variables):
`BOT_TOKEN`, `WEBAPP_URL`, а також усі `VITE_FIREBASE_*`, `VITE_TMDB_API_TOKEN`, `GEMINI_API_KEY`.
