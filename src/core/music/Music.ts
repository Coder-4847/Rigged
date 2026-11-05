import { NoteEvent, TrackDef, TrackId, generate } from './tracks';

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** One playing track: owns its output gain (for crossfades) and its scheduling cursor. */
class Voice {
  readonly out: GainNode;
  private def: TrackDef;
  private steps: number;
  private stepDur: number;
  private next = 0; // next absolute step to schedule
  private t0: number; // time of absolute step 0
  private echo: GainNode;
  private delay: DelayNode;
  private byStep: NoteEvent[][];

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
    id: TrackId,
    private noise: AudioBuffer,
    startTime: number,
  ) {
    const g = generate(id);
    this.def = g.def;
    this.steps = g.steps;
    this.stepDur = 60 / g.def.bpm / 4;
    this.t0 = startTime;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    // dotted-eighth echo shared by lead and pad
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = this.stepDur * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.55 * this.def.echo;
    this.echo.connect(this.delay);
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(this.out);
    this.byStep = Array.from({ length: this.steps }, () => [] as NoteEvent[]);
    for (const e of g.events) this.byStep[e.step % this.steps].push(e);
  }

  /** Schedule every step that starts before `until` (audio-clock seconds). */
  pump(until: number): void {
    while (this.t0 + this.next * this.stepDur < until) {
      const time = this.t0 + this.next * this.stepDur;
      for (const e of this.byStep[this.next % this.steps]) this.play(e, Math.max(time, this.ctx.currentTime));
      this.next++;
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, hold: number, r: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }

  private tone(t: number, midi: number, wave: OscillatorType, peak: number, a: number, hold: number, r: number, cutoff: number, send = 0, detune = 0): void {
    const o = this.ctx.createOscillator();
    o.type = wave;
    o.frequency.value = mtof(midi);
    o.detune.value = detune;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.45), t + a + hold + r);
    const g = this.ctx.createGain();
    this.env(g, t, a, peak, hold, r);
    o.connect(f).connect(g);
    g.connect(this.out);
    if (send > 0) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.echo);
    }
    o.start(t);
    o.stop(t + a + hold + r + 0.05);
  }

  private hit(t: number, kind: 'kick' | 'snare' | 'hat', vel: number): void {
    const c = this.ctx;
    if (kind === 'kick') {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      const g = c.createGain();
      this.env(g, t, 0.002, 0.5 * vel, 0.02, 0.2);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.3);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7500 : 1800;
    f.Q.value = 0.8;
    const g = c.createGain();
    this.env(g, t, 0.001, (kind === 'hat' ? 0.1 : 0.2) * vel, 0.005, kind === 'hat' ? 0.05 : 0.14);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, 0.1);
    src.stop(t + 0.25);
  }

  private play(e: NoteEvent, t: number): void {
    const d = this.def;
    const len = e.len * this.stepDur;
    switch (e.kind) {
      case 'pad':
        for (const [i, n] of (e.notes ?? [e.midi]).entries()) {
          this.tone(t, n, 'triangle', 0.045 * e.vel, 0.5, Math.max(0.1, len - 0.9), 0.9, 1400, 0.25, i % 2 ? 7 : -7);
          this.tone(t, n + 12, 'sine', 0.02 * e.vel, 0.6, Math.max(0.1, len - 1), 1, 2000, 0.4);
        }
        break;
      case 'bass':
        this.tone(t, e.midi, d.bass.wave, 0.12 * e.vel, 0.01, len * 0.55, 0.12, d.bass.cutoff);
        break;
      case 'lead':
        this.tone(t, e.midi, d.lead.wave, 0.07 * e.vel, 0.006, 0.04, Math.max(0.25, len * 0.9), d.lead.cutoff, 1);
        break;
      case 'kick':
      case 'snare':
      case 'hat':
        this.hit(t, e.kind, e.vel);
        break;
    }
  }

  dispose(): void {
    this.out.disconnect();
    this.echo.disconnect();
    this.delay.disconnect();
  }
}

/**
 * Looping generative music with crossfades between tracks, a "muffle" for pause menus and ducking for
 * crashes / fanfares. Works with a real or an Offline context (so it can be rendered in tests).
 */
export class Music {
  private voices: Array<{ v: Voice; fading: boolean; fadeEnd: number }> = [];
  private tone: BiquadFilterNode;
  private level: GainNode;
  private noise: AudioBuffer;
  private timer: ReturnType<typeof setInterval> | null = null;
  private muffled = false;
  current: TrackId | null = null;

  constructor(
    private ctx: BaseAudioContext,
    dest: AudioNode,
  ) {
    this.level = ctx.createGain();
    this.level.gain.value = 0.55;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.tone.connect(this.level).connect(dest);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Start (or crossfade to) a track. Re-selecting the current track does nothing. */
  play(id: TrackId, at = this.ctx.currentTime): void {
    if (this.current === id) return;
    this.current = id;
    const now = this.ctx.currentTime;
    for (const o of this.voices) this.fade(o, 1.2, now);
    const v = new Voice(this.ctx, this.tone, id, this.noise, at);
    v.out.gain.setValueAtTime(0, at);
    v.out.gain.linearRampToValueAtTime(1, at + 1.4);
    this.voices.push({ v, fading: false, fadeEnd: 0 });
    if (!this.timer && typeof AudioContext !== 'undefined' && this.ctx instanceof AudioContext) this.timer = setInterval(() => this.pump(), 60);
    this.pump();
  }

  private fade(o: { v: Voice; fading: boolean; fadeEnd: number }, secs: number, now: number): void {
    if (o.fading) return;
    o.fading = true;
    o.fadeEnd = now + secs;
    o.v.out.gain.cancelScheduledValues(now);
    o.v.out.gain.setValueAtTime(o.v.out.gain.value, now);
    o.v.out.gain.linearRampToValueAtTime(0, now + secs);
  }

  /** Schedule ahead of the audio clock; also reaps voices whose fade-out finished. */
  pump(until = this.ctx.currentTime + 0.35): void {
    const now = this.ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const o = this.voices[i];
      if (o.fading && now > o.fadeEnd + 0.1) {
        o.v.dispose();
        this.voices.splice(i, 1);
        continue;
      }
      if (!o.fading) o.v.pump(until);
    }
  }

  /** Offline rendering helper: schedule the whole [0, seconds) range for the current track. */
  scheduleAll(seconds: number): void {
    for (const o of this.voices) o.v.pump(seconds);
  }

  stop(fade = 0.6): void {
    this.current = null;
    const now = this.ctx.currentTime;
    for (const o of this.voices) this.fade(o, fade, now);
  }

  /** Pause menus: soften and darken the music instead of cutting it. */
  setMuffled(m: boolean): void {
    if (m === this.muffled) return;
    this.muffled = m;
    const t = this.ctx.currentTime;
    this.tone.frequency.cancelScheduledValues(t);
    this.tone.frequency.setTargetAtTime(m ? 700 : 18000, t, 0.15);
    this.level.gain.setTargetAtTime(m ? 0.32 : 0.55, t, 0.15);
  }

  /** Briefly lower the music (crash crunch, fanfare). */
  duck(seconds = 0.6, depth = 0.25): void {
    const t = this.ctx.currentTime;
    const base = this.muffled ? 0.32 : 0.55;
    this.level.gain.cancelScheduledValues(t);
    this.level.gain.setValueAtTime(this.level.gain.value, t);
    this.level.gain.linearRampToValueAtTime(base * depth, t + 0.04);
    this.level.gain.linearRampToValueAtTime(base, t + seconds);
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stop(0.1);
  }
}
