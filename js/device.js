// Screen wake lock and haptic feedback, both optional browser features.

const nav = typeof navigator !== 'undefined' ? navigator : {};

export const wakeLockSupported = 'wakeLock' in nav;
export const vibrateSupported = typeof nav.vibrate === 'function';
export const isIOS =
  /iPad|iPhone|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
/** Android vibrates; iPhones (iOS 18+) give a light tap via a native switch control. */
export const hapticsSupported = vibrateSupported || isIOS;

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

// iOS Safari has no vibration API, but toggling a native <input switch> plays the system haptic.
let switchLabel = null;
function iosTap() {
  if (!switchLabel) {
    switchLabel = document.createElement('label');
    switchLabel.setAttribute('aria-hidden', 'true');
    switchLabel.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    switchLabel.append(input);
    document.body.append(switchLabel);
  }
  // Clicking the label focuses the hidden switch; hand focus straight back so
  // keyboard and page-turner input keeps working.
  const previous = document.activeElement;
  switchLabel.click();
  if (previous && previous !== document.body) previous.focus({ preventScroll: true });
  else document.activeElement?.blur();
}

/** `kind`: 'tap' (a row), 'double' (a chart starting again), 'soft' (small adjustments). */
export function haptic(kind = 'tap') {
  try {
    if (vibrateSupported) {
      navigator.vibrate(kind === 'double' ? [22, 80, 22] : kind === 'soft' ? 8 : 14);
    } else if (isIOS) {
      iosTap();
      if (kind === 'double') setTimeout(iosTap, 110);
    }
  } catch {
    /* haptics are a nicety; never let them break counting */
  }
}
