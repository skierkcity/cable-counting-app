import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChart,
  createPart,
  chartStatus,
  stepPart,
  nudgeChart,
  resetPart,
  duplicatePart,
  updateChart,
  wrappedCharts,
  normaliseState,
  emptyState,
  nextChartColor,
  mostRecentPart,
  CHART_COLORS,
} from '../js/model.js';

function partWith(...charts) {
  return { ...createPart('Back'), charts: charts.map((c) => createChart(c)) };
}

function rowsOf(part) {
  return part.charts.map((c) => chartStatus(c, part.rowsKnitted).row);
}

test('a new chart starts on row 1, repeat 1', () => {
  const part = partWith({ label: 'A', rows: 4 });
  assert.deepEqual(chartStatus(part.charts[0], 0), { row: 1, rows: 4, repeat: 1, isLast: false, isFirst: true });
});

test('+1 advances every chart, each wrapping at its own length', () => {
  let part = partWith({ label: 'A', rows: 4 }, { label: 'B', rows: 6 }, { label: 'C', rows: 1 });
  const seen = [];
  for (let i = 0; i < 7; i++) {
    seen.push(rowsOf(part));
    part = stepPart(part, 1);
  }
  assert.deepEqual(seen, [
    [1, 1, 1],
    [2, 2, 1],
    [3, 3, 1],
    [4, 4, 1],
    [1, 5, 1],
    [2, 6, 1],
    [3, 1, 1],
  ]);
  assert.equal(part.rowsKnitted, 7);
});

test('repeat count increases each time a chart starts over', () => {
  let part = partWith({ label: 'A', rows: 3 });
  for (let i = 0; i < 7; i++) part = stepPart(part, 1);
  const s = chartStatus(part.charts[0], part.rowsKnitted);
  assert.equal(s.row, 2);
  assert.equal(s.repeat, 3);
});

test('-1 counts backwards and wraps from row 1 to the last row', () => {
  let part = partWith({ label: 'A', rows: 4 }, { label: 'B', rows: 10 });
  for (let i = 0; i < 4; i++) part = stepPart(part, 1); // A back on row 1 (repeat 2)
  assert.deepEqual(rowsOf(part), [1, 5]);
  part = stepPart(part, -1);
  assert.deepEqual(rowsOf(part), [4, 4]);
  assert.equal(chartStatus(part.charts[0], part.rowsKnitted).repeat, 1);
});

test('-1 does nothing before the first row has been counted', () => {
  const part = partWith({ label: 'A', rows: 4 });
  assert.equal(stepPart(part, -1), part);
});

test('start offset lets a chart begin partway through', () => {
  let part = partWith({ label: 'A', rows: 8 }, { label: 'B', rows: 8, startRow: 5 });
  assert.deepEqual(rowsOf(part), [1, 5]);
  for (let i = 0; i < 4; i++) part = stepPart(part, 1);
  assert.deepEqual(rowsOf(part), [5, 1]);
  assert.equal(chartStatus(part.charts[1], part.rowsKnitted).repeat, 2);
});

test('nudging moves one chart only, in either direction, with wrapping', () => {
  let part = partWith({ label: 'A', rows: 4 }, { label: 'B', rows: 4 });
  part = nudgeChart(part, part.charts[1].id, -1);
  assert.deepEqual(rowsOf(part), [1, 4]);
  assert.equal(chartStatus(part.charts[1], part.rowsKnitted).repeat, 1);
  part = nudgeChart(part, part.charts[1].id, 2);
  assert.deepEqual(rowsOf(part), [1, 2]);
  assert.equal(part.rowsKnitted, 0);
});

test('wrappedCharts reports charts that just went back to row 1', () => {
  let part = partWith({ label: 'A', rows: 2 }, { label: 'B', rows: 3 });
  assert.deepEqual(wrappedCharts(part).map((c) => c.label), []);
  part = stepPart(part, 1);
  assert.deepEqual(wrappedCharts(part).map((c) => c.label), []);
  part = stepPart(part, 1);
  assert.deepEqual(wrappedCharts(part).map((c) => c.label), ['A']);
  part = stepPart(part, 1);
  assert.deepEqual(wrappedCharts(part).map((c) => c.label), ['B']);
});

test('reset returns the part and all charts to the start', () => {
  let part = partWith({ label: 'A', rows: 4, startRow: 3 });
  part = stepPart(stepPart(part, 1), 1);
  part = nudgeChart(part, part.charts[0].id, 1);
  part = resetPart(part);
  assert.equal(part.rowsKnitted, 0);
  assert.deepEqual(rowsOf(part), [3]);
});

test('duplicate copies the charts with new ids and fresh counts', () => {
  let part = partWith({ label: 'A', rows: 4 }, { label: 'B', rows: 6, startRow: 2 });
  part = nudgeChart(stepPart(part, 1), part.charts[0].id, 1);
  const copy = duplicatePart(part, 'Right sleeve');
  assert.equal(copy.name, 'Right sleeve');
  assert.equal(copy.rowsKnitted, 0);
  assert.notEqual(copy.id, part.id);
  assert.deepEqual(copy.charts.map((c) => [c.label, c.rows, c.startRow, c.nudge, c.color]), [
    ['A', 4, 1, 0, part.charts[0].color],
    ['B', 6, 2, 0, part.charts[1].color],
  ]);
  assert.equal(copy.lastUsedAt, 0);
  assert.ok(copy.charts.every((c, i) => c.id !== part.charts[i].id));
});

test('updateChart keeps values in range', () => {
  const chart = createChart({ label: 'A', rows: 10, startRow: 8 });
  assert.equal(updateChart(chart, { rows: 5 }).startRow, 5);
  assert.equal(updateChart(chart, { rows: 0 }).rows, 1);
  assert.equal(updateChart(chart, { rows: 'abc' }).rows, 10);
  assert.equal(updateChart(chart, { label: '   ' }).label, 'A');
  assert.equal(updateChart(chart, { startRow: 99 }).startRow, 10);
});

test('normaliseState round-trips a valid backup', () => {
  const state = emptyState();
  const part = stepPart(partWith({ label: 'Cable A', rows: 12 }), 1);
  state.projects.push({ id: 'p1', name: 'Jumper', createdAt: 1, updatedAt: 2, parts: [part] });
  const restored = normaliseState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored, state);
});

test('normaliseState rejects files that are not backups', () => {
  assert.throws(() => normaliseState(null), /backup/);
  assert.throws(() => normaliseState({ hello: 1 }), /backup/);
  assert.throws(() => normaliseState({ version: 99, projects: [] }), /newer/);
});

test('normaliseState repairs bad values', () => {
  const s = normaliseState({
    projects: [{ name: '', parts: [{ rowsKnitted: -3, charts: [{ rows: 5000, startRow: 0 }] }] }],
  });
  const chart = s.projects[0].parts[0].charts[0];
  assert.equal(s.projects[0].name, 'Untitled project');
  assert.equal(s.projects[0].parts[0].rowsKnitted, 0);
  assert.equal(chart.rows, 999);
  assert.equal(chart.startRow, 1);
  assert.equal(chart.label, 'Chart');
  assert.equal(chart.color, CHART_COLORS[0]);
  assert.ok(chart.id);
});

test('older backups without colours get a distinct colour per chart', () => {
  const s = normaliseState({
    projects: [{ name: 'Old', parts: [{ name: 'Back', charts: [{ rows: 4 }, { rows: 6 }, { rows: 8, color: 'teal' }] }] }],
  });
  assert.deepEqual(s.projects[0].parts[0].charts.map((c) => c.color), [CHART_COLORS[0], CHART_COLORS[1], 'teal']);
  assert.equal(s.projects[0].parts[0].lastUsedAt, 0);
});

test('new charts get the first unused colour', () => {
  const part = partWith({ label: 'A', color: CHART_COLORS[0] }, { label: 'B', color: CHART_COLORS[2] });
  assert.equal(nextChartColor(part), CHART_COLORS[1]);
  const full = { ...part, charts: CHART_COLORS.map((color) => createChart({ color })) };
  assert.equal(nextChartColor(full), CHART_COLORS[0]);
});

test('updateChart only accepts known colours', () => {
  const chart = createChart({ label: 'A', color: 'indigo' });
  assert.equal(updateChart(chart, { color: 'sage' }).color, 'sage');
  assert.equal(updateChart(chart, { color: 'neon' }).color, 'indigo');
  assert.equal(updateChart(chart, { rows: 4 }).color, 'indigo');
});

test('mostRecentPart finds the last part used across projects', () => {
  const mk = (name, lastUsedAt, charts = 1) => ({
    ...createPart(name),
    lastUsedAt,
    charts: Array.from({ length: charts }, () => createChart()),
  });
  const state = emptyState();
  assert.equal(mostRecentPart(state), null);
  state.projects.push({ id: 'a', name: 'A', parts: [mk('Back', 100), mk('Front', 0)] });
  state.projects.push({ id: 'b', name: 'B', parts: [mk('Sleeve', 300), mk('Empty', 500, 0)] });
  const recent = mostRecentPart(state);
  assert.equal(recent.part.name, 'Sleeve');
  assert.equal(recent.project.id, 'b');
});
