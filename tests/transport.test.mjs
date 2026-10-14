import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransportRoutes, sampleRoute } from '../dist/transport.js';
const filter = (buildings, kind, terrain) => buildTransportRoutes(buildings, terrain).filter(route => route.kind === kind);
const cell = type => ({ type, width: 1, height: 1 });

test('connected streets produce cars and walkers; demolition of their link removes travel', () => {
  const city = { '0,0': cell('asphalt'), '1,0': cell('bridge'), '2,0': cell('tunnel') };
  const cars = filter(city, 'car');
  assert.equal(cars.length, 1);
  assert.equal(cars[0].path.length, 3);
  assert.equal(filter(city, 'walker').length, 1);
  delete city['1,0'];
  assert.equal(filter(city, 'car').length, 0);
});

test('rail traffic needs two stations and an uninterrupted rail connection', () => {
  const city = { '0,0': { type: 'station', width: 2, height: 2 }, '2,0': cell('railway'), '3,0': cell('railBridge'), '4,0': cell('station') };
  const train = filter(city, 'train');
  assert.equal(train.length, 1);
  assert.ok(train[0].path.some(p => p.x === 3));
  delete city['3,0'];
  assert.equal(filter(city, 'train').length, 0);
  city['3,0'] = cell('road');
  assert.equal(filter(city, 'train').length, 0, 'roads cannot replace railway tracks');
  city['3,0'] = cell('railway');
  delete city['4,0'];
  assert.equal(filter(city, 'train').length, 0, 'a single station has no fake loop');
});

test('metro has an independent connected network', () => {
  const city = { '0,0': cell('metroStation'), '1,0': cell('metroLine'), '2,0': cell('metroLine'), '3,0': cell('metroStation') };
  assert.equal(filter(city, 'metro').length, 1);
  assert.equal(filter(city, 'train').length, 0);
  delete city['2,0'];
  assert.equal(filter(city, 'metro').length, 0);
});

test('ships travel between harbors only on connected water, including under bridges', () => {
  const city = { '0,0': cell('harbor'), '6,0': cell('seaport'), '3,1': cell('bridge') };
  const river = (x, y) => y === 1 && x >= 0 && x <= 6 ? 'water' : 'grass';
  const boats = filter(city, 'boat', river);
  assert.equal(boats.length, 1);
  assert.ok(boats[0].path.length >= 5);
  assert.ok(boats[0].path.every(p => river(p.x, p.y) === 'water'));
  const cut = (x, y) => x === 3 ? 'grass' : river(x, y);
  assert.equal(filter(city, 'boat', cut).length, 0, 'boats may never cross a land gap');
  delete city['6,0'];
  assert.equal(filter(city, 'boat', river).length, 0);
});

test('airplanes fly between the centers of real airport footprints', () => {
  const city = { '0,0': { type: 'airport', width: 8, height: 4 }, '25,8': { type: 'internationalAirport', width: 12, height: 6 } };
  const planes = filter(city, 'plane');
  assert.equal(planes.length, 1);
  assert.deepEqual(planes[0].path, [{ x: 3.5, y: 1.5 }, { x: 30.5, y: 10.5 }]);
  delete city['25,8'];
  assert.equal(filter(city, 'plane').length, 0);
});

test('route sampling respects bends and makes return trips instead of orbiting endpoints', () => {
  const route = { path: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] };
  assert.deepEqual([sampleRoute(route, .5).x, sampleRoute(route, .5).y], [.5, 0]);
  assert.deepEqual([sampleRoute(route, 1.5).x, sampleRoute(route, 1.5).y], [1, .5]);
  assert.deepEqual([sampleRoute(route, 4).x, sampleRoute(route, 4).y], [1, .5]);
  assert.deepEqual([sampleRoute(route, 5).x, sampleRoute(route, 5).y], [.5, 0]);
});

test('boats route around islands without moving diagonally through land', () => {
  const city = { '0,0': cell('harbor'), '6,0': cell('harbor') };
  const water = (x, y) => x >= 0 && x <= 6 && y >= 1 && y <= 3 && !(x === 3 && y < 3) ? 'water' : 'grass';
  const [route] = filter(city, 'boat', water);
  assert.ok(route);
  assert.ok(route.path.some(p => p.y === 3));
  assert.ok(route.path.every(p => water(p.x, p.y) === 'water'));
  for (let i = 1; i < route.path.length; i++) assert.equal(Math.abs(route.path[i].x-route.path[i-1].x)+Math.abs(route.path[i].y-route.path[i-1].y),1);
});

test('isolated earlier stations cannot starve a later connected railway or metro line', () => {
  for (const [station, track, kind] of [['station', 'railway', 'train'], ['metroStation', 'metroLine', 'metro']]) {
    const city = {};
    for (let i = 0; i < 40; i++) city[`${i * 3},0`] = cell(station);
    city['200,0'] = cell(station);
    city['202,0'] = cell(station);
    city['201,0'] = cell(track);
    const routes = filter(city, kind);
    assert.equal(routes.length, 1);
    assert.deepEqual(routes[0].path, [{ x: 200, y: 0 }, { x: 201, y: 0 }, { x: 202, y: 0 }]);
    delete city['201,0'];
    assert.equal(filter(city, kind).length, 0);
  }
});

test('rail component planning follows long detours beyond terminal bounding boxes', () => {
  const city = { '0,0': cell('station'), '2,0': cell('station') };
  for (let y = 1; y <= 50; y++) { city[`0,${y}`] = cell('railway'); city[`2,${y}`] = cell('railway'); }
  city['1,50'] = cell('railway');
  const [route] = filter(city, 'train');
  assert.ok(route);
  assert.ok(route.path.some(p => p.y === 50));
  assert.equal(route.path.length, 103);
});

test('nearby connected late ports take priority over earlier isolated ports', () => {
  const city = {};
  for (let i = 0; i < 40; i++) city[`${i * 3},0`] = cell('harbor');
  city['200,0'] = cell('harbor');
  city['202,0'] = cell('harbor');
  const water = (x, y) => y === 1 && (x >= 200 && x <= 202 || x >= 0 && x <= 117 && x % 3 === 0) ? 'water' : 'grass';
  const routes = filter(city, 'boat', water);
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].path, [{ x: 200, y: 1 }, { x: 201, y: 1 }, { x: 202, y: 1 }]);
  const reordered = Object.fromEntries(Object.entries(city).reverse());
  assert.deepEqual(filter(reordered, 'boat', water), routes, 'save insertion order must not determine which ports get tried');
});
