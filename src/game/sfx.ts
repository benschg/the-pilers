// Soundeffekte – werden direkt im Browser erzeugt (keine Dateien nötig)

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  // Muss nach einem Klick aufgerufen werden (Browser-Regel)
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* kein Ton möglich */
    }
  }

  private ok(vol: number) {
    return !!this.ctx && !!this.master && !this.muted && vol > 0.01;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, to?: number, delay = 0) {
    if (!this.ok(vol)) return;
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, type: BiquadFilterType, freq: number, toFreq?: number, delay = 0) {
    if (!this.ok(vol) || !this.noiseBuf) return;
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (toFreq) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  shot(kind: string, v = 1) {
    switch (kind) {
      case "rifle":
        this.noise(0.07, 0.5 * v, "highpass", 1800);
        this.tone(700, 0.06, "square", 0.08 * v, 250);
        break;
      case "sniper":
        this.noise(0.45, 0.9 * v, "lowpass", 2500, 300);
        this.tone(160, 0.35, "sawtooth", 0.25 * v, 45);
        break;
      case "shotgun":
        this.noise(0.3, 1 * v, "lowpass", 1600, 200);
        this.tone(110, 0.2, "square", 0.2 * v, 40);
        break;
      case "smg":
        this.noise(0.05, 0.35 * v, "highpass", 2500);
        break;
      case "minigun":
        this.noise(0.04, 0.3 * v, "bandpass", 1400);
        this.tone(220, 0.04, "square", 0.05 * v, 120);
        break;
      case "rocket":
        this.noise(0.6, 0.6 * v, "bandpass", 600, 2000);
        this.tone(90, 0.4, "sawtooth", 0.15 * v, 200);
        break;
      case "bow":
        this.tone(320, 0.18, "triangle", 0.3 * v, 140);
        this.noise(0.12, 0.2 * v, "bandpass", 3000);
        break;
      case "raygun":
        this.tone(1400, 0.16, "square", 0.12 * v, 280);
        this.tone(2100, 0.12, "sine", 0.1 * v, 600);
        break;
    }
  }

  hit(head: boolean) {
    this.tone(head ? 1500 : 950, 0.09, "sine", 0.35);
    if (head) this.tone(2200, 0.12, "sine", 0.2, undefined, 0.04);
  }

  hurt() {
    this.tone(220, 0.14, "square", 0.15, 110);
  }

  explode(v = 1) {
    this.noise(0.9, 1 * v, "lowpass", 900, 80);
    this.tone(90, 0.6, "sine", 0.5 * v, 30);
  }

  pickup() {
    this.tone(660, 0.1, "triangle", 0.25);
    this.tone(990, 0.15, "triangle", 0.25, undefined, 0.08);
  }

  heal() {
    this.tone(400, 0.35, "sine", 0.25, 900);
    this.tone(600, 0.35, "sine", 0.15, 1300, 0.05);
  }

  jump() {
    this.tone(280, 0.12, "sine", 0.15, 520);
  }

  boing(v = 1) {
    this.tone(150, 0.35, "sine", 0.4 * v, 700);
  }

  build(v = 1) {
    for (let i = 0; i < 3; i++) this.noise(0.06, 0.5 * v, "bandpass", 500 + i * 120, undefined, i * 0.07);
  }

  elim() {
    [880, 1100, 1320].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.3, undefined, i * 0.07));
  }

  chest() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, "sine", 0.22, undefined, i * 0.09));
  }

  win() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, i === 5 ? 0.6 : 0.2, "triangle", 0.3, undefined, i * 0.14));
  }
}
