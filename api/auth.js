// Verified Telegram auth: exchanges Mini App initData for a Firebase custom
// token with uid tg_<id>. The initData signature is validated server-side
// (HMAC-SHA256 with the bot token, per Telegram docs), so nobody can mint a
// token for someone else's account. With this, Firestore rules can finally
// enforce "you can only write your own doc" (see firestore.rules).
//
// Required env: BOT_TOKEN, FIREBASE_SERVICE_ACCOUNT (JSON or base64 JSON —
// Firebase console → Project settings → Service accounts → Generate new key).
// Until FIREBASE_SERVICE_ACCOUNT is set, this returns 503 and the client
// silently falls back to anonymous auth — nothing breaks.

import crypto from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const getServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { /* maybe base64 */ }
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch (e) { return null; }
};

const getAdmin = () => {
  if (getApps().length > 0) return getAuth();
  const sa = getServiceAccount();
  if (!sa) return null;
  initializeApp({ credential: cert(sa) });
  return getAuth();
};

// Telegram WebApp initData validation:
// secret = HMAC_SHA256("WebAppData", bot_token); hash = HMAC_SHA256(secret, data_check_string)
const validateInitData = (initData, botToken) => {
  let params;
  try { params = new URLSearchParams(initData); } catch (e) { return null; }
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(expected, 'hex');
  let b;
  try { b = Buffer.from(hash, 'hex'); } catch (e) { return null; }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // Freshness: reject initData older than 24h (replay window)
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  try { return JSON.parse(params.get('user') || 'null'); } catch (e) { return null; }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'BOT_TOKEN not configured' });

  const adminAuth = getAdmin();
  if (!adminAuth) {
    // Service account not set up yet — client falls back to anonymous auth
    return res.status(503).json({ error: 'FIREBASE_SERVICE_ACCOUNT not configured' });
  }

  const { initData } = req.body || {};
  if (!initData || typeof initData !== 'string' || initData.length > 4096) {
    return res.status(400).json({ error: 'initData required' });
  }

  const tgUser = validateInitData(initData, botToken);
  if (!tgUser?.id) return res.status(401).json({ error: 'Invalid initData' });

  try {
    const token = await adminAuth.createCustomToken(`tg_${tgUser.id}`);
    return res.status(200).json({ token });
  } catch (e) {
    console.error('[Auth] createCustomToken failed:', e.message);
    return res.status(500).json({ error: 'Token creation failed' });
  }
}
