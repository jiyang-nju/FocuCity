// Pure, bounded route planning. Vehicles exist only when infrastructure connects.
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const ROAD = new Set(['road', 'asphalt', 'bridge', 'tunnel']);
const RAIL = new Set(['railway', 'railBridge', 'station']);
const METRO = new Set(['metroLine', 'metroStation']);
const PORT = new Set(['harbor', 'seaport', 'shippingHub']);
const AIRPORT = new Set(['airport', 'internationalAirport']);
const WATER = new Set(['water', 'river', 'lake', 'ocean']);
const keyOf = (x, y) => `${x},${y}`;
const pointOf = key => { const [x, y] = key.split(',').map(Number); return { x, y }; };

export function buildingCells(key, building) {
  const { x, y } = pointOf(key), width = Math.max(1, building.width || 1), height = Math.max(1, building.height || 1);
  const cells = [];
  for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < height; dy++) cells.push({ x: x + dx, y: y + dy });
  return cells;
}

function bfs(starts, isAllowed, targets, maxNodes = 20000) {
  const queue = [], parents = new Map();
  for (const p of starts) { const k = keyOf(p.x, p.y); if (!parents.has(k) && isAllowed(p.x, p.y)) { queue.push(p); parents.set(k, null); } }
  let end = null;
  for (let i = 0; i < queue.length && i < maxNodes; i++) {
    const p = queue[i], key = keyOf(p.x, p.y);
    if (targets?.has(key)) { end = key; break; }
    for (const [dx, dy] of DIRECTIONS) {
      const x = p.x + dx, y = p.y + dy, next = keyOf(x, y);
      if (!parents.has(next) && isAllowed(x, y)) { parents.set(next, key); queue.push({ x, y }); }
    }
  }
  if (!targets) end = queue[Math.min(queue.length, maxNodes) - 1] && keyOf(queue[Math.min(queue.length, maxNodes) - 1].x, queue[Math.min(queue.length, maxNodes) - 1].y);
  if (!end) return { path: [], visited: parents };
  const path = [];
  while (end) { path.push(pointOf(end)); end = parents.get(end); }
  return { path: path.reverse(), visited: parents };
}

function roadRoutes(network) {
  const seen = new Set(), routes = [];
  for (const key of network) {
    if (seen.has(key) || routes.length >= 36) continue;
    const first = bfs([pointOf(key)], (x, y) => network.has(keyOf(x, y)));
    for (const k of first.visited.keys()) seen.add(k);
    if (first.path.length < 2) continue;
    const path = bfs([first.path.at(-1)], (x, y) => network.has(keyOf(x, y))).path;
    if (path.length > 1) routes.push({ kind: 'car', path }, { kind: 'walker', path });
  }
  return routes;
}

function networkTerminalRoutes(terminals, kind, network, limit = 16) {
  const routes = [], seen = new Set(), owner = new Map();
  for (const terminal of terminals) for (const p of terminal.cells) owner.set(keyOf(p.x, p.y), terminal);
  // Traverse each finite rail component once. Isolated stations cost only their
  // own cells and cannot consume a pair-search budget needed by another line.
  for (const from of terminals) {
    if (seen.has(keyOf(from.cells[0].x, from.cells[0].y))) continue;
    const queue = [], parents = new Map(), linked = new Set([from.key]);
    for (const p of from.cells) {
      const key = keyOf(p.x, p.y);
      queue.push(p); parents.set(key, null); seen.add(key);
    }
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], key = keyOf(p.x, p.y), to = owner.get(key);
      if (to && !linked.has(to.key)) {
        linked.add(to.key);
        const path = [];
        for (let step = key; step; step = parents.get(step)) path.push(pointOf(step));
        if (path.length > 1) routes.push({ kind, path: path.reverse(), from: from.key, to: to.key });
        if (routes.length >= limit) return routes;
      }
      for (const [dx, dy] of DIRECTIONS) {
        const x = p.x + dx, y = p.y + dy, next = keyOf(x, y);
        if (!seen.has(next) && network.has(next)) {
          seen.add(next); parents.set(next, key); queue.push({ x, y });
        }
      }
    }
  }
  return routes;
}

function waterRoutes(terminals, allowed, entrances, limit = 16) {
  const routes = [], candidates = [], pairs = new Set();
  const ready = terminals.map(terminal => ({ ...terminal, entrances: entrances(terminal) })).filter(terminal => terminal.entrances.length);
  // Sample neighbours in both coordinate orders, then try the globally closest
  // pairs first. Candidate storage and water searches remain capped regardless
  // of town size, without privileging the first ports added to the save.
  for (const axis of ['x', 'y']) {
    const other = axis === 'x' ? 'y' : 'x';
    const ordered = [...ready].sort((a, b) => a.center[axis] - b.center[axis] || a.center[other] - b.center[other]);
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < Math.min(ordered.length, i + 9); j++) {
      const from = ordered[i], to = ordered[j], pair = [from.key, to.key].sort().join(':');
      if (pairs.has(pair)) continue;
      const distance = Math.abs(to.center.x - from.center.x) + Math.abs(to.center.y - from.center.y);
      if (candidates.length === 32 && distance >= candidates.at(-1).distance) continue;
      candidates.push({ from, to, distance, pair }); pairs.add(pair);
      candidates.sort((a, b) => a.distance - b.distance || a.pair.localeCompare(b.pair));
      if (candidates.length > 32) pairs.delete(candidates.pop().pair);
    }
  }
  for (const { from, to } of candidates) {
    const targets = new Set(to.entrances.map(p => keyOf(p.x, p.y)));
    const minX = Math.min(from.center.x, to.center.x) - 44, maxX = Math.max(from.center.x, to.center.x) + 44;
    const minY = Math.min(from.center.y, to.center.y) - 44, maxY = Math.max(from.center.y, to.center.y) + 44;
    const bounded = (x, y) => x >= minX && x <= maxX && y >= minY && y <= maxY && allowed(x, y);
    const path = bfs(from.entrances, bounded, targets, 14000).path;
    if (path.length > 1) routes.push({ kind: 'boat', path, from: from.key, to: to.key });
    if (routes.length >= limit) break;
  }
  return routes;
}

export function buildTransportRoutes(buildings = {}, terrain = () => 'grass') {
  const roads = new Set(), rails = new Set(), metro = new Set(), stations = [], metros = [], ports = [], airports = [], occupied = new Map();
  for (const [key, building] of Object.entries(buildings)) {
    const cells = buildingCells(key, building), center = { x: cells.reduce((n, p) => n + p.x, 0) / cells.length, y: cells.reduce((n, p) => n + p.y, 0) / cells.length };
    const terminal = { key, building, cells, center };
    for (const { x, y } of cells) {
      const cellKey = keyOf(x, y); occupied.set(cellKey, building.type);
      if (ROAD.has(building.type)) roads.add(cellKey);
      if (RAIL.has(building.type)) rails.add(cellKey);
      if (METRO.has(building.type)) metro.add(cellKey);
    }
    if (building.type === 'station') stations.push(terminal);
    if (building.type === 'metroStation') metros.push(terminal);
    if (PORT.has(building.type)) ports.push(terminal);
    if (AIRPORT.has(building.type)) airports.push(terminal);
  }
  const routes = roadRoutes(roads);
  routes.push(...networkTerminalRoutes(stations, 'train', rails));
  routes.push(...networkTerminalRoutes(metros, 'metro', metro));
  const isWater = (x, y) => WATER.has(terrain(x, y)) && (!occupied.has(keyOf(x, y)) || ['bridge', 'railBridge', 'metroLine'].includes(occupied.get(keyOf(x, y))));
  const waterEntrances = terminal => {
    const entries = new Map();
    for (const p of terminal.cells) for (const [dx, dy] of DIRECTIONS) if (isWater(p.x + dx, p.y + dy)) entries.set(keyOf(p.x + dx, p.y + dy), { x: p.x + dx, y: p.y + dy });
    return [...entries.values()];
  };
  routes.push(...waterRoutes(ports, isWater, waterEntrances));
  // Neighbouring airports form a ring instead of an unbounded all-pairs fleet.
  for (let i = 0; i < airports.length && i < 24; i++) {
    if (airports.length < 2 || airports.length === 2 && i === 1) break;
    const from = airports[i], to = airports[(i + 1) % airports.length];
    routes.push({ kind: 'plane', from: from.key, to: to.key, path: [from.center, to.center] });
  }
  return routes;
}

// A route is traversed in both directions with a short stop at each terminus.
export function sampleRoute(route, elapsedSeconds, speed = 1, offset = 0) {
  const path = route.path;
  if (!path?.length) return null;
  const lengths = route.lengths || path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
  const total = lengths.reduce((n, length) => n + length, 0);
  if (!total) return { ...path[0], direction: 0, progress: 0 };
  const pause = 1.5 * speed, period = total * 2 + pause * 2;
  const travel = ((elapsedSeconds * speed + offset) % period + period) % period;
  const returning = travel > total + pause;
  let distance = returning ? Math.max(0, total - (travel - total - pause)) : Math.min(total, travel);
  const progress = distance / total;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? Math.min(1, distance / lengths[i]) : 0, from = path[i], to = path[i + 1];
      return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, direction: Math.atan2(to.y - from.y, to.x - from.x) + (returning ? Math.PI : 0), progress };
    }
    distance -= lengths[i];
  }
}
