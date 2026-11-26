// game/audio.js
// Procedural sound, no audio files: the turbine is a filtered sawtooth whose pitch follows
// throttle and airspeed, wind is filtered noise, and the gates chime as they are cleared.

export class Sound {
  constructor() {
    this.enabled = true;
    this.started = false;
    this.ctx = null;
  }

  // Browsers only allow audio after a gesture, so this waits for the first key or click.
  start() {
    if (this.started) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.36;
    this.master.connect(ctx.destination);

    this.turbine = ctx.createOscillator();
    this.turbine.type = 'sawtooth';
    this.turbine.frequency.value = 70;
    this.turbineGain = ctx.createGain();
    this.turbineGain.gain.value = 0.1;
    this.turbineFilter = ctx.createBiquadFilter();
    this.turbineFilter.type = 'lowpass';
    this.turbineFilter.frequency.value = 620;
    this.turbine.connect(this.turbineFilter).connect(this.turbineGain).connect(this.master);
    this.turbine.start();

    // Wind: white noise through a band-pass whose gain rises with airspeed.
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.02;
    this.noise.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.noise.start();
    this.started = true;
  }

  update(model) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const pitch = 62 + model.throttle * 90 + model.speed * 0.32;
    this.turbine.frequency.setTargetAtTime(pitch, t, 0.15);
    this.turbineFilter.frequency.setTargetAtTime(420 + model.throttle * 1500, t, 0.2);
    this.turbineGain.gain.setTargetAtTime(0.05 + model.throttle * 0.13, t, 0.2);
    this.windGain.gain.setTargetAtTime(Math.min(0.16, model.speed / 1100), t, 0.3);
    this.windFilter.frequency.setTargetAtTime(400 + model.speed * 6, t, 0.3);
  }

  tone(frequency, duration, type = 'sine', volume = 0.22) {
    if (!this.started || !this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  gate() {
    this.tone(880, 0.35, 'sine', 0.2);
    setTimeout(() => this.tone(1320, 0.4, 'sine', 0.16), 90);
  }

  crash() {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(160, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.9);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.95);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.36 : 0;
  }
}
