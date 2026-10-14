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

// A binary heap keeps long sea lanes proportional to the route explored, rather
// than filling a fixed square of ocean with an undirected breadth-first search.
class MinHeap {
  items = [];
  push(item) {
    const a = this.items; let i = a.length; a.push(item);
    while (i) { const parent = (i - 1) >> 1; if (!this.before(item, a[parent])) break; a[i] = a[parent]; i = parent; }
    a[i] = item;
  }
  before(a, b) { return a.f < b.f || a.f === b.f && a.h < b.h; }
  pop() {
    const a = this.items, first = a[0], last = a.pop();
    if (a.length) {
      let i = 0;
      while (i * 2 + 1 < a.length) {
        let child = i * 2 + 1;
        if (child + 1 < a.length && this.before(a[child + 1], a[child])) child++;
        if (!this.before(a[child], last)) break;
        a[i] = a[child]; i = child;
      }
      a[i] = last;
    }
    return first;
  }
}

function reconstruct(parents, end) {
  const path = [];
  while (end !== null && end !== undefined) { path.push(pointOf(end)); end = parents.get(end); }
  return path.reverse();
}

function waterSearch(starts, goals, allowed, maxNodes) {
  const targets = new Set(goals.map(p => keyOf(p.x, p.y)));
  const minX = Math.min(...goals.map(p => p.x)), maxX = Math.max(...goals.map(p => p.x));
  const minY = Math.min(...goals.map(p => p.y)), maxY = Math.max(...goals.map(p => p.y));
  const heuristic = (x, y) => Math.max(minX - x, 0, x - maxX) + Math.max(minY - y, 0, y - maxY);
  const open = new MinHeap(), parents = new Map(), scores = new Map();
  for (const p of starts) {
    const key = keyOf(p.x, p.y), h = heuristic(p.x, p.y);
    if (scores.has(key)) continue;
    scores.set(key, 0); parents.set(key, null); open.push({ ...p, key, g: 0, h, f: h });
  }
  let expanded = 0;
  while (open.items.length && expanded < maxNodes) {
    const p = open.pop();
    if (p.g !== scores.get(p.key)) continue;
    expanded++;
    if (targets.has(p.key)) return { path: reconstruct(parents, p.key), parents, expanded, complete: false };
    for (const [dx, dy] of DIRECTIONS) {
      const x = p.x + dx, y = p.y + dy, key = keyOf(x, y), g = p.g + 1;
      if (g >= (scores.get(key) ?? Infinity) || !allowed(x, y)) continue;
      const h = heuristic(x, y);
      scores.set(key, g); parents.set(key, p.key); open.push({ x, y, key, g, h, f: g + h });
    }
  }
  // Exhausting a finite component proves disconnection. Hitting the node budget
  // does not, and the UI receives a separate status instead of inventing a route.
  return { path: [], parents, expanded, complete: !open.items.length };
}

function sharedDockPath(from, to, allowed) {
  const targets = new Set(to.entrances.map(p => keyOf(p.x, p.y)));
  for (const p of from.entrances) if (targets.has(keyOf(p.x, p.y))) {
    // Adjacent ports may share all their water entrances. Give them two real
    // water positions instead of silently discarding a one-point BFS result.
    for (const [dx, dy] of DIRECTIONS) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (allowed(q.x, q.y)) return [p, q];
    }
  }
  return [];
}

function waterRoutes(terminals, allowed, entrances, options = {}) {
  const maxNodes = Math.max(1, Math.min(128000, options.maxWaterNodes ?? 32000));
  const maxCandidates = Math.max(1, Math.min(32, options.maxPortCandidates ?? 8));
  const ports = terminals.map(terminal => ({ ...terminal, entrances: entrances(terminal), connections: [], status: 'disconnected', reason: '没有连通到其他港口的水路。', searchedNodes: 0 }));
  ports.sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y || a.key.localeCompare(b.key));
  const ready = ports.filter(port => port.entrances.length), routes = [], connectedPairs = new Set();
  let searchedNodes = 0;
  const connect = (from, to, path) => {
    if (path.length === 1) path = sharedDockPath(from, to, allowed);
    if (path.length < 2) return false;
    const pair = [from.key, to.key].sort().join(':');
    if (!connectedPairs.has(pair)) {
      connectedPairs.add(pair);
      const high = [from.building.type, to.building.type];
      const style = high.includes('shippingHub') ? 'cargo' : high.includes('seaport') ? 'liner' : 'sailboat';
      routes.push({ kind: 'boat', style, path, from: from.key, to: to.key });
      from.connections.push(to.key); to.connections.push(from.key);
    }
    from.status = to.status = 'connected'; from.reason = to.reason = '已有往返航线。';
    return true;
  };
  for (const from of ports) {
    if (!from.entrances.length) { from.status = 'no-water'; from.reason = '码头周围没有可通航水面，请检查岸边建筑是否堵住出海口。'; continue; }
    if (ready.length < 2) { from.status = 'waiting-for-port'; from.reason = '还需要另一座临水港口。'; continue; }
    if (from.connections.length) continue;
    const candidates = ready.filter(to => to !== from).map(to => ({ to, distance: Math.abs(to.center.x - from.center.x) + Math.abs(to.center.y - from.center.y) }))
      .sort((a, b) => a.distance - b.distance || a.to.key.localeCompare(b.to.key));
    let remaining = maxNodes, exhaustedComponent = false, crampedDock = false;
    for (const { to, distance } of candidates.slice(0, maxCandidates)) {
      if (!remaining || from.connections.length) break;
      // Every unconnected port receives its own budget. Earlier, closer port
      // pairs can no longer use up the only global 32 search slots.
      const budget = Math.min(remaining, Math.max(4096, Math.ceil(distance * 4 + 1024)));
      const result = waterSearch(from.entrances, to.entrances, allowed, budget);
      remaining -= result.expanded; searchedNodes += result.expanded; from.searchedNodes += result.expanded;
      if (result.path.length) {
        if (!connect(from, to, result.path)) crampedDock = true;
      } else if (result.complete) {
        exhaustedComponent = true;
        // A small isolated lake can be exhausted while aiming at a closer port
        // on another lake. Any farther port in this same lake is still eligible.
        for (const { to: reachable } of candidates) {
          const endpoint = reachable.entrances.find(p => result.parents.has(keyOf(p.x, p.y)));
          if (endpoint && connect(from, reachable, reconstruct(result.parents, keyOf(endpoint.x, endpoint.y)))) break;
        }
        break;
      }
    }
    if (!from.connections.length) {
      if (crampedDock) { from.status = 'berth-too-small'; from.reason = '两座码头共用的水面太小，至少需要相邻的两格通航水面。'; }
      else if (!exhaustedComponent) { from.status = 'search-limit'; from.reason = '航线搜索达到预算，尚未确认是否连通；可沿水路增设中转港口。'; }
    }
  }
  return {
    routes,
    ports: ports.map(({ key, building, entrances, status, reason, connections, searchedNodes }) => ({ key, type: building.type, entrances: entrances.length, status, reason, connections, searchedNodes })),
    diagnostics: { searchedNodes, maxWaterNodesPerPort: maxNodes, maxPortCandidates: maxCandidates, limitedPorts: ports.filter(port => port.status === 'search-limit').length },
  };
}

// Routes are immutable after planning. Cache both cumulative distances and the
// total once; long ship journeys then cost O(log n) per animation sample.
const routeMetrics = new WeakMap();
export function prepareRoute(route) {
  const path = route.path || [], lengths = [], cumulative = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const length = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    lengths.push(length); total += length; cumulative.push(total);
  }
  route.lengths = lengths; route.cumulative = cumulative; route.total = total;
  routeMetrics.set(route, { path, size: path.length, lengths, cumulative, total });
  return route;
}

export function buildTransportNetwork(buildings = {}, terrain = () => 'grass', options = {}) {
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
  const shipping = waterRoutes(ports, isWater, waterEntrances, options);
  routes.push(...shipping.routes);
  // Neighbouring airports form a ring instead of an unbounded all-pairs fleet.
  for (let i = 0; i < airports.length && i < 24; i++) {
    if (airports.length < 2 || airports.length === 2 && i === 1) break;
    const from = airports[i], to = airports[(i + 1) % airports.length];
    routes.push({ kind: 'plane', from: from.key, to: to.key, path: [from.center, to.center] });
  }
  return { routes: routes.map(prepareRoute), ports: shipping.ports, diagnostics: shipping.diagnostics };
}

export function buildTransportRoutes(buildings = {}, terrain = () => 'grass', options = {}) {
  return buildTransportNetwork(buildings, terrain, options).routes;
}

// A route is traversed in both directions with a short stop at each terminus.
export function sampleRoute(route, elapsedSeconds, speed = 1, offset = 0) {
  const path = route.path;
  if (!path?.length) return null;
  let metrics = routeMetrics.get(route);
  if (!metrics || metrics.path !== path || metrics.size !== path.length) { prepareRoute(route); metrics = routeMetrics.get(route); }
  const { lengths, cumulative, total } = metrics;
  if (!total) return { ...path[0], direction: 0, progress: 0 };
  const pause = 1.5 * speed, period = total * 2 + pause * 2;
  const travel = ((elapsedSeconds * speed + offset) % period + period) % period;
  const returning = travel > total + pause;
  const distance = returning ? Math.max(0, total - (travel - total - pause)) : Math.min(total, travel);
  const progress = distance / total;
  let low = 1, high = cumulative.length - 1;
  while (low < high) { const middle = (low + high) >> 1; if (cumulative[middle] < distance) low = middle + 1; else high = middle; }
  const i = low - 1, from = path[i], to = path[i + 1];
  const f = lengths[i] ? Math.min(1, (distance - cumulative[i]) / lengths[i]) : 0;
  return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, direction: Math.atan2(to.y - from.y, to.x - from.x) + (returning ? Math.PI : 0), progress };
}
