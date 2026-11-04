// Screen wake lock and vibration, both optional browser features.

export const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
export const vibrateSupported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let wanted = false;
let sentinel = null;

async function acquire() {
  if (!wakeLockSupported || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
    if (!wanted) release();
  } catch {
    sentinel = null; // e.g. low battery mode or not allowed; counting still works
  }
}

function release() {
  const s = sentinel;
  sentinel = null;
  s?.release().catch(() => {});
}

/** Keep the screen on while `on` is true. Re-acquired automatically when the app returns to the foreground. */
export function setKeepAwake(on) {
  wanted = on;
  if (on) acquire();
  else release();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible') acquire();
  });
}

export function buzz(pattern) {
  if (!vibrateSupported) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
