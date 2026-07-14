// ── Unified Storage Adapter ──────────────────────────────────────
// Dynamically routes operations to Firestore or localStorage (guestStorage)
// based on whether the user is in Guest / Try Mode.

import * as fb from '../firebase';
import * as guest from './guestStorage';

// ── Daily Items ───────────────────────────────────────────────────
export function addItem(section, text, date, isGuest) {
  if (isGuest) {
    return guest.guestAddItem(section, text, date);
  }
  return fb.addItem(section, text, date);
}

export function deleteItem(id, isGuest) {
  if (isGuest) {
    return guest.guestDeleteItem(id);
  }
  return fb.deleteItem(id);
}

export function updateItem(id, fields, isGuest) {
  if (isGuest) {
    return guest.guestUpdateItem(id, fields);
  }
  return fb.updateItem(id, fields);
}

export function subscribeToItems(date, callback, isGuest) {
  if (isGuest) {
    return guest.guestSubscribeToItems(date, callback);
  }
  return fb.subscribeToItems(date, callback);
}

export function subscribeToRecentItems(dates, callback, isGuest) {
  if (isGuest) {
    return guest.guestSubscribeToRecentItems(dates, callback);
  }
  return fb.subscribeToRecentItems(dates, callback);
}

export function subscribeToActiveDates(callback, isGuest) {
  if (isGuest) {
    return guest.guestSubscribeToActiveDates(callback);
  }
  return fb.subscribeToActiveDates(callback);
}

// ── Weekly Items ──────────────────────────────────────────────────
export function addWeeklyItem(weekStr, dayIndex, text, isGuest) {
  if (isGuest) {
    return guest.guestAddWeeklyItem(weekStr, dayIndex, text);
  }
  return fb.addWeeklyItem(weekStr, dayIndex, text);
}

export function deleteWeeklyItem(id, isGuest) {
  if (isGuest) {
    return guest.guestDeleteWeeklyItem(id);
  }
  return fb.deleteWeeklyItem(id);
}

export function toggleWeeklyItem(id, done, isGuest) {
  if (isGuest) {
    return guest.guestToggleWeeklyItem(id, done);
  }
  return fb.toggleWeeklyItem(id, done);
}

export function subscribeToWeeklyItems(weekStr, callback, isGuest) {
  if (isGuest) {
    return guest.guestSubscribeToWeeklyItems(weekStr, callback);
  }
  return fb.subscribeToWeeklyItems(weekStr, callback);
}

export function subscribeToActiveWeeks(callback, isGuest) {
  if (isGuest) {
    return guest.guestSubscribeToActiveWeeks(callback);
  }
  return fb.subscribeToActiveWeeks(callback);
}

// ── Reflections ───────────────────────────────────────────────────
export function addReflection(text, category, isGuest) {
  if (isGuest) {
    return guest.guestAddReflection(text, category);
  }
  return fb.addReflection(text, category);
}

export function deleteReflection(id, isGuest) {
  if (isGuest) {
    return guest.guestDeleteReflection(id);
  }
  return fb.deleteReflection(id);
}

export function subscribeToReflections(callback, isGuest) {
  if (isGuest) {
    return guest.guestSubscribeToReflections(callback);
  }
  return fb.subscribeToReflections(callback);
}
