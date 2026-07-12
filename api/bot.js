// Telegram bot webhook.
// On /start (and any other message) replies instantly with the app splash:
// text message + single "Почати пошук" button that opens the Mini App.
// Setup instructions: see BOT_SETUP.md in the project root.

const tgCall = async (token, method, payload) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) console.error(`[Bot] ${method} failed:`, JSON.stringify(data));
  return data;
};

export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'BOT_TOKEN not configured in Vercel' });

  // App URL: env override or the current deployment domain
  const appUrl = process.env.WEBAPP_URL || `https://${req.headers.host}`;

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, hint: 'QuickMovie bot webhook. POST updates here.' });
  }

  const update = req.body || {};

  try {
    // Answer callback queries so buttons never show a spinner
    if (update.callback_query) {
      await tgCall(token, 'answerCallbackQuery', { callback_query_id: update.callback_query.id });
    }

    const msg = update.message;
    // Reply only in private chats; any text (including /start) gets the splash.
    // Text can be overridden via Vercel env var BOT_CAPTION.
    if (msg?.chat?.id && msg.chat.type === 'private') {
      await tgCall(token, 'sendMessage', {
        chat_id: msg.chat.id,
        text: process.env.BOT_CAPTION || '🎬 <b>QuickMovie</b>\n\n📺 Переглядай трейлери\n⏳ Відкладай на потім\n👥 Спільний Watchlist\n🤖 AI-пошук по опису\n🔔 Нагадування про вихід фільмів',
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '▶️ Почати пошук', web_app: { url: appUrl } }
          ]]
        }
      });
    }
  } catch (e) {
    console.error('[Bot] handler error:', e.message);
  }

  // Always 200 so Telegram doesn't retry-flood the endpoint
  return res.status(200).json({ ok: true });
}
