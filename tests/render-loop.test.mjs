import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderLoop, RENDER_MODES } from '../dist/render-loop.js';

// Timers fire at their requested deadline; RAF callbacks only run on the next
// 120 Hz display refresh. An unrequested refresh does no work at all.
function fakeDisplay(refreshRate = 120) {
  const refreshInterval = 1000 / refreshRate;
  let time = 0, nextId = 1, frameRequests = 0;
  const pending = new Map();
  const cancelled = { frame: 0, timer: 0 };
  const schedule = (kind, callback, due) => {
    const id = nextId++;
    pending.set(id, { kind, callback, due });
    return id;
  };
  const cancel = (id, kind) => {
    if (pending.delete(id)) cancelled[kind]++;
  };
  return {
    options: {
      now: () => time,
      requestFrame: callback => {
        frameRequests++;
        const nextRefresh = Math.floor(time / refreshInterval + 1e-9) + 1;
        return schedule('frame', callback, nextRefresh * refreshInterval);
      },
      cancelFrame: id => cancel(id, 'frame'),
      setTimer: (callback, delay) => schedule('timer', callback, time + delay),
      clearTimer: id => cancel(id, 'timer'),
    },
    advance(milliseconds) {
      const target = time + milliseconds;
      let iterations = 0;
      while (pending.size) {
        const [id, event] = [...pending].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
        if (event.due > target + 1e-9) break;
        assert.ok(++iterations < 10000, 'render loop must not spin without advancing time');
        time = event.due;
        pending.delete(id);
        event.callback(time);
      }
      time = target;
    },
    count: kind => [...pending.values()].filter(event => !kind || event.kind === kind).length,
    get frameRequests() { return frameRequests; },
    cancelled,
  };
}

test('a 120 Hz display paints at most 30 times a second and sleeps between frames', () => {
  const display = fakeDisplay();
  const paints = [];
  const loop = createRenderLoop(time => { paints.push(time); return true; }, display.options);
  assert.equal(display.count(), 0, 'inactive maps must not schedule work');
  loop.setActive(true);
  display.advance(1000);
  assert.ok(paints.length >= 29 && paints.length <= 30, `painted ${paints.length} frames`);
  assert.ok(display.frameRequests <= 31, 'throttling must avoid waking on all 120 display refreshes');
  for (let index = 1; index < paints.length; index++) {
    assert.ok(paints[index] - paints[index - 1] >= 1000 / 30 - .5);
  }
  loop.destroy();
});

test('eco mode reduces a continuously animated map to 20 frames per second', () => {
  const display = fakeDisplay();
  const paints = [];
  const loop = createRenderLoop(time => { paints.push(time); return true; }, { ...display.options, fps: RENDER_MODES.eco.fps });
  loop.setActive(true);
  display.advance(1000);
  assert.ok(paints.length >= 19 && paints.length <= 20, `painted ${paints.length} eco frames`);
  assert.ok(display.frameRequests <= 21);
  for (let index = 1; index < paints.length; index++) {
    assert.ok(paints[index] - paints[index - 1] >= 50 - .5);
  }
  loop.destroy();
});

test('pausing cancels both queued RAF and sleeping timers, and resuming restarts drawing', () => {
  const display = fakeDisplay();
  let paints = 0;
  const loop = createRenderLoop(() => { paints++; return true; }, display.options);
  loop.setActive(true);
  assert.equal(display.count('frame'), 1);
  loop.setActive(false);
  assert.equal(display.cancelled.frame, 1);
  display.advance(1000);
  assert.equal(paints, 0);
  assert.equal(display.count(), 0);
  loop.setActive(true);
  display.advance(10);
  assert.equal(paints, 1);
  assert.equal(display.count('timer'), 1);
  loop.setActive(false);
  assert.equal(display.cancelled.timer, 1);
  loop.invalidate();
  display.advance(1000);
  assert.equal(paints, 1);
  assert.equal(display.count(), 0, 'invalidation must not wake a hidden map');
  loop.setActive(true);
  display.advance(10);
  assert.equal(paints, 2);
  loop.destroy();
});

test('a static map sleeps indefinitely until invalidated, coalescing repeated invalidations', () => {
  const display = fakeDisplay();
  let paints = 0;
  const loop = createRenderLoop(() => { paints++; return false; }, display.options);
  loop.setActive(true);
  display.advance(1000);
  assert.equal(paints, 1);
  assert.equal(display.count(), 0);
  display.advance(60000);
  assert.equal(paints, 1);
  for (let count = 0; count < 20; count++) loop.invalidate();
  assert.equal(display.count('frame'), 1);
  display.advance(1000);
  assert.equal(paints, 2);
  assert.equal(display.count(), 0);
  loop.destroy();
});

test('repeated interaction invalidations cannot bypass the frame cap', () => {
  const display = fakeDisplay();
  let paints = 0;
  const loop = createRenderLoop(() => { paints++; return true; }, display.options);
  loop.setActive(true);
  for (let refresh = 0; refresh < 120; refresh++) {
    loop.invalidate();
    display.advance(1000 / 120);
  }
  assert.ok(paints >= 29 && paints <= 30, `interaction painted ${paints} frames`);
  loop.destroy();
});

test('destroy cancels pending work and permanently rejects activation and invalidation', () => {
  for (const initialDelay of [0, 10]) {
    const display = fakeDisplay();
    let paints = 0;
    const loop = createRenderLoop(() => { paints++; return true; }, display.options);
    loop.setActive(true);
    display.advance(initialDelay);
    assert.equal(display.count(), 1);
    const before = paints;
    loop.destroy();
    assert.equal(display.count(), 0);
    loop.setActive(true);
    loop.setFps(60);
    loop.invalidate();
    loop.destroy();
    display.advance(10000);
    assert.equal(paints, before);
    assert.equal(display.count(), 0);
  }
});
