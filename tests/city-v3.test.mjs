import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, createInitialState, buildAt, getBuildingAt, getFootprint, canUpgradeBuilding, upgradeBuilding, demolishAt, validateSave } from '../dist/model.js';

const grass = () => 'grass';
function sandbox() { const state = createInitialState(42); state.points = 10000; state.levelUnlocked = 12; return state; }

test('a rotated convenience store grows through the retail chain without charging twice', () => {
  const state = sandbox();
  assert.equal(buildAt(state, 'convenienceStore', -3, 5, grass, 1).ok, true);
  for (const id of ['supermarket', 'shoppingMall', 'grandMall']) {
    const definition = CATALOG.find(item => item.id === id);
    const previousPaid = state.buildings['-3,5'].paid;
    assert.equal(canUpgradeBuilding(state, -3, 5, grass).cost, definition.cost - previousPaid);
    assert.equal(upgradeBuilding(state, -3, 5, grass).ok, true);
    assert.equal(state.points, 10000 - definition.cost);
    assert.equal(state.buildings['-3,5'].type, id);
    assert.equal(state.buildings['-3,5'].rotation, 1);
    assert.equal(state.buildings['-3,5'].width, definition.height);
    assert.equal(state.buildings['-3,5'].height, definition.width);
    for (const cell of getFootprint(state.buildings['-3,5'], -3, 5)) {
      assert.equal(getBuildingAt(state, cell.x, cell.y).key, '-3,5');
    }
  }
  assert.equal(canUpgradeBuilding(state, -3, 5, grass).ok, false);
  const restored = validateSave(JSON.parse(JSON.stringify(state))).state;
  assert.deepEqual(restored.buildings, state.buildings);
  assert.equal(demolishAt(restored, 0, 10).refund, 360);
  assert.equal(Object.keys(restored.buildings).length, 0);
});

test('retail expansion waits for the required city level and preserves neighbors', () => {
  const state = createInitialState(42); state.points = 1000;
  buildAt(state, 'convenienceStore', 0, 0, grass);
  const locked = JSON.stringify(state);
  assert.equal(upgradeBuilding(state, 0, 0, grass).ok, false);
  assert.equal(JSON.stringify(state), locked);
  state.levelUnlocked = 3;
  buildAt(state, 'cottage', 1, 1, grass);
  const blocked = JSON.stringify(state);
  assert.equal(upgradeBuilding(state, 0, 0, grass).ok, false);
  assert.equal(JSON.stringify(state), blocked);
  demolishAt(state, 1, 1);
  assert.equal(upgradeBuilding(state, 0, 0, grass).ok, true);
});

test('new businesses and public amenities survive save validation alongside the original shop', () => {
  const state = sandbox();
  const ids = ['shop', 'convenienceStore', 'supermarket', 'shoppingMall', 'grandMall', 'bakery', 'cafe', 'restaurant', 'hotel', 'postOffice', 'bank', 'cinema', 'sportsCenter'];
  for (const [index, id] of ids.entries()) {
    assert.equal(buildAt(state, id, index * 10, 0, grass, index % 2).ok, true, id);
  }
  const result = validateSave(JSON.parse(JSON.stringify(state)));
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.buildings, state.buildings);
  assert.equal(result.state.points, state.points);
  const legacy = validateSave({ ...createInitialState(42), version: 1, buildings: { '0,0': { type: 'shop' } } }).state;
  assert.equal(legacy.buildings['0,0'].type, 'shop');
  assert.equal(demolishAt(legacy, 0, 0).refund, 25);
});

test('performance settings persist and missing or unsupported values use balanced mode', () => {
  assert.equal(createInitialState(42).settings.performanceMode, 'balanced');
  for (const mode of ['balanced', 'eco', 'quality']) {
    const state = createInitialState(42);
    state.settings = { sound: true, performanceMode: mode };
    const restored = validateSave(JSON.parse(JSON.stringify(state))).state;
    assert.deepEqual(restored.settings, { sound: true, performanceMode: mode });
    assert.deepEqual(validateSave(restored).state, restored);
  }
  for (const version of [1, 2]) {
    for (const settings of [undefined, null, {}, { sound: true }, { performanceMode: 'unlimited' }, { performanceMode: 60 }, { performanceMode: ['eco'] }]) {
      const result = validateSave({ ...createInitialState(42), version, settings });
      assert.equal(result.ok, true);
      assert.equal(result.state.settings.performanceMode, 'balanced');
      assert.equal(result.state.settings.sound, settings?.sound === true);
    }
  }
});
