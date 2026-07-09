import { useEffect, useRef } from 'react';
import { subscribeToItems, subscribeToWeeklyItems } from '../firebase';
import {
  getNotificationSettings,
  isSlotDispatched,
  markSlotDispatched,
  calculatePendingTasks,
  calculateInactivityDays,
  calculateWeeklySummary,
  triggerPendingTasksNotification,
  triggerGentleReminderNotification,
  triggerInactivityNotification,
  triggerWeeklyDigestNotification,
} from '../services/notificationService';

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekMonday(date) {
  const d = new Date(date);
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

// Check if current time is within [targetMins, targetMins + 30]
function isWithinSlotWindow(nowMinutes, targetMins) {
  return nowMinutes >= targetMins && nowMinutes <= targetMins + 30;
}

export function useNotificationScheduler(activeDates = []) {
  const todayItemsRef = useRef([]);
  const currentWeeklyItemsRef = useRef([]);

  const todayStr = toLocalDateStr(new Date());
  const currentWeekStr = toWeekStr(getWeekMonday(new Date()));

  // 1. Maintain background subscriptions to today's items & current week's items
  useEffect(() => {
    const unsubItems = subscribeToItems(todayStr, (items) => {
      todayItemsRef.current = items;
    });
    const unsubWeekly = subscribeToWeeklyItems(currentWeekStr, (weekly) => {
      currentWeeklyItemsRef.current = weekly;
    });

    return () => {
      unsubItems?.();
      unsubWeekly?.();
    };
  }, [todayStr, currentWeekStr]);

  // 2. Scheduler tick (runs every 30 seconds)
  useEffect(() => {
    function checkSchedule() {
      const settings = getNotificationSettings();
      if (!settings.enabled) return;

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentDateStr = toLocalDateStr(now);
      const isSunday = now.getDay() === 0;

      // ── 1. Pending Tasks (08:00, 12:30, 17:00) ────────────
      if (settings.pendingTasks) {
        const slots = [
          { key: 'pending_morning',   targetMins: 8 * 60,       timeOfDay: 'morning' },   // 08:00
          { key: 'pending_afternoon', targetMins: 12 * 60 + 30, timeOfDay: 'afternoon' }, // 12:30
          { key: 'pending_evening',   targetMins: 17 * 60,      timeOfDay: 'evening' },   // 17:00
        ];

        for (const slot of slots) {
          if (isWithinSlotWindow(currentMinutes, slot.targetMins)) {
            if (!isSlotDispatched(slot.key, currentDateStr)) {
              const count = calculatePendingTasks(todayItemsRef.current, currentWeeklyItemsRef.current);
              if (count > 0) {
                triggerPendingTasksNotification(slot.timeOfDay, count);
              }
              markSlotDispatched(slot.key, currentDateStr);
            }
          }
        }
      }

      // ── 2. Gentle Reminders (12:00, 18:00) ────────────────
      if (settings.gentleReminders) {
        const slots = [
          { key: 'gentle_noon',    targetMins: 12 * 60, timeOfDay: 'noon' },    // 12:00
          { key: 'gentle_evening', targetMins: 18 * 60, timeOfDay: 'evening' }, // 18:00
        ];

        for (const slot of slots) {
          if (isWithinSlotWindow(currentMinutes, slot.targetMins)) {
            if (!isSlotDispatched(slot.key, currentDateStr)) {
              triggerGentleReminderNotification(slot.timeOfDay);
              markSlotDispatched(slot.key, currentDateStr);
            }
          }
        }
      }

      // ── 3. 5-Day Inactivity Check (10:00) ─────────────────
      if (settings.inactivity) {
        const targetMins = 10 * 60; // 10:00
        if (isWithinSlotWindow(currentMinutes, targetMins)) {
          if (!isSlotDispatched('inactivity_check', currentDateStr)) {
            const days = calculateInactivityDays(activeDates, todayItemsRef.current);
            if (days >= 5) {
              triggerInactivityNotification();
            }
            markSlotDispatched('inactivity_check', currentDateStr);
          }
        }
      }

      // ── 4. Sunday Weekly Digest (Sunday 09:00) ─────────────
      if (settings.weeklyDigest && isSunday) {
        const targetMins = 9 * 60; // 09:00
        if (isWithinSlotWindow(currentMinutes, targetMins)) {
          if (!isSlotDispatched('sunday_digest', currentDateStr)) {
            const stats = calculateWeeklySummary(todayItemsRef.current, currentWeeklyItemsRef.current);
            triggerWeeklyDigestNotification(stats);
            markSlotDispatched('sunday_digest', currentDateStr);
          }
        }
      }
    }

    // Run immediately on mount, then every 30 seconds
    checkSchedule();
    const interval = setInterval(checkSchedule, 30 * 1000);
    return () => clearInterval(interval);
  }, [activeDates]);
}
