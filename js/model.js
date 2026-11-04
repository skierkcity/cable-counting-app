// Pure data + counting logic. No DOM access here so it can be unit tested in Node.

export const SCHEMA_VERSION = 1;
export const MAX_ROWS = 999;
export const MAX_NAME = 60;

export function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function defaultSettings() {
  return { keepAwake: true, vibrate: true };
}

export function emptyState() {
  return { version: SCHEMA_VERSION, projects: [], settings: defaultSettings() };
}

function cleanName(value, fallback) {
  const s = String(value ?? '').trim().slice(0, MAX_NAME);
  return s || fallback;
}

export function clampInt(value, min, max, fallback = min) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function createProject(name) {
  const now = Date.now();
  return { id: uid(), name: cleanName(name, 'Untitled project'), createdAt: now, updatedAt: now, parts: [] };
}

export function createPart(name) {
  return { id: uid(), name: cleanName(name, 'Part'), rowsKnitted: 0, charts: [] };
}

/**
 * A chart repeats every `rows` rows. `startRow` is the chart row worked on the part's
 * first row (for staggered charts). `nudge` is any manual per-chart adjustment.
 */
export function createChart({ label, rows = 8, startRow = 1 } = {}) {
  const r = clampInt(rows, 1, MAX_ROWS, 8);
  return {
    id: uid(),
    label: cleanName(label, 'Chart'),
    rows: r,
    startRow: clampInt(startRow, 1, r, 1),
    nudge: 0,
  };
}

/** Floor-modulo that is always non-negative. */
export function mod(n, m) {
  return ((n % m) + m) % m;
}

/** Zero-based absolute position of a chart, counting through every repeat. */
export function chartPosition(chart, rowsKnitted) {
  return chart.startRow - 1 + rowsKnitted + chart.nudge;
}

/**
 * What the knitter needs to see for one chart.
 *  row     – current chart row (1..rows), wraps back to 1 after the last row
 *  repeat  – which repetition of the chart this is (1-based)
 *  isLast  – this is the chart's last row; the next row starts it again
 */
export function chartStatus(chart, rowsKnitted) {
  const pos = chartPosition(chart, rowsKnitted);
  const row = mod(pos, chart.rows) + 1;
  const repeat = Math.max(1, Math.floor(pos / chart.rows) + 1);
  return { row, rows: chart.rows, repeat, isLast: row === chart.rows, isFirst: row === 1 };
}

/** Move every chart in the part forward (+1) or back (-1). Returns a new part. */
export function stepPart(part, delta) {
  const next = part.rowsKnitted + delta;
  if (next < 0) return part;
  return { ...part, rowsKnitted: next };
}

/** Charts that are back on row 1 (i.e. just started over after stepping forward). */
export function wrappedCharts(part) {
  if (part.rowsKnitted === 0) return [];
  return part.charts.filter((c) => chartStatus(c, part.rowsKnitted).isFirst);
}

/** Adjust a single chart without touching the others. */
export function nudgeChart(part, chartId, delta) {
  return {
    ...part,
    charts: part.charts.map((c) => (c.id === chartId ? { ...c, nudge: c.nudge + delta } : c)),
  };
}

export function resetPart(part) {
  return { ...part, rowsKnitted: 0, charts: part.charts.map((c) => ({ ...c, nudge: 0 })) };
}

/** Copy a part's setup (e.g. second sleeve) with fresh ids and counts back at the start. */
export function duplicatePart(part, name) {
  return {
    id: uid(),
    name: cleanName(name, part.name + ' (copy)'),
    rowsKnitted: 0,
    charts: part.charts.map((c) => ({ ...c, id: uid(), nudge: 0 })),
  };
}

/** Apply edits to a chart's settings, keeping values in range. */
export function updateChart(chart, changes) {
  const rows = 'rows' in changes ? clampInt(changes.rows, 1, MAX_ROWS, chart.rows) : chart.rows;
  const startRow = clampInt('startRow' in changes ? changes.startRow : chart.startRow, 1, rows, 1);
  const label = 'label' in changes ? cleanName(changes.label, chart.label) : chart.label;
  return { ...chart, label, rows, startRow };
}

/**
 * Validate and normalise data from a backup file (or from storage).
 * Throws an Error with a readable message when the data is unusable.
 */
export function normaliseState(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) {
    throw new Error("This file doesn't look like a Cable Counter backup.");
  }
  if (typeof data.version === 'number' && data.version > SCHEMA_VERSION) {
    throw new Error('This backup was made by a newer version of the app.');
  }
  const seen = new Set();
  const freshId = (id) => {
    const ok = typeof id === 'string' && id && !seen.has(id);
    const out = ok ? id : uid();
    seen.add(out);
    return out;
  };
  const projects = data.projects.map((p) => {
    if (!p || typeof p !== 'object') throw new Error('A project in this file is damaged.');
    const parts = Array.isArray(p.parts) ? p.parts : [];
    return {
      id: freshId(p.id),
      name: cleanName(p.name, 'Untitled project'),
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
      updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : Date.now(),
      parts: parts.map((part) => {
        if (!part || typeof part !== 'object') throw new Error('A part in this file is damaged.');
        const charts = Array.isArray(part.charts) ? part.charts : [];
        return {
          id: freshId(part.id),
          name: cleanName(part.name, 'Part'),
          rowsKnitted: clampInt(part.rowsKnitted, 0, Number.MAX_SAFE_INTEGER, 0),
          charts: charts.map((c) => {
            if (!c || typeof c !== 'object') throw new Error('A chart in this file is damaged.');
            const rows = clampInt(c.rows, 1, MAX_ROWS, 8);
            return {
              id: freshId(c.id),
              label: cleanName(c.label, 'Chart'),
              rows,
              startRow: clampInt(c.startRow, 1, rows, 1),
              nudge: clampInt(c.nudge, -1e9, 1e9, 0),
            };
          }),
        };
      }),
    };
  });
  const s = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const defaults = defaultSettings();
  return {
    version: SCHEMA_VERSION,
    projects,
    settings: {
      keepAwake: typeof s.keepAwake === 'boolean' ? s.keepAwake : defaults.keepAwake,
      vibrate: typeof s.vibrate === 'boolean' ? s.vibrate : defaults.vibrate,
    },
  };
}
