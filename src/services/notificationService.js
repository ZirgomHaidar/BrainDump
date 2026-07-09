// ── Notification Service ──────────────────────────────────────────

const SETTINGS_KEY   = 'bd_notification_settings';
const DISPATCHED_KEY = 'bd_notifications_dispatched';

const DEFAULT_SETTINGS = {
  enabled: false,
  pendingTasks: true,
  gentleReminders: true,
  inactivity: true,
  weeklyDigest: true,
};

export function hasNotificationSupport() {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window || (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window);
}

export function getNotificationPermission() {
  if (!hasNotificationSupport()) return 'unsupported';
  if (typeof Notification !== 'undefined') {
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }
  return 'default';
}

export async function requestNotificationPermission() {
  if (!hasNotificationSupport()) return 'unsupported';
  try {
    if (typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const current = getNotificationSettings();
        saveNotificationSettings({ ...current, enabled: true });
      }
      return permission;
    }
    return 'unsupported';
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  }
}

export function getNotificationSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveNotificationSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Error saving notification settings:', err);
  }
}

// ── Deduplication Tracker ─────────────────────────────────

export function isSlotDispatched(slotKey, dateStr) {
  try {
    const raw = localStorage.getItem(DISPATCHED_KEY);
    const records = raw ? JSON.parse(raw) : {};
    return records[`${slotKey}_${dateStr}`] === true;
  } catch {
    return false;
  }
}

export function markSlotDispatched(slotKey, dateStr) {
  try {
    const raw = localStorage.getItem(DISPATCHED_KEY);
    const records = raw ? JSON.parse(raw) : {};
    records[`${slotKey}_${dateStr}`] = true;

    // Prune entries older than 14 days to keep storage clean
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const cutoffStr = fourteenDaysAgo.toISOString().slice(0, 10);

    const cleaned = {};
    Object.keys(records).forEach(k => {
      const parts = k.split('_');
      const dStr = parts[parts.length - 1];
      if (dStr >= cutoffStr) {
        cleaned[k] = true;
      }
    });

    localStorage.setItem(DISPATCHED_KEY, JSON.stringify(cleaned));
  } catch (err) {
    console.error('Error marking notification slot dispatched:', err);
  }
}

// ── Notification Dispatcher ───────────────────────────────
export async function sendNotification(title, options = {}) {
  if (!hasNotificationSupport()) {
    console.warn('Notifications not supported in this browser.');
    return false;
  }

  // Request permission on the fly if still in 'default' state
  let perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  if (perm === 'default' && typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function') {
    try {
      perm = await Notification.requestPermission();
    } catch (e) {
      console.warn('Permission request error:', e);
    }
  }

  if (perm !== 'granted') {
    console.warn('Notification permission is not granted:', perm);
    return false;
  }

  const iconUrl = typeof window !== 'undefined' ? `${window.location.origin}/pwa-icon.svg` : '/pwa-icon.svg';
  const notificationOptions = {
    icon: iconUrl,
    badge: iconUrl,
    vibrate: [200, 100, 200],
    tag: options.tag || `bd-${Date.now()}`,
    renotify: true,
    data: { url: typeof window !== 'undefined' ? window.location.origin : '/' },
    ...options,
  };

  // 1. Service Worker showNotification (Mandatory for Android & iOS PWAs, recommended on all platforms)
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      let swReg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve(null), 350)),
      ]);
      if (!swReg) {
        swReg = await navigator.serviceWorker.getRegistration();
      }
      if (swReg && typeof swReg.showNotification === 'function') {
        await swReg.showNotification(title, notificationOptions);
        return true;
      }
    } catch (swErr) {
      console.warn('Service worker showNotification failed:', swErr);
    }
  }

  // 2. Standard window Notification constructor fallback (Desktop Chrome, Firefox, Safari on macOS, Linux)
  if (typeof Notification !== 'undefined') {
    try {
      const n = new Notification(title, notificationOptions);
      n.onclick = () => {
        window.focus();
        n.close();
      };
      return true;
    } catch (notifErr) {
      console.warn('Notification with icon failed, retrying text-only:', notifErr);
      try {
        const fallbackOptions = { body: notificationOptions.body };
        const n = new Notification(title, fallbackOptions);
        n.onclick = () => {
          window.focus();
          n.close();
        };
        return true;
      } catch (retryErr) {
        console.error('Notification dispatch failed completely:', retryErr);
        return false;
      }
    }
  }

  return false;
}

// ── Notification Content Generators & Calculations ────────

export function calculatePendingTasks(items = [], weeklyItems = []) {
  // Uncompleted items in today's Brain Dump (excluding letgo crossedOut items)
  const pendingTodos = items.filter(i => {
    if (i.section === 'letgo') return !i.crossedOut;
    return !i.done;
  }).length;

  // Uncompleted items in today's weekly column
  const todayDayIndex = (new Date().getDay() + 6) % 7; // Mon=0 .. Sun=6
  const pendingWeekly = weeklyItems.filter(i => i.dayIndex === todayDayIndex && !i.done).length;

  return pendingTodos + pendingWeekly;
}

export function calculateInactivityDays(activeDates = [], items = []) {
  if (!activeDates.length) return 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Check if there are items dumped today
  const hasItemsToday = items.some(i => i.date === todayStr);
  if (hasItemsToday) return 0;

  // Find most recent active date before today
  const pastDates = activeDates.filter(d => d < todayStr).sort();
  if (!pastDates.length) return 0;

  const latestPast = pastDates[pastDates.length - 1];
  const diffMs = new Date(`${todayStr}T00:00:00`) - new Date(`${latestPast}T00:00:00`);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function calculateWeeklySummary(items = [], weeklyItems = []) {
  const dumpedCount = items.length + weeklyItems.length;
  const completedCount = items.filter(i => i.done || i.highlighted).length + weeklyItems.filter(i => i.done).length;
  const letGoCount = items.filter(i => i.section === 'letgo' && i.crossedOut).length;

  return {
    dumped: dumpedCount,
    completed: completedCount,
    letGo: letGoCount,
  };
}

// ── Trigger Specific Notification Types ───────────────────

export async function triggerPendingTasksNotification(timeOfDay, count) {
  let bodyText = `You have ${count} pending task${count === 1 ? '' : 's'} today.`;
  if (timeOfDay === 'morning') {
    bodyText += ' Morning focus: pick 1–3 to tackle.';
  } else if (timeOfDay === 'afternoon') {
    bodyText += ' Quick check-in for the afternoon.';
  } else {
    bodyText += ' Wrap up or roll over to tomorrow.';
  }

  return sendNotification('BRAINDUMP · Pending Tasks', {
    body: bodyText,
    tag: `bd-pending-${timeOfDay}`,
  });
}

export async function triggerGentleReminderNotification(timeOfDay) {
  return sendNotification('BRAINDUMP', {
    body: 'Brain heavy? Dump here. No guilt if ignore.',
    tag: `bd-gentle-${timeOfDay}`,
  });
}

export async function triggerInactivityNotification() {
  return sendNotification('BRAINDUMP · Clearing the Pile', {
    body: 'Still care about this, or throw in fire? I am Here to Help clean pile.',
    tag: 'bd-inactivity',
  });
}

export async function triggerWeeklyDigestNotification(stats) {
  const body = `This week: ${stats.dumped} dumped, ${stats.completed} completed, ${stats.letGo} let go. Ready for a clean slate?`;
  return sendNotification('BRAINDUMP · Sunday Weekly Digest', {
    body,
    tag: 'bd-weekly-digest',
  });
}
