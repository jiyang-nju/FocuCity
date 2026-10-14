import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKIN_REWARDS, CHECKIN_RULES, createCheckinState, normalizeCheckins, getCheckinStatus, claimCheckin } from '../dist/checkins.js';

const at = (year, month, day, hour = 12) => new Date(year, month - 1, day, hour).getTime();
const city = () => ({ points: 0, checkins: createCheckinState() });
const sign = (state, year, month, days) => days.forEach(day => assert.equal(claimCheckin(state, 'daily', at(year, month, day)).ok, true));

test('daily rewards are awarded once per local day and survive JSON save/load', () => {
  const state = city();
  assert.deepEqual(claimCheckin(state, 'daily', at(2026, 10, 13)), { ok: true, message: '签到成功，获得 10 专注点。', points: 10 });
  assert.equal(claimCheckin(state, 'daily', at(2026, 10, 13, 23)).ok, false);
  assert.equal(state.points, 10);
  const restored = JSON.parse(JSON.stringify(state));
  restored.checkins = normalizeCheckins(restored.checkins);
  assert.equal(claimCheckin(restored, 'daily', at(2026, 10, 13)).ok, false);
  assert.equal(claimCheckin(restored, 'daily', at(2026, 10, 14)).ok, true);
  assert.equal(restored.points, 20);
  assert.equal(getCheckinStatus(restored, at(2026, 10, 14)).todayClaimed, true);
});

test('weekly reward requires five distinct days and a Monday starts a fresh period', () => {
  const state = city();
  sign(state, 2026, 10, [12, 13, 14, 15]);
  assert.equal(claimCheckin(state, 'weekly', at(2026, 10, 15)).ok, false);
  sign(state, 2026, 10, [16]);
  const status = getCheckinStatus(state, at(2026, 10, 18));
  assert.equal(status.weekKey, '2026-10-12');
  assert.equal(status.weekDays, 5);
  assert.equal(status.weekEligible, true);
  assert.equal(claimCheckin(state, 'weekly', at(2026, 10, 18)).points, 40);
  assert.equal(claimCheckin(state, 'weekly', at(2026, 10, 18)).ok, false);
  assert.equal(state.points, 90);
  assert.equal(getCheckinStatus(state, at(2026, 10, 19)).weekDays, 0);
  assert.equal(claimCheckin(state, 'weekly', at(2026, 10, 19)).ok, false);
});

test('monthly reward requires three weeks of five days each, not just fifteen total days', () => {
  const state = city();
  sign(state, 2026, 10, [5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22]);
  assert.equal(getCheckinStatus(state, at(2026, 10, 22)).qualifiedWeeks, 2);
  assert.equal(claimCheckin(state, 'monthly', at(2026, 10, 22)).ok, false);
  sign(state, 2026, 10, [23]);
  assert.equal(getCheckinStatus(state, at(2026, 10, 23)).qualifiedWeeks, 3);
  assert.equal(claimCheckin(state, 'monthly', at(2026, 10, 23)).points, 150);
  assert.equal(claimCheckin(state, 'monthly', at(2026, 10, 31)).ok, false);
  assert.equal(state.points, 300);
  assert.equal(getCheckinStatus(state, at(2026, 11, 1)).qualifiedWeeks, 0);
  const scattered = city();
  sign(scattered, 2026, 10, [1, 2, 3, 5, 6, 7, 12, 13, 14, 19, 20, 21, 26, 27, 28]);
  assert.equal(getCheckinStatus(scattered, at(2026, 10, 31)).monthDays, 15);
  assert.equal(claimCheckin(scattered, 'monthly', at(2026, 10, 31)).ok, false);
});

test('cross-month and cross-year weeks share a weekly reward but month totals remain separate', () => {
  const state = city();
  sign(state, 2025, 12, [29, 30, 31]);
  sign(state, 2026, 1, [1, 2]);
  const status = getCheckinStatus(state, at(2026, 1, 2));
  assert.equal(status.weekKey, '2025-12-29');
  assert.equal(status.weekDays, 5);
  assert.equal(status.monthDays, 2);
  assert.equal(status.qualifiedWeeks, 0);
  assert.equal(claimCheckin(state, 'weekly', at(2026, 1, 2)).ok, true);
  assert.equal(claimCheckin(state, 'weekly', at(2026, 1, 4)).ok, false);
  sign(state, 2026, 1, [3, 4]);
  assert.equal(getCheckinStatus(state, at(2026, 1, 4)).qualifiedWeeks, 0);
  // September 2026 starts on Tuesday: five in-month days count as a full week.
  const boundary = city();
  sign(boundary, 2026, 9, [1, 2, 3, 4, 5]);
  assert.equal(getCheckinStatus(boundary, at(2026, 9, 5)).qualifiedWeeks, 1);
});

test('normalization validates dates including leap years, deduplicates and drops invalid keys', () => {
  const normalized = normalizeCheckins({
    days: ['2024-02-29', '2024-02-29', '2025-02-29', '2026-04-31', '2026-10-13', '2026-1-02', null, 1, '2026-13-01'],
    weeks: ['2026-10-12', '2026-10-12', '2026-10-13', '2026-W42'],
    months: ['2026-10', '2026-10', '2026-13', '26-10', null],
    ignored: 'not copied',
  });
  assert.deepEqual(normalized, { days: ['2024-02-29', '2026-10-13'], weeks: ['2026-10-12'], months: ['2026-10'] });
  assert.deepEqual(normalizeCheckins(null), createCheckinState());
  assert.deepEqual(normalizeCheckins({ days: 'bad', weeks: {}, months: 7 }), createCheckinState());
  const state = city();
  sign(state, 2024, 2, [29]);
  const status = getCheckinStatus(state, at(2024, 2, 29));
  assert.equal(status.calendar.length, 29);
  assert.deepEqual(status.calendar.at(-1), { date: '2024-02-29', day: 29, weekday: 4, signed: true, today: true, future: false });
  assert.equal(getCheckinStatus(state, at(2025, 2, 28)).calendar.length, 28);
});

test('future imported checkins do not unlock rewards before their dates', () => {
  const state = city();
  state.checkins.days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];
  assert.equal(getCheckinStatus(state, at(2026, 10, 12)).weekDays, 1);
  assert.equal(claimCheckin(state, 'weekly', at(2026, 10, 12)).ok, false);
  assert.equal(getCheckinStatus(state, at(2026, 10, 16)).weekEligible, true);
});

test('oversized imported histories are bounded and a new claim keeps its duplicate marker', () => {
  const date = new Date(Date.UTC(2000, 0, 1, 12));
  const days = Array.from({ length: 40000 }, () => {
    const key = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 1);
    return key;
  });
  const months = Array.from({ length: 1300 }, (_, index) => `${2000 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`);
  const state = { points: 0, checkins: normalizeCheckins({ days, months }) };
  assert.equal(state.checkins.days.length, 36600);
  assert.equal(state.checkins.months.length, 1200);
  assert.equal(claimCheckin(state, 'daily', at(1999, 12, 31)).ok, true);
  assert.equal(state.checkins.days.length, 36600);
  assert.equal(claimCheckin(state, 'daily', at(1999, 12, 31)).ok, false);
  assert.equal(state.points, 10);
});

test('invalid inputs cannot award points and corrupt balances cannot produce negative or NaN results', () => {
  for (const points of [-90, NaN, Infinity, '100']) {
    const state = { points, checkins: createCheckinState() };
    assert.equal(claimCheckin(state, 'daily', at(2026, 10, 13)).ok, true);
    assert.equal(state.points, 10);
  }
  const state = city();
  assert.equal(claimCheckin(state, '__proto__', at(2026, 10, 13)).ok, false);
  assert.equal(claimCheckin(state, 'daily', NaN).ok, false);
  assert.equal(claimCheckin(state, 'daily', -1).ok, false);
  assert.equal(claimCheckin(null, 'daily', at(2026, 10, 13)).ok, false);
  assert.equal(state.points, 0);
  assert.deepEqual(state.checkins, createCheckinState());
  state.points = 1e9 - 1;
  assert.equal(claimCheckin(state, 'daily', at(2026, 10, 13)).ok, false);
  assert.equal(state.points, 1e9 - 1);
  assert.equal(getCheckinStatus(state, at(2026, 10, 13)).todayClaimed, false);
  assert.equal(CHECKIN_REWARDS.monthly, 150);
  assert.match(CHECKIN_RULES.monthly, /跨月周只计算本月/);
});
