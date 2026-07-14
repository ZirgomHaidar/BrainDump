// ── Dashboard Analytics & Calculations Service ───────────────────────
import { todayStr, toLocalDateStr } from './guestStorage';

/**
 * Returns the last N dates (ending with todayStr by default).
 * Format: Array of { dateStr, dayLabel, dayShort, dayNum, isToday }
 */
export function getLastNDays(n = 7, refDateStr = null) {
  const dates = [];
  const ref = refDateStr ? new Date(refDateStr + 'T00:00:00') : new Date();
  const today = todayStr();
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateStr(d);
    const dayOfWeek = d.getDay();

    dates.push({
      dateStr,
      dayLabel: dayNames[dayOfWeek],
      dayShort: dayNames[dayOfWeek].charAt(0),
      dayNum: d.getDate(),
      isToday: dateStr === today,
    });
  }

  return dates;
}

/**
 * Calculates consecutive daily streak from sorted activeDates array.
 */
export function calculateStreak(activeDates = []) {
  if (!activeDates || activeDates.length === 0) return 0;
  const dateSet = new Set(activeDates);

  let current = new Date();
  let streak = 0;
  let dateString = toLocalDateStr(current);

  // If today has no entries yet, check if yesterday was active
  if (!dateSet.has(dateString)) {
    current.setDate(current.getDate() - 1);
    dateString = toLocalDateStr(current);
    if (!dateSet.has(dateString)) return 0;
  }

  while (dateSet.has(dateString)) {
    streak++;
    current.setDate(current.getDate() - 1);
    dateString = toLocalDateStr(current);
  }

  return streak;
}

/**
 * Checks if an item is considered 'cleared' based on its quadrant.
 */
export function isItemCleared(item) {
  if (!item) return false;
  switch (item.section) {
    case 'todos':
      return Boolean(item.done);
    case 'decisions':
      return Boolean(item.done);
    case 'ideas':
      return Boolean(item.highlighted);
    case 'letgo':
      return Boolean(item.crossedOut);
    default:
      return Boolean(item.done);
  }
}

/**
 * Calculates Mind Clearance metric.
 * 100% when 0 items (clear mind) or when all items are cleared.
 */
export function calculateMindClearance(items = []) {
  const total = items.length;
  if (total === 0) {
    return { total: 0, cleared: 0, percentage: 100, pending: 0 };
  }

  const cleared = items.filter(isItemCleared).length;
  const pending = total - cleared;
  const percentage = Math.round((cleared / total) * 100);

  return { total, cleared, pending, percentage };
}

/**
 * Breakdown of items per quadrant with counts and colors.
 */
export const QUADRANT_CONFIG = [
  { key: 'todos',     label: 'TO-DOs',    color: 'var(--todos-accent, #a8bbdc)',     action: 'Done' },
  { key: 'decisions', label: 'DECISIONS', color: 'var(--decisions-accent, #c4abca)', action: 'Decided' },
  { key: 'ideas',     label: 'IDEAS',     color: 'var(--ideas-accent, #b1e57e)',     action: 'Starred' },
  { key: 'letgo',     label: 'LET GO',    color: 'var(--letgo-accent, #fbc9a9)',     action: 'Released' },
];

export function calculateQuadrantStats(items = []) {
  return QUADRANT_CONFIG.map((q) => {
    const qItems = items.filter((i) => i.section === q.key);
    const total = qItems.length;
    const cleared = qItems.filter(isItemCleared).length;
    const rate = total > 0 ? Math.round((cleared / total) * 100) : 0;
    return {
      ...q,
      total,
      cleared,
      rate,
    };
  });
}

/**
 * Aggregates 7-day activity metrics for the vertical bar chart.
 */
export function calculate7DayActivity(items = [], dayDefs = []) {
  const itemsByDate = {};
  items.forEach((item) => {
    if (!item.date) return;
    if (!itemsByDate[item.date]) itemsByDate[item.date] = [];
    itemsByDate[item.date].push(item);
  });

  const dailyData = dayDefs.map((d) => {
    const dayItems = itemsByDate[d.dateStr] || [];
    const total = dayItems.length;
    const cleared = dayItems.filter(isItemCleared).length;
    return {
      ...d,
      total,
      cleared,
    };
  });

  const maxTotal = Math.max(...dailyData.map((d) => d.total), 1);

  return {
    dailyData: dailyData.map((d) => ({
      ...d,
      heightPct: d.total > 0 ? Math.max(Math.round((d.total / maxTotal) * 100), 12) : 4,
      clearedPct: d.total > 0 ? Math.round((d.cleared / d.total) * 100) : 0,
    })),
    maxTotal,
    weekTotal: dailyData.reduce((acc, d) => acc + d.total, 0),
    weekCleared: dailyData.reduce((acc, d) => acc + d.cleared, 0),
  };
}

/**
 * Curated daily aesthetic & mental models.
 */
export const MINDSET_REFLECTIONS = [
  {
    title: 'AESTHETIC-USABILITY EFFECT',
    principle: 'Users perceive aesthetically pleasing and well-structured systems as inherently more usable and frictionless.',
    author: 'Human-Computer Interaction Rule',
  },
  {
    title: 'EXTERNAL BRAIN LAW',
    principle: 'Your mind is for having ideas, not holding them. Capture everything into trusted storage immediately.',
    author: 'David Allen — GTD',
  },
  {
    title: 'DECISION MINIMALISM',
    principle: 'Reducing trivial choices early in the day preserves cognitive endurance for high-leverage execution.',
    author: 'Cognitive Load Theory',
  },
  {
    title: 'INVERSION MENTAL MODEL',
    principle: 'Avoid stupidity rather than seeking brilliance. Identify what causes mental clutter, and systematically let it go.',
    author: 'Charlie Munger',
  },
  {
    title: 'MOMENTUM HEURISTIC',
    principle: 'Action precedes motivation, not the other way around. Clear one small to-do to generate immediate momentum.',
    author: 'Behavioral Psychology',
  },
];
