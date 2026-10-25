// Fabrics audio: CC0 freesound recordings, motion-driven loops (rustle, flap, wind, fire) and one-shots, plus the blow-into-the-mic sensor.
const FILES = ['rustle', 'flap', 'wind', 'fire', 'snip1', 'snip2', 'tear1', 'tear2', 'ignite', 'thud1', 'thud2', 'drip'];

export class Sound {
  constructor() {
    this.ctx = null; this.buf = {}; this.loops = {}; this.muted = false; this.last = {};
    this.mic = null; this.micLevel = 0;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);
    FILES.forEach(name => fetch(`assets/audio/${name}.mp3`).then(r => r.arrayBuffer()).then(a => this.ctx.decodeAudioData(a)).then(b => {
      this.buf[name] = b;
      if (['rustle', 'flap', 'wind', 'fire'].includes(name)) this.startLoop(name);
    }).catch(() => {}));
  }
  startLoop(name) {
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = this.buf[name]; s.loop = true; s.loopStart = 0.05; s.loopEnd = s.buffer.duration - 0.05;
    g.gain.value = 0;
    s.connect(g).connect(this.master);
    s.start(0, Math.random() * s.buffer.duration * 0.8);
    this.loops[name] = { s, g, v: 0 };
  }
  level(name, v, rate = 1) {
    const l = this.loops[name];
    if (!l) return;
    v = Math.max(0, Math.min(1, v));
    l.v += (v - l.v) * 0.15;
    l.g.gain.setTargetAtTime(l.v, this.ctx.currentTime, 0.05);
    l.s.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
  }
  play(names, vol = 1, gap = 0.08, rate = 1) {
    if (!this.ctx || this.muted) return;
    const name = Array.isArray(names) ? names[(Math.random() * names.length) | 0] : names;
    const key = Array.isArray(names) ? names[0] : names;
    const now = this.ctx.currentTime;
    if (now - (this.last[key] || 0) < gap || !this.buf[name]) return;
    this.last[key] = now;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = this.buf[name]; s.playbackRate.value = rate * (0.92 + Math.random() * 0.16);
    g.gain.value = Math.min(1, vol);
    s.connect(g).connect(this.master); s.start();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  async enableMic() {
    this.unlock();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = this.ctx.createMediaStreamSource(stream);
    const an = this.ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.2;
    src.connect(an);
    this.mic = { stream, an, data: new Uint8Array(an.frequencyBinCount) };
  }
  disableMic() {
    if (!this.mic) return;
    this.mic.stream.getTracks().forEach(t => t.stop());
    this.mic = null; this.micLevel = 0;
  }
  readMic() {
    if (!this.mic) return 0;
    const { an, data } = this.mic;
    an.getByteFrequencyData(data);
    let lo = 0;
    const n = Math.min(40, data.length);
    for (let i = 2; i < n; i++) lo += data[i];
    lo /= (n - 2) * 255;
    const v = Math.max(0, (lo - 0.28) / 0.4);
    this.micLevel += (Math.min(1, v) - this.micLevel) * (v > this.micLevel ? 0.5 : 0.08);
    return this.micLevel;
  }
}
