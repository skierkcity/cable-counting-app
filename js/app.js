import * as M from './model.js';
import { loadState, saveState, requestPersistence } from './storage.js';
import { setKeepAwake, buzz, wakeLockSupported, vibrateSupported } from './device.js';

const app = document.getElementById('app');
let state = loadState();
let current = { projectId: null, partId: null, view: 'home' };
let adjustMode = false;

/* ---------- helpers ---------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const href = (...segments) => '#/' + segments.map(encodeURIComponent).join('/');

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function relTime(ts) {
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (ts >= startOfToday) return 'today';
  if (ts >= startOfToday - day) return 'yesterday';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  gear:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  edit: '<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

function save() {
  if (!saveState(state)) toast("Couldn't save. Your phone's storage may be full.");
}

const getProject = (id) => state.projects.find((p) => p.id === id);
const getPart = (project, id) => project?.parts.find((p) => p.id === id);

function putProject(project) {
  project = { ...project, updatedAt: Date.now() };
  state = { ...state, projects: state.projects.map((p) => (p.id === project.id ? project : p)) };
  save();
  return project;
}

function putPart(projectId, part) {
  const project = getProject(projectId);
  putProject({ ...project, parts: project.parts.map((p) => (p.id === part.id ? part : p)) });
  return part;
}

/** Find the project + part the current screen is about. */
function ctx() {
  const project = getProject(current.projectId);
  return { project, part: getPart(project, current.partId) };
}

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/** Small modal used instead of prompt()/confirm(), which look poor in an installed app. */
function dialog({ title, message = '', input = null, okText = 'OK', cancelText = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = `
      <form method="dialog" class="dialog-form">
        <h2 class="dialog-title">${esc(title)}</h2>
        ${message ? `<p class="dialog-msg">${esc(message)}</p>` : ''}
        ${
          input
            ? `<input class="input" name="value" maxlength="${M.MAX_NAME}" autocomplete="off" enterkeyhint="done"
                 aria-label="${esc(input.label || title)}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}">`
            : ''
        }
        <div class="dialog-actions">
          <button type="button" class="btn" data-cancel>${esc(cancelText)}</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(okText)}</button>
        </div>
      </form>`;
    document.body.append(dlg);
    const field = dlg.querySelector('input');
    let result = input ? null : false;
    dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
    dlg.querySelector('form').addEventListener('submit', (e) => {
      if (input) {
        const v = field.value.trim();
        if (!v) {
          e.preventDefault();
          field.focus();
          return;
        }
        result = v;
      } else {
        result = true;
      }
    });
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });
    dlg.showModal();
    if (field) {
      field.focus();
      field.select();
    }
  });
}

/* ---------- routing ---------- */

function go(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    route();
  } else if (location.hash === hash) {
    route();
  } else {
    location.hash = hash;
  }
}

function route() {
  const seg = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  setKeepAwake(false);
  const prevPart = current.partId;
  current = { projectId: null, partId: null, view: 'home' };

  if (seg[0] === 'settings') return renderSettings();
  if (seg[0] === 'p' && seg[1]) {
    const project = getProject(seg[1]);
    if (!project) return go('#/', { replace: true });
    current.projectId = project.id;
    if (seg[2]) {
      const part = getPart(project, seg[2]);
      if (!part) return go(href('p', project.id), { replace: true });
      current.partId = part.id;
      if (prevPart !== part.id) adjustMode = false;
      if (seg[3] === 'setup') return renderSetup(project, part);
      return renderCounter(project, part);
    }
    return renderProject(project);
  }
  return renderHome();
}

function show(view, title, html) {
  current.view = view;
  document.title = title ? `${title} · Cable Counter` : 'Cable Counter';
  app.innerHTML = html;
  app.dataset.view = view;
  window.scrollTo(0, 0);
}

/* ---------- screens ---------- */

function renderHome() {
  const projects = [...state.projects].sort((a, b) => b.updatedAt - a.updatedAt);
  show(
    'home',
    '',
    `
    <header class="bar">
      <h1 class="bar-title brand">Cable Counter</h1>
      <a class="icon-btn" href="#/settings" aria-label="Settings and backup">${icon('gear')}</a>
    </header>
    <main class="content">
      ${
        projects.length
          ? `<h2 class="section-title">Projects</h2><ul class="list">${projects
              .map(
                (p) => `
            <li><a class="card card-link" href="${href('p', p.id)}">
              <span class="card-title">${esc(p.name)}</span>
              <span class="card-meta">${plural(p.parts.length, 'part')} · updated ${relTime(p.updatedAt)}</span>
            </a></li>`
              )
              .join('')}</ul>`
          : `<div class="empty">
              <p class="empty-title">No projects yet</p>
              <p>Create a project, add its parts (back, fronts, sleeves&hellip;), then set up the charts you're following in each part.</p>
            </div>`
      }
    </main>
    <footer class="actions">
      <button class="btn btn-primary btn-wide" data-action="new-project">${icon('plus')} New project</button>
    </footer>`
  );
}

function partSummary(part) {
  if (!part.charts.length) return 'No charts yet. Tap to set up.';
  return `${plural(part.charts.length, 'chart')} · on row ${part.rowsKnitted + 1}`;
}

function renderProject(project) {
  show(
    'project',
    project.name,
    `
    <header class="bar">
      <a class="icon-btn" href="#/" aria-label="All projects">${icon('back')}</a>
      <div class="bar-titles"><h1 class="bar-title">${esc(project.name)}</h1><p class="bar-sub">Project</p></div>
      <button class="icon-btn" data-action="rename-project" aria-label="Rename project">${icon('edit')}</button>
    </header>
    <main class="content">
      ${
        project.parts.length
          ? `<h2 class="section-title">Parts</h2><ul class="list">${project.parts
              .map((part) => {
                const target = part.charts.length ? href('p', project.id, part.id) : href('p', project.id, part.id, 'setup');
                return `
            <li class="card part-card">
              <a class="part-main" href="${target}">
                <span class="card-title">${esc(part.name)}</span>
                <span class="card-meta">${partSummary(part)}</span>
                ${
                  part.charts.length
                    ? `<span class="chip-row">${part.charts.map((c) => `<span class="tag">${esc(c.label)}</span>`).join('')}</span>`
                    : ''
                }
              </a>
              <div class="part-actions">
                <a class="btn btn-small" href="${href('p', project.id, part.id, 'setup')}">Set up</a>
                <button class="btn btn-small" data-action="duplicate-part" data-part="${esc(part.id)}">Duplicate</button>
                <button class="btn btn-small btn-quiet-danger" data-action="delete-part" data-part="${esc(part.id)}">Delete</button>
              </div>
            </li>`;
              })
              .join('')}</ul>`
          : `<div class="empty">
              <p class="empty-title">No parts yet</p>
              <p>Add a part for each piece you knit, for example Back, Left front, Right front, Left sleeve, Right sleeve. Set up one sleeve, then use <strong>Duplicate</strong> for the other.</p>
            </div>`
      }
      <div class="danger-zone">
        <button class="btn btn-quiet-danger" data-action="delete-project">${icon('trash')} Delete project</button>
      </div>
    </main>
    <footer class="actions">
      <button class="btn btn-primary btn-wide" data-action="add-part">${icon('plus')} Add part</button>
    </footer>`
  );
}

function renderSetup(project, part) {
  const counted = part.rowsKnitted > 0 || part.charts.some((c) => c.nudge !== 0);
  show(
    'setup',
    `Set up ${part.name}`,
    `
    <header class="bar">
      <a class="icon-btn" href="${href('p', project.id)}" aria-label="Back to ${esc(project.name)}">${icon('back')}</a>
      <div class="bar-titles"><h1 class="bar-title">Set up part</h1><p class="bar-sub">${esc(project.name)}</p></div>
    </header>
    <main class="content">
      <label class="field">
        <span class="field-label">Part name</span>
        <input class="input" data-field="part-name" value="${esc(part.name)}" maxlength="${M.MAX_NAME}" autocomplete="off" enterkeyhint="done">
      </label>

      <h2 class="section-title">Charts <span class="muted">(${part.charts.length})</span></h2>
      <p class="hint">Give each chart a label you'll recognise on the counting screen, and the number of rows before it repeats.
      Use <em>Start on row</em> if a chart doesn't begin on its row 1 when this part does.</p>

      <ol class="list chart-edit-list">
        ${part.charts
          .map(
            (c, i) => `
          <li class="card chart-edit" data-chart-id="${esc(c.id)}">
            <div class="chart-edit-head">
              <span class="chart-edit-index">${i + 1}</span>
              <div class="chart-edit-tools">
                <button class="icon-btn small" data-action="move-chart" data-chart="${esc(c.id)}" data-delta="-1" aria-label="Move ${esc(c.label)} earlier" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
                <button class="icon-btn small" data-action="move-chart" data-chart="${esc(c.id)}" data-delta="1" aria-label="Move ${esc(c.label)} later" ${i === part.charts.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
                <button class="icon-btn small danger" data-action="remove-chart" data-chart="${esc(c.id)}" aria-label="Remove ${esc(c.label)}">${icon('trash')}</button>
              </div>
            </div>
            <label class="field">
              <span class="field-label">Label</span>
              <input class="input" data-field="chart-label" data-chart="${esc(c.id)}" value="${esc(c.label)}" maxlength="${M.MAX_NAME}" autocomplete="off" enterkeyhint="done">
            </label>
            <div class="field-row">
              <label class="field">
                <span class="field-label">Rows in chart</span>
                <input class="input" type="number" inputmode="numeric" min="1" max="${M.MAX_ROWS}" data-field="chart-rows" data-chart="${esc(c.id)}" value="${c.rows}">
              </label>
              <label class="field">
                <span class="field-label">Start on row</span>
                <input class="input" type="number" inputmode="numeric" min="1" max="${c.rows}" data-field="chart-start" data-chart="${esc(c.id)}" value="${c.startRow}">
              </label>
            </div>
          </li>`
          )
          .join('')}
      </ol>
      <button class="btn btn-wide btn-dashed" data-action="add-chart">${icon('plus')} Add chart</button>

      <div class="danger-zone">
        ${counted ? `<button class="btn btn-quiet-danger" data-action="reset-part">Reset count to row 1</button>` : ''}
        <button class="btn btn-quiet-danger" data-action="delete-part" data-part="${esc(part.id)}">${icon('trash')} Delete part</button>
      </div>
    </main>
    <footer class="actions">
      ${
        part.charts.length
          ? `<a class="btn btn-primary btn-wide" href="${href('p', project.id, part.id)}">Start counting</a>`
          : `<button class="btn btn-primary btn-wide" disabled>Add a chart to start counting</button>`
      }
    </footer>`
  );
}

function renderCounter(project, part) {
  if (!part.charts.length) return go(href('p', project.id, part.id, 'setup'), { replace: true });
  show(
    'counter',
    part.name,
    `
    <div class="counter">
      <header class="bar">
        <a class="icon-btn" href="${href('p', project.id)}" aria-label="Back to ${esc(project.name)}">${icon('back')}</a>
        <div class="bar-titles"><h1 class="bar-title">${esc(part.name)}</h1><p class="bar-sub">${esc(project.name)}</p></div>
        <button class="chip-btn" data-action="toggle-adjust" aria-pressed="${adjustMode}">Adjust</button>
        <a class="icon-btn" href="${href('p', project.id, part.id, 'setup')}" aria-label="Set up charts">${icon('edit')}</a>
      </header>
      <section class="summary" id="summary" aria-live="polite" aria-atomic="true"></section>
      <p class="adjust-hint" id="adjust-hint" ${adjustMode ? '' : 'hidden'}>Move a single chart that has got out of step. Other charts aren't affected.</p>
      <main class="chart-grid" id="charts"></main>
      <div class="count-bar">
        <button class="btn-minus" id="minus" data-action="step" data-delta="-1" aria-label="Back one row">&minus;1</button>
        <button class="btn-plus" id="plus" data-action="step" data-delta="1" aria-label="Forward one row">+1 <span>row</span></button>
      </div>
    </div>`
  );
  paintCounter();
  setKeepAwake(state.settings.keepAwake);
}

function paintCounter(flashIds = []) {
  const { project, part } = ctx();
  if (!project || !part) return;
  const summary = document.getElementById('summary');
  const grid = document.getElementById('charts');
  summary.innerHTML = `
    <span class="summary-row">Row <strong>${part.rowsKnitted + 1}</strong></span>
    <span class="summary-meta">${plural(part.rowsKnitted, 'row')} done</span>`;
  const n = part.charts.length;
  grid.dataset.count = String(n);
  grid.dataset.density = n <= 2 ? 'roomy' : n <= 6 ? 'compact' : 'dense';
  grid.classList.toggle('adjusting', adjustMode);
  grid.innerHTML = part.charts
    .map((c) => {
      const s = M.chartStatus(c, part.rowsKnitted);
      const flash = flashIds.includes(c.id);
      return `
      <article class="chart-card${s.isLast ? ' is-last' : ''}${flash ? ' flash' : ''}"
        aria-label="${esc(c.label)}: row ${s.row} of ${s.rows}, repeat ${s.repeat}${s.isLast ? ', last row' : ''}">
        <h2 class="chart-label">${esc(c.label)}</h2>
        <p class="chart-row" aria-hidden="true"><span class="chart-row-num">${s.row}</span><span class="chart-row-of">/ ${s.rows}</span></p>
        <p class="chart-meta" aria-hidden="true">
          <span>Repeat ${s.repeat}</span>
          ${s.isLast ? '<span class="pill">Last row</span>' : ''}
        </p>
        ${
          adjustMode
            ? `<div class="nudge">
                 <button class="nudge-btn" data-action="nudge" data-chart="${esc(c.id)}" data-delta="-1" aria-label="Move ${esc(c.label)} back one row">${icon('minus')}</button>
                 <button class="nudge-btn" data-action="nudge" data-chart="${esc(c.id)}" data-delta="1" aria-label="Move ${esc(c.label)} forward one row">${icon('plus')}</button>
               </div>`
            : ''
        }
      </article>`;
    })
    .join('');
  document.getElementById('minus').disabled = part.rowsKnitted === 0;
}

function renderSettings() {
  const s = state.settings;
  show(
    'settings',
    'Settings',
    `
    <header class="bar">
      <a class="icon-btn" href="#/" aria-label="All projects">${icon('back')}</a>
      <div class="bar-titles"><h1 class="bar-title">Settings</h1></div>
    </header>
    <main class="content">
      <section class="card stack">
        <h2 class="card-heading">While counting</h2>
        <label class="toggle">
          <span><strong>Keep screen awake</strong><small>Stops your phone dimming or locking on the counting screen.${
            wakeLockSupported ? '' : ' Not supported by this browser.'
          }</small></span>
          <input type="checkbox" role="switch" data-setting="keepAwake" ${s.keepAwake ? 'checked' : ''}>
        </label>
        <label class="toggle">
          <span><strong>Vibrate on each row</strong><small>A short buzz on +1, and a double buzz when a chart starts again from row 1.${
            vibrateSupported ? '' : ' Not supported here (iPhones don’t let web apps vibrate).'
          }</small></span>
          <input type="checkbox" role="switch" data-setting="vibrate" ${s.vibrate ? 'checked' : ''}>
        </label>
      </section>

      <section class="card stack">
        <h2 class="card-heading">Backup</h2>
        <p>Your projects are saved on this phone only. Export a backup now and then and keep it somewhere safe (Files, email, cloud drive) so you can restore it on a new phone.</p>
        <div class="button-row">
          <button class="btn btn-primary" data-action="export">Export backup</button>
          <button class="btn" data-action="import">Restore from backup</button>
        </div>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>

      <section class="card stack">
        <h2 class="card-heading">Install on your phone</h2>
        <p><strong>iPhone/iPad:</strong> open this page in Safari, tap Share, then <em>Add to Home Screen</em>.</p>
        <p><strong>Android:</strong> open this page in Chrome, tap the &#8942; menu, then <em>Install app</em> or <em>Add to Home screen</em>.</p>
        <p class="muted">Once installed it works offline.</p>
      </section>
    </main>`
  );
}

/* ---------- actions ---------- */

function nextChartLabel(part) {
  const used = new Set(part.charts.map((c) => c.label.toLowerCase()));
  for (let i = 0; i < 26; i++) {
    const label = `Chart ${String.fromCharCode(65 + i)}`;
    if (!used.has(label.toLowerCase())) return label;
  }
  return `Chart ${part.charts.length + 1}`;
}

const actions = {
  async 'new-project'() {
    const name = await dialog({ title: 'New project', input: { placeholder: 'e.g. Aran jumper' }, okText: 'Create' });
    if (name === null) return;
    const project = M.createProject(name);
    state = { ...state, projects: [...state.projects, project] };
    save();
    go(href('p', project.id));
  },

  async 'rename-project'() {
    const { project } = ctx();
    const name = await dialog({ title: 'Rename project', input: { value: project.name }, okText: 'Save' });
    if (name === null) return;
    putProject({ ...project, name: name.slice(0, M.MAX_NAME) });
    route();
  },

  async 'delete-project'() {
    const { project } = ctx();
    const ok = await dialog({
      title: `Delete "${project.name}"?`,
      message: 'All of its parts and row counts will be removed. This can’t be undone.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    state = { ...state, projects: state.projects.filter((p) => p.id !== project.id) };
    save();
    go('#/', { replace: true });
  },

  async 'add-part'() {
    const { project } = ctx();
    const name = await dialog({
      title: 'Add part',
      input: { placeholder: 'e.g. Back, Left front, Sleeve' },
      okText: 'Add',
    });
    if (name === null) return;
    const part = M.createPart(name);
    putProject({ ...project, parts: [...project.parts, part] });
    go(href('p', project.id, part.id, 'setup'));
  },

  async 'duplicate-part'(el) {
    const { project } = ctx();
    const part = getPart(project, el.dataset.part);
    const name = await dialog({
      title: `Duplicate "${part.name}"`,
      message: 'Copies the charts. The new part starts from row 1.',
      input: { value: `${part.name} (copy)` },
      okText: 'Duplicate',
    });
    if (name === null) return;
    const copy = M.duplicatePart(part, name);
    const parts = [...project.parts];
    parts.splice(parts.indexOf(part) + 1, 0, copy);
    putProject({ ...project, parts });
    route();
    toast(`Added "${copy.name}"`);
  },

  async 'delete-part'(el) {
    const { project } = ctx();
    const part = getPart(project, el.dataset.part);
    const ok = await dialog({
      title: `Delete "${part.name}"?`,
      message: 'Its charts and row count will be removed. This can’t be undone.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    putProject({ ...project, parts: project.parts.filter((p) => p.id !== part.id) });
    if (current.partId) go(href('p', project.id), { replace: true });
    else route();
  },

  'add-chart'() {
    const { project, part } = ctx();
    const chart = M.createChart({ label: nextChartLabel(part), rows: 8 });
    putPart(project.id, { ...part, charts: [...part.charts, chart] });
    route();
    const input = app.querySelector(`[data-field="chart-label"][data-chart="${CSS.escape(chart.id)}"]`);
    input?.closest('.chart-edit')?.scrollIntoView({ block: 'center' });
    input?.focus();
    input?.select();
  },

  async 'remove-chart'(el) {
    const { project, part } = ctx();
    const chart = part.charts.find((c) => c.id === el.dataset.chart);
    const ok = await dialog({ title: `Remove "${chart.label}"?`, okText: 'Remove', danger: true });
    if (!ok) return;
    putPart(project.id, { ...part, charts: part.charts.filter((c) => c.id !== chart.id) });
    route();
  },

  'move-chart'(el) {
    const { project, part } = ctx();
    const charts = [...part.charts];
    const i = charts.findIndex((c) => c.id === el.dataset.chart);
    const j = i + Number(el.dataset.delta);
    if (i < 0 || j < 0 || j >= charts.length) return;
    [charts[i], charts[j]] = [charts[j], charts[i]];
    putPart(project.id, { ...part, charts });
    route();
    app.querySelector(`[data-action="move-chart"][data-chart="${CSS.escape(el.dataset.chart)}"][data-delta="${el.dataset.delta}"]:not(:disabled)`)?.focus();
  },

  async 'reset-part'() {
    const { project, part } = ctx();
    const ok = await dialog({
      title: 'Reset count?',
      message: `Every chart in "${part.name}" goes back to its starting row and the row count returns to 1.`,
      okText: 'Reset',
      danger: true,
    });
    if (!ok) return;
    putPart(project.id, M.resetPart(part));
    route();
    toast('Count reset');
  },

  step(el) {
    const delta = Number(el.dataset.delta);
    const { project, part } = ctx();
    const next = M.stepPart(part, delta);
    if (next === part) return;
    putPart(project.id, next);
    const wrapped = delta > 0 ? M.wrappedCharts(next).map((c) => c.id) : [];
    if (state.settings.vibrate) buzz(wrapped.length ? [25, 80, 25] : delta > 0 ? 15 : [10, 40, 10]);
    paintCounter(wrapped);
  },

  nudge(el) {
    const { project, part } = ctx();
    putPart(project.id, M.nudgeChart(part, el.dataset.chart, Number(el.dataset.delta)));
    if (state.settings.vibrate) buzz(10);
    paintCounter();
  },

  'toggle-adjust'(el) {
    adjustMode = !adjustMode;
    el.setAttribute('aria-pressed', String(adjustMode));
    document.getElementById('adjust-hint').hidden = !adjustMode;
    paintCounter();
  },

  async export() {
    const data = JSON.stringify({ ...state, app: 'cable-counter', exportedAt: new Date().toISOString() }, null, 2);
    const name = `cable-counter-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([data], name, { type: 'application/json' });
    const touch = window.matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Cable Counter backup' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Backup exported');
  },

  import() {
    document.getElementById('import-file').click();
  },
};

async function importBackup(file) {
  let data;
  try {
    data = M.normaliseState(JSON.parse(await file.text()));
  } catch (err) {
    toast(err instanceof SyntaxError ? "That file isn't a Cable Counter backup." : err.message);
    return;
  }
  const ok = await dialog({
    title: 'Restore backup?',
    message: `This replaces everything currently in the app with the ${plural(data.projects.length, 'project')} in the backup.`,
    okText: 'Replace',
    danger: true,
  });
  if (!ok) return;
  state = { ...data, settings: state.settings };
  save();
  toast('Backup restored');
  go('#/');
}

/* ---------- events ---------- */

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el);
});

// Text fields save as you type; number fields are checked when you leave them.
app.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.field === 'part-name') {
    const { project, part } = ctx();
    if (el.value.trim()) putPart(project.id, { ...part, name: el.value.trim().slice(0, M.MAX_NAME) });
  } else if (el.dataset.field === 'chart-label') {
    const { project, part } = ctx();
    if (el.value.trim()) {
      putPart(project.id, {
        ...part,
        charts: part.charts.map((c) => (c.id === el.dataset.chart ? M.updateChart(c, { label: el.value }) : c)),
      });
    }
  }
});

app.addEventListener('change', (e) => {
  const el = e.target;
  const field = el.dataset.field;
  if (field === 'part-name') {
    el.value = ctx().part.name;
  } else if (field === 'chart-label' || field === 'chart-rows' || field === 'chart-start') {
    const { project, part } = ctx();
    const key = { 'chart-label': 'label', 'chart-rows': 'rows', 'chart-start': 'startRow' }[field];
    let updated;
    putPart(project.id, {
      ...part,
      charts: part.charts.map((c) => (c.id === el.dataset.chart ? (updated = M.updateChart(c, { [key]: el.value })) : c)),
    });
    // Show the cleaned-up values (e.g. start row can't be past the chart's last row).
    const card = el.closest('.chart-edit');
    card.querySelector('[data-field="chart-label"]').value = updated.label;
    card.querySelector('[data-field="chart-rows"]').value = updated.rows;
    const start = card.querySelector('[data-field="chart-start"]');
    start.value = updated.startRow;
    start.max = updated.rows;
  } else if (el.dataset.setting) {
    state = { ...state, settings: { ...state.settings, [el.dataset.setting]: el.checked } };
    save();
  } else if (el.id === 'import-file' && el.files[0]) {
    importBackup(el.files[0]);
    el.value = '';
  }
});

// Keyboard / Bluetooth page-turner support on the counting screen.
document.addEventListener('keydown', (e) => {
  if (current.view !== 'counter' || document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input, textarea, select')) return;
  const onControl = e.target.closest?.('button, a');
  const forward = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key) || (!onControl && (e.key === ' ' || e.key === 'Enter'));
  const back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key);
  if (!forward && !back) return;
  e.preventDefault();
  const btn = document.getElementById(forward ? 'plus' : 'minus');
  if (btn && !btn.disabled) actions.step(btn);
});

// Another tab or window changed the data: pick it up.
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('cable-counter:v1') && !e.key.includes('damaged')) {
    state = loadState();
    route();
  }
});

window.addEventListener('hashchange', route);

requestPersistence();
route();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
