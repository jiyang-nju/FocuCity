// Original, asset-free ambience. Call start()/chime() from a user gesture to
// unlock audio; browsers may otherwise keep AudioContext suspended.
export function createSoundscape() {
  const MODES = new Set(['forest', 'rain', 'piano']);
  const nodes = new Set();
  const sources = new Set();
  const timers = new Set();
  const buffers = new Map();
  let context = null;
  let output = null;
  let running = false;
  let mode = 'forest';
  let volume = 0.45;
  let revision = 0;
  let phrase = 0;

  function getContext() {
    if (context && context.state !== 'closed') return context;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return null;
    try {
      context = new AudioContext();
      buffers.clear();
      return context;
    } catch {
      return null;
    }
  }

  function keep(node, source = false) {
    nodes.add(node);
    if (source) sources.add(node);
    return node;
  }

  function ensureOutput() {
    if (output) return output;
    const master = keep(context.createGain());
    const limiter = keep(context.createDynamicsCompressor());
    master.gain.value = volume * 0.38;
    limiter.threshold.value = -18;
    limiter.knee.value = 18;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.3;
    master.connect(limiter);
    limiter.connect(context.destination);
    output = master;
    return master;
  }

  function clearGraph() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const source of sources) {
      source.onended = null;
      try { source.stop(); } catch { /* It may already have ended. */ }
    }
    sources.clear();
    for (const node of nodes) {
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    }
    nodes.clear();
    output = null;
  }

  function later(callback, delay) {
    const current = revision;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (running && revision === current) callback();
    }, delay);
    timers.add(timer);
  }

  function pinkNoise() {
    if (buffers.has('pink')) return buffers.get('pink');
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    // Match the loop boundary to avoid a periodic click.
    const blend = Math.min(1024, Math.floor(data.length / 4));
    for (let i = 0; i < blend; i++) {
      const amount = i / blend;
      data[data.length - blend + i] =
        data[data.length - blend + i] * (1 - amount) + data[i] * amount;
    }
    buffers.set('pink', buffer);
    return buffer;
  }

  function noise(low, high, gainValue, swaying = false) {
    const source = keep(context.createBufferSource(), true);
    const highPass = keep(context.createBiquadFilter());
    const lowPass = keep(context.createBiquadFilter());
    const gain = keep(context.createGain());
    source.buffer = pinkNoise();
    source.loop = true;
    // The buffer's tail crossfades into its first 1,024 frames. Resume just
    // after those frames so the loop boundary remains continuous.
    source.loopStart = 1024 / context.sampleRate;
    highPass.type = 'highpass';
    highPass.frequency.value = low;
    lowPass.type = 'lowpass';
    lowPass.frequency.value = high;
    lowPass.Q.value = 0.4;
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(gainValue, context.currentTime + 1.5);
    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(gain);
    gain.connect(ensureOutput());
    source.start(0, Math.random() * 3);
    if (swaying) {
      const lfo = keep(context.createOscillator(), true);
      const depth = keep(context.createGain());
      lfo.frequency.value = 0.085;
      depth.gain.value = gainValue * 0.23;
      lfo.connect(depth);
      depth.connect(gain.gain);
      lfo.start();
    }
  }

  function tone(frequency, delay, duration, peak, type = 'sine', bird = false) {
    if (!context || sources.size > 48) return;
    const oscillator = keep(context.createOscillator(), true);
    const gain = keep(context.createGain());
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (bird) {
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.3, start + duration * 0.25);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.85, start + duration * 0.9);
    }
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + Math.min(0.025, duration * 0.15));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.gain.linearRampToValueAtTime(0, start + duration + 0.025);
    oscillator.connect(gain);
    gain.connect(ensureOutput());
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      sources.delete(oscillator);
      nodes.delete(oscillator);
      nodes.delete(gain);
      if (!running && sources.size === 0) clearGraph();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  }

  function birds() {
    const pitch = 1800 + Math.random() * 1200;
    tone(pitch, 0, 0.16, 0.016, 'sine', true);
    tone(pitch * 1.07, 0.2, 0.12, 0.012, 'sine', true);
    if (Math.random() > 0.5) tone(pitch * 0.92, 0.42, 0.2, 0.009, 'sine', true);
    later(birds, 6000 + Math.random() * 11000);
  }

  function piano() {
    // An original sparse pentatonic phrase, with a gentle harmonic overtone.
    const melody = [0, 7, 12, 9, 4, 7, 2, 9, 12, 7, 4, 2];
    const offset = melody[phrase++ % melody.length];
    const frequency = 261.6256 * 2 ** (offset / 12);
    tone(frequency, 0, 2.9, 0.085);
    tone(frequency * 2, 0, 1.5, 0.012, 'triangle');
    if (phrase % 3 === 1) tone(130.8128, 0.08, 4.2, 0.035);
    later(piano, 3100 + Math.random() * 1400);
  }

  function buildScene() {
    ensureOutput();
    if (mode === 'forest') {
      noise(100, 720, 0.32, true);
      later(birds, 1300);
    } else if (mode === 'rain') {
      noise(180, 5800, 0.7);
      noise(55, 380, 0.22, true);
    } else {
      phrase = 0;
      piano();
    }
  }

  const api = {
    async start(nextMode = 'forest') {
      const desired = MODES.has(nextMode) ? nextMode : 'forest';
      if (running && context?.state === 'running') {
        api.setMode(desired);
        return true;
      }
      const current = ++revision;
      mode = desired;
      if (!getContext()) return false;
      try { await context.resume(); } catch { return false; }
      if (revision !== current || context.state !== 'running') return false;
      clearGraph();
      running = true;
      buildScene();
      return true;
    },
    stop() {
      revision++;
      running = false;
      clearGraph();
    },
    setMode(nextMode) {
      if (!MODES.has(nextMode) || nextMode === mode) return;
      mode = nextMode;
      if (running) {
        revision++;
        clearGraph();
        buildScene();
      }
    },
    setVolume(nextVolume) {
      const value = Number(nextVolume);
      if (!Number.isFinite(value)) return;
      volume = Math.min(1, Math.max(0, value));
      if (output && context) {
        output.gain.cancelScheduledValues(context.currentTime);
        output.gain.setTargetAtTime(volume * 0.38, context.currentTime, 0.08);
      }
    },
    async chime() {
      const current = revision;
      if (!getContext()) return false;
      try { await context.resume(); } catch { return false; }
      if (current !== revision || context.state !== 'running') return false;
      [523.251, 659.255, 783.991].forEach((frequency, i) => {
        tone(frequency, i * 0.14, 1.2, 0.1);
      });
      return true;
    },
    get active() { return running && context?.state === 'running'; },
  };
  return api;
}
