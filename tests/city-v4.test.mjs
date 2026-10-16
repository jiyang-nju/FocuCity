import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, createInitialState, buildAt, canBuildAt, demolishAt, upgradeBuilding,
  getBuildingAt, getBuildingsAt, getBuildingLayer, parseBuildingKey,
  validateSave, planLinearBuild, buildLinear, collectProgressRewards,
  getAchievementProgress, discoverSecret, startFocus, completeFocus,
} from '../dist/model.js';

const grass = () => 'grass';
const water = () => 'water';
function sandbox() { const state = createInitialState(42); state.points = 10000; state.levelUnlocked = 12; return state; }

test('new saves are truly empty with varied terrain, while old saves retain their original terrain', () => {
  const fresh = createInitialState(42);
  assert.equal(fresh.version, 3);
  assert.equal(fresh.terrainVersion, 2);
  assert.deepEqual(collectProgressRewards(fresh), []);
  assert.equal(fresh.points, 0);
  assert.deepEqual(fresh.buildings, {});
  assert.equal(getAchievementProgress(fresh).filter(item => item.completed).length, 0);
  for (const version of [1, 2]) {
    const old = validateSave({ ...fresh, version }).state;
    assert.equal(old.version, 3);
    assert.equal(old.terrainVersion, 1);
    assert.equal(validateSave(old).state.terrainVersion, 1);
  }
  assert.deepEqual(validateSave(fresh).state, fresh);
});

test('road, railway, and underground rail share one cell and targeted removal preserves other layers', () => {
  const state = sandbox();
  for (const id of ['road', 'railway', 'metroLine']) assert.equal(buildAt(state, id, 2, -3, grass).ok, true);
  assert.deepEqual(Object.keys(state.buildings), ['2,-3', 'rail:2,-3', 'underground:2,-3']);
  assert.deepEqual(getBuildingsAt(state, 2, -3).map(item => item.layer), ['surface', 'rail', 'underground']);
  assert.equal(getBuildingAt(state, 2, -3).definition.id, 'road');
  assert.equal(getBuildingAt(state, 2, -3, 'rail').definition.id, 'railway');
  assert.equal(demolishAt(state, 2, -3, 'rail').refund, 6);
  assert.deepEqual(getBuildingsAt(state, 2, -3).map(item => item.layer), ['surface', 'underground']);
  assert.equal(upgradeBuilding(state, 2, -3, grass, 'surface').cost, 3);
  assert.equal(getBuildingAt(state, 2, -3).definition.id, 'asphalt');
  assert.equal(demolishAt(state, 2, -3).refund, 5);
  assert.equal(demolishAt(state, 2, -3).refund, 9);
  assert.equal(state.points, 10000);
});

test('rail crossings are allowed in either order but tracks cannot cross houses or station buildings', () => {
  for (const [first, second] of [['railway', 'asphalt'], ['bridge', 'railBridge'], ['railBridge', 'bridge']]) {
    const state = sandbox(), terrain = first.includes('Bridge') || second.includes('Bridge') ? water : grass;
    assert.equal(buildAt(state, first, 0, 0, terrain).ok, true);
    assert.equal(buildAt(state, second, 0, 0, terrain).ok, true);
    assert.equal(buildAt(state, second, 0, 0, terrain).ok, false);
  }
  for (const [first, second] of [['cottage', 'railway'], ['railway', 'cottage'], ['station', 'railway'], ['railway', 'station']]) {
    const state = sandbox();
    assert.equal(buildAt(state, first, 0, 0, grass).ok, true);
    const snapshot = JSON.stringify(state);
    assert.equal(buildAt(state, second, 0, 0, grass).ok, false);
    assert.equal(JSON.stringify(state), snapshot);
  }
});

test('underground lines allow full buildings overhead and expansion without destroying the line', () => {
  const state = sandbox();
  assert.equal(buildLinear(state, 'metroLine', { x: 0, y: 0 }, { x: 4, y: 0 }, grass).ok, true);
  assert.equal(buildAt(state, 'school', 0, 0, grass).ok, true);
  assert.equal(upgradeBuilding(state, 0, 0, grass).ok, true);
  assert.equal(getBuildingAt(state, 3, 0, 'underground').definition.id, 'metroLine');
  assert.equal(buildAt(state, 'metroLine', 2, 1, grass).ok, true);
  assert.equal(demolishAt(state, 3, 2).refund, 100);
  assert.equal(Object.values(state.buildings).filter(item => item.type === 'metroLine').length, 6);
});

test('old transport keys migrate into layers and duplicate aliases cannot duplicate refunds', () => {
  const state = validateSave({ ...createInitialState(42), version: 2, buildings: {
    '0,0': { type: 'railway' }, '1,0': { type: 'metroLine' },
    'rail:0,0': { type: 'railway' }, 'rail:2,0': { type: 'road' },
    'underground:2,0': { type: 'metroLine' }, 'garbage:0,0': { type: 'cottage' },
  } }).state;
  assert.deepEqual(Object.keys(state.buildings), ['rail:0,0', 'underground:1,0', '2,0', 'underground:2,0']);
  assert.equal(demolishAt(state, 0, 0, 'rail').refund, 6);
  assert.equal(demolishAt(state, 0, 0, 'rail').ok, false);
  assert.deepEqual(parseBuildingKey('underground:-12,6'), { x: -12, y: 6 });
  assert.equal(parseBuildingKey('rail:10000001,0'), null);
  assert.equal(parseBuildingKey('other:1,0'), null);
  assert.equal(getBuildingLayer('grandStation'), 'surface');
});

test('layered imported saves reject same-layer and house-track overlap but preserve legal crossings', () => {
  const state = sandbox();
  for (const id of ['bridge', 'railBridge', 'metroLine']) buildAt(state, id, 0, 0, water);
  buildAt(state, 'school', 10, 0, grass);
  state.buildings['rail:11,1'] = { type: 'railway' };
  state.buildings['underground:11,1'] = { type: 'metroLine' };
  state.buildings['11,0'] = { type: 'road' };
  const result = validateSave(state).state;
  assert.equal(getBuildingsAt(result, 0, 0).length, 3);
  assert.equal(getBuildingsAt(result, 11, 1).length, 2);
  assert.equal(result.buildings['rail:11,1'], undefined);
  assert.equal(result.buildings['11,0'], undefined);
  assert.deepEqual(validateSave(result).state, result);
});

test('straight-line preview skips existing identical cells and charges only newly constructed cells', () => {
  const state = sandbox();
  buildAt(state, 'asphalt', -2, 4, grass);
  const snapshot = JSON.stringify(state);
  const plan = planLinearBuild(state, 'asphalt', { x: 0, y: 4 }, { x: -4, y: 4 }, grass);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(plan.ok, true);
  assert.equal(plan.count, 4);
  assert.equal(plan.cost, 20);
  assert.equal(plan.skipped, 1);
  assert.deepEqual(plan.cells, [{ x: 0, y: 4 }, { x: -1, y: 4 }, { x: -3, y: 4 }, { x: -4, y: 4 }]);
  assert.equal(buildLinear(state, 'asphalt', { x: 0, y: 4 }, { x: -4, y: 4 }, grass).ok, true);
  assert.equal(state.points, 9975);
  const noop = buildLinear(state, 'asphalt', { x: 0, y: 4 }, { x: -4, y: 4 }, grass);
  assert.equal(noop.cost, 0);
  assert.equal(noop.count, 0);
  assert.equal(state.points, 9975);
});

test('batch building is atomic for blocked lots, mixed terrain, insufficient funds, and invalid endpoints', () => {
  const state = sandbox();
  buildAt(state, 'school', 4, 0, grass);
  let snapshot = JSON.stringify(state);
  assert.equal(buildLinear(state, 'road', { x: 0, y: 0 }, { x: 6, y: 0 }, grass).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(buildLinear(state, 'road', { x: 0, y: 2 }, { x: 6, y: 2 }, x => x === 3 ? 'water' : 'grass').ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  state.points = 9; snapshot = JSON.stringify(state);
  assert.equal(buildLinear(state, 'asphalt', { x: 0, y: 5 }, { x: 2, y: 5 }, grass).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  for (const end of [{ x: 1, y: 1 }, { x: 200, y: 0 }, { x: NaN, y: 0 }, { x: 10000001, y: 0 }]) assert.equal(buildLinear(state, 'road', { x: 0, y: 0 }, end, grass).ok, false);
  assert.equal(buildLinear(state, 'school', { x: 0, y: 0 }, { x: 0, y: 0 }, grass).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
});

test('batch rails overlay roads, support negative direction and accept the 200-cell limit', () => {
  const state = sandbox();
  assert.equal(buildLinear(state, 'road', { x: 4, y: 99 }, { x: 4, y: -100 }, grass).count, 200);
  assert.equal(buildLinear(state, 'railway', { x: 4, y: -100 }, { x: 4, y: 99 }, grass).count, 200);
  assert.equal(Object.keys(state.buildings).length, 400);
  assert.equal(state.points, 8400);
});

test('sand and wetlands are buildable land while train bridges still require water', () => {
  const state = sandbox();
  for (const [x, type] of ['sand', 'wetland'].entries()) {
    assert.equal(buildAt(state, 'road', x, 0, () => type).ok, true);
    assert.equal(buildAt(state, 'metroLine', x, 0, () => type).ok, true);
    assert.equal(canBuildAt(state, 'railBridge', x, 0, () => type).ok, false);
  }
});

test('large industry and central station expand to 24 cells and return the entire paid amount', () => {
  for (const [initial, expanded, total] of [['factory', 'largeFactory', 300], ['station', 'grandStation', 280]]) {
    const state = sandbox();
    buildAt(state, initial, 0, 0, grass, 1);
    assert.equal(upgradeBuilding(state, 0, 0, grass).ok, true);
    assert.equal(getBuildingAt(state, 3, 5).definition.id, expanded);
    assert.equal(state.points, 10000 - total);
    assert.equal(demolishAt(state, 3, 5).refund, total);
    assert.equal(state.points, 10000);
  }
  const state = sandbox();
  state.buildings['0,0'] = { type: 'school', width: 2, height: 2, paid: 13 };
  assert.equal(demolishAt(state, 1, 1).refund, 13);
  state.buildings['0,0'] = { type: 'school', width: 2, height: 2, paid: 35 };
  state.points = 1e9;
  const snapshot = JSON.stringify(state);
  assert.equal(demolishAt(state, 0, 0).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
});

test('level breakthroughs report every newly crossed level with facility purposes and one-shot rewards', () => {
  const state = createInitialState(42);
  state.points = 1000;
  for (let x = 0; x < 4; x++) buildAt(state, 'cottage', x, 0, grass);
  const first = collectProgressRewards(state);
  const level = first.find(item => item.kind === 'level');
  assert.equal(level.level, 2);
  assert.equal(level.points, 40);
  assert.ok(level.unlocks.some(item => item.id === 'school' && item.description.length > 0));
  assert.equal(first.filter(item => item.kind === 'achievement').length, 1);
  const balance = state.points;
  for (let x = 0; x < 4; x++) demolishAt(state, x, 0);
  for (let x = 0; x < 4; x++) buildAt(state, 'cottage', x, 0, grass);
  assert.deepEqual(collectProgressRewards(state), []);
  assert.equal(state.points, balance);
  state.levelUnlocked = 5;
  assert.deepEqual(collectProgressRewards(state).filter(item => item.kind === 'level').map(item => item.level), [3, 4, 5]);
  assert.deepEqual(collectProgressRewards(validateSave(state).state), []);
});

test('old cities keep their earned levels without retroactive level reward payouts', () => {
  for (const version of [1, 2]) {
    const state = validateSave({ ...createInitialState(42), version, levelUnlocked: 5 }).state;
    assert.equal(collectProgressRewards(state).filter(item => item.kind === 'level').length, 0);
    assert.equal(state.points, 0);
  }
});

test('focus and check-in achievements award once and save their earned status', () => {
  const state = createInitialState(42), now = new Date(2026, 0, 1, 10).getTime();
  startFocus(state, { minutes: 60 }, now);
  completeFocus(state, now + 3600000);
  const events = collectProgressRewards(state);
  assert.deepEqual(events.map(item => item.id), ['first-focus', 'focus-hour']);
  assert.equal(state.points, 90);
  state.checkins.days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '9999-12-31'];
  const checkin = collectProgressRewards(state);
  assert.deepEqual(checkin.map(item => item.id), ['checkin-five']);
  assert.equal(state.points, 120);
  const restored = validateSave(state).state;
  assert.deepEqual(collectProgressRewards(restored), []);
  assert.equal(getAchievementProgress(restored).find(item => item.id === 'checkin-five').claimed, true);
});

test('secrets reward exactly once per city and malformed progress markers are safely normalized', () => {
  const state = createInitialState(42);
  assert.equal(discoverSecret(state, 'missing').ok, false);
  for (const id of ['evening', 'forest', 'shore', 'explorer']) {
    assert.equal(discoverSecret(state, id).ok, true);
    assert.equal(discoverSecret(state, id).ok, false);
  }
  assert.equal(state.points, 33);
  const restored = validateSave(state).state;
  assert.equal(discoverSecret(restored, 'shore').ok, false);
  restored.progress = { claimedLevels: [2, 2, Infinity, -1], achievements: ['bad', 'first-home', 'first-home'], secrets: ['shore', 'shore', '__proto__'] };
  assert.deepEqual(validateSave(restored).state.progress, { claimedLevels: [1, 2], achievements: ['first-home'], secrets: ['shore'] });
});

test('rewards at the storage ceiling remain claimable after spending points', () => {
  const state = createInitialState(42); state.points = 1e9; state.levelUnlocked = 2;
  assert.deepEqual(collectProgressRewards(state), []);
  assert.equal(discoverSecret(state, 'evening').ok, false);
  state.points -= 100;
  assert.equal(collectProgressRewards(state).length, 1);
  assert.equal(discoverSecret(state, 'evening').ok, true);
  assert.equal(state.points, 1e9 - 55);
});
