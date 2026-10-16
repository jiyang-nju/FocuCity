import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, LEVELS, createInitialState, getFootprint, getBuildingAt, canBuildAt, buildAt, demolishAt, canUpgradeBuilding, upgradeBuilding, validateSave, cityStats } from '../dist/model.js';

const grass = () => 'grass';
function sandbox() { const state = createInitialState(1); state.points = 10000; state.levelUnlocked = 12; return state; }

test('catalog provides 59 dimensioned facilities across twelve levels and valid expansion chains', () => {
  assert.equal(CATALOG.length, 59);
  assert.equal(LEVELS.length, 12);
  const ids = new Set(CATALOG.map(item => item.id));
  assert.equal(ids.size, CATALOG.length);
  for (const item of CATALOG) {
    assert.ok(item.width >= 1 && item.height >= 1);
    assert.ok(item.level >= 1 && item.level <= 12);
    if (item.upgradeTo) {
      const next = CATALOG.find(entry => entry.id === item.upgradeTo);
      assert.ok(next, item.id);
      assert.ok(next.cost >= item.cost);
      assert.ok(next.level >= item.level);
      assert.ok(next.width * next.height >= item.width * item.height);
    }
  }
  assert.equal(getFootprint('internationalAirport', 0, 0).length, 72);
});

test('multi-cell lots charge once, block every occupied cell, and demolish from any cell', () => {
  const state = sandbox();
  assert.equal(buildAt(state, 'school', 2, 3, grass).ok, true);
  assert.equal(state.points, 9965);
  assert.equal(getBuildingAt(state, 3, 4).key, '2,3');
  assert.equal(getBuildingAt(state, 4, 4), null);
  assert.equal(canBuildAt(state, 'road', 3, 4, grass).ok, false);
  assert.equal(buildAt(state, 'farm', 1, 2, grass).ok, false);
  assert.equal(state.points, 9965);
  assert.equal(demolishAt(state, 3, 4).refund, 35);
  assert.deepEqual(state.buildings, {});
});

test('rotation changes the whole footprint and terrain checks every cell before spending', () => {
  const state = sandbox();
  const before = state.points;
  assert.equal(buildAt(state, 'farm', 0, 0, (x, y) => x === 2 && y === 1 ? 'water' : 'grass').ok, false);
  assert.equal(state.points, before);
  assert.equal(buildAt(state, 'farm', 0, 0, grass, 1).ok, true);
  assert.equal(state.buildings['0,0'].width, 2);
  assert.equal(state.buildings['0,0'].height, 3);
  assert.equal(state.buildings['0,0'].rotation, 1);
  assert.deepEqual(getFootprint(state.buildings['0,0'], 0, 0), getFootprint('farm', 0, 0, 1));
  assert.equal(getBuildingAt(state, 1, 2).definition.id, 'farm');
  assert.equal(getBuildingAt(state, 2, 1), null);
});

test('bridges require water, tunnels require mountains, and underground rail shares its cell with the surface', () => {
  const state = sandbox();
  assert.equal(buildAt(state, 'bridge', 0, 0, grass).ok, false);
  assert.equal(buildAt(state, 'bridge', 0, 0, () => 'river').ok, true);
  assert.equal(buildAt(state, 'railBridge', 1, 0, () => ({type:'water'})).ok, true);
  assert.equal(buildAt(state, 'tunnel', 2, 0, grass).ok, false);
  assert.equal(buildAt(state, 'tunnel', 2, 0, () => 'mountain').ok, true);
  assert.equal(buildAt(state, 'metroLine', 3, 0, () => 'water').ok, true);
  assert.equal(buildAt(state, 'bridge', 3, 0, () => 'water').ok, true);
});

test('harbors need a land footprint with water outside any edge', () => {
  const state = sandbox();
  assert.equal(buildAt(state, 'harbor', 0, 0, grass).ok, false);
  assert.equal(buildAt(state, 'harbor', 0, 0, (x,y) => x === 1 && y === 1 ? 'water' : 'grass').ok, false);
  assert.equal(buildAt(state, 'harbor', 0, 0, (x,y) => x === 2 && y === 1 ? 'water' : 'grass').ok, true);
});

test('facility upgrades retain their anchor, charge only the cost difference, and add their full lot', () => {
  const state = sandbox();
  buildAt(state, 'school', 10, 10, grass);
  const before = state.points;
  assert.equal(canUpgradeBuilding(state, 11, 11, grass).cost, 65);
  const result = upgradeBuilding(state, 11, 11, grass);
  assert.equal(result.ok, true);
  assert.equal(state.points, before - 65);
  assert.equal(state.buildings['10,10'].type, 'highschool');
  assert.equal(getBuildingAt(state, 13, 12).key, '10,10');
  assert.equal(state.buildings['10,10'].paid, 100);
  assert.equal(demolishAt(state, 13, 12).refund, 100);
});

test('expansion is atomic when its extra cells, terrain, funds, or unlock are unavailable', () => {
  const state = sandbox();
  buildAt(state, 'school', 0, 0, grass);
  buildAt(state, 'road', 3, 2, grass);
  const snapshot = JSON.stringify(state);
  assert.equal(upgradeBuilding(state, 0, 0, grass).ok, false);
  assert.equal(JSON.stringify(state), snapshot);
  demolishAt(state, 3, 2);
  assert.equal(upgradeBuilding(state, 0, 0, (x,y) => x === 3 && y === 2 ? 'mountain' : 'grass').ok, false);
  state.points = 64;
  assert.equal(upgradeBuilding(state, 0, 0, grass).ok, false);
  state.points = 100;
  state.levelUnlocked = 2;
  assert.equal(upgradeBuilding(state, 0, 0, grass).ok, false);
  assert.equal(state.buildings['0,0'].type, 'school');
});

test('v1 saves retain compact legacy buildings, original points, timers, and city names', () => {
  const legacy = { ...createInitialState(22), version:1, points:130, cityName:'我的旧城', levelUnlocked:5,
    buildings:{'0,0':{type:'airport'},'1,0':{type:'harbor'},'2,0':{type:'school'}} };
  delete legacy.checkins;
  const state = validateSave(legacy).state;
  assert.equal(state.version, 3);
  assert.equal(state.points, 130);
  assert.equal(state.cityName, '我的旧城');
  assert.equal(state.levelUnlocked, 8);
  assert.equal(Object.keys(state.buildings).length, 3);
  assert.equal(state.buildings['0,0'].width, 1);
  assert.equal(state.buildings['0,0'].height, 1);
  assert.equal(demolishAt(state, 0, 0).refund, 180);
  assert.deepEqual(state.checkins, {days:[],weeks:[],months:[]});
});

test('v2 imports preserve rotated lots and check-ins and prune invalid or overlapping structures', () => {
  const state = sandbox();
  buildAt(state, 'farm', -4, 7, grass, 1);
  state.checkins.days = ['2026-10-13'];
  state.buildings['-3,8'] = {type:'road',width:1,height:1};
  state.buildings['20,20'] = {type:'airport',width:1000000,height:1000000};
  const restored = validateSave(state).state;
  assert.equal(Object.keys(restored.buildings).length, 1);
  assert.deepEqual(restored.buildings['-4,7'], state.buildings['-4,7']);
  assert.deepEqual(restored.checkins.days, ['2026-10-13']);
  assert.deepEqual(validateSave(JSON.parse(JSON.stringify(restored))).state, restored);
});

test('large facilities and later milestones remain gated until earned levels are unlocked', () => {
  const state = createInitialState(1); state.points = 10000;
  assert.equal(canBuildAt(state, 'airport', 0, 0, grass).ok, false);
  state.levelUnlocked = 11;
  assert.equal(buildAt(state, 'internationalAirport', 0, 0, grass).ok, true);
  assert.equal(cityStats(state).level, 11);
  assert.equal(demolishAt(state, 11, 5).ok, true);
  assert.equal(cityStats(state).level, 11);
  assert.equal(canBuildAt(state, 'landmark', 0, 0, grass).ok, false);
});

test('map coordinates stay bounded and invalid placement cannot partially spend points', () => {
  const state = sandbox();
  const before = state.points;
  assert.equal(buildAt(state, 'airport', 1e7, 0, grass).ok, false);
  assert.equal(buildAt(state, 'road', NaN, 0, grass).ok, false);
  assert.equal(buildAt(state, 'unknown', 0, 0, grass).ok, false);
  assert.equal(state.points, before);
  assert.equal(canBuildAt({seed:1,buildings:{}}, 'road', 0, 0, grass).ok, false);
});
