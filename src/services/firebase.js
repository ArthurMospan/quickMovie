import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// --- Telegram User Helpers ---

// Get Telegram user from WebApp SDK.
// IMPORTANT: Telegram user data must NOT depend on Firebase auth succeeding.
// Auth order: 1) verified identity — initData is validated on the server
// (/api/auth, HMAC with the bot token) and exchanged for a Firebase custom
// token with uid tg_<id>, so Firestore rules can enforce "only my doc";
// 2) fallback — anonymous auth (legacy mode, works until rules are tightened).
export const getTelegramUser = async () => {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const initData = window.Telegram?.WebApp?.initData;

  let authed = false;
  if (initData) {
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData })
      });
      if (r.ok) {
        const { token } = await r.json();
        if (token) {
          await signInWithCustomToken(auth, token);
          authed = true;
        }
      }
    } catch (e) { /* /api/auth not configured yet — fall back to anonymous */ }
  }
  if (!authed) {
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.warn('[Firebase] Anonymous auth failed (saves may not work):', e?.message);
    }
  }

  if (tgUser && tgUser.id) {
    // Real avatar: photo_url from initData (often absent) → our server proxy
    // via Bot API (/api/avatar) → components fall back to initials on error.
    const photoURL = tgUser.photo_url || `/api/avatar?id=${tgUser.id}`;
    return {
      uid: `tg_${tgUser.id}`,
      tgId: tgUser.id,
      displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Користувач',
      username: tgUser.username || null,
      photoURL
    };
  }
  return null;
};

// Save the user's public profile (name/username/photo) so the partner can see who they're connected to
export const saveUserProfile = async (user) => {
  if (!user?.uid) return;
  try {
    await setDoc(doc(db, 'users', user.uid), {
      name: user.displayName || '',
      username: user.username || '',
      photo: user.photoURL || ''
    }, { merge: true });
  } catch (e) {
    console.warn('[Firebase] saveUserProfile failed:', e?.message);
  }
};

// Ensure user document exists in Firestore
export const ensureUserDoc = async (uid) => {
  if (!uid) return;
  try {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userDocRef);
    if (!docSnap.exists()) {
      await setDoc(userDocRef, {
        saves: [],
        watched: [],
        shared: [],
        partnerId: ""
      });
    }
  } catch (e) {
    console.warn('[Firebase] ensureUserDoc failed:', e?.message);
  }
};

// --- User Data Subscription ---
export const subscribeToUser = (uid, callback) => {
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'users', uid), callback, (err) => {
    console.error("User subscription error:", err);
  });
};

// --- Partner Subscription ---
export const subscribeToPartner = (partnerId, callback) => {
  if (!partnerId || partnerId.length < 3) return () => {};
  return onSnapshot(doc(db, 'users', partnerId), callback, (err) => {
    console.error("Partner subscription error:", err);
  });
};

// --- Update Partner ID ---
export const updateUserPartnerId = async (uid, partnerId) => {
  if (!uid) return;
  const userDocRef = doc(db, 'users', uid);
  try {
    await updateDoc(userDocRef, { partnerId });
  } catch (e) {
    // Doc might not exist yet
    await setDoc(userDocRef, { saves: [], watched: [], partnerId }, { merge: true });
  }
};

// --- Update own doc without a read-before-write ---
// (was: ensureUserDoc = extra getDoc on EVERY tap; now: update, and only if
// the doc doesn't exist yet — merge-create it)
const safeUpdate = async (uid, data) => {
  const ref = doc(db, 'users', uid);
  try {
    await updateDoc(ref, data);
  } catch (e) {
    await setDoc(ref, data, { merge: true });
  }
};

// --- Toggle Save ---
export const toggleSaveMovie = async (uid, movieId, isSaved) => {
  if (!uid) return;
  await safeUpdate(uid, { saves: isSaved ? arrayRemove(movieId) : arrayUnion(movieId) });
};

// --- Toggle Shared (⭐ adds a movie from MY list to the couple's shared list) ---
export const toggleSharedMovie = async (uid, movieId, isShared) => {
  if (!uid) return;
  await safeUpdate(uid, { shared: isShared ? arrayRemove(movieId) : arrayUnion(movieId) });
};

// --- One-shot reconcile of local-only saves/shared (was: N requests, one per movie) ---
export const reconcileUserData = async (uid, { saves = [], shared = [] }) => {
  if (!uid || (saves.length === 0 && shared.length === 0)) return;
  const data = {};
  if (saves.length > 0) data.saves = arrayUnion(...saves);
  if (shared.length > 0) data.shared = arrayUnion(...shared);
  await safeUpdate(uid, data);
};

// --- Remove ids from several lists in ONE write ---
// Використовується для «Видалити звідусіль» (картка фільму) та для
// cloud-heal видалень, які не долетіли до Firestore (офлайн/помилка).
export const removeUserData = async (uid, { saves = [], watched = [], shared = [] }) => {
  if (!uid || (saves.length === 0 && watched.length === 0 && shared.length === 0)) return;
  const data = {};
  if (saves.length > 0) data.saves = arrayRemove(...saves);
  if (watched.length > 0) data.watched = arrayRemove(...watched);
  if (shared.length > 0) data.shared = arrayRemove(...shared);
  await safeUpdate(uid, data);
};

// --- Symmetric partner unlink: clear the partner's pointer to me
// (only if it actually points at me — we don't touch anything else) ---
export const unlinkPartner = async (myUid, partnerUid) => {
  if (!myUid || !partnerUid) return;
  const snap = await getDoc(doc(db, 'users', partnerUid));
  if (snap.exists() && snap.data().partnerId === myUid) {
    await updateDoc(doc(db, 'users', partnerUid), { partnerId: '' });
  }
};

// --- Release reminder (sent by /api/cron-reminders via the Telegram bot) ---
export const addReleaseReminder = async (uid, reminder) => {
  if (!uid || !reminder?.date) return;
  await safeUpdate(uid, {
    reminders: arrayUnion({
      id: reminder.id,
      title: reminder.title || '',
      date: reminder.date // YYYY-MM-DD
    })
  });
};

export const markMovieWatched = async (uid, movieId) => {
  if (!uid) return;
  await safeUpdate(uid, {
    watched: arrayUnion(movieId)
  });
};

// --- Toggle Watched ---
export const toggleMovieWatched = async (uid, movieId, isWatched) => {
  if (!uid) return;
  await safeUpdate(uid, {
    watched: isWatched ? arrayRemove(movieId) : arrayUnion(movieId),
    // Watch → movie leaves the saved list; un-watch → returns to the saved list
    saves: isWatched ? arrayUnion(movieId) : arrayRemove(movieId)
  });
};
