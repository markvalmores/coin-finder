// Synthesized Web Audio API Parlor Sound Effects

class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playCoinClink() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Metallic sovereign coin ring (two high harmonic sine tones)
    const freqs = [1864.66, 2793.83, 3729.31];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.025);

      gain.gain.setValueAtTime(0.001, now + idx * 0.025);
      gain.gain.exponentialRampToValueAtTime(0.11 / (idx + 1), now + idx * 0.025 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.025 + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.025);
      osc.stop(now + idx * 0.025 + 0.4);
    });
  }

  public playBlanketClose() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playBlanketOpen() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(390, now + 0.26);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public playHatLift() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.14);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playGuessCorrect() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Bright major triad arpeggio (Seeker found the coin!)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0.001, now + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.4);
    });
  }

  public playGuessMiss() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sly parlor bluff cadence (Seeker missed, Hider scores!)
    const notes = [392.0, 349.23, 311.13];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.001, now + idx * 0.11);
      gain.gain.linearRampToValueAtTime(0.07, now + idx * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.3);
    });
  }

  public playMatchVictory() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const fanfare = [
      { freq: 523.25, delay: 0, dur: 0.18 },
      { freq: 659.25, delay: 0.12, dur: 0.18 },
      { freq: 783.99, delay: 0.24, dur: 0.18 },
      { freq: 1046.5, delay: 0.38, dur: 0.55 },
      { freq: 1318.5, delay: 0.52, dur: 0.65 },
    ];

    fanfare.forEach(({ freq, delay, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);

      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.linearRampToValueAtTime(0.16, now + delay + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.05);
    });
  }
}

export const sound = new SoundEngine();
