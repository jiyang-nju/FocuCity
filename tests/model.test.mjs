import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, startFocus, pauseFocus, resumeFocus, completeFocus, cancelFocus, getRemaining, buildAt, demolishAt, cityStats, validateSave, todayStats, weekStats, localDateKey, loadState, saveState, STORAGE_KEY } from '../dist/model.js';

const NOW = new Date(2026, 9, 12, 10, 0, 0).getTime();

function withMemoryStorage(run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } });
  try { run(storage); }
  finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
}

test('a new city has no subsidy and spending requires earned focus points', () => {
  const state = createInitialState(42);
  assert.equal(state.points, 0);
  assert.deepEqual(state.buildings, {});
  assert.equal(buildAt(state, 'cottage', 0, 0, 'grass').ok, false);
  assert.equal(startFocus(state, { task: '阅读', minutes: 15 }, NOW).ok, true);
  assert.equal(completeFocus(state, NOW + 15 * 60000 - 1), null);
  assert.equal(completeFocus(state, NOW + 15 * 60000).points, 15);
  assert.equal(completeFocus(state, NOW + 15 * 60000), null);
  assert.equal(state.sessions.length, 1);
  assert.equal(buildAt(state, 'cottage', 0, 0, 'grass').ok, true);
  assert.equal(state.points, 0);
  assert.equal(cityStats(state).population, 12);
  assert.equal(demolishAt(state, 0, 0).refund, 7);
  assert.equal(state.points, 7);
  assert.equal(cityStats(state).population, 0);
  assert.equal(demolishAt(state, 0, 0).ok, false);
});

test('paused time does not count and a refreshed running clock retains its deadline', () => {
  const state = createInitialState(1);
  startFocus(state, { minutes: 25 }, NOW);
  pauseFocus(state, NOW + 5 * 60000);
  assert.equal(getRemaining(state, NOW + 60 * 60000), 20 * 60);
  assert.equal(completeFocus(state, NOW + 60 * 60000), null);
  const restored = validateSave(JSON.parse(JSON.stringify(state))).state;
  resumeFocus(restored, NOW + 60 * 60000);
  const secondRestore = validateSave(JSON.parse(JSON.stringify(restored))).state;
  assert.equal(getRemaining(secondRestore, NOW + 65 * 60000), 15 * 60);
  assert.equal(completeFocus(secondRestore, NOW + 79 * 60000), null);
  assert.equal(completeFocus(secondRestore, NOW + 80 * 60000).points, 25);
  assert.equal(secondRestore.points, 25);
});

test('completion while offline credits its scheduled day and duplicate timers cannot reward twice', () => {
  const state = createInitialState(1);
  const start = new Date(2026, 9, 11, 23, 0, 0).getTime();
  startFocus(state, { minutes: 25 }, start);
  const oldFocus = { ...state.focus };
  completeFocus(state, NOW);
  assert.equal(todayStats(state, new Date(2026, 9, 11)).minutes, 25);
  assert.equal(todayStats(state, new Date(2026, 9, 12)).minutes, 0);
  state.focus = oldFocus;
  assert.equal(completeFocus(state, NOW), null);
  assert.equal(state.points, 25);
  assert.equal(state.focus, null);
});

test('cancelling grants no points and input validation preserves an existing focus', () => {
  const state = createInitialState(3);
  assert.equal(startFocus(state, { minutes: 0 }, NOW).ok, false);
  assert.equal(startFocus(state, { minutes: 1.5 }, NOW).ok, false);
  startFocus(state, { task: 'Writing', minutes: 10 }, NOW);
  assert.equal(startFocus(state, { minutes: 25 }, NOW).ok, false);
  assert.equal(state.focus.task, 'Writing');
  cancelFocus(state);
  assert.equal(state.points, 0);
  assert.equal(state.sessions.length, 0);
});

test('terrain, occupancy, unlocks and shore requirements are checked before spending', () => {
  const state = createInitialState(1);
  state.points = 1000;
  assert.equal(buildAt(state, 'airport', 0, 0, 'grass').ok, false);
  assert.equal(buildAt(state, 'road', 0, 0, 'water').ok, false);
  assert.equal(buildAt(state, 'cottage', 0.2, 0, 'grass').ok, false);
  assert.equal(buildAt(state, 'cottage', 0, 0, 'mountain').ok, false);
  assert.equal(state.points, 1000);
  assert.equal(buildAt(state, 'road', 0, 0, 'forest').ok, true);
  assert.equal(buildAt(state, 'road', 0, 0, 'forest').ok, false);
  assert.equal(state.points, 998);
  state.levelUnlocked = 3;
  assert.equal(buildAt(state, 'harbor', 1, 0, 'grass', () => 'grass').ok, false);
  assert.equal(buildAt(state, 'harbor', 1, 0, 'grass', (x, y) => x === 2 && y === 0 ? 'water' : 'grass').ok, true);
  assert.equal(state.points, 928);
});

test('population or GDP unlocks facilities and demolition keeps earned levels', () => {
  const state = createInitialState(1);
  state.points = 1000;
  for (let x = 0; x < 4; x++) buildAt(state, 'cottage', x, 0, 'grass');
  assert.equal(cityStats(state).level, 2);
  assert.equal(cityStats(state).population, 48);
  for (let x = 0; x < 4; x++) demolishAt(state, x, 0);
  assert.equal(cityStats(state).population, 0);
  assert.equal(cityStats(state).level, 2);
  assert.equal(buildAt(state, 'apartment', 0, 0, 'grass').ok, true);
  const economicState = createInitialState(2);
  economicState.points = 1000;
  for (let x = 0; x < 4; x++) buildAt(economicState, 'shop', x, 0, 'grass');
  assert.equal(cityStats(economicState).level, 2);
  assert.equal(cityStats(economicState).population, 16);
  assert.equal(cityStats(economicState).gdp, 200);
});

test('malformed saves are rejected or safely pruned without trusting extra properties', () => {
  assert.equal(validateSave(null).ok, false);
  assert.equal(validateSave({ version: 2 }).ok, false);
  const data = createInitialState(1);
  data.points = -90;
  data.buildings = JSON.parse('{"0,0":{"type":"cottage"},"1,0":{"type":"bogus"},"bad":{"type":"road"},"__proto__":{"polluted":true}}');
  data.sessions = [null, { id: 'broken', minutes: -5 }];
  data.focus = { id: 'broken', duration: 500, remaining: NaN, status: 'running' };
  const restored = validateSave(data);
  assert.equal(restored.ok, true);
  assert.equal(restored.state.points, 0);
  assert.deepEqual(restored.state.buildings, { '0,0': { type: 'cottage' } });
  assert.equal(restored.state.sessions.length, 0);
  assert.equal(restored.state.focus, null);
  assert.equal({}.polluted, undefined);
});

test('weekly statistics use seven local calendar days', () => {
  const state = createInitialState(1);
  startFocus(state, { minutes: 20 }, NOW);
  completeFocus(state, NOW + 20 * 60000);
  const week = weekStats(state, new Date(NOW));
  assert.equal(week.length, 7);
  assert.equal(week[6].date, localDateKey(NOW));
  assert.equal(week[6].minutes, 20);
  assert.equal(week[6].points, 20);
  assert.equal(week[6].today, true);
  assert.equal(week.filter(day => day.today).length, 1);
});

test('local storage failure does not crash and valid state survives save/load', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  try {
    const state = createInitialState(42);
    startFocus(state, { minutes: 15 }, NOW);
    assert.equal(saveState(state).ok, true);
    assert.equal(loadState().focus.endAt, state.focus.endAt);
    storage.set(STORAGE_KEY, '{oops');
    assert.equal(loadState().points, 0);
    globalThis.localStorage.setItem = () => { throw new Error('Quota'); };
    assert.equal(saveState(state).ok, false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('IDs that normalize to the same 128 characters cannot restore duplicate sessions or timers', () => {
  const state = createInitialState(42);
  const prefix = 'a'.repeat(128);
  const session = { id: prefix + 'first', minutes: 25, points: 9999, completedAt: NOW, date: 'not-a-date', task: 'Reading' };
  state.sessions = [session, { ...session, id: prefix + 'second' }, { ...session, id: '  ' }];
  state.focus = { id: prefix + 'third', duration: 1500, remaining: 0, status: 'running', endAt: NOW };
  const restored = validateSave(state).state;
  assert.equal(restored.sessions.length, 1);
  assert.equal(restored.sessions[0].id, prefix);
  assert.equal(restored.sessions[0].points, 25);
  assert.equal(restored.sessions[0].date, localDateKey(NOW));
  assert.equal(restored.focus, null);
});

test('invalid timestamps cannot award points or corrupt pause and resume', () => {
  const state = createInitialState(42);
  assert.equal(startFocus(state, { minutes: 25 }, Infinity).ok, false);
  startFocus(state, { minutes: 25 }, NOW);
  assert.equal(completeFocus(state, NaN), null);
  assert.equal(completeFocus(state, Infinity), null);
  assert.equal(pauseFocus(state, NaN).ok, false);
  assert.equal(state.focus.status, 'running');
  pauseFocus(state, NOW);
  assert.equal(resumeFocus(state, Infinity).ok, false);
  assert.equal(state.focus.status, 'paused');
  assert.equal(state.points, 0);
});

test('a delayed tab cannot overwrite newer buildings and spending with duplicate focus completion', () => {
  withMemoryStorage(() => {
    const original = createInitialState(42);
    startFocus(original, { minutes: 15 }, NOW);
    saveState(original);
    const firstTab = loadState();
    const delayedTab = loadState();
    completeFocus(firstTab, NOW + 15 * 60000);
    saveState(firstTab);
    buildAt(firstTab, 'cottage', 0, 0, 'grass');
    saveState(firstTab);
    completeFocus(delayedTab, NOW + 15 * 60000);
    const result = saveState(delayedTab);
    assert.equal(result.ok, false);
    assert.equal(result.conflict, true);
    assert.equal(delayedTab.points, 0);
    assert.equal(delayedTab.sessions.length, 1);
    assert.equal(delayedTab.buildings['0,0'].type, 'cottage');
    assert.deepEqual(loadState(), firstTab);
    assert.equal(saveState(delayedTab).ok, true);
  });
});

test('a stale tab synchronizes a reset while explicit import remains available', () => {
  withMemoryStorage(storage => {
    const original = createInitialState(42);
    original.points = 50;
    saveState(original);
    const delayedTab = loadState();
    storage.delete(STORAGE_KEY);
    delayedTab.cityName = 'Stale name';
    assert.equal(saveState(delayedTab).conflict, true);
    assert.equal(delayedTab.points, 0);
    assert.equal(delayedTab.cityName, 'FocuCity');
    const imported = validateSave(original).state;
    assert.equal(saveState(imported).ok, true);
    assert.equal(loadState().points, 50);
    assert.equal(loadState().seed, 42);
  });
});

test('the latest of two newly opened empty tabs is preserved', () => {
  withMemoryStorage(() => {
    const firstTab = loadState();
    const secondTab = loadState();
    startFocus(firstTab, { task: 'First tab', minutes: 25 }, NOW);
    saveState(firstTab);
    startFocus(secondTab, { task: 'Second tab', minutes: 10 }, NOW);
    assert.equal(saveState(secondTab).conflict, true);
    assert.equal(secondTab.focus.task, 'First tab');
    assert.equal(loadState().focus.task, 'First tab');
  });
});
