import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  orderBy,
  deleteField,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

// ── Auth ──────────────────────────────────────────────────

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signOutUser = () => signOut(auth);
export const onAuthChange = (cb) => onAuthStateChanged(auth, cb);

const itemsRef = collection(db, 'items');

export function addItem(section, text, date) {
  return addDoc(itemsRef, {
    section,
    text,
    date,
    done: false,
    highlighted: false,
    crossedOut: false,
    createdAt: serverTimestamp(),
  });
}

export function deleteItem(id) {
  return deleteDoc(doc(db, 'items', id));
}

export function updateItem(id, fields) {
  return updateDoc(doc(db, 'items', id), fields);
}

export function subscribeToActiveDates(callback) {
  return onSnapshot(itemsRef, (snapshot) => {
    const dateSet = new Set();
    snapshot.docs.forEach(d => {
      const date = d.data().date;
      if (date) dateSet.add(date);
    });
    callback(Array.from(dateSet).sort());
  });
}

// ── Journal ──────────────────────────────────────────────

const journalRef = collection(db, 'journal');

export function saveJournalEntry(date, text) {
  if (!text.trim()) return deleteDoc(doc(db, 'journal', date));
  return setDoc(doc(db, 'journal', date), { date, text, updatedAt: serverTimestamp() });
}

export function subscribeToJournalEntry(date, callback) {
  return onSnapshot(doc(db, 'journal', date), (snap) => {
    callback(snap.exists() ? snap.data().text || '' : '');
  });
}

export function subscribeToJournalDates(callback) {
  return onSnapshot(journalRef, (snap) => {
    callback(snap.docs.map((d) => d.id));
  });
}

// ── Weekly Plan ───────────────────────────────────────────

const weeklyRef = collection(db, 'weeklyItems');

export function addWeeklyItem(weekStr, dayIndex, text) {
  return addDoc(weeklyRef, { weekStr, dayIndex, text, done: false, createdAt: serverTimestamp() });
}

export function deleteWeeklyItem(id) {
  return deleteDoc(doc(db, 'weeklyItems', id));
}

export function toggleWeeklyItem(id, done) {
  return updateDoc(doc(db, 'weeklyItems', id), { done });
}

export function subscribeToWeeklyItems(weekStr, callback) {
  const q = query(weeklyRef, where('weekStr', '==', weekStr), orderBy('createdAt'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ── Morning Chores ────────────────────────────────────────

const choresRef = collection(db, 'morningChores');

export function addChore(text, order) {
  return addDoc(choresRef, { text, order, createdAt: serverTimestamp() });
}

export function deleteChore(id) {
  return deleteDoc(doc(db, 'morningChores', id));
}

export function subscribeToChores(callback) {
  const q = query(choresRef, orderBy('order'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export function subscribeToChoreLog(dateStr, callback) {
  return onSnapshot(doc(db, 'morningChoreLog', dateStr), (snap) => {
    callback(snap.exists() ? snap.data() : {});
  });
}

export function toggleChoreLog(dateStr, choreId, completed) {
  const ref = doc(db, 'morningChoreLog', dateStr);
  if (completed) {
    return setDoc(ref, { [choreId]: true }, { merge: true });
  }
  return updateDoc(ref, { [choreId]: deleteField() });
}

// ── Pomodoro ──────────────────────────────────────────────

const pomodoroRef = collection(db, 'pomodoroSessions');

export function logPomodoroSession(title, date) {
  return addDoc(pomodoroRef, { title, date, completedAt: serverTimestamp(), duration: 25 });
}

export function subscribeToPomodoroSessions(dateStr, callback) {
  const q = query(pomodoroRef, where('date', '==', dateStr), orderBy('completedAt'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ── Reflections ───────────────────────────────────────────

const reflectionsRef = collection(db, 'reflections');

export function addReflection(text, category) {
  return addDoc(reflectionsRef, { text, category: category || null, createdAt: serverTimestamp() });
}

export function deleteReflection(id) {
  return deleteDoc(doc(db, 'reflections', id));
}

export function subscribeToReflections(callback) {
  const q = query(reflectionsRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ── Items ─────────────────────────────────────────────────

export function subscribeToItems(date, callback) {
  const q = query(itemsRef, where('date', '==', date));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return ta - tb;
      });
    callback(items);
  });
}
