// Sleep between frames instead of waking at the display's full refresh rate.
export const RENDER_MODES = Object.freeze({
  balanced: Object.freeze({ fps: 30, dpr: 1.5, label: '均衡' }),
  eco: Object.freeze({ fps: 20, dpr: 1, label: '省电' }),
  quality: Object.freeze({ fps: 30, dpr: 2, label: '清晰' }),
});

export function createRenderLoop(draw, options = {}) {
  const request = options.requestFrame || (fn => requestAnimationFrame(fn));
  const cancel = options.cancelFrame || (id => cancelAnimationFrame(id));
  const setTimer = options.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer || (id => clearTimeout(id));
  const now = options.now || (() => performance.now());
  let fps = options.fps || 30, active = false, destroyed = false;
  let frame = null, timer = null, lastPaint = -Infinity;
  function clear() {
    if (frame !== null) cancel(frame);
    if (timer !== null) clearTimer(timer);
    frame = timer = null;
  }
  function queue(delay = 0) {
    if (!active || destroyed || frame !== null || timer !== null) return;
    if (delay > 0) timer = setTimer(() => { timer = null; queue(); }, delay);
    else frame = request(tick);
  }
  function tick(timestamp) {
    frame = null;
    if (!active || destroyed) return;
    const interval = 1000 / fps, remaining = interval - (timestamp - lastPaint);
    if (remaining > .5) { queue(Math.max(1, remaining - 1)); return; }
    lastPaint = timestamp;
    const animate = draw(timestamp);
    if (animate) queue(Math.max(1, interval - (now() - timestamp) - 1));
  }
  return {
    setActive(value) {
      if (destroyed || active === !!value) return;
      active = !!value; clear();
      if (active) { lastPaint = -Infinity; queue(); }
    },
    invalidate() {
      if (timer !== null) { clearTimer(timer); timer = null; }
      queue();
    },
    setFps(value) { fps = Math.max(1, Math.min(60, value)); },
    destroy() { destroyed = true; active = false; clear(); },
  };
}
