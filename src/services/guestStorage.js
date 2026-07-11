// ── Guest Storage Service (localStorage Adapter) ───────────────────
// Provides a local-only reactive storage layer matching Firestore's contract

export const GUEST_MODE_KEY = 'bd_guest_mode';
export const GUEST_ITEMS_KEY = 'bd_guest_items';
export const GUEST_WEEKLY_KEY = 'bd_guest_weekly';
export const GUEST_REFLECTIONS_KEY = 'bd_guest_reflections';
export const GUEST_BANNER_DISMISSED_KEY = 'bd_guest_banner_dismissed';

// ── Date Helpers ──────────────────────────────────────────────────
export const toLocalDateStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const todayStr = () => toLocalDateStr(new Date());

export function getWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function toWeekStr(monday) {
  const d = new Date(monday);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ── Listener Registry ─────────────────────────────────────────────
const listeners = {
  items: new Set(),
  activeDates: new Set(),
  weekly: new Set(),
  activeWeeks: new Set(),
  reflections: new Set(),
};

function notify(type) {
  listeners[type].forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error(`[guestStorage] Error in listener (${type}):`, err);
    }
  });
}

// Listen to multi-tab storage changes
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === GUEST_ITEMS_KEY) {
      notify('items');
      notify('activeDates');
    } else if (e.key === GUEST_WEEKLY_KEY) {
      notify('weekly');
      notify('activeWeeks');
    } else if (e.key === GUEST_REFLECTIONS_KEY) {
      notify('reflections');
    }
  });
}

// ── Low-Level Storage Helpers ─────────────────────────────────────
function getRaw(key, fallback = []) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch (err) {
    console.warn(`[guestStorage] Failed to read ${key}:`, err);
    return fallback;
  }
}

function setRaw(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (err) {
    console.error(`[guestStorage] Failed to write ${key}:`, err);
  }
}

// ── Guest Mode State ──────────────────────────────────────────────
export function isGuestMode() {
  return localStorage.getItem(GUEST_MODE_KEY) === 'true';
}

export function setGuestMode(active) {
  if (active) {
    localStorage.setItem(GUEST_MODE_KEY, 'true');
    seedGuestSampleData();
  } else {
    localStorage.removeItem(GUEST_MODE_KEY);
  }
}

export function isBannerDismissed() {
  return localStorage.getItem(GUEST_BANNER_DISMISSED_KEY) === 'true';
}

export function setBannerDismissed(dismissed) {
  if (dismissed) {
    localStorage.setItem(GUEST_BANNER_DISMISSED_KEY, 'true');
  } else {
    localStorage.removeItem(GUEST_BANNER_DISMISSED_KEY);
  }
}

export function hasGuestData() {
  const items = getRaw(GUEST_ITEMS_KEY, []);
  const weekly = getRaw(GUEST_WEEKLY_KEY, []);
  const reflections = getRaw(GUEST_REFLECTIONS_KEY, []);
  return items.length > 0 || weekly.length > 0 || reflections.length > 0;
}

// ── Seeding Sample Data ───────────────────────────────────────────
export function seedGuestSampleData() {
  const existingItems = getRaw(GUEST_ITEMS_KEY, null);
  if (existingItems !== null) return; // Already initialized

  const today = todayStr();
  const sampleItems = [
    {
      id: 'guest_sample_todo_1',
      section: 'todos',
      text: 'Urgent task or chore — click circle to mark done',
      date: today,
      done: false,
      highlighted: false,
      crossedOut: false,
      isSample: true,
      createdAt: Date.now() - 3000,
    },
    {
      id: 'guest_sample_dec_1',
      section: 'decisions',
      text: 'Unresolved choice weighing on you — click star to highlight priority',
      date: today,
      done: false,
      highlighted: true,
      crossedOut: false,
      isSample: true,
      createdAt: Date.now() - 2000,
    },
    {
      id: 'guest_sample_idea_1',
      section: 'ideas',
      text: 'Creative spark or project — click edit to refine thoughts',
      date: today,
      done: false,
      highlighted: false,
      crossedOut: false,
      isSample: true,
      createdAt: Date.now() - 1000,
    },
    {
      id: 'guest_sample_letgo_1',
      section: 'letgo',
      text: 'Something outside your control — click slash to let it go',
      date: today,
      done: false,
      highlighted: false,
      crossedOut: true,
      isSample: true,
      createdAt: Date.now(),
    },
  ];
  setRaw(GUEST_ITEMS_KEY, sampleItems);

  // Weekly sample
  const weekMonday = getWeekMonday(new Date());
  const currentWeekStr = toWeekStr(weekMonday);
  const dayIndex = (new Date().getDay() + 6) % 7; // Mon=0 .. Sun=6
  const sampleWeekly = [
    {
      id: 'guest_sample_week_1',
      weekStr: currentWeekStr,
      dayIndex,
      text: 'Review weekly priorities and dump mind clutter',
      done: false,
      isSample: true,
      createdAt: Date.now(),
    },
  ];
  setRaw(GUEST_WEEKLY_KEY, sampleWeekly);

  // Reflection sample
  const sampleReflections = [
    {
      id: 'guest_sample_ref_1',
      text: 'The mind is for having ideas, not holding them. — David Allen',
      category: 'principle',
      isSample: true,
      createdAt: Date.now(),
    },
  ];
  setRaw(GUEST_REFLECTIONS_KEY, sampleReflections);

  notify('items');
  notify('activeDates');
  notify('weekly');
  notify('activeWeeks');
  notify('reflections');
}

export function clearGuestSampleData() {
  const items = getRaw(GUEST_ITEMS_KEY, []).filter((i) => !i.isSample);
  const weekly = getRaw(GUEST_WEEKLY_KEY, []).filter((w) => !w.isSample);
  const reflections = getRaw(GUEST_REFLECTIONS_KEY, []).filter((r) => !r.isSample);

  setRaw(GUEST_ITEMS_KEY, items);
  setRaw(GUEST_WEEKLY_KEY, weekly);
  setRaw(GUEST_REFLECTIONS_KEY, reflections);

  notify('items');
  notify('activeDates');
  notify('weekly');
  notify('activeWeeks');
  notify('reflections');
}

export function clearAllGuestStorage() {
  localStorage.removeItem(GUEST_ITEMS_KEY);
  localStorage.removeItem(GUEST_WEEKLY_KEY);
  localStorage.removeItem(GUEST_REFLECTIONS_KEY);
  localStorage.removeItem(GUEST_MODE_KEY);
  localStorage.removeItem(GUEST_BANNER_DISMISSED_KEY);

  notify('items');
  notify('activeDates');
  notify('weekly');
  notify('activeWeeks');
  notify('reflections');
}

// ── Daily Items API ───────────────────────────────────────────────
export function guestAddItem(section, text, date) {
  const items = getRaw(GUEST_ITEMS_KEY, []);
  const newItem = {
    id: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    section,
    text,
    date,
    done: false,
    highlighted: false,
    crossedOut: false,
    createdAt: Date.now(),
  };
  items.push(newItem);
  setRaw(GUEST_ITEMS_KEY, items);
  notify('items');
  notify('activeDates');
  return Promise.resolve(newItem);
}

export function guestDeleteItem(id) {
  const items = getRaw(GUEST_ITEMS_KEY, []).filter((i) => i.id !== id);
  setRaw(GUEST_ITEMS_KEY, items);
  notify('items');
  notify('activeDates');
  return Promise.resolve();
}

export function guestUpdateItem(id, fields) {
  const items = getRaw(GUEST_ITEMS_KEY, []).map((i) => (i.id === id ? { ...i, ...fields } : i));
  setRaw(GUEST_ITEMS_KEY, items);
  notify('items');
  return Promise.resolve();
}

export function guestSubscribeToItems(date, callback) {
  const run = () => {
    const all = getRaw(GUEST_ITEMS_KEY, []);
    const matching = all
      .filter((i) => i.date === date)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(matching);
  };
  run();
  listeners.items.add(run);
  return () => listeners.items.delete(run);
}

export function guestSubscribeToActiveDates(callback) {
  const run = () => {
    const all = getRaw(GUEST_ITEMS_KEY, []);
    const set = new Set();
    all.forEach((i) => {
      if (i.date) set.add(i.date);
    });
    callback(Array.from(set).sort());
  };
  run();
  listeners.activeDates.add(run);
  return () => listeners.activeDates.delete(run);
}

// ── Weekly Items API ──────────────────────────────────────────────
export function guestAddWeeklyItem(weekStr, dayIndex, text) {
  const weekly = getRaw(GUEST_WEEKLY_KEY, []);
  const newItem = {
    id: `guest_week_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    weekStr,
    dayIndex,
    text,
    done: false,
    createdAt: Date.now(),
  };
  weekly.push(newItem);
  setRaw(GUEST_WEEKLY_KEY, weekly);
  notify('weekly');
  notify('activeWeeks');
  return Promise.resolve(newItem);
}

export function guestDeleteWeeklyItem(id) {
  const weekly = getRaw(GUEST_WEEKLY_KEY, []).filter((w) => w.id !== id);
  setRaw(GUEST_WEEKLY_KEY, weekly);
  notify('weekly');
  notify('activeWeeks');
  return Promise.resolve();
}

export function guestToggleWeeklyItem(id, done) {
  const weekly = getRaw(GUEST_WEEKLY_KEY, []).map((w) => (w.id === id ? { ...w, done } : w));
  setRaw(GUEST_WEEKLY_KEY, weekly);
  notify('weekly');
  return Promise.resolve();
}

export function guestSubscribeToWeeklyItems(weekStr, callback) {
  const run = () => {
    const all = getRaw(GUEST_WEEKLY_KEY, []);
    const matching = all
      .filter((w) => w.weekStr === weekStr)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    callback(matching);
  };
  run();
  listeners.weekly.add(run);
  return () => listeners.weekly.delete(run);
}

export function guestSubscribeToActiveWeeks(callback) {
  const run = () => {
    const all = getRaw(GUEST_WEEKLY_KEY, []);
    const set = new Set();
    all.forEach((w) => {
      if (w.weekStr) set.add(w.weekStr);
    });
    callback(Array.from(set).sort());
  };
  run();
  listeners.activeWeeks.add(run);
  return () => listeners.activeWeeks.delete(run);
}

// ── Reflections API ───────────────────────────────────────────────
export function guestAddReflection(text, category) {
  const list = getRaw(GUEST_REFLECTIONS_KEY, []);
  const newItem = {
    id: `guest_ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    category: category || null,
    createdAt: Date.now(),
  };
  list.unshift(newItem);
  setRaw(GUEST_REFLECTIONS_KEY, list);
  notify('reflections');
  return Promise.resolve(newItem);
}

export function guestDeleteReflection(id) {
  const list = getRaw(GUEST_REFLECTIONS_KEY, []).filter((r) => r.id !== id);
  setRaw(GUEST_REFLECTIONS_KEY, list);
  notify('reflections');
  return Promise.resolve();
}

export function guestSubscribeToReflections(callback) {
  const run = () => {
    const list = getRaw(GUEST_REFLECTIONS_KEY, []);
    // Format timestamp for display compatibility with Firestore ts.toDate()
    const mapped = list.map((r) => ({
      ...r,
      createdAt: {
        toDate: () => new Date(r.createdAt || Date.now()),
      },
    }));
    callback(mapped);
  };
  run();
  listeners.reflections.add(run);
  return () => listeners.reflections.delete(run);
}

// ── Firestore Migration ───────────────────────────────────────────
export async function migrateGuestDataToFirestore(firestoreApis) {
  const { addItem, addWeeklyItem, addReflection } = firestoreApis;
  const items = getRaw(GUEST_ITEMS_KEY, []);
  const weekly = getRaw(GUEST_WEEKLY_KEY, []);
  const reflections = getRaw(GUEST_REFLECTIONS_KEY, []);

  // Filter out sample items unless modified
  const userItems = items.filter((i) => !i.isSample);
  const userWeekly = weekly.filter((w) => !w.isSample);
  const userReflections = reflections.filter((r) => !r.isSample);

  for (const item of userItems) {
    await addItem(item.section, item.text, item.date);
  }

  for (const w of userWeekly) {
    await addWeeklyItem(w.weekStr, w.dayIndex, w.text);
  }

  for (const r of userReflections) {
    await addReflection(r.text, r.category);
  }

  clearAllGuestStorage();
}
