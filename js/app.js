import * as M from './model.js';
import { loadState, saveState, requestPersistence } from './storage.js';
import { setKeepAwake, haptic, wakeLockSupported, hapticsSupported, vibrateSupported } from './device.js';

const app = document.getElementById('app');
const snack = document.getElementById('snack');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let state = loadState();
let current = { view: null, projectId: null, partId: null };
let adjustMode = false;
let setupReturnsToCounter = false;
let lastRenderKey = null;

/* ---------- small helpers ---------- */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const href = (...segments) => '#/' + segments.map(encodeURIComponent).join('/');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const dye = (color) => `--c: var(--dye-${M.CHART_COLORS.includes(color) ? color : M.CHART_COLORS[0]})`;

const COLOR_NAMES = {
  madder: 'Madder red',
  indigo: 'Indigo',
  weld: 'Weld yellow',
  sage: 'Sage',
  heather: 'Heather',
  teal: 'Teal',
  walnut: 'Walnut',
  rose: 'Rose',
};

function relTime(ts) {
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (ts >= startOfToday) return 'today';
  if (ts >= startOfToday - day) return 'yesterday';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const ICONS = {
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  chevron: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  minus: '<path d="M5.5 12h13"/>',
  edit: '<path d="M4.5 19.5h4l10-10a2.1 2.1 0 0 0-4-4l-10 10v4z"/><path d="M13.5 6.5l4 4"/>',
  up: '<path d="M12 19V5.5M6.5 11L12 5.5 17.5 11"/>',
  down: '<path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6 7l.8 11.2A2 2 0 0 0 8.8 20h6.4a2 2 0 0 0 2-1.8L18 7M9.5 7V4.5h5V7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  tally: '<path d="M6 5v14M10 5v14M14 5v14M18 5v14M4 16L20 8"/>',
  export: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  import: '<path d="M12 3.5V15M7.5 10.5L12 15l4.5-4.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  check: '<path d="M5.5 12.5l4.2 4.2L18.5 8"/>',
};
const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

/** Two crossing cable strands, used for empty states. */
const cableArt = () => `
  <svg class="empty-art" viewBox="0 0 120 150" aria-hidden="true" fill="none" stroke-linecap="round">
    <path d="M80 14C80 48 40 48 40 75S80 102 80 136" stroke="var(--dye-sage)" stroke-width="15"/>
    <path d="M40 14C40 48 80 48 80 75S40 102 40 136" stroke="var(--bg)" stroke-width="27"/>
    <path d="M40 14C40 48 80 48 80 75S40 102 40 136" stroke="var(--dye-madder)" stroke-width="15"/>
  </svg>`;

const chartDots = (part) =>
  `<span class="dots" aria-hidden="true">${part.charts
    .slice(0, 8)
    .map((c) => `<i style="${dye(c.color)}"></i>`)
    .join('')}</span>`;

/* ---------- state ---------- */

let pendingUndo = null;

function persist() {
  if (!saveState(state)) notify("Couldn't save. Your phone's storage may be full.");
}

/** Save a change. Any newer change ends the chance to undo an older one. */
function save() {
  if (pendingUndo) {
    pendingUndo = null;
    dismissSnack();
  }
  persist();
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

function ctx() {
  const project = getProject(current.projectId);
  return { project, part: getPart(project, current.partId) };
}

/** Make a change straight away, with a few seconds to undo it (instead of an "are you sure?"). */
function withUndo(message, change) {
  const before = state;
  change();
  const token = {};
  pendingUndo = token;
  notify(message, {
    action: 'Undo',
    onAction: () => {
      if (pendingUndo !== token) return;
      pendingUndo = null;
      state = before;
      persist();
      route({ animate: false });
    },
  });
}

/* ---------- snackbar ---------- */

let snackTimer;
function notify(message, { action, onAction } = {}) {
  snack.innerHTML = `<span class="snack-msg">${esc(message)}</span>${
    action ? `<button type="button" class="snack-btn">${esc(action)}</button>` : ''
  }`;
  snack.querySelector('.snack-btn')?.addEventListener('click', () => {
    dismissSnack();
    onAction();
  });
  snack.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(dismissSnack, action ? 5000 : 2600);
}

function dismissSnack() {
  clearTimeout(snackTimer);
  snack.classList.remove('show');
}

/* ---------- bottom sheets ---------- */

function openSheet(build) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    dlg.innerHTML = '<div class="sheet-panel" tabindex="-1"></div>';
    const panel = dlg.firstElementChild;
    let closing = false;

    // Resolve straight away (not after the closing animation) so a follow-up sheet
    // opens within the same tap, which lets iOS show the keyboard for it.
    const close = (value = null) => {
      if (closing) return;
      closing = true;
      resolve(value);
      if (reducedMotion.matches) return dlg.close();
      dlg.classList.add('closing');
      setTimeout(() => dlg.close(), 190);
    };

    // Keep the sheet above the on-screen keyboard.
    const vv = window.visualViewport;
    const fitKeyboard = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      dlg.style.setProperty('--kb', `${kb}px`);
    };
    vv?.addEventListener('resize', fitKeyboard);

    build(panel, close);
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close(null);
    });
    dlg.addEventListener('close', () => {
      vv?.removeEventListener('resize', fitKeyboard);
      dlg.remove();
      if (!closing) resolve(null);
    });
    document.body.append(dlg);
    dlg.showModal();
    // Focus the text field if there is one; otherwise the sheet itself, so no button looks pre-selected.
    const field = panel.querySelector('input');
    if (field) {
      field.focus();
      field.select();
    } else {
      panel.focus();
    }
  });
}

const sheetHead = (title, message) =>
  `<div class="sheet-grabber" aria-hidden="true"></div>
   ${title ? `<h2 class="sheet-title">${esc(title)}</h2>` : ''}
   ${message ? `<p class="sheet-msg">${esc(message)}</p>` : ''}`;

/** A list of choices. Resolves with the chosen id, or null. */
function menu({ title, message, items, top = '' }) {
  return openSheet((panel, close) => {
    panel.innerHTML = `${sheetHead(title, message)}${top}
      <div class="sheet-list">${items
        .filter(Boolean)
        .map(
          (it) => `<button type="button" class="sheet-item${it.danger ? ' danger' : ''}" data-id="${esc(it.id)}" ${
            it.disabled ? 'disabled' : ''
          }>${icon(it.icon)}<span>${esc(it.label)}</span></button>`
        )
        .join('')}</div>
      <button type="button" class="sheet-cancel">Cancel</button>`;
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b && !b.disabled) close(b.dataset.id);
      else if (e.target.closest('.sheet-cancel')) close(null);
    });
  });
}

/** Ask for a name. Resolves with the trimmed text, or null. */
function prompt({ title, message, value = '', placeholder = '', ok = 'Save' }) {
  return openSheet((panel, close) => {
    panel.innerHTML = `${sheetHead(title, message)}
      <form class="sheet-form" novalidate>
        <input class="input" name="value" maxlength="${M.MAX_NAME}" autocomplete="off" autocapitalize="sentences"
          enterkeyhint="done" aria-label="${esc(title)}" placeholder="${esc(placeholder)}" value="${esc(value)}">
        <div class="sheet-buttons">
          <button type="button" class="btn btn-quiet" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">${esc(ok)}</button>
        </div>
      </form>`;
    const input = panel.querySelector('input');
    const submit = panel.querySelector('[type=submit]');
    const sync = () => (submit.disabled = !input.value.trim());
    input.addEventListener('input', sync);
    sync();
    panel.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) close(input.value.trim());
    });
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(null));
  });
}

function confirmSheet({ title, message, ok, danger = false }) {
  return openSheet((panel, close) => {
    panel.innerHTML = `${sheetHead(title, message)}
      <div class="sheet-buttons">
        <button type="button" class="btn btn-quiet" data-no>Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(ok)}</button>
      </div>`;
    panel.querySelector('[data-no]').addEventListener('click', () => close(false));
    panel.querySelector('[data-yes]').addEventListener('click', () => close(true));
  }).then(Boolean);
}

/* ---------- routing ---------- */

const DEPTH = { home: 0, settings: 1, project: 1, setup: 2, counter: 2 };

function resolveRoute() {
  const seg = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (seg[0] === 'settings') return { view: 'settings' };
  if (seg[0] === 'p' && seg[1]) {
    const project = getProject(seg[1]);
    if (!project) return { redirect: '#/' };
    if (!seg[2]) return { view: 'project', project };
    const part = getPart(project, seg[2]);
    if (!part) return { redirect: href('p', project.id) };
    if (seg[3] === 'setup') return { view: 'setup', project, part };
    if (!part.charts.length) return { redirect: href('p', project.id, part.id, 'setup') };
    return { view: 'counter', project, part };
  }
  return { view: 'home' };
}

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

function route({ animate = true } = {}) {
  const target = resolveRoute();
  if (target.redirect) {
    history.replaceState(null, '', target.redirect);
    return route({ animate });
  }
  const prev = current;
  const changed =
    prev.view !== target.view || prev.projectId !== (target.project?.id ?? null) || prev.partId !== (target.part?.id ?? null);

  const render = () => renderRoute(target, prev, changed);

  if (animate && changed && prev.view && document.startViewTransition && !reducedMotion.matches) {
    const depth = DEPTH[target.view] - DEPTH[prev.view];
    document.documentElement.dataset.nav = depth > 0 ? 'forward' : depth < 0 ? 'back' : 'fade';
    document.startViewTransition(render);
  } else {
    render();
  }
}

function renderRoute(target, prev, changed) {
  current = { view: target.view, projectId: target.project?.id ?? null, partId: target.part?.id ?? null };
  setKeepAwake(false);
  if (target.view !== 'counter' || changed) adjustMode = false;

  switch (target.view) {
    case 'settings':
      return renderSettings();
    case 'project':
      return renderProject(target.project);
    case 'setup':
      if (changed) setupReturnsToCounter = prev.view === 'counter' && prev.partId === target.part.id;
      return renderSetup(target.project, target.part);
    case 'counter': {
      let part = target.part;
      if (changed) part = putPart(target.project.id, { ...part, lastUsedAt: Date.now() });
      return renderCounter(getProject(target.project.id), part);
    }
    default:
      return renderHome();
  }
}

/** Swap in a screen. Re-rendering the same screen keeps the scroll position. */
function show(view, key, title, html) {
  const same = lastRenderKey === key;
  const y = window.scrollY;
  document.title = title ? `${title} · Cable Counter` : 'Cable Counter';
  app.dataset.view = view;
  app.innerHTML = html;
  window.scrollTo(0, same ? y : 0);
  lastRenderKey = key;
}

/* ---------- screens ---------- */

function renderHome() {
  const projects = [...state.projects].sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = M.mostRecentPart(state);
  show(
    'home',
    'home',
    '',
    `
    <header class="hero">
      <h1 class="display">Cable Counter</h1>
      <a class="icon-btn" href="#/settings" aria-label="Settings and backup">${icon('gear')}</a>
    </header>
    <main class="content">
      ${
        recent
          ? `<a class="continue" href="${href('p', recent.project.id, recent.part.id)}">
              <span class="continue-text">
                <span class="eyebrow">Continue knitting</span>
                <span class="continue-title">${esc(recent.part.name)}</span>
                <span class="continue-sub">${esc(recent.project.name)}</span>
                <span class="continue-meta">${chartDots(recent.part)}<span>Row <b>${recent.part.rowsKnitted + 1}</b></span></span>
              </span>
              <span class="continue-go" aria-hidden="true">${icon('chevron')}</span>
            </a>`
          : ''
      }
      ${
        projects.length
          ? `<h2 class="section-label">Projects</h2>
            <ul class="list">${projects
              .map(
                (p) => `
              <li><a class="row-card" href="${href('p', p.id)}">
                <span class="row-card-text">
                  <span class="row-card-title">${esc(p.name)}</span>
                  <span class="row-card-meta">${plural(p.parts.length, 'part')} · ${relTime(p.updatedAt)}</span>
                </span>
                ${icon('chevron', 'icon chevron')}
              </a></li>`
              )
              .join('')}</ul>`
          : `<div class="empty">
              ${cableArt()}
              <h2 class="empty-title">Cast on your first project</h2>
              <p>Add a project, give it parts (back, fronts, sleeves), then set up the charts you're following in each one.</p>
            </div>`
      }
    </main>
    <footer class="dock">
      <button class="btn ${recent ? 'btn-secondary' : 'btn-primary'} btn-block" data-action="new-project">${icon('plus')}<span>New project</span></button>
    </footer>`
  );
}

function renderProject(project) {
  show(
    'project',
    `project:${project.id}`,
    project.name,
    `
    <header class="bar">
      <a class="icon-btn" href="#/" aria-label="All projects">${icon('back')}</a>
      <span class="bar-spacer"></span>
      <button class="icon-btn" data-action="project-menu" aria-label="Project options">${icon('more')}</button>
    </header>
    <div class="page-head">
      <h1 class="display">${esc(project.name)}</h1>
      <p class="page-sub">${project.parts.length ? plural(project.parts.length, 'part') : 'Project'}</p>
    </div>
    <main class="content">
      ${
        project.parts.length
          ? `<ul class="list">${project.parts
              .map((part) => {
                const target = part.charts.length ? href('p', project.id, part.id) : href('p', project.id, part.id, 'setup');
                return `
              <li class="part-card">
                <a class="part-link" href="${target}">
                  <span class="part-text">
                    <span class="part-name">${esc(part.name)}</span>
                    <span class="part-meta">${
                      part.charts.length ? `${chartDots(part)}<span>${plural(part.charts.length, 'chart')}</span>` : 'No charts yet'
                    }</span>
                  </span>
                  ${
                    part.charts.length
                      ? `<span class="part-row"><span>Row</span><b>${part.rowsKnitted + 1}</b></span>`
                      : `<span class="part-setup">Set up</span>`
                  }
                </a>
                <button class="icon-btn part-more" data-action="part-menu" data-part="${esc(part.id)}" aria-label="Options for ${esc(part.name)}">${icon('more')}</button>
              </li>`;
              })
              .join('')}</ul>`
          : `<div class="empty">
              ${cableArt()}
              <h2 class="empty-title">Add the pieces you'll knit</h2>
              <p>For example Back, Left front, Right front, Left sleeve, Right sleeve. Set up one sleeve, then duplicate it for the other.</p>
            </div>`
      }
    </main>
    <footer class="dock">
      <button class="btn btn-primary btn-block" data-action="add-part">${icon('plus')}<span>Add part</span></button>
    </footer>`
  );
}

function stepper(chart, field, label, value, min, max) {
  const id = `${field}-${chart.id}`;
  return `
    <div class="stepper-field">
      <label class="field-label" for="${esc(id)}">${label}</label>
      <div class="stepper">
        <button type="button" class="step-btn" data-step="-1" data-field="${field}" data-chart="${esc(chart.id)}"
          aria-label="${label}: one less" ${value <= min ? 'disabled' : ''}>${icon('minus')}</button>
        <input class="step-input" id="${esc(id)}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
          data-field="chart-${field}" data-chart="${esc(chart.id)}" value="${value}" enterkeyhint="done">
        <button type="button" class="step-btn" data-step="1" data-field="${field}" data-chart="${esc(chart.id)}"
          aria-label="${label}: one more" ${value >= max ? 'disabled' : ''}>${icon('plus')}</button>
      </div>
    </div>`;
}

function renderSetup(project, part) {
  const counterHref = href('p', project.id, part.id);
  const backHref = setupReturnsToCounter && part.charts.length ? counterHref : href('p', project.id);
  const doneLabel = setupReturnsToCounter || part.rowsKnitted > 0 ? 'Done' : 'Start counting';
  show(
    'setup',
    `setup:${part.id}`,
    `Charts for ${part.name}`,
    `
    <header class="bar">
      <a class="icon-btn" href="${backHref}" aria-label="Back">${icon('back')}</a>
      <div class="bar-titles"><p class="bar-title">Charts</p><p class="bar-sub">${esc(project.name)}</p></div>
    </header>
    <div class="page-head">
      <label class="sr-only" for="part-name">Part name</label>
      <input class="title-input" id="part-name" data-field="part-name" value="${esc(part.name)}" maxlength="${M.MAX_NAME}"
        autocomplete="off" enterkeyhint="done">
      <p class="page-sub">Each chart repeats on its own. If a chart doesn't begin on its row 1, set the row it starts on.</p>
    </div>
    <main class="content">
      ${
        part.charts.length
          ? `<ol class="list editors">${part.charts
              .map(
                (c, i) => `
            <li class="editor" style="${dye(c.color)}" data-chart-id="${esc(c.id)}">
              <div class="editor-head">
                <button type="button" class="swatch-btn" data-action="chart-menu" data-chart="${esc(c.id)}"
                  aria-label="Colour and options for chart ${i + 1}"><span></span></button>
                <input class="editor-label" data-field="chart-label" data-chart="${esc(c.id)}" value="${esc(c.label)}"
                  maxlength="${M.MAX_NAME}" autocomplete="off" enterkeyhint="done" aria-label="Chart ${i + 1} label">
                <button type="button" class="icon-btn" data-action="chart-menu" data-chart="${esc(c.id)}"
                  aria-label="Options for chart ${i + 1}">${icon('more')}</button>
              </div>
              <div class="editor-fields">
                ${stepper(c, 'rows', 'Rows', c.rows, 1, M.MAX_ROWS)}
                ${stepper(c, 'startRow', 'Starts on row', c.startRow, 1, c.rows)}
              </div>
            </li>`
              )
              .join('')}</ol>`
          : `<p class="empty-inline">Add the first chart you're following in this part.</p>`
      }
      <button class="btn btn-dashed btn-block" data-action="add-chart">${icon('plus')}<span>Add chart</span></button>
    </main>
    <footer class="dock">
      ${
        part.charts.length
          ? `<a class="btn btn-primary btn-block" href="${counterHref}">${doneLabel}</a>`
          : `<button class="btn btn-primary btn-block" disabled>Add a chart to start counting</button>`
      }
    </footer>`
  );
}

function chartCard(c, s) {
  return `
    <article class="chart${s.isLast ? ' is-last' : ''}" style="${dye(c.color)}" data-chart-id="${esc(c.id)}"
      aria-label="${esc(cardLabel(c, s))}">
      <div class="chart-head"><span class="chart-dot" aria-hidden="true"></span><h2 class="chart-name">${esc(c.label)}</h2></div>
      <div class="chart-num" aria-hidden="true"><span class="roll">${s.row}</span><span class="chart-of">/${s.rows}</span></div>
      <div class="chart-progress" aria-hidden="true"><span style="transform: scaleX(${s.row / s.rows})"></span></div>
      <div class="chart-foot" aria-hidden="true"><span>Repeat <span class="rep">${s.repeat}</span></span><span class="chart-last">Last row</span></div>
      <div class="nudge" ${adjustMode ? '' : 'inert'}>
        <div class="nudge-inner">
          <button type="button" class="nudge-btn" data-action="nudge" data-chart="${esc(c.id)}" data-delta="-1"
            aria-label="Move ${esc(c.label)} back one row">${icon('minus')}</button>
          <button type="button" class="nudge-btn" data-action="nudge" data-chart="${esc(c.id)}" data-delta="1"
            aria-label="Move ${esc(c.label)} forward one row">${icon('plus')}</button>
        </div>
      </div>
    </article>`;
}

const cardLabel = (c, s) => `${c.label}: row ${s.row} of ${s.rows}, repeat ${s.repeat}${s.isLast ? ', last row' : ''}`;

function renderCounter(project, part) {
  const n = part.charts.length;
  show(
    'counter',
    `counter:${part.id}`,
    part.name,
    `
    <div class="counter${adjustMode ? ' is-adjusting' : ''}">
      <header class="bar">
        <a class="icon-btn" href="${href('p', project.id)}" aria-label="Back to ${esc(project.name)}">${icon('back')}</a>
        <div class="bar-titles"><h1 class="bar-title">${esc(part.name)}</h1><p class="bar-sub">${esc(project.name)}</p></div>
        <button class="icon-btn menu-btn" id="menu-btn" data-action="counter-menu" aria-label="Counter options">${icon('more')}</button>
        <button class="done-btn" id="done-btn" data-action="adjust-done">Done</button>
      </header>
      <section class="tally" aria-live="polite" aria-atomic="true">
        <span class="tally-label">Row</span><span class="tally-num" id="tally-num">${part.rowsKnitted + 1}</span>
        <span class="tally-done" id="tally-done">${part.rowsKnitted} knitted</span>
      </section>
      <div class="adjust-note"><p>Nudge a chart that's out of step. The others stay where they are.</p></div>
      <main class="charts" id="charts" data-count="${n}" data-density="${n <= 2 ? 'roomy' : n <= 6 ? 'compact' : 'dense'}">
        ${part.charts.map((c) => chartCard(c, M.chartStatus(c, part.rowsKnitted))).join('')}
      </main>
      <div class="count-bar">
        <button class="count-minus" id="minus" data-action="step" data-delta="-1" aria-label="Back one row" ${
          part.rowsKnitted === 0 ? 'disabled' : ''
        }>${icon('minus')}<span>1</span></button>
        <button class="count-plus" id="plus" data-action="step" data-delta="1" aria-label="Forward one row">+1</button>
      </div>
    </div>`
  );
  setKeepAwake(state.settings.keepAwake);
}

/** Roll a number to its new value (up when counting forward, down when going back). */
function roll(el, value, dir) {
  const text = String(value);
  if (!el || el.textContent === text) return;
  el.textContent = text;
  if (!dir || reducedMotion.matches || !el.animate) return;
  el.animate(
    [
      { transform: `translateY(${dir > 0 ? 0.35 : -0.35}em)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
  );
}

function setProgress(el, fraction, instant) {
  if (instant) {
    el.style.transition = 'none';
    el.style.transform = `scaleX(${fraction})`;
    void el.offsetWidth;
    el.style.transition = '';
  } else {
    el.style.transform = `scaleX(${fraction})`;
  }
}

/** Update the counting screen in place so numbers and bars can animate. */
function updateCounter({ prev, dir = 0, wrapped = [] }) {
  const { part } = ctx();
  const grid = document.getElementById('charts');
  if (!part || !grid) return;
  roll(document.getElementById('tally-num'), part.rowsKnitted + 1, dir);
  document.getElementById('tally-done').textContent = `${part.rowsKnitted} knitted`;
  document.getElementById('minus').disabled = part.rowsKnitted === 0;

  for (const c of part.charts) {
    const card = grid.querySelector(`[data-chart-id="${CSS.escape(c.id)}"]`);
    if (!card) continue;
    const s = M.chartStatus(c, part.rowsKnitted);
    const old = prev ? M.chartStatus(prev.charts.find((x) => x.id === c.id) ?? c, prev.rowsKnitted) : s;
    // Went past the last row (or back past row 1): the bar jumps rather than sliding backwards.
    const wrappedHere = dir !== 0 && s.row !== old.row && Math.sign(s.row - old.row) !== Math.sign(dir);
    card.classList.toggle('is-last', s.isLast);
    card.setAttribute('aria-label', cardLabel(c, s));
    roll(card.querySelector('.roll'), s.row, dir);
    const rep = card.querySelector('.rep');
    if (rep.textContent !== String(s.repeat)) {
      rep.textContent = s.repeat;
      if (s.repeat > old.repeat && !reducedMotion.matches) {
        rep.animate([{ transform: 'scale(1.5)' }, { transform: 'none' }], {
          duration: 420,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        });
      }
    }
    setProgress(card.querySelector('.chart-progress > span'), s.row / s.rows, wrappedHere);
    if (wrapped.includes(c.id)) {
      card.classList.remove('glow');
      void card.offsetWidth;
      card.classList.add('glow');
    }
  }
}

function setAdjust(on) {
  adjustMode = on;
  const root = app.querySelector('.counter');
  if (!root) return;
  root.classList.toggle('is-adjusting', on);
  root.querySelectorAll('.nudge').forEach((n) => (n.inert = !on));
  document.getElementById(on ? 'done-btn' : 'menu-btn')?.focus({ preventScroll: true });
}

function renderSettings() {
  const s = state.settings;
  const hapticText = vibrateSupported
    ? 'A gentle buzz on each row, and a double buzz when a chart starts again.'
    : hapticsSupported
      ? 'A light tap on each row (iPhone with iOS 18 or later).'
      : 'Not available on this device.';
  show(
    'settings',
    'settings',
    'Settings',
    `
    <header class="bar">
      <a class="icon-btn" href="#/" aria-label="All projects">${icon('back')}</a>
      <span class="bar-spacer"></span>
    </header>
    <div class="page-head"><h1 class="display">Settings</h1></div>
    <main class="content">
      <h2 class="section-label">While counting</h2>
      <div class="group">
        <label class="setting">
          <span class="setting-text">
            <span class="setting-title">Keep screen awake</span>
            <span class="setting-desc">${
              wakeLockSupported ? 'Stops your phone dimming while you count.' : 'Not supported by this browser.'
            }</span>
          </span>
          <input type="checkbox" class="switch" role="switch" data-setting="keepAwake" ${s.keepAwake ? 'checked' : ''} ${
            wakeLockSupported ? '' : 'disabled'
          }>
        </label>
        <label class="setting">
          <span class="setting-text">
            <span class="setting-title">Haptic feedback</span>
            <span class="setting-desc">${hapticText}</span>
          </span>
          <input type="checkbox" class="switch" role="switch" data-setting="vibrate" ${s.vibrate ? 'checked' : ''} ${
            hapticsSupported ? '' : 'disabled'
          }>
        </label>
      </div>

      <h2 class="section-label">Backup</h2>
      <div class="group">
        <button class="setting" data-action="export">
          <span class="setting-icon">${icon('export')}</span>
          <span class="setting-text"><span class="setting-title">Export backup</span><span class="setting-desc">Save all your projects to a file</span></span>
          ${icon('chevron', 'icon chevron')}
        </button>
        <button class="setting" data-action="import">
          <span class="setting-icon">${icon('import')}</span>
          <span class="setting-text"><span class="setting-title">Restore from backup</span><span class="setting-desc">Replace everything with a backup file</span></span>
          ${icon('chevron', 'icon chevron')}
        </button>
      </div>
      <p class="group-note">Projects are saved on this phone only. Export a backup now and then and keep it somewhere safe, like Files, email or a cloud drive.</p>
      <input type="file" id="import-file" accept="application/json,.json" hidden>

      <h2 class="section-label">Install on your phone</h2>
      <div class="group prose">
        <p><b>iPhone or iPad:</b> open this page in Safari, tap Share, then <em>Add to Home Screen</em>.</p>
        <p><b>Android:</b> open this page in Chrome, tap the &#8942; menu, then <em>Install app</em>.</p>
        <p class="muted">Once installed, Cable Counter works offline.</p>
      </div>
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

/** "Left sleeve" → "Right sleeve", "Front 1" → "Front 2", otherwise "… (copy)". */
function mirrorName(name) {
  const swapped = name.replace(/\b(left|right)\b/gi, (w) => {
    const to = /^left$/i.test(w) ? 'right' : 'left';
    if (w === w.toUpperCase()) return to.toUpperCase();
    return w[0] === w[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
  });
  if (swapped !== name) return swapped;
  const numbered = name.match(/^(.*?)(\d+)$/);
  if (numbered) return `${numbered[1]}${Number(numbered[2]) + 1}`;
  return `${name} (copy)`;
}

function hasCount(part) {
  return part.rowsKnitted > 0 || part.charts.some((c) => c.nudge !== 0);
}

const actions = {
  async 'new-project'() {
    const name = await prompt({ title: 'New project', placeholder: 'e.g. Aran jumper', ok: 'Create' });
    if (name === null) return;
    const project = M.createProject(name);
    state = { ...state, projects: [...state.projects, project] };
    save();
    go(href('p', project.id));
  },

  async 'project-menu'() {
    const { project } = ctx();
    const choice = await menu({
      title: project.name,
      items: [
        { id: 'rename', icon: 'edit', label: 'Rename project' },
        { id: 'delete', icon: 'trash', label: 'Delete project', danger: true },
      ],
    });
    if (choice === 'rename') {
      const name = await prompt({ title: 'Rename project', value: project.name });
      if (name === null) return;
      putProject({ ...getProject(project.id), name: name.slice(0, M.MAX_NAME) });
      route({ animate: false });
    } else if (choice === 'delete') {
      withUndo(`Deleted "${project.name}"`, () => {
        state = { ...state, projects: state.projects.filter((p) => p.id !== project.id) };
        save();
        go('#/', { replace: true });
      });
    }
  },

  async 'add-part'() {
    const { project } = ctx();
    const name = await prompt({ title: 'Add part', placeholder: 'e.g. Back, Left front, Sleeve', ok: 'Add' });
    if (name === null) return;
    const part = M.createPart(name);
    putProject({ ...getProject(project.id), parts: [...getProject(project.id).parts, part] });
    go(href('p', project.id, part.id, 'setup'));
  },

  async 'part-menu'(el) {
    const { project } = ctx();
    const part = getPart(project, el.dataset.part);
    const choice = await menu({
      title: part.name,
      items: [
        part.charts.length && { id: 'count', icon: 'tally', label: 'Count rows' },
        { id: 'edit', icon: 'edit', label: part.charts.length ? 'Edit charts' : 'Set up charts' },
        part.charts.length && { id: 'duplicate', icon: 'copy', label: 'Duplicate' },
        { id: 'delete', icon: 'trash', label: 'Delete part', danger: true },
      ],
    });
    if (choice === 'count') go(href('p', project.id, part.id));
    else if (choice === 'edit') go(href('p', project.id, part.id, 'setup'));
    else if (choice === 'duplicate') {
      const name = await prompt({
        title: `Duplicate ${part.name}`,
        message: 'Copies the charts. The new part starts at row 1.',
        value: mirrorName(part.name),
        ok: 'Duplicate',
      });
      if (name === null) return;
      const fresh = getProject(project.id);
      const copy = M.duplicatePart(part, name);
      const parts = [...fresh.parts];
      parts.splice(parts.findIndex((p) => p.id === part.id) + 1, 0, copy);
      putProject({ ...fresh, parts });
      route({ animate: false });
      notify(`Added ${copy.name}`);
    } else if (choice === 'delete') {
      withUndo(`Deleted ${part.name}`, () => {
        const fresh = getProject(project.id);
        putProject({ ...fresh, parts: fresh.parts.filter((p) => p.id !== part.id) });
        route({ animate: false });
      });
    }
  },

  'add-chart'() {
    const { project, part } = ctx();
    const chart = M.createChart({ label: nextChartLabel(part), rows: 8, color: M.nextChartColor(part) });
    putPart(project.id, { ...part, charts: [...part.charts, chart] });
    route({ animate: false });
    const card = app.querySelector(`[data-chart-id="${CSS.escape(chart.id)}"]`);
    if (!card) return;
    const input = card.querySelector('.editor-label');
    input.focus({ preventScroll: true });
    input.select();
    card.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    if (!reducedMotion.matches) {
      card.animate([{ opacity: 0, transform: 'translateY(12px) scale(0.98)' }, { opacity: 1, transform: 'none' }], {
        duration: 320,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    }
  },

  async 'chart-menu'(el) {
    const { project, part } = ctx();
    const i = part.charts.findIndex((c) => c.id === el.dataset.chart);
    const chart = part.charts[i];
    if (!chart) return;
    const swatches = `
      <div class="swatches" role="radiogroup" aria-label="Chart colour">
        ${M.CHART_COLORS.map(
          (c) => `<button type="button" class="swatch" role="radio" aria-checked="${c === chart.color}" aria-label="${
            COLOR_NAMES[c]
          }" data-id="color:${c}" style="${dye(c)}">${c === chart.color ? icon('check') : ''}</button>`
        ).join('')}
      </div>`;
    const choice = await menu({
      title: chart.label,
      top: swatches,
      items: [
        { id: 'up', icon: 'up', label: 'Move earlier', disabled: i === 0 },
        { id: 'down', icon: 'down', label: 'Move later', disabled: i === part.charts.length - 1 },
        { id: 'remove', icon: 'trash', label: 'Remove chart', danger: true },
      ],
    });
    if (!choice) return;
    const fresh = getPart(getProject(project.id), part.id);
    if (choice.startsWith('color:')) {
      const color = choice.slice(6);
      putPart(project.id, { ...fresh, charts: fresh.charts.map((c) => (c.id === chart.id ? M.updateChart(c, { color }) : c)) });
      route({ animate: false });
    } else if (choice === 'up' || choice === 'down') {
      const charts = [...fresh.charts];
      const from = charts.findIndex((c) => c.id === chart.id);
      const to = from + (choice === 'up' ? -1 : 1);
      if (to < 0 || to >= charts.length) return;
      [charts[from], charts[to]] = [charts[to], charts[from]];
      putPart(project.id, { ...fresh, charts });
      route({ animate: false });
      const moved = app.querySelector(`[data-chart-id="${CSS.escape(chart.id)}"]`);
      moved?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    } else if (choice === 'remove') {
      withUndo(`Removed ${chart.label}`, () => {
        putPart(project.id, { ...fresh, charts: fresh.charts.filter((c) => c.id !== chart.id) });
        route({ animate: false });
      });
    }
  },

  async 'counter-menu'() {
    const { project, part } = ctx();
    const choice = await menu({
      title: part.name,
      items: [
        { id: 'adjust', icon: 'sliders', label: 'Adjust a single chart' },
        { id: 'edit', icon: 'edit', label: 'Edit charts' },
        { id: 'reset', icon: 'reset', label: 'Reset count to row 1', danger: true, disabled: !hasCount(part) },
      ],
    });
    if (choice === 'adjust') setAdjust(true);
    else if (choice === 'edit') go(href('p', project.id, part.id, 'setup'));
    else if (choice === 'reset') {
      withUndo('Count reset to row 1', () => {
        putPart(project.id, M.resetPart(getPart(getProject(project.id), part.id)));
        route({ animate: false });
      });
    }
  },

  'adjust-done'() {
    setAdjust(false);
  },

  step(el) {
    const delta = Number(el.dataset.delta);
    const { project, part } = ctx();
    const next = M.stepPart(part, delta);
    if (next === part) return;
    putPart(project.id, { ...next, lastUsedAt: Date.now() });
    const wrapped = delta > 0 ? M.wrappedCharts(next).filter((c) => c.rows > 1).map((c) => c.id) : [];
    if (state.settings.vibrate) haptic(wrapped.length ? 'double' : 'tap');
    updateCounter({ prev: part, dir: delta, wrapped });
  },

  nudge(el) {
    const { project, part } = ctx();
    const next = M.nudgeChart(part, el.dataset.chart, Number(el.dataset.delta));
    putPart(project.id, { ...next, lastUsedAt: Date.now() });
    if (state.settings.vibrate) haptic('soft');
    updateCounter({ prev: part, dir: Number(el.dataset.delta) });
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
    notify('Backup exported');
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
    notify(err instanceof SyntaxError ? "That file isn't a Cable Counter backup." : err.message);
    return;
  }
  const ok = await confirmSheet({
    title: 'Restore this backup?',
    message: `Everything currently in the app will be replaced with the ${plural(data.projects.length, 'project')} in the backup.`,
    ok: 'Replace',
    danger: true,
  });
  if (!ok) return;
  state = { ...data, settings: state.settings };
  save();
  go('#/');
  notify('Backup restored');
}

/* ---------- chart setup fields ---------- */

const FIELD_KEYS = { 'chart-label': 'label', 'chart-rows': 'rows', 'chart-startRow': 'startRow' };

function updateChartField(chartId, key, value) {
  const { project, part } = ctx();
  let updated = null;
  putPart(project.id, {
    ...part,
    charts: part.charts.map((c) => (c.id === chartId ? (updated = M.updateChart(c, { [key]: value })) : c)),
  });
  return updated;
}

/** Show cleaned-up values (e.g. the start row can't be past the chart's last row). */
function syncEditor(chart) {
  if (!chart) return;
  const card = app.querySelector(`.editor[data-chart-id="${CSS.escape(chart.id)}"]`);
  if (!card) return;
  const rows = card.querySelector('[data-field="chart-rows"]');
  const start = card.querySelector('[data-field="chart-startRow"]');
  if (document.activeElement !== card.querySelector('.editor-label')) card.querySelector('.editor-label').value = chart.label;
  rows.value = chart.rows;
  start.value = chart.startRow;
  card.querySelector('[data-field="rows"][data-step="-1"]').disabled = chart.rows <= 1;
  card.querySelector('[data-field="rows"][data-step="1"]').disabled = chart.rows >= M.MAX_ROWS;
  card.querySelector('[data-field="startRow"][data-step="-1"]').disabled = chart.startRow <= 1;
  card.querySelector('[data-field="startRow"][data-step="1"]').disabled = chart.startRow >= chart.rows;
}

function stepField(btn) {
  if (btn.disabled) return false;
  const { part } = ctx();
  const chart = part.charts.find((c) => c.id === btn.dataset.chart);
  if (!chart) return false;
  const key = btn.dataset.field;
  const updated = updateChartField(chart.id, key, chart[key] + Number(btn.dataset.step));
  syncEditor(updated);
  if (state.settings.vibrate) haptic('soft');
  return !btn.disabled;
}

// Press and hold a stepper button to keep changing the value.
let holdTimer = null;
function stopHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
}
app.addEventListener('pointerdown', (e) => {
  const step = e.target.closest('.step-btn');
  if (step && !step.disabled && e.button === 0) {
    // Commit a number that's being typed before stepping from it.
    if (document.activeElement?.matches?.('.step-input')) document.activeElement.blur();
    stepField(step);
    let delay = 420;
    const repeat = () => {
      if (!stepField(step)) return stopHold();
      delay = Math.max(45, delay * 0.8);
      holdTimer = setTimeout(repeat, delay);
    };
    holdTimer = setTimeout(repeat, delay);
    return;
  }
  // Soft ripple from the point of contact on the counting buttons.
  const big = e.target.closest('.count-plus, .count-minus');
  if (big && !big.disabled && !reducedMotion.matches && big.animate) {
    const r = big.getBoundingClientRect();
    const size = Math.hypot(r.width, r.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    big.append(dot);
    dot
      .animate([{ transform: 'scale(0)', opacity: 0.28 }, { transform: 'scale(1)', opacity: 0 }], {
        duration: 650,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      })
      .addEventListener('finish', () => dot.remove());
  }
});
['pointerup', 'pointercancel', 'blur'].forEach((type) => window.addEventListener(type, stopHold));
app.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.step-btn, .count-plus, .count-minus')) e.preventDefault();
});

/* ---------- events ---------- */

app.addEventListener('click', (e) => {
  const step = e.target.closest('.step-btn');
  if (step) {
    // Pointer presses are handled on pointerdown; this catches keyboard presses.
    if (e.detail === 0) stepField(step);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el);
});

// Names save as you type; numbers are checked when you leave the field.
app.addEventListener('input', (e) => {
  const el = e.target;
  const value = el.value.trim();
  if (!value) return;
  if (el.dataset.field === 'part-name') {
    const { project, part } = ctx();
    putPart(project.id, { ...part, name: value.slice(0, M.MAX_NAME) });
  } else if (el.dataset.field === 'chart-label') {
    updateChartField(el.dataset.chart, 'label', value);
  }
});

app.addEventListener('change', (e) => {
  const el = e.target;
  const field = el.dataset.field;
  if (field === 'part-name') {
    el.value = ctx().part.name;
  } else if (FIELD_KEYS[field]) {
    syncEditor(updateChartField(el.dataset.chart, FIELD_KEYS[field], el.value));
  } else if (el.dataset.setting) {
    state = { ...state, settings: { ...state.settings, [el.dataset.setting]: el.checked } };
    save();
    if (el.dataset.setting === 'vibrate' && el.checked) haptic('tap');
  } else if (el.id === 'import-file' && el.files[0]) {
    importBackup(el.files[0]);
    el.value = '';
  }
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox])')) e.target.blur();
});

// Keyboard / Bluetooth page-turner support on the counting screen.
document.addEventListener('keydown', (e) => {
  if (current.view !== 'counter' || document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input:not([switch]), textarea, select')) return;
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
  if (e.key === 'cable-counter:v1') {
    state = loadState();
    route({ animate: false });
  }
});

// iOS only applies :active styles when a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

window.addEventListener('hashchange', () => route());

requestPersistence();
route();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
