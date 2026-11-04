import { emptyState, normaliseState } from './model.js';

const KEY = 'cable-counter:v1';

/** Load saved data. Damaged data is set aside (never silently overwritten). */
export function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return emptyState();
  }
  if (!raw) return emptyState();
  try {
    return normaliseState(JSON.parse(raw));
  } catch (err) {
    console.error('Saved data could not be read; keeping a copy aside.', err);
    try {
      localStorage.setItem(`${KEY}:damaged-${Date.now()}`, raw);
    } catch {
      /* ignore */
    }
    return emptyState();
  }
}

/** Returns false if the browser refused to save (e.g. storage full or disabled). */
export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Could not save', err);
    return false;
  }
}

/** Ask the browser not to clear our data under storage pressure. */
export function requestPersistence() {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* ignore */
  }
}
