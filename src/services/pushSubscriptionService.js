// ── Server-Side Web Push Subscription Service ──────────────────────

import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, getAuthUser } from '../firebase';
import { getNotificationSettings } from './notificationService';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BPQiUK8skNfWPLY_lUW-1_7UKQKZcOJ15oCzPCF2lpg92evmT-0YZ-AUNhWUMbqODIvAMTrtnWpzsT8zVZj0U-U';

// Convert URL-safe base64 string to Uint8Array for PushManager
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported() {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
}

// Generate a deterministic Firestore document ID from the push endpoint
async function getSubscriptionDocId(endpoint) {
  try {
    const msgBuffer = new TextEncoder().encode(endpoint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return 'sub_' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  } catch {
    return 'sub_' + btoa(endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  }
}

// Check current browser subscription status
export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise(resolve => setTimeout(() => resolve(null), 800)),
    ]);
    if (!reg || !reg.pushManager) return null;
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.warn('Error checking push subscription:', err);
    return null;
  }
}

// Subscribe the browser/PWA to Web Push and save to Firestore
export async function subscribeToPush(customSettings = null) {
  if (!isPushSupported()) {
    throw new Error('Push messaging is not supported in this browser.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission ${permission}`);
  }

  let reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise(resolve => setTimeout(() => resolve(null), 1200)),
  ]);

  if (!reg) {
    reg = await navigator.serviceWorker.getRegistration();
  }

  if (!reg || !reg.pushManager) {
    throw new Error('Service Worker push manager not ready. Please reload the page.');
  }

  let sub = await reg.pushManager.getSubscription();

  // Create new subscription if none exists
  if (!sub) {
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  const subJson = sub.toJSON();
  const docId = await getSubscriptionDocId(sub.endpoint);
  const currentUser = getAuthUser();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const settings = customSettings || getNotificationSettings();

  const payload = {
    endpoint: sub.endpoint,
    keys: subJson.keys,
    userId: currentUser ? currentUser.uid : 'anonymous',
    userEmail: currentUser ? currentUser.email : null,
    timezone,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    settings: {
      enabled: true,
      pendingTasks: settings.pendingTasks ?? true,
      gentleReminders: settings.gentleReminders ?? true,
      inactivity: settings.inactivity ?? true,
      weeklyDigest: settings.weeklyDigest ?? true,
    },
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, 'pushSubscriptions', docId), payload, { merge: true });
  localStorage.setItem('bd_push_subscribed', 'true');

  return sub;
}

// Unsubscribe from Web Push and remove record from Firestore
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg || !reg.pushManager) return false;

    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const docId = await getSubscriptionDocId(sub.endpoint);
      await sub.unsubscribe();
      try {
        await deleteDoc(doc(db, 'pushSubscriptions', docId));
      } catch (e) {
        console.warn('Error removing subscription from Firestore:', e);
      }
    }

    localStorage.removeItem('bd_push_subscribed');
    return true;
  } catch (err) {
    console.error('Error unsubscribing from push:', err);
    return false;
  }
}
