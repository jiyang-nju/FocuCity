// Calendar rewards use the device's local day. Week identifiers are the local
// Monday's YYYY-MM-DD; calendar arithmetic is independent of daylight saving.
export const CHECKIN_REWARDS = Object.freeze({ daily: 10, weekly: 40, monthly: 150 });
export const CHECKIN_RULES = Object.freeze({
  daily: '每天签到可领取 10 专注点，每个自然日限领一次。',
  weekly: '每周一至周日累计签到 5 天，可领取 40 专注点；每周限领一次，须在当周领取。',
  monthly: '当月有 3 个自然周各签到至少 5 天，可领取 150 专注点；跨月周只计算本月的签到日期，每月限领一次，须在当月领取。',
});

const MAX_POINTS = 1e9;
const LIMITS = Object.freeze({ days: 36600, weeks: 6000, months: 1200 });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pad = value => String(value).padStart(2, '0');

function parseDay(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function utcKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function mondayKey(key) {
  const date = parseDay(key);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return utcKey(date);
}

function validWeek(key) {
  // The first supported day, 1970-01-01, belongs to the week of 1969-12-29.
  return key === '1969-12-29' || (parseDay(key)?.getUTCDay() === 1);
}

function validMonth(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}$/.test(key)) return false;
  const [year, month] = key.split('-').map(Number);
  return year >= 1970 && year <= 9999 && month >= 1 && month <= 12;
}

function cleanList(value, valid, limit) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(valid))].sort().slice(-limit);
}

export function createCheckinState() {
  return { days: [], weeks: [], months: [] };
}

export function normalizeCheckins(raw) {
  const data = isRecord(raw) ? raw : {};
  return {
    days: cleanList(data.days, key => Boolean(parseDay(key)), LIMITS.days),
    weeks: cleanList(data.weeks, validWeek, LIMITS.weeks),
    months: cleanList(data.months, validMonth, LIMITS.months),
  };
}

function localDay(now) {
  const timestamp = now instanceof Date ? now.getTime() : now;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return parseDay(key) ? key : null;
}

export function getCheckinStatus(state, now = Date.now()) {
  const today = localDay(now);
  const data = normalizeCheckins(state?.checkins);
  if (!today) return { valid: false, today: null, weekKey: null, monthKey: null, todayClaimed: false, weekDays: 0, weekClaimed: false, weekEligible: false, qualifiedWeeks: 0, monthClaimed: false, monthEligible: false, daysInMonth: [], monthDays: 0, calendar: [], weekProgress: [], rewards: CHECKIN_REWARDS };
  const weekKey = mondayKey(today);
  const monthKey = today.slice(0, 7);
  // Future imported dates must not unlock rewards early.
  const elapsedDays = data.days.filter(day => day <= today);
  const daysInMonth = elapsedDays.filter(day => day.startsWith(`${monthKey}-`));
  const weekDays = elapsedDays.filter(day => mondayKey(day) === weekKey).length;
  const weekCounts = new Map();
  for (const day of daysInMonth) {
    const week = mondayKey(day);
    weekCounts.set(week, (weekCounts.get(week) || 0) + 1);
  }
  const weekProgress = [...weekCounts].map(([key, days]) => ({ key, days, qualified: days >= 5 }));
  const qualifiedWeeks = weekProgress.filter(week => week.qualified).length;
  const weekClaimed = data.weeks.includes(weekKey);
  const monthClaimed = data.months.includes(monthKey);
  const [year, month] = monthKey.split('-').map(Number);
  const monthLength = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  const daySet = new Set(daysInMonth);
  const calendar = Array.from({ length: monthLength }, (_, index) => {
    const date = `${monthKey}-${pad(index + 1)}`;
    return { date, day: index + 1, weekday: parseDay(date).getUTCDay(), signed: daySet.has(date), today: date === today, future: date > today };
  });
  return {
    valid: true, today, weekKey, monthKey,
    todayClaimed: data.days.includes(today),
    weekDays, weekClaimed, weekEligible: weekDays >= 5 && !weekClaimed,
    qualifiedWeeks, monthClaimed, monthEligible: qualifiedWeeks >= 3 && !monthClaimed,
    daysInMonth, monthDays: daysInMonth.length, calendar, weekProgress,
    rewards: CHECKIN_REWARDS,
  };
}

function addKey(list, key, limit) {
  // Keep the just-claimed period even if a malformed import contains far-future
  // dates. Otherwise pruning could discard its marker and allow another claim.
  if (list.length >= limit) list.shift();
  list.push(key);
  list.sort();
}

export function claimCheckin(state, kind = 'daily', now = Date.now()) {
  const fail = message => ({ ok: false, message, points: 0 });
  if (!isRecord(state) || !Object.hasOwn(CHECKIN_REWARDS, kind)) return fail('签到类型无效，请重试。');
  const status = getCheckinStatus(state, now);
  if (!status.valid) return fail('日期无效，请检查设备时间。');
  if (kind === 'daily' && status.todayClaimed) return fail('今天已经签到，明天再来吧。');
  if (kind === 'weekly' && status.weekClaimed) return fail('本周奖励已经领取。');
  if (kind === 'monthly' && status.monthClaimed) return fail('本月奖励已经领取。');
  if (kind === 'weekly' && !status.weekEligible) return fail(`本周已签到 ${status.weekDays}/5 天，再来 ${5 - status.weekDays} 天即可领取。`);
  if (kind === 'monthly' && !status.monthEligible) return fail(`本月已有 ${status.qualifiedWeeks}/3 个达标周，每个达标周需在本月签到 5 天。`);
  const balance = typeof state.points === 'number' && Number.isFinite(state.points) ? Math.max(0, Math.min(MAX_POINTS, Math.floor(state.points))) : 0;
  const reward = CHECKIN_REWARDS[kind];
  if (balance + reward > MAX_POINTS) return fail('专注点已接近存储上限，使用一些后再领取。');
  const data = normalizeCheckins(state.checkins);
  const field = { daily: 'days', weekly: 'weeks', monthly: 'months' }[kind];
  const key = { daily: status.today, weekly: status.weekKey, monthly: status.monthKey }[kind];
  addKey(data[field], key, LIMITS[field]);
  state.checkins = data;
  state.points = balance + reward;
  return { ok: true, message: `${{ daily: '签到成功', weekly: '本周奖励已领取', monthly: '本月奖励已领取' }[kind]}，获得 ${reward} 专注点。`, points: reward };
}
