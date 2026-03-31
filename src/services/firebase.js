import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot } from 'firebase/firestore';

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
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// --- Auth ---
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const userDocRef = doc(db, 'users', result.user.uid);
    const docSnap = await getDoc(userDocRef);
    if (!docSnap.exists()) {
      await setDoc(userDocRef, {
        saves: [],
        watched: [],
        partnerId: ""
      });
    }
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = () => signOut(auth);

// --- User Data Subscription ---
export const subscribeToUser = (uid, callback) => {
  if (!uid) return () => {};
  return onSnapshot(doc(db, 'users', uid), callback);
};

// --- Partner Subscription ---
export const subscribeToPartner = (partnerId, callback) => {
  if (!partnerId || partnerId.length < 5) return () => {};
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
