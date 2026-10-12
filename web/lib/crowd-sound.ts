// Stadium crowd ambience, synthesised with the Web Audio API (no audio files).
//
// Pink noise runs through band-pass filters at voice-like frequencies; each band's level flutters at speech
// rates, which turns rushing noise into a murmur of many voices. Slow swells come and go on their own, and
// cheer() adds a short roar (a correct answer, louder for rarer tiers). Browsers only allow sound after a
// tap or key press, so start() must be called from one.

const BANDS = [260, 420, 640, 900, 1250, 1750, 2500];
const LEVEL = 0.32;          // master gain. Rendered offline: murmur -32 dBFS RMS, biggest cheer -22 dBFS RMS (peak -9)
const FLUTTER_MS = 110;
const FX_LEVEL = 0.5;        // gate smashes in the tier reveal

export class CrowdSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private bus: AudioNode | null = null;         // into the crowd's tone filter, after the swell
  private noise: AudioBuffer | null = null;
  private swell: GainNode | null = null;
  private bands: GainNode[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextSwell = 0;
  private muted = false;

  /** Builds the graph on first use; later calls just resume a suspended context. */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.swell = ctx.createGain();
    this.swell.gain.value = 1;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3200;
    this.swell.connect(tone).connect(this.master).connect(ctx.destination);
    this.bus = tone;

    this.fx = ctx.createGain();
    this.fx.gain.value = 0;
    this.fx.connect(ctx.destination);
    const noise = pinkNoise(ctx, 4);
    this.noise = noise;
    for (const f of BANDS) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = f * (0.95 + Math.random() * 0.1);
      band.Q.value = 1.6;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      src.connect(band).connect(gain).connect(this.swell);
      src.start(0, Math.random() * noise.duration);
      this.bands.push(gain);
    }
    this.nextSwell = ctx.currentTime + 6;
    this.timer = setInterval(() => this.tick(), FLUTTER_MS);
    this.setMuted(this.muted);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : LEVEL, this.ctx.currentTime, muted ? 0.15 : 1.2);
    this.fx?.gain.setTargetAtTime(muted ? 0 : FX_LEVEL, this.ctx.currentTime, 0.05);
    if (!muted) void this.ctx.resume();
  }

  /** A roar on top of the murmur; strength 0..1. */
  cheer(strength: number) {
    if (!this.ctx || !this.swell) return;
    const t = this.ctx.currentTime;
    const peak = 1.5 + 2.8 * Math.max(0, Math.min(1, strength));      // louder for every tier
    this.swell.gain.cancelScheduledValues(t);
    this.swell.gain.setTargetAtTime(peak, t, 0.12);
    this.swell.gain.setTargetAtTime(1, t + 0.9 + strength * 1.6, 0.6);
    this.nextSwell = t + 10 + Math.random() * 10;
  }

  /** A missed chance: many voices sliding down from "ooh" to "aww", then the murmur settles for a while. */
  groan() {
    if (!this.ctx || !this.bus || !this.swell || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(4.4, t + 0.25);           // rendered offline: -21.5 dBFS RMS, peak -9
    env.gain.setValueAtTime(4.4, t + 0.85);
    env.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    const f1 = ctx.createBiquadFilter();                       // first formant: "ooh" (~400 Hz) opening to "aww" (~650)
    f1.type = "bandpass";
    f1.Q.value = 3;
    f1.frequency.setValueAtTime(380, t);
    f1.frequency.linearRampToValueAtTime(650, t + 1.2);
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.Q.value = 4;
    f2.frequency.setValueAtTime(850, t);
    f2.frequency.linearRampToValueAtTime(1050, t + 1.2);
    const voices = ctx.createGain();
    voices.gain.value = 1 / 14;
    voices.connect(f1).connect(env);
    voices.connect(f2).connect(env);
    env.connect(this.bus);
    for (let i = 0; i < 14; i++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const f0 = (i % 3 ? 120 : 200) + Math.random() * 70;     // mostly low voices, some higher
      o.frequency.setValueAtTime(f0 * 1.1, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + 1.6);
      o.detune.value = (Math.random() - 0.5) * 40;
      o.connect(voices);
      o.start(t + Math.random() * 0.12);
      o.stop(t + 2.1);
    }
    const breath = ctx.createBufferSource();                   // the breathy part of a crowd's "ooh"
    breath.buffer = this.noise;
    const bg = ctx.createGain();
    bg.gain.value = 0.5;
    breath.connect(bg).connect(f1);
    breath.start(t, Math.random() * 2, 2.1);
    this.swell.gain.cancelScheduledValues(t);                  // then the stands quieten down
    this.swell.gain.setTargetAtTime(0.55, t + 1.2, 0.5);
    this.swell.gain.setTargetAtTime(1, t + 5, 1.5);
    this.nextSwell = t + 12 + Math.random() * 8;
  }

  /** One gate smashed in the tier reveal: a crack of noise over a low thud. depth 0..1, louder further in. */
  smash(depth: number) {
    if (!this.ctx || !this.fx || !this.noise) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const k = 0.55 + 0.45 * Math.max(0, Math.min(1, depth));

    const crack = ctx.createBufferSource();
    crack.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 700;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0, t);
    cg.gain.linearRampToValueAtTime(0.9 * k, t + 0.004);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    crack.connect(hp).connect(cg).connect(this.fx);
    crack.start(t, Math.random() * 3, 0.2);

    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(130, t);
    thud.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0, t);
    tg.gain.linearRampToValueAtTime(0.8 * k, t + 0.006);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    thud.connect(tg).connect(this.fx);
    thud.start(t);
    thud.stop(t + 0.25);
  }

  private tick() {
    if (!this.ctx || !this.swell) return;
    const t = this.ctx.currentTime;
    for (const g of this.bands) g.gain.setTargetAtTime(0.25 + Math.random() * 0.75, t, 0.04);
    if (t >= this.nextSwell) {                       // the crowd rises on its own now and then
      this.swell.gain.setTargetAtTime(1.35 + Math.random() * 0.4, t, 0.5);
      this.swell.gain.setTargetAtTime(1, t + 1.5 + Math.random(), 0.8);
      this.nextSwell = t + 8 + Math.random() * 14;
    }
  }
}

/** `seconds` of stereo pink noise (Paul Kellet's filter), normalised to a 0.5 peak. */
function pinkNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      peak = Math.max(peak, Math.abs(data[i]));
    }
    for (let i = 0; i < len; i++) data[i] = (data[i] / peak) * 0.5;
  }
  return buf;
}

export { pinkNoise };
