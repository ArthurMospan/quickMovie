import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

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
// Firebase anonymous auth is attempted separately and non-blocking.
export const getTelegramUser = async () => {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;

  // Firebase anonymous auth (needed only for Firestore rules) — never blocks user detection
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.warn('[Firebase] Anonymous auth failed (saves may not work):', e?.message);
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

// --- Toggle Save ---
export const toggleSaveMovie = async (uid, movieId, isSaved) => {
  if (!uid) return;
  await ensureUserDoc(uid);
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    saves: isSaved ? arrayRemove(movieId) : arrayUnion(movieId)
  });
};

// --- Mark Watched ---
// --- Toggle Shared (⭐ adds a movie from MY list to the couple's shared list) ---
export const toggleSharedMovie = async (uid, movieId, isShared) => {
  if (!uid) return;
  await ensureUserDoc(uid);
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    shared: isShared ? arrayRemove(movieId) : arrayUnion(movieId)
  });
};

// --- Release reminder (sent by /api/cron-reminders via the Telegram bot) ---
export const addReleaseReminder = async (uid, reminder) => {
  if (!uid || !reminder?.date) return;
  await ensureUserDoc(uid);
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    reminders: arrayUnion({
      id: reminder.id,
      title: reminder.title || '',
      date: reminder.date // YYYY-MM-DD
    })
  });
};

export const markMovieWatched = async (uid, movieId) => {
  if (!uid) return;
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    watched: arrayUnion(movieId)
  });
};

// --- Toggle Watched ---
export const toggleMovieWatched = async (uid, movieId, isWatched) => {
  if (!uid) return;
  await ensureUserDoc(uid);
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    watched: isWatched ? arrayRemove(movieId) : arrayUnion(movieId),
    // Watch → movie leaves the saved list; un-watch → returns to the saved list
    saves: isWatched ? arrayUnion(movieId) : arrayRemove(movieId)
  });
};
