// Daily cron (see vercel.json → crons): finds users whose saved release
// reminders are due today (or overdue) and sends them a Telegram message
// via the bot. Reminders are stored by the app in users/{uid}.reminders
// as [{ id, title, date: 'YYYY-MM-DD' }].
//
// Firestore is accessed through its REST API with an anonymous Firebase
// auth token (the same auth model the web app uses), so no service account
// is needed. Required env vars (already set for the app):
//   BOT_TOKEN, VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID

const tgSend = (token, chatId, text) =>
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
  });

export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!token || !apiKey || !projectId) {
    return res.status(500).json({ error: 'Missing env: BOT_TOKEN / VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID' });
  }

  // 1. Anonymous Firebase auth (Firestore rules allow authed clients)
  let idToken = null;
  try {
    const authRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
    );
    idToken = (await authRes.json()).idToken || null;
  } catch (e) { /* fall through — rules may be open */ }

  const fsBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const authHeaders = idToken ? { Authorization: `Bearer ${idToken}` } : {};

  const today = new Date().toISOString().slice(0, 10);
  let sent = 0, checked = 0, errors = 0;

  try {
    let pageToken = '';
    do {
      const listUrl = `${fsBase}/users?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
      const listRes = await fetch(listUrl, { headers: authHeaders });
      const data = await listRes.json();
      if (data.error) throw new Error(`Firestore: ${data.error.message}`);
      pageToken = data.nextPageToken || '';

      for (const docItem of data.documents || []) {
        checked++;
        const uid = docItem.name.split('/').pop();
        if (!uid.startsWith('tg_')) continue;

        const values = docItem.fields?.reminders?.arrayValue?.values || [];
        if (values.length === 0) continue;

        const reminders = values.map(v => {
          const f = v.mapValue?.fields || {};
          return {
            id: Number(f.id?.integerValue ?? f.id?.doubleValue ?? 0),
            title: f.title?.stringValue || 'Фільм',
            date: f.date?.stringValue || ''
          };
        });

        const due = reminders.filter(r => r.date && r.date <= today);
        if (due.length === 0) continue;

        const chatId = uid.replace('tg_', '');
        for (const r of due) {
          try {
            await tgSend(token, chatId, `🍿 Сьогодні прем'єра — <b>«${r.title}»</b>!\n\nВідкривай QuickMovie, дивись трейлер ще раз і додавай у вотчліст 🎬`);
            sent++;
          } catch (e) { errors++; }
        }

        // Remove the sent reminders from the user's doc
        const left = reminders.filter(r => !(r.date && r.date <= today));
        await fetch(`${fsBase}/users/${uid}?updateMask.fieldPaths=reminders`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            fields: {
              reminders: {
                arrayValue: {
                  values: left.map(r => ({
                    mapValue: {
                      fields: {
                        id: { integerValue: String(r.id) },
                        title: { stringValue: r.title },
                        date: { stringValue: r.date }
                      }
                    }
                  }))
                }
              }
            }
          })
        });
      }
    } while (pageToken);
  } catch (e) {
    return res.status(500).json({ error: e.message, checked, sent, errors });
  }

  return res.status(200).json({ ok: true, today, checked, sent, errors });
}
