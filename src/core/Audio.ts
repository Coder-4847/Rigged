/**
 * Fully procedural WebAudio: no asset files. Engine tone, impacts, crash, UI blips, chimes.
 * The AudioContext is created on the first user gesture (mobile autoplay policy) and is
 * suspended while the tab is hidden.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  // engine voices
  private engOsc1?: OscillatorNode;
  private engOsc2?: OscillatorNode;
  private engGain?: GainNode;
  private engFilter?: BiquadFilterNode;
  private rollGain?: GainNode;
  private rollFilter?: BiquadFilterNode;
  // proximity ambience (laser hum, saw whir)
  private humGain?: GainNode;
  private humFilter?: BiquadFilterNode;
  private whirGain?: GainNode;
  private whirFilter?: BiquadFilterNode;

  volumes = { master: 0.8, sfx: 1, music: 0.5 };
  muted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (!this.muted) void this.ctx.resume();
    });
  }

  /** Call from any pointer/key handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.sfx = c.createGain();
      this.musicBus = c.createGain();
      this.sfx.connect(this.master);
      this.musicBus.connect(this.master);
      // Gentle limiter so stacked effects never clip.
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      this.master.connect(comp).connect(c.destination);
      this.noise = this.makeNoise(c);
      this.applyVolumes();
      this.startEngine();
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
  }

  private makeNoise(c: AudioContext): AudioBuffer {
    const buf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolumes(v: Partial<typeof this.volumes>): void {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.03);
  }

  // ------------------------------------------------------------------ engine

  private startEngine(): void {
    const c = this.ctx!;
    this.engOsc1 = c.createOscillator();
    this.engOsc2 = c.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc2.type = 'square';
    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 400;
    this.engFilter.Q.value = 3;
    this.engGain = c.createGain();
    this.engGain.gain.value = 0;
    const g2 = c.createGain();
    g2.gain.value = 0.45;
    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(g2).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.sfx);
    this.engOsc1.start();
    this.engOsc2.start();

    // Tyre/road rumble: looped noise through a bandpass, gated by ground speed.
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.rollFilter = c.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 300;
    this.rollFilter.Q.value = 0.7;
    this.rollGain = c.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.sfx);
    src.start();

    // Laser hum: detuned saws through a bandpass, silent until a laser is nearby.
    const hum1 = c.createOscillator();
    const hum2 = c.createOscillator();
    hum1.type = 'sawtooth';
    hum2.type = 'square';
    hum1.frequency.value = 118;
    hum2.frequency.value = 121.5;
    this.humFilter = c.createBiquadFilter();
    this.humFilter.type = 'bandpass';
    this.humFilter.frequency.value = 480;
    this.humFilter.Q.value = 4;
    this.humGain = c.createGain();
    this.humGain.gain.value = 0;
    hum1.connect(this.humFilter);
    hum2.connect(this.humFilter);
    this.humFilter.connect(this.humGain).connect(this.sfx);
    hum1.start();
    hum2.start();

    // Saw whir: looped noise, bandpassed high.
    const w = c.createBufferSource();
    w.buffer = this.noise;
    w.loop = true;
    w.playbackRate.value = 1.3;
    this.whirFilter = c.createBiquadFilter();
    this.whirFilter.type = 'bandpass';
    this.whirFilter.frequency.value = 2200;
    this.whirFilter.Q.value = 2.5;
    this.whirGain = c.createGain();
    this.whirGain.gain.value = 0;
    w.connect(this.whirFilter).connect(this.whirGain).connect(this.sfx);
    w.start();
  }

  /** Proximity ambience: pass 0..1 loudness for the nearest laser / saw (0 = silent). */
  ambient(laser: number, saw: number, t = 0): void {
    if (!this.ctx || !this.humGain) return;
    const now = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(laser * 0.06, now, 0.1);
    this.humFilter!.frequency.setTargetAtTime(430 + Math.sin(t * 7) * 40 + laser * 160, now, 0.1);
    this.whirGain!.gain.setTargetAtTime(saw * 0.09, now, 0.08);
    this.whirFilter!.frequency.setTargetAtTime(1700 + saw * 1500 + Math.sin(t * 18) * 150, now, 0.05);
  }

  /** Level hazard one-shots. `vol` is 0..1 (distance attenuation done by the caller). */
  hazard(kind: string, vol: number): void {
    if (!this.ctx || vol <= 0.01) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, vol);
    switch (kind) {
      case 'crusher-warn':
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.2, 'square', 880, 880, 0.09, 0.1 * v);
        break;
      case 'crusher-slam':
        this.tone(t, 'sine', 95, 28, 0.4, 0.9 * v);
        this.noiseBurst(t, 0.28, 0.6 * v, 'lowpass', 1400, 120);
        this.tone(t + 0.02, 'square', 220, 90, 0.12, 0.2 * v);
        break;
      case 'laser-on':
        this.tone(t, 'sawtooth', 300, 1400, 0.12, 0.12 * v);
        break;
      case 'laser-charge':
        this.tone(t, 'triangle', 600, 900, 0.08, 0.1 * v);
        break;
      case 'laser-zap':
        this.noiseBurst(t, 0.25, 0.5 * v, 'highpass', 3000, 800);
        this.tone(t, 'sawtooth', 1800, 90, 0.3, 0.25 * v);
        break;
      case 'boost':
        this.noiseBurst(t, 0.45, 0.28 * v, 'bandpass', 500, 3500, 0.9);
        this.tone(t, 'sawtooth', 180, 520, 0.3, 0.1 * v);
        break;
      case 'bounce':
        this.tone(t, 'sine', 200, 720, 0.28, 0.4 * v);
        this.tone(t + 0.04, 'triangle', 400, 1000, 0.2, 0.15 * v);
        break;
      case 'cannon-charge':
        this.tone(t, 'sawtooth', 90, 340, 0.5, 0.2 * v);
        break;
      case 'cannon':
        this.tone(t, 'sine', 120, 30, 0.5, 0.9 * v);
        this.noiseBurst(t, 0.4, 0.55 * v, 'lowpass', 2400, 200);
        break;
      case 'switch':
        this.tone(t, 'square', 300, 220, 0.06, 0.18 * v);
        this.tone(t + 0.07, 'square', 520, 440, 0.07, 0.15 * v);
        break;
      case 'crumble':
        this.noiseBurst(t, 0.5, 0.45 * v, 'lowpass', 900, 120);
        break;
      case 'fall-warn':
        this.noiseBurst(t, 0.6, 0.18 * v, 'lowpass', 400, 160);
        this.tone(t + 0.1, 'square', 1200, 900, 0.05, 0.07 * v);
        break;
      case 'fall-hit':
        this.tone(t, 'sine', 140, 40, 0.3, 0.7 * v);
        this.noiseBurst(t, 0.2, 0.4 * v, 'lowpass', 1800, 200);
        break;
      case 'tnt-fuse':
        this.noiseBurst(t, 0.4, 0.2 * v, 'highpass', 4000, 6000);
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.1, 'square', 1000, 1000, 0.04, 0.08 * v);
        break;
      case 'explosion':
        this.tone(t, 'sine', 90, 22, 0.9, 1 * v);
        this.noiseBurst(t, 0.8, 0.9 * v, 'lowpass', 3000, 90);
        this.noiseBurst(t, 0.2, 0.6 * v, 'highpass', 1500, 600);
        break;
      case 'boulder':
        this.noiseBurst(t, 0.9, 0.4 * v, 'lowpass', 500, 100);
        break;
      case 'transform':
        [440, 554, 659, 880].forEach((f, i) => this.tone(t + i * 0.06, 'triangle', f, f * 1.02, 0.18, 0.16 * v));
        break;
    }
  }

  /**
   * Per-frame engine update.
   * @param speedFrac 0..1 of top speed, @param load 0..1 throttle, @param grounded wheels on ground
   */
  engine(speedFrac: number, load: number, grounded: boolean, alive: boolean): void {
    if (!this.ctx || !this.engOsc1) return;
    const t = this.ctx.currentTime;
    // Faux 3-speed gearbox: RPM sweeps up then drops at each shift, giving that engine character.
    const gear = Math.min(2, Math.floor(speedFrac * 3));
    const rpm = Math.min(1, speedFrac * 3 - gear + (load > 0.1 ? 0.12 : 0));
    const freq = 52 + rpm * 62 + gear * 14 + (grounded ? 0 : load * 40);
    this.engOsc1!.frequency.setTargetAtTime(freq, t, 0.04);
    this.engOsc2!.frequency.setTargetAtTime(freq * 0.5, t, 0.04);
    this.engFilter!.frequency.setTargetAtTime(260 + rpm * 520 + load * 340, t, 0.05);
    const g = alive ? 0.05 + load * 0.07 + speedFrac * 0.03 : 0;
    this.engGain!.gain.setTargetAtTime(g, t, 0.06);
    const roll = alive && grounded ? Math.min(1, speedFrac * 1.4) * 0.07 : 0;
    this.rollGain!.gain.setTargetAtTime(roll, t, 0.08);
    this.rollFilter!.frequency.setTargetAtTime(220 + speedFrac * 900, t, 0.1);
  }

  silenceEngine(): void {
    if (!this.ctx || !this.engGain) return;
    this.engGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    this.rollGain!.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
  }

  // ------------------------------------------------------------------ one-shots

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseBurst(t: number, dur: number, peak: number, filterType: BiquadFilterType, f0: number, f1: number, q = 1): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.005, peak, dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, dest: AudioNode = this.sfx): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.004, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Suspension / landing thump scaled by impact (Δv m/s). */
  thump(impact: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, impact / 14);
    this.tone(t, 'sine', 130, 42, 0.16 + k * 0.1, 0.25 + k * 0.5);
    this.noiseBurst(t, 0.09 + k * 0.08, 0.1 + k * 0.28, 'lowpass', 700, 120);
  }

  /** Metal crunch with a few cartoony clanks and a boom. */
  crash(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.35, 0.7, 'bandpass', 2600, 300, 0.6);
    this.noiseBurst(t, 0.2, 0.6, 'highpass', 1800, 900);
    this.tone(t, 'sine', 110, 28, 0.45, 0.8);
    for (let i = 0; i < 5; i++) {
      const dt = 0.03 + i * 0.07 + Math.random() * 0.03;
      this.tone(t + dt, 'square', 380 + Math.random() * 900, 120 + Math.random() * 100, 0.1, 0.12);
    }
    // little comedic "boing" from the driver's head
    this.tone(t + 0.12, 'sine', 240, 520, 0.2, 0.18);
  }

  /** Star pickup chime; `i` = 0..2 climbs the pentatonic scale. */
  chime(i = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const scale = [659.25, 783.99, 987.77, 1318.5];
    const f = scale[Math.min(i, scale.length - 1)];
    this.tone(t, 'triangle', f, f, 0.5, 0.28);
    this.tone(t + 0.02, 'sine', f * 2, f * 2, 0.35, 0.1);
  }

  checkpoint(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'triangle', 523, 523, 0.18, 0.22);
    this.tone(t + 0.1, 'triangle', 784, 784, 0.3, 0.22);
  }

  click(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 'square', 520, 340, 0.06, 0.1);
  }

  hover(): void {
    if (!this.ctx) return;
    this.tone(this.ctx.currentTime, 'triangle', 700, 760, 0.04, 0.05);
  }

  fanfare(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(t + i * 0.1, 'square', f, f, 0.28, 0.14);
      this.tone(t + i * 0.1, 'triangle', f / 2, f / 2, 0.3, 0.2);
    });
    this.tone(t + 0.45, 'triangle', 1318.5, 1318.5, 0.7, 0.2);
  }

  /** Quick whoosh for the screen wipe / respawn. */
  whoosh(): void {
    if (!this.ctx) return;
    this.noiseBurst(this.ctx.currentTime, 0.22, 0.14, 'bandpass', 400, 2400, 0.8);
  }
}
