// The city economy and focus clock are independent of rendering.
// Preserve the original storage key so existing saves remain available after the FocuCity rename.
export const STORAGE_KEY = 'senyu-focus-city-v1';
export const CATALOG = Object.freeze([
  { id: 'cottage', name: '林间小屋', category: '居住', description: '一扇暖黄的窗，十二位新邻居的家。', cost: 15, level: 1, population: 12, gdp: 18 },
  { id: 'road', name: '石板小路', category: '交通', description: '把生活连在一起，让居民沿着小路散步。', cost: 2, level: 1, population: 0, gdp: 0 },
  { id: 'garden', name: '花间庭院', category: '景观', description: '给城市留一块可以慢下来的绿地。', cost: 5, level: 1, population: 0, gdp: 2 },
  { id: 'shop', name: '街角商店', category: '生产', description: '面包的香气，是小镇醒来的信号。', cost: 25, level: 1, population: 4, gdp: 50 },
  { id: 'apartment', name: '温馨小区', category: '居住', description: '容纳更多相遇，也容纳更多生活。', cost: 45, level: 2, population: 45, gdp: 60 },
  { id: 'school', name: '小镇学校', category: '公共', description: '铃声响起，好奇心在这里长大。', cost: 35, level: 2, population: 4, gdp: 90 },
  { id: 'clinic', name: '社区医院', category: '公共', description: '让每一位居民都能安心生活。', cost: 40, level: 2, population: 4, gdp: 100 },
  { id: 'farm', name: '向阳农场', category: '生产', description: '四季生长，收获田野的温柔馈赠。', cost: 55, level: 2, population: 8, gdp: 150 },
  { id: 'police', name: '小镇警局', category: '公共', description: '守护安静街道与每一个归家的人。', cost: 50, level: 3, population: 6, gdp: 120 },
  { id: 'fire', name: '消防站', category: '公共', description: '明亮的红色屋顶，随时准备守护城市。', cost: 55, level: 3, population: 6, gdp: 120 },
  { id: 'harbor', name: '晴湾港口', category: '交通', description: '建在临水的陆地上，让远方的船只来访。', cost: 70, level: 3, population: 12, gdp: 260, terrain: 'shore' },
  { id: 'factory', name: '轻工业工厂', category: '生产', description: '把小镇的创造力，变成真实的产品。', cost: 100, level: 4, population: 35, gdp: 520 },
  { id: 'airport', name: '云端机场', category: '交通', description: '当梦想足够辽阔，世界也会靠近。', cost: 180, level: 5, population: 20, gdp: 1200 },
].map(Object.freeze));

export const LEVELS = Object.freeze([
  { level: 1, title: '初生村落', population: 0, gdp: 0 },
  { level: 2, title: '宜居小镇', population: 48, gdp: 180 },
  { level: 3, title: '活力新城', population: 120, gdp: 500 },
  { level: 4, title: '繁荣都市', population: 300, gdp: 1800 },
  { level: 5, title: '星光都会', population: 650, gdp: 4500 },
].map(Object.freeze));

const byId = new Map(CATALOG.map(item => [item.id, item]));
const MAX_POINTS = 1e9;
const MAX_COORD = 1e7;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const safeInt = (value, min, max) => finite(value) && Number.isInteger(value) && value >= min && value <= max;
const cleanText = (value, fallback, length = 80) => typeof value === 'string' && value.trim() ? value.trim().slice(0, length) : fallback;
const coordinatesValid = (x, y) => safeInt(x, -MAX_COORD, MAX_COORD) && safeInt(y, -MAX_COORD, MAX_COORD);
const validTimestamp = value => finite(value) && value >= 0 && value <= 8640000000000000;
const cleanId = value => typeof value === 'string' ? value.trim().slice(0, 128) : '';
// States loaded from this browser remember their last persisted snapshot. This
// prevents a delayed storage event from letting an older tab overwrite progress.
// New and imported states deliberately remain eligible to replace a save.
const savedSnapshots = new WeakMap();
let idCounter = 0;
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${(++idCounter).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function createInitialState(seed = Math.floor(Math.random() * 0xffffffff)) {
  return {
    version: 1,
    seed: safeInt(seed, 0, 0xffffffff) ? seed : 20261012,
    points: 0,
    buildings: {},
    sessions: [],
    focus: null,
    cityName: 'FocuCity',
    levelUnlocked: 1,
    settings: { sound: false },
  };
}

export function localDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function metrics(buildings) {
  let population = 0;
  let gdp = 0;
  let buildingCount = 0;
  for (const building of Object.values(buildings || {})) {
    const definition = byId.get(building?.type);
    if (!definition) continue;
    population += definition.population;
    gdp += definition.gdp;
    buildingCount += 1;
  }
  return { population, gdp, buildingCount };
}

export function levelByMetrics(buildings) {
  const { population, gdp } = metrics(buildings);
  return LEVELS.reduce((level, milestone) => population >= milestone.population || gdp >= milestone.gdp ? milestone.level : level, 1);
}

export function cityStats(state) {
  const current = metrics(state.buildings);
  const level = Math.max(levelByMetrics(state.buildings), Math.min(LEVELS.length, state.levelUnlocked || 1));
  const milestone = LEVELS[level - 1];
  const next = LEVELS[level];
  return {
    ...current,
    level,
    unlockedLevel: level,
    title: milestone.title,
    nextLevel: next?.level ?? null,
    nextPopulation: next?.population ?? null,
    nextGdp: next?.gdp ?? null,
    progress: next ? Math.min(1, Math.max(current.population / next.population, current.gdp / next.gdp)) : 1,
    maxLevel: !next,
  };
}

export function todayStats(state, date = new Date()) {
  const key = localDateKey(date);
  const sessions = state.sessions.filter(session => session.date === key);
  return {
    minutes: sessions.reduce((total, session) => total + session.minutes, 0),
    points: sessions.reduce((total, session) => total + session.points, 0),
    count: sessions.length,
    sessions,
  };
}

export function weekStats(state, date = new Date()) {
  const current = new Date(date);
  // Calendar arithmetic keeps this correct through daylight-saving changes.
  current.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(current);
    day.setDate(current.getDate() - 6 + index);
    const { sessions, ...stats } = todayStats(state, day);
    return { date: localDateKey(day), label: `${day.getMonth() + 1}/${day.getDate()}`, weekday: ['日', '一', '二', '三', '四', '五', '六'][day.getDay()], today: index === 6, ...stats };
  });
}

export function getRemaining(state, now = Date.now()) {
  const focus = state.focus;
  if (!focus) return 0;
  if (!validTimestamp(now)) return Math.max(0, focus.remaining);
  return focus.status === 'running'
    ? Math.max(0, Math.min(focus.duration, Math.ceil((focus.endAt - now) / 1000)))
    : Math.max(0, focus.remaining);
}

export function startFocus(state, { task = '一件值得专注的小事', minutes = 25 } = {}, now = Date.now()) {
  if (state.focus) return { ok: false, message: '请先完成或结束当前专注。' };
  if (!safeInt(minutes, 1, 240) || !validTimestamp(now) || !validTimestamp(now + minutes * 60000)) return { ok: false, message: '专注时长请填写 1–240 分钟的整数。' };
  const duration = minutes * 60;
  state.focus = { id: makeId(), task: cleanText(task, '一件值得专注的小事'), duration, remaining: duration, endAt: now + duration * 1000, status: 'running' };
  return { ok: true, message: '专注已经开始。', focus: state.focus };
}

export function pauseFocus(state, now = Date.now()) {
  if (!validTimestamp(now)) return { ok: false, message: '计时信息无效，请重试。' };
  if (state.focus?.status !== 'running') return { ok: false, message: '当前没有正在进行的专注。' };
  const remaining = getRemaining(state, now);
  if (remaining === 0) {
    const completed = completeFocus(state, now);
    return { ok: true, message: '这一段专注已完成。', completed };
  }
  state.focus.remaining = remaining;
  state.focus.endAt = null;
  state.focus.status = 'paused';
  return { ok: true, message: '专注已暂停。' };
}

export function resumeFocus(state, now = Date.now()) {
  if (state.focus?.status !== 'paused') return { ok: false, message: '当前没有暂停的专注。' };
  if (!validTimestamp(now) || !validTimestamp(now + state.focus.remaining * 1000)) return { ok: false, message: '计时信息无效，请重试。' };
  state.focus.endAt = now + state.focus.remaining * 1000;
  state.focus.status = 'running';
  return { ok: true, message: '继续这一段专注。' };
}

export function cancelFocus(state) {
  if (!state.focus) return { ok: false, message: '当前没有专注任务。' };
  state.focus = null;
  return { ok: true, message: '本次专注已结束，未完成的专注不获得专注点。' };
}

export function completeFocus(state, now = Date.now()) {
  const focus = state.focus;
  if (!focus || focus.status !== 'running' || !validTimestamp(now) || !validTimestamp(focus.endAt) || now < focus.endAt) return null;
  // A saved or imported timer can never award the same session twice.
  if (state.sessions.some(session => session.id === focus.id)) {
    state.focus = null;
    return null;
  }
  const minutes = focus.duration / 60;
  const session = { id: focus.id, task: focus.task, minutes, points: minutes, completedAt: focus.endAt, date: localDateKey(focus.endAt) };
  state.points = Math.min(MAX_POINTS, state.points + minutes);
  state.sessions.push(session);
  state.focus = null;
  return { points: minutes, minutes, session };
}

function terrainName(terrain) {
  return typeof terrain === 'string' ? terrain : terrain?.type;
}

export function buildAt(state, id, x, y, terrain, getNeighborTerrain) {
  const definition = byId.get(id);
  if (!definition) return { ok: false, message: '没有找到这项设施。' };
  if (!coordinatesValid(x, y)) return { ok: false, message: '请选择有效的地块。' };
  if (definition.level > cityStats(state).level) return { ok: false, message: `城市达到 Lv.${definition.level} 后解锁${definition.name}。` };
  const key = `${x},${y}`;
  if (state.buildings[key]) return { ok: false, message: '这里已有建筑，可以先拆除再建设。' };
  if (!['grass', 'forest'].includes(terrainName(terrain))) return { ok: false, message: '请在草地或森林地块上建设。' };
  if (definition.terrain === 'shore') {
    const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const nearWater = typeof getNeighborTerrain === 'function' && directions.some(([dx, dy]) => ['water', 'river', 'lake', 'ocean'].includes(terrainName(getNeighborTerrain(x + dx, y + dy))));
    if (!nearWater) return { ok: false, message: '港口需要建在紧邻水面的陆地上。' };
  }
  if (state.points < definition.cost) return { ok: false, message: `还差 ${definition.cost - state.points} 专注点，再专注一会儿吧。` };
  state.points -= definition.cost;
  state.buildings[key] = { type: id };
  const previousLevel = state.levelUnlocked || 1;
  state.levelUnlocked = Math.max(previousLevel, levelByMetrics(state.buildings));
  return { ok: true, message: `${definition.name}建好了！`, levelUp: state.levelUnlocked > previousLevel, level: state.levelUnlocked };
}

export function demolishAt(state, x, y) {
  if (!coordinatesValid(x, y)) return { ok: false, message: '请选择有效的地块。', refund: 0 };
  const key = `${x},${y}`;
  const definition = byId.get(state.buildings[key]?.type);
  if (!definition) return { ok: false, message: '这里没有可以拆除的设施。', refund: 0 };
  // Record the peak before changing the population and economy.
  state.levelUnlocked = cityStats(state).level;
  const refund = Math.floor(definition.cost / 2);
  delete state.buildings[key];
  state.points = Math.min(MAX_POINTS, state.points + refund);
  return { ok: true, message: `已拆除${definition.name}，返还 ${refund} 专注点。`, refund };
}

export function validateSave(data) {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.buildings) || !Array.isArray(data.sessions)) {
    return { ok: false, message: '这不是有效的 FocuCity 存档，或存档版本不受支持。' };
  }
  const state = createInitialState(data.seed);
  state.cityName = cleanText(data.cityName, state.cityName, 24);
  state.points = safeInt(data.points, 0, MAX_POINTS) ? data.points : 0;
  state.settings.sound = data.settings?.sound === true;
  for (const [key, value] of Object.entries(data.buildings).slice(0, 100000)) {
    if (!/^-?\d+,-?\d+$/.test(key) || !isRecord(value) || !byId.has(value.type)) continue;
    const [x, y] = key.split(',').map(Number);
    if (!coordinatesValid(x, y)) continue;
    state.buildings[`${x},${y}`] = { type: value.type };
  }
  const knownIds = new Set();
  for (const session of data.sessions.slice(0, 100000)) {
    if (!isRecord(session)) continue;
    const id = cleanId(session.id);
    if (!id || knownIds.has(id)) continue;
    if (!safeInt(session.minutes, 1, 240) || !validTimestamp(session.completedAt)) continue;
    knownIds.add(id);
    state.sessions.push({ id, task: cleanText(session.task, '专注任务'), minutes: session.minutes, points: session.minutes, completedAt: session.completedAt, date: localDateKey(session.completedAt) });
  }
  const focus = data.focus;
  const focusId = cleanId(focus?.id);
  if (isRecord(focus) && focusId && !knownIds.has(focusId)
      && safeInt(focus.duration, 60, 240 * 60) && focus.duration % 60 === 0
      && safeInt(focus.remaining, 0, focus.duration)
      && ['running', 'paused'].includes(focus.status)
      && (focus.status === 'paused' || validTimestamp(focus.endAt))) {
    state.focus = {
      id: focusId, task: cleanText(focus.task, '专注任务'), duration: focus.duration,
      remaining: focus.remaining, endAt: focus.status === 'paused' ? null : focus.endAt, status: focus.status,
    };
  }
  state.levelUnlocked = Math.max(safeInt(data.levelUnlocked, 1, LEVELS.length) ? data.levelUnlocked : 1, levelByMetrics(state.buildings));
  return { ok: true, state, message: '城市存档已准备好。' };
}

export function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    const result = raw ? validateSave(JSON.parse(raw)) : null;
    const state = result?.ok ? result.state : createInitialState();
    savedSnapshots.set(state, raw);
    return state;
  } catch {
    return createInitialState();
  }
}

export function saveState(state) {
  try {
    if (!globalThis.localStorage) return { ok: false, message: '浏览器未提供本地存储，请导出存档保留进度。' };
    const current = globalThis.localStorage.getItem(STORAGE_KEY) ?? null;
    if (savedSnapshots.has(state) && savedSnapshots.get(state) !== current) {
      // An explicit import/reset creates an untracked state and can replace the
      // current snapshot. Ordinary UI edits must never replace another tab's work.
      let latest;
      try { latest = current ? validateSave(JSON.parse(current)) : null; } catch { /* Recover corrupt storage by saving this valid state. */ }
      if (latest?.ok) {
        Object.assign(state, latest.state);
        savedSnapshots.set(state, current);
        return { ok: false, conflict: true, message: '另一标签页有新进度，已同步城市，请重试刚才的操作。' };
      }
      if (current === null) {
        Object.assign(state, createInitialState());
        savedSnapshots.set(state, null);
        return { ok: false, conflict: true, message: '另一标签页已清除存档，当前城市已同步。' };
      }
    }
    const raw = JSON.stringify(state);
    globalThis.localStorage.setItem(STORAGE_KEY, raw);
    savedSnapshots.set(state, raw);
    return { ok: true, message: '城市已保存。' };
  } catch {
    return { ok: false, message: '本地存储空间不足或不可用，请导出存档保留进度。' };
  }
}
