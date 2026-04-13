import { initializeApp } from 'firebase/app';
import {
  getFirestore,
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
export const db = getFirestore(app);

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
