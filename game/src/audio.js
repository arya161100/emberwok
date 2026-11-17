// EMBERWOK — audio.js
// All sound is synthesized with WebAudio: no audio assets, no network.
// The AudioContext is created lazily on the first user gesture (ensure()),
// and every method is a safe no-op when audio is unavailable or muted, so
// the game never crashes on a silent machine.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.nextNoteTime = 0;
  }

  // Create (or resume) the AudioContext. Call from a user gesture.
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
      }
    } catch { /* ignore */ }
    return this.muted;
  }

  // --- primitives ---------------------------------------------------------

  // A single oscillator note. `when` is an absolute ctx time (default: now).
  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!this.ready || this.muted) return;
    try {
      const t0 = when || this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch { /* ignore */ }
  }

  // Filtered white-noise burst (sizzle, chop, steam). The buffer is filled
  // with a tiny LCG, not Math.random, so even the audio path stays
  // deterministic (the sim itself never touches randomness at all).
  noise(dur, filterFreq = 1200, vol = 0.2, type = 'bandpass', when = 0) {
    if (!this.ready || this.muted) return;
    try {
      const t0 = when || this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let s = (this.noiseSeed = ((this.noiseSeed || 123456789) * 1664525 + 1013904223) >>> 0);
      for (let i = 0; i < len; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        data[i] = s / 2147483648 - 1;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = filterFreq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t0);
      src.stop(t0 + dur);
    } catch { /* ignore */ }
  }

  // --- game sounds --------------------------------------------------------

  // Knife on the board: short thock + noise tick.
  chop() {
    this.noise(0.06, 2600, 0.25, 'highpass');
    this.tone(190, 0.08, 'triangle', 0.3, 0, 90);
  }

  // Wok / steamer working: a breath of sizzle.
  sizzle() {
    this.noise(0.35, 5200, 0.12, 'highpass');
    this.noise(0.3, 900, 0.08, 'lowpass');
  }

  // Order ticket appears / tea poured: bright bell.
  ding() {
    this.tone(1318, 0.35, 'sine', 0.18);
    this.tone(1760, 0.45, 'sine', 0.14, this.ctx ? this.ctx.currentTime + 0.07 : 0);
  }

  // Dish served: warm little arpeggio.
  serve() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(523, 0.12, 'triangle', 0.22, t);
    this.tone(659, 0.12, 'triangle', 0.22, t + 0.08);
    this.tone(784, 0.22, 'triangle', 0.24, t + 0.16);
  }

  // Perfect serve: serve arpeggio + sparkle on top.
  perfect() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.serve();
    this.tone(1046, 0.3, 'sine', 0.16, t + 0.22);
    this.tone(1318, 0.4, 'sine', 0.16, t + 0.3);
    this.tone(1568, 0.5, 'sine', 0.12, t + 0.38);
  }

  // Customer walks away: sad descending pair.
  walkaway() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(392, 0.25, 'sawtooth', 0.1, t, 330);
    this.tone(311, 0.45, 'sawtooth', 0.1, t + 0.22, 262);
  }

  // Coins landing: two high pings.
  coin() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.tone(988, 0.09, 'square', 0.08, t);
    this.tone(1318, 0.18, 'square', 0.08, t + 0.07);
  }

  // UI click.
  click() {
    this.tone(660, 0.06, 'square', 0.1);
  }

  // Rush hour: drum + rising call.
  rush() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.tone(140, 0.12, 'sine', 0.35, t + i * 0.14, 70);
    this.tone(523, 0.15, 'triangle', 0.2, t + 0.42);
    this.tone(659, 0.15, 'triangle', 0.2, t + 0.5);
    this.tone(784, 0.3, 'triangle', 0.22, t + 0.58);
  }

  // Night cleared: short fanfare.
  nightDone() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, t + i * 0.13));
    this.tone(1318, 0.5, 'sine', 0.16, t + 0.55);
  }

  // Game over: slow descent.
  gameOver() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const seq = [392, 370, 349, 311];
    seq.forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.18, t + i * 0.3));
  }

  // --- music --------------------------------------------------------------
  //
  // A light pentatonic loop (A minor pentatonic over a soft bass), scheduled
  // a bar ahead with a timer. Pure WebAudio, no assets. The scheduler only
  // runs while music is on; stopMusic() clears it.

  startMusic() {
    if (!this.ensure()) return;
    if (this.musicTimer) return;
    this.musicStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 120);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  scheduleMusic() {
    if (!this.ctx || this.musicTimer === null) return;
    const stepDur = 60 / 132 / 2; // 132 BPM eighth notes.
    // A-minor pentatonic melody, 16 steps; 0 = rest.
    const melody = [440, 0, 523, 659, 0, 587, 523, 0, 440, 0, 392, 440, 523, 0, 659, 0];
    const bass = [110, 0, 0, 0, 87, 0, 0, 0, 98, 0, 0, 0, 82, 0, 110, 0];
    while (this.nextNoteTime < this.ctx.currentTime + 0.35) {
      const i = this.musicStep % 16;
      const m = melody[i];
      const b = bass[i];
      if (m) this.tone(m, stepDur * 1.8, 'triangle', 0.07, this.nextNoteTime);
      if (b) this.tone(b, stepDur * 3.5, 'sine', 0.12, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.musicStep += 1;
    }
  }
}
