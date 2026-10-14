import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransportNetwork, buildTransportRoutes, prepareRoute, sampleRoute } from '../dist/transport.js';
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


test('large and rotated shipping hubs connect across a long ocean without a fixed search rectangle', () => {
  const city = {
    '0,0': { type: 'shippingHub', width: 4, height: 6, rotation: 1 },
    '1000,2': { type: 'shippingHub', width: 6, height: 4 },
  };
  const ocean = (x, y) => y >= 6 ? 'water' : 'grass';
  const network = buildTransportNetwork(city, ocean);
  const [route] = network.routes.filter(route => route.kind === 'boat');
  assert.ok(route, 'both large harbor footprints must get an actual outbound route');
  assert.equal(route.style, 'cargo');
  assert.ok(route.path.length > 990);
  assert.ok(route.path.every(p => ocean(p.x, p.y) === 'water'));
  assert.ok(network.ports.every(port => port.status === 'connected'));
  assert.ok(network.diagnostics.searchedNodes < 2000, 'open water should use directed search, not flood a large square');
});

test('shipping follows a narrow waterway that detours much farther than 44 tiles', () => {
  const city = { '0,0': cell('shippingHub'), '6,0': cell('shippingHub') };
  const river = (x, y) => ((x === 0 || x === 6) && y >= 1 && y <= 180 || y === 180 && x >= 0 && x <= 6) ? 'water' : 'grass';
  const [route] = filter(city, 'boat', river);
  assert.ok(route);
  assert.ok(route.path.some(p => p.y === 180));
  assert.ok(route.path.every(p => river(p.x, p.y) === 'water'));
  for (let i = 1; i < route.path.length; i++) assert.equal(Math.abs(route.path[i].x - route.path[i - 1].x) + Math.abs(route.path[i].y - route.path[i - 1].y), 1);
});

test('many nearby port pairs cannot suppress a remote pair of shipping hubs', () => {
  const city = {};
  for (let i = 0; i < 40; i++) {
    city[`${i * 10},0`] = cell('harbor');
    city[`${i * 10 + 2},0`] = cell('harbor');
  }
  city['1000,0'] = { type: 'shippingHub', width: 6, height: 4 };
  city['1050,0'] = { type: 'shippingHub', width: 6, height: 4 };
  const water = (x, y) => (y === 1 && x >= 0 && x <= 392 && x % 10 <= 2 || y === 4 && x >= 1000 && x <= 1055) ? 'water' : 'grass';
  const network = buildTransportNetwork(city, water);
  const hubs = network.ports.filter(port => port.type === 'shippingHub');
  assert.ok(hubs.every(port => port.status === 'connected'));
  assert.ok(network.routes.some(route => route.kind === 'boat' && [route.from, route.to].includes('1000,0') && [route.from, route.to].includes('1050,0')));
  assert.ok(network.ports.every(port => port.status === 'connected'), 'each isolated water network deserves its own route');
});

test('adjacent shipping hubs sharing water entrances still receive a moving boat', () => {
  const city = {
    '0,0': { type: 'shippingHub', width: 6, height: 4 },
    '7,0': { type: 'shippingHub', width: 6, height: 4 },
  };
  const channel = (x, y) => x === 6 && y >= 0 && y <= 3 ? 'water' : 'grass';
  const network = buildTransportNetwork(city, channel);
  const [route] = network.routes.filter(route => route.kind === 'boat');
  assert.ok(route);
  assert.ok(route.path.length >= 2);
  assert.ok(route.path.every(p => channel(p.x, p.y) === 'water'));
  assert.notDeepEqual(sampleRoute(route, 0), sampleRoute(route, .5));
});

test('port diagnostics distinguish an isolated lake, missing water, and exhausted search budget', () => {
  const city = { '0,0': cell('harbor'), '100,0': cell('shippingHub'), '200,0': cell('seaport') };
  const lakes = (x, y) => y === 1 && (x === 0 || x === 100) ? 'water' : 'grass';
  const network = buildTransportNetwork(city, lakes);
  assert.equal(network.ports.find(port => port.key === '0,0').status, 'disconnected');
  assert.equal(network.ports.find(port => port.key === '100,0').status, 'disconnected');
  assert.equal(network.ports.find(port => port.key === '200,0').status, 'no-water');
  assert.equal(network.routes.filter(route => route.kind === 'boat').length, 0);
  const limited = buildTransportNetwork({ '0,0': cell('harbor'), '100,0': cell('shippingHub') }, (x, y) => y >= 1 ? 'water' : 'grass', { maxWaterNodes: 1 });
  assert.ok(limited.ports.every(port => port.status === 'search-limit'));
  assert.equal(limited.diagnostics.limitedPorts, 2);
  assert.ok(limited.diagnostics.searchedNodes <= 2);
});

test('finite lake discovery can reach a farther port beyond the nearest-candidate allowance', () => {
  const city = { '0,0': cell('harbor'), '500,0': cell('shippingHub') };
  for (let i = 1; i <= 12; i++) city[`${i * 2},-3`] = cell('harbor');
  const lake = (x, y) => (y === 1 && x >= 0 && x <= 500 || y === -4 && x >= 2 && x <= 24 && x % 2 === 0) ? 'water' : 'grass';
  const network = buildTransportNetwork(city, lake, { maxPortCandidates: 1 });
  assert.equal(network.ports.find(port => port.key === '0,0').status, 'connected');
  assert.equal(network.ports.find(port => port.key === '500,0').status, 'connected');
});

test('a one-cell shared berth is reported explicitly instead of drawing ships on land', () => {
  const city = { '0,0': cell('harbor'), '2,0': cell('harbor') };
  const pool = (x, y) => x === 1 && y === 0 ? 'water' : 'grass';
  const network = buildTransportNetwork(city, pool);
  assert.equal(network.routes.filter(route => route.kind === 'boat').length, 0);
  assert.ok(network.ports.every(port => port.status === 'berth-too-small'));
});

test('long-route sampling uses cached distances and does not revisit every waypoint per frame', () => {
  let reads = 0;
  const points = Array.from({ length: 20001 }, (_, x) => ({ x, y: 0 }));
  const path = new Proxy(points, { get(target, key, receiver) { if (/^\d+$/.test(String(key))) reads++; return Reflect.get(target, key, receiver); } });
  const route = prepareRoute({ kind: 'boat', path });
  assert.equal(route.total, 20000);
  reads = 0;
  for (let t = 0; t < 100; t++) assert.equal(sampleRoute(route, t + .5).x, t + .5);
  assert.ok(reads <= 300, `only the sampled segment should be read, saw ${reads} waypoint reads`);
  assert.equal(sampleRoute(route, 30002).x, 10000 - .5);
});
