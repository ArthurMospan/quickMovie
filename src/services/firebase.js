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

// Get Telegram user from WebApp SDK
export const getTelegramUser = async () => {
  try {
    // Authenticate anonymously to satisfy Firebase rules (request.auth != null)
    await signInAnonymously(auth);
    
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser && tgUser.id) {
      return {
        uid: `tg_${tgUser.id}`,
        tgId: tgUser.id,
        displayName: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Користувач',
        username: tgUser.username || null,
        photoURL: tgUser.photo_url || null
      };
    }
  } catch (e) {
    console.warn('[TG] Could not get Telegram user or auth failed:', e);
  }
  return null;
};

// Ensure user document exists in Firestore
export const ensureUserDoc = async (uid) => {
  if (!uid) return;
  const userDocRef = doc(db, 'users', uid);
  const docSnap = await getDoc(userDocRef);
  if (!docSnap.exists()) {
    await setDoc(userDocRef, {
      saves: [],
      watched: [],
      partnerId: ""
    });
  }
};

// --- User Data Subscription ---
export const subscribeToUser = (uid, callback) => {
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'users', uid), callback);
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
  await updateDoc(userDocRef, { partnerId });
};

// --- Toggle Save ---
export const toggleSaveMovie = async (uid, movieId, isSaved) => {
  if (!uid) return;
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    saves: isSaved ? arrayRemove(movieId) : arrayUnion(movieId)
  });
};

// --- Mark Watched ---
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
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    watched: isWatched ? arrayRemove(movieId) : arrayUnion(movieId),
    saves: arrayRemove(movieId) // Remove from saves when toggling watched
  });
};
