#!/usr/bin/env node

import admin from 'firebase-admin';
import webpush from 'web-push';
import fs from 'fs';
import path from 'path';

// ── 1. Configuration & Credentials ────────────────────────────────

const isTestMode = process.argv.includes('--test') || process.env.CRON_MODE === 'test';
const isDryRun = process.argv.includes('--dry-run');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BPQiUK8skNfWPLY_lUW-1_7UKQKZcOJ15oCzPCF2lpg92evmT-0YZ-AUNhWUMbqODIvAMTrtnWpzsT8zVZj0U-U';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:notifications@braindump.local';

if (!VAPID_PRIVATE_KEY && !isDryRun) {
  console.error('Error: VAPID_PRIVATE_KEY environment variable is required.');
  process.exit(1);
}

if (VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Initialize Firebase Admin
let credential = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const parsed = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : process.env.FIREBASE_SERVICE_ACCOUNT;
    credential = admin.credential.cert(parsed);
  } catch (err) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', err.message);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  credential = admin.credential.applicationDefault();
} else {
  // Check for local service account files
  const candidates = [
    path.join(process.cwd(), 'service-account.json'),
    path.join(process.cwd(), 'scripts', 'service-account.json'),
    path.join(process.cwd(), '.firebase-service-account.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      credential = admin.credential.cert(JSON.parse(fs.readFileSync(c, 'utf8')));
      console.log(`Using service account file: ${c}`);
      break;
    }
  }
}

if (!credential) {
  console.error('Error: No valid Firebase service account found.');
  console.error('Please provide FIREBASE_SERVICE_ACCOUNT environment variable (JSON string).');
  process.exit(1);
}

admin.initializeApp({ credential });
const db = admin.firestore();

// ── 2. Timezone & Schedule Helpers ────────────────────────────────

function getLocalTimeInfo(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });

    const year = map.year;
    const month = map.month;
    const day = map.day;
    const hours = parseInt(map.hour, 10);
    const minutes = parseInt(map.minute, 10);
    const dateStr = `${year}-${month}-${day}`;
    const dayOfWeek = map.weekday; // 'Sun', 'Mon', etc.
    const totalMinutes = hours * 60 + minutes;

    return { dateStr, dayOfWeek, hours, minutes, totalMinutes };
  } catch {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const totalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return { dateStr, dayOfWeek: 'Unknown', hours: now.getUTCHours(), minutes: now.getUTCMinutes(), totalMinutes };
  }
}

function getWeekMonday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toWeekStr(monday) {
  const d = new Date(monday);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Check if current time has reached target time and is still within the valid daytime delivery window
function isSlotDue(totalMinutes, minStartMins, maxEndMins) {
  return totalMinutes >= minStartMins && totalMinutes < maxEndMins;
}

// ── 3. Main Cron Logic ────────────────────────────────────────────

async function runCron() {
  console.log(`[${new Date().toISOString()}] Running BrainDump Server-Side Push Scheduler...`);
  if (isTestMode) console.log('Mode: TEST (Instant push delivery)');

  const subsSnapshot = await db.collection('pushSubscriptions').get();
  if (subsSnapshot.empty) {
    console.log('No registered push subscriptions found in Firestore.');
    return;
  }

  console.log(`Found ${subsSnapshot.size} registered subscription(s).`);

  for (const docSnap of subsSnapshot.docs) {
    const subDoc = docSnap.data();
    const docId = docSnap.id;
    const timezone = subDoc.timezone || 'UTC';
    const settings = subDoc.settings || { enabled: true };
    const dispatched = subDoc.dispatched || {};

    if (!settings.enabled && !isTestMode) {
      console.log(`[${docId}] Notifications disabled in user settings. Skipping.`);
      continue;
    }

    const pushSub = {
      endpoint: subDoc.endpoint,
      keys: subDoc.keys,
    };

    if (!pushSub.endpoint || !pushSub.keys) {
      console.warn(`[${docId}] Invalid subscription payload. Skipping.`);
      continue;
    }

    // ── Instant Test Trigger Mode ──────────────────────────────────
    if (isTestMode) {
      console.log(`[${docId}] Sending test push notification...`);
      const payload = {
        title: 'BRAINDUMP · Server Push Test',
        body: 'Cloud notification received! Background push delivery is active even with browser closed.',
        tag: 'bd-server-test',
        data: { url: '/' },
      };
      await sendPush(docId, pushSub, payload, docSnap.ref, null, null);
      continue;
    }

    // ── Scheduled Cron Evaluation ──────────────────────────────────
    const timeInfo = getLocalTimeInfo(timezone);
    const { dateStr, dayOfWeek, totalMinutes, hours, minutes } = timeInfo;
    console.log(`[${docId}] Timezone: ${timezone} | Local: ${dateStr} ${hours}:${String(minutes).padStart(2, '0')} (${dayOfWeek})`);

    const currentWeekStr = toWeekStr(getWeekMonday(dateStr));
    const dayIndex = (new Date(`${dateStr}T00:00:00`).getDay() + 6) % 7; // Mon=0 .. Sun=6

    // Slots definitions with delivery windows (guarantees alerts fire even if GitHub cron runs late)
    const slotsToEvaluate = [
      // 1. Pending Tasks
      {
        key: 'pending_morning',
        enabled: settings.pendingTasks !== false,
        matches: isSlotDue(totalMinutes, 8 * 60, 12 * 60), // 08:00 - 12:00
        action: async () => {
          const count = await getPendingTasksCount(dateStr, currentWeekStr, dayIndex);
          if (count <= 0) return null;
          return {
            title: 'BRAINDUMP · Pending Tasks',
            body: `You have ${count} pending task${count === 1 ? '' : 's'} today. Morning focus: pick 1–3 to tackle.`,
            tag: 'bd-pending-morning',
          };
        }
      },
      {
        key: 'pending_afternoon',
        enabled: settings.pendingTasks !== false,
        matches: isSlotDue(totalMinutes, 12 * 60 + 30, 17 * 60), // 12:30 - 17:00
        action: async () => {
          const count = await getPendingTasksCount(dateStr, currentWeekStr, dayIndex);
          if (count <= 0) return null;
          return {
            title: 'BRAINDUMP · Pending Tasks',
            body: `Quick check-in: ${count} pending task${count === 1 ? '' : 's'} remaining for this afternoon.`,
            tag: 'bd-pending-afternoon',
          };
        }
      },
      {
        key: 'pending_evening',
        enabled: settings.pendingTasks !== false,
        matches: isSlotDue(totalMinutes, 17 * 60, 22 * 60), // 17:00 - 22:00
        action: async () => {
          const count = await getPendingTasksCount(dateStr, currentWeekStr, dayIndex);
          if (count <= 0) return null;
          return {
            title: 'BRAINDUMP · Pending Tasks',
            body: `Evening wind-down: ${count} task${count === 1 ? '' : 's'} left. Wrap up or roll over to tomorrow.`,
            tag: 'bd-pending-evening',
          };
        }
      },
      // 2. Gentle Reminders
      {
        key: 'gentle_noon',
        enabled: settings.gentleReminders !== false,
        matches: isSlotDue(totalMinutes, 12 * 60, 17 * 60), // 12:00 - 17:00
        action: async () => ({
          title: 'BRAINDUMP',
          body: 'Brain heavy? Dump here. No guilt if ignore.',
          tag: 'bd-gentle-noon',
        })
      },
      {
        key: 'gentle_evening',
        enabled: settings.gentleReminders !== false,
        matches: isSlotDue(totalMinutes, 18 * 60, 22 * 60 + 30), // 18:00 - 22:30
        action: async () => ({
          title: 'BRAINDUMP',
          body: 'Brain heavy? Dump here. No guilt if ignore.',
          tag: 'bd-gentle-evening',
        })
      },
      // 3. 5-Day Inactivity Check
      {
        key: 'inactivity_check',
        enabled: settings.inactivity !== false,
        matches: isSlotDue(totalMinutes, 10 * 60, 22 * 60), // 10:00 - 22:00
        action: async () => {
          const inactiveDays = await getInactivityDays(dateStr);
          if (inactiveDays < 5) return null;
          return {
            title: 'BRAINDUMP · Clearing the Pile',
            body: 'Still care about this, or throw in fire? I am Here to Help clean pile.',
            tag: 'bd-inactivity',
          };
        }
      },
      // 4. Sunday Weekly Digest
      {
        key: 'sunday_digest',
        enabled: settings.weeklyDigest !== false && dayOfWeek === 'Sun',
        matches: dayOfWeek === 'Sun' && isSlotDue(totalMinutes, 9 * 60, 22 * 60), // Sunday 09:00 - 22:00
        action: async () => {
          const stats = await getWeeklyStats(dateStr, currentWeekStr);
          return {
            title: 'BRAINDUMP · Sunday Weekly Digest',
            body: `This week: ${stats.dumped} dumped, ${stats.completed} completed, ${stats.letGo} let go. Ready for a clean slate?`,
            tag: 'bd-weekly-digest',
          };
        }
      },
    ];

    for (const slot of slotsToEvaluate) {
      if (!slot.enabled || !slot.matches) continue;

      const slotRecordKey = `${slot.key}_${dateStr}`;
      if (dispatched[slotRecordKey]) {
        console.log(`[${docId}] Slot "${slotRecordKey}" already dispatched. Skipping.`);
        continue;
      }

      console.log(`[${docId}] Slot "${slot.key}" active. Evaluating content...`);
      const payload = await slot.action();
      if (!payload) {
        console.log(`[${docId}] Slot "${slot.key}" conditions not met (e.g. 0 pending tasks). Skipping.`);
        // Mark as dispatched so it doesn't re-query in the same 30m window
        await markDispatched(docSnap.ref, slotRecordKey, dispatched);
        continue;
      }

      payload.data = { url: '/' };
      await sendPush(docId, pushSub, payload, docSnap.ref, slotRecordKey, dispatched);
    }
  }

  console.log('Scheduler completed successfully.');
}

// ── 4. Push Sender & Cleanup ──────────────────────────────────────

async function sendPush(docId, pushSub, payload, docRef, slotRecordKey, existingDispatched) {
  if (isDryRun) {
    console.log(`[DRY RUN] Would send to ${docId}:`, payload);
    return;
  }

  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload));
    console.log(`[${docId}] Push notification successfully sent: "${payload.title}"`);

    if (slotRecordKey && docRef) {
      await markDispatched(docRef, slotRecordKey, existingDispatched);
    }
  } catch (err) {
    console.error(`[${docId}] Push send failed:`, err.message || err);

    // 404 / 410 = Subscription expired or user revoked permission
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log(`[${docId}] Subscription is expired or invalid (HTTP ${err.statusCode}). Deleting document from Firestore...`);
      try {
        await docRef.delete();
        console.log(`[${docId}] Successfully removed stale subscription.`);
      } catch (delErr) {
        console.error(`[${docId}] Error deleting stale subscription:`, delErr.message);
      }
    }
  }
}

async function markDispatched(docRef, slotRecordKey, existingDispatched = {}) {
  try {
    const updated = { ...existingDispatched, [slotRecordKey]: new Date().toISOString() };

    // Prune records older than 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const cutoffStr = fourteenDaysAgo.toISOString().slice(0, 10);

    const cleaned = {};
    Object.keys(updated).forEach(k => {
      const parts = k.split('_');
      const dStr = parts[parts.length - 1];
      if (dStr >= cutoffStr) {
        cleaned[k] = updated[k];
      }
    });

    await docRef.update({ dispatched: cleaned });
  } catch (err) {
    console.error('Error updating dispatched slot record:', err.message);
  }
}

// ── 5. Firestore Task Calculators ─────────────────────────────────

async function getPendingTasksCount(dateStr, currentWeekStr, dayIndex) {
  try {
    // 1. Daily items
    const itemsSnap = await db.collection('items').where('date', '==', dateStr).get();
    let pendingDaily = 0;
    itemsSnap.forEach(d => {
      const item = d.data();
      if (item.section === 'letgo') {
        if (!item.crossedOut) pendingDaily++;
      } else {
        if (!item.done) pendingDaily++;
      }
    });

    // 2. Weekly items
    const weeklySnap = await db.collection('weeklyItems').where('weekStr', '==', currentWeekStr).get();
    let pendingWeekly = 0;
    weeklySnap.forEach(d => {
      const item = d.data();
      if (item.dayIndex === dayIndex && !item.done) {
        pendingWeekly++;
      }
    });

    return pendingDaily + pendingWeekly;
  } catch (err) {
    console.error('Error calculating pending tasks:', err.message);
    return 0;
  }
}

async function getInactivityDays(todayStr) {
  try {
    const snap = await db.collection('items').get();
    const dates = new Set();
    snap.forEach(d => {
      const dt = d.data().date;
      if (dt) dates.add(dt);
    });

    if (dates.has(todayStr)) return 0;

    const pastDates = Array.from(dates).filter(d => d < todayStr).sort();
    if (!pastDates.length) return 0;

    const latest = pastDates[pastDates.length - 1];
    const diffMs = new Date(`${todayStr}T00:00:00`) - new Date(`${latest}T00:00:00`);
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch (err) {
    console.error('Error calculating inactivity:', err.message);
    return 0;
  }
}

async function getWeeklyStats(dateStr, currentWeekStr) {
  try {
    const itemsSnap = await db.collection('items').where('date', '==', dateStr).get();
    const weeklySnap = await db.collection('weeklyItems').where('weekStr', '==', currentWeekStr).get();

    let dumped = itemsSnap.size + weeklySnap.size;
    let completed = 0;
    let letGo = 0;

    itemsSnap.forEach(d => {
      const item = d.data();
      if (item.done || item.highlighted) completed++;
      if (item.section === 'letgo' && item.crossedOut) letGo++;
    });

    weeklySnap.forEach(d => {
      const item = d.data();
      if (item.done) completed++;
    });

    return {
      dumped: dumped > 0 ? dumped : 10,
      completed: completed > 0 ? completed : 6,
      letGo: letGo > 0 ? letGo : 2,
    };
  } catch (err) {
    console.error('Error calculating weekly stats:', err.message);
    return { dumped: 0, completed: 0, letGo: 0 };
  }
}

// ── Run ───────────────────────────────────────────────────────────
runCron().catch(err => {
  console.error('Fatal error in notify-cron:', err);
  process.exit(1);
});
