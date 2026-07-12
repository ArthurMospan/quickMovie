// Daily cron (see vercel.json → crons): finds users whose saved release
// reminders are due today (or overdue) and sends them a Telegram message
// via the bot. Reminders are stored by the app in users/{uid}.reminders
// as [{ id, title, date: 'YYYY-MM-DD' }].
//
// Access paths:
//  1) firebase-admin with FIREBASE_SERVICE_ACCOUNT (preferred — keeps working
//     after Firestore rules are tightened, see SECURITY_SETUP.md);
//  2) legacy fallback: Firestore REST + anonymous auth (works only while
//     rules are open). Required env: BOT_TOKEN, VITE_FIREBASE_API_KEY,
//     VITE_FIREBASE_PROJECT_ID (+ optional FIREBASE_SERVICE_ACCOUNT).
//
// A reminder is deleted ONLY after Telegram confirms the send (ok: true) —
// failed sends stay and retry on the next run.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const getServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { /* maybe base64 */ }
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (e) { return null; }
};

const tgSendOk = async (token, chatId, text) => {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    const data = await r.json().catch(() => ({}));
    return data.ok === true;
  } catch (e) {
    return false;
  }
};

const reminderText = (title) =>
  `🍿 Сьогодні прем'єра — <b>«${title}»</b>!\n\nВідкривай QuickMovie, дивись трейлер ще раз і додавай у вотчліст 🎬`;

// Sends due reminders; returns the list that must STAY in the doc
// (not due yet + failed sends), plus counters.
const processReminders = async (token, uid, reminders, today) => {
  const chatId = uid.replace('tg_', '');
  const keep = [];
  let sent = 0, errors = 0;

  for (const r of reminders) {
    const isDue = r.date && r.date <= today;
    if (!isDue) { keep.push(r); continue; }
    const ok = await tgSendOk(token, chatId, reminderText(r.title));
    if (ok) sent++;
    else { errors++; keep.push(r); } // failed → keep for the next run
  }
  return { keep, sent, errors, changed: keep.length !== reminders.length };
};

// --- Path 1: firebase-admin ---
async function runWithAdmin(token, today) {
  if (getApps().length === 0) initializeApp({ credential: cert(getServiceAccount()) });
  const db = getFirestore();

  let checked = 0, sent = 0, errors = 0;
  const snap = await db.collection('users').get();

  for (const docSnap of snap.docs) {
    checked++;
    const uid = docSnap.id;
    if (!uid.startsWith('tg_')) continue;

    const reminders = (docSnap.data().reminders || []).map(r => ({
      id: Number(r.id) || 0,
      title: r.title || 'Фільм',
      date: r.date || ''
    }));
    if (reminders.length === 0 || !reminders.some(r => r.date && r.date <= today)) continue;

    const out = await processReminders(token, uid, reminders, today);
    sent += out.sent; errors += out.errors;
    if (out.changed) {
      await docSnap.ref.update({ reminders: out.keep });
    }
  }
  return { mode: 'admin', checked, sent, errors };
}

// --- Path 2: legacy REST + anonymous auth (until the service account is configured) ---
async function runWithRest(token, today) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) throw new Error('Missing env: VITE_FIREBASE_API_KEY / VITE_FIREBASE_PROJECT_ID');

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

  let checked = 0, sent = 0, errors = 0;
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
      if (!reminders.some(r => r.date && r.date <= today)) continue;

      const out = await processReminders(token, uid, reminders, today);
      sent += out.sent; errors += out.errors;

      if (out.changed) {
        await fetch(`${fsBase}/users/${uid}?updateMask.fieldPaths=reminders`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            fields: {
              reminders: {
                arrayValue: {
                  values: out.keep.map(r => ({
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
    }
  } while (pageToken);

  return { mode: 'rest', checked, sent, errors };
}

export default async function handler(req, res) {
  const token = process.env.BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'BOT_TOKEN not configured' });

  const today = new Date().toISOString().slice(0, 10);

  try {
    const result = getServiceAccount()
      ? await runWithAdmin(token, today)
      : await runWithRest(token, today);
    return res.status(200).json({ ok: true, today, ...result });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
