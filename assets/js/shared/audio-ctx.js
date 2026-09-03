export class SharedAudioEngine {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.masterGain = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  createSource() {
    const src = this.ctx.createMediaElementSource.bind(this.ctx);
    return { connect: (node) => src(node).connect(this.analyser) };
  }

  get frequencyBinCount() {
    return this.analyser ? this.analyser.frequencyBinCount : 1024;
  }

  getByteTimeDomainData(arr) {
    if (this.analyser) this.analyser.getByteTimeDomainData(arr);
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}

export const sharedAudio = new SharedAudioEngine();
