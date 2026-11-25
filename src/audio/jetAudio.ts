import type { FlightTelemetry } from '../core/types';

/**
 * Pure Procedural Web Audio Jet Engine & Atmosphere Synthesizer:
 * - Twin jet turbine whine (harmonic oscillators + bandpass)
 * - Broadband jet exhaust roar & supersonic afterburner sub-rumble
 * - Speed/G-load airframe wind rush
 * - Cloud penetration enveloping whoosh
 */
export class JetAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private turbineOsc1: OscillatorNode | null = null;
  private turbineOsc2: OscillatorNode | null = null;
  private turbineGain: GainNode | null = null;

  private exhaustFilter: BiquadFilterNode | null = null;
  private exhaustGain: GainNode | null = null;

  private abFilter: BiquadFilterNode | null = null;
  private abGain: GainNode | null = null;

  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private cloudFilter: BiquadFilterNode | null = null;
  private cloudGain: GainNode | null = null;

  private enabled = false;
  private initialized = false;

  private createNoiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
    const length = ctx.sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Pink-ish weighted noise for richer acoustic jet & wind timbre
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.12;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private init(): void {
    if (this.initialized) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    this.masterGain = master;

    const noiseBuf = this.createNoiseBuffer(ctx, 3);
    const makeLoopNoise = () => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      src.start();
      return src;
    };

    // 1. Twin turbine core whine
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 260;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 524;
    const turbFilter = ctx.createBiquadFilter();
    turbFilter.type = 'bandpass';
    turbFilter.frequency.value = 620;
    turbFilter.Q.value = 2.4;
    const turbGain = ctx.createGain();
    turbGain.gain.value = 0.03;
    osc1.connect(turbFilter);
    osc2.connect(turbFilter);
    turbFilter.connect(turbGain);
    turbGain.connect(master);
    osc1.start();
    osc2.start();
    this.turbineOsc1 = osc1;
    this.turbineOsc2 = osc2;
    this.turbineGain = turbGain;

    // 2. Main jet exhaust broadband roar
    const exSrc = makeLoopNoise();
    const exFilter = ctx.createBiquadFilter();
    exFilter.type = 'lowpass';
    exFilter.frequency.value = 340;
    exFilter.Q.value = 0.8;
    const exGain = ctx.createGain();
    exGain.gain.value = 0.18;
    exSrc.connect(exFilter);
    exFilter.connect(exGain);
    exGain.connect(master);
    this.exhaustFilter = exFilter;
    this.exhaustGain = exGain;

    // 3. Afterburner thunderous sub-roar
    const abSrc = makeLoopNoise();
    const abFilter = ctx.createBiquadFilter();
    abFilter.type = 'bandpass';
    abFilter.frequency.value = 110;
    abFilter.Q.value = 0.7;
    const abGain = ctx.createGain();
    abGain.gain.value = 0.0;
    abSrc.connect(abFilter);
    abFilter.connect(abGain);
    abGain.connect(master);
    this.abFilter = abFilter;
    this.abGain = abGain;

    // 4. High-speed airflow / wind rush
    const wSrc = makeLoopNoise();
    const wFilter = ctx.createBiquadFilter();
    wFilter.type = 'bandpass';
    wFilter.frequency.value = 950;
    wFilter.Q.value = 1.2;
    const wGain = ctx.createGain();
    wGain.gain.value = 0.05;
    wSrc.connect(wFilter);
    wFilter.connect(wGain);
    wGain.connect(master);
    this.windFilter = wFilter;
    this.windGain = wGain;

    // 5. Cloud penetration enveloping whoosh
    const cSrc = makeLoopNoise();
    const cFilter = ctx.createBiquadFilter();
    cFilter.type = 'bandpass';
    cFilter.frequency.value = 420;
    cFilter.Q.value = 0.9;
    const cGain = ctx.createGain();
    cGain.gain.value = 0.0;
    cSrc.connect(cFilter);
    cFilter.connect(cGain);
    cGain.connect(master);
    this.cloudFilter = cFilter;
    this.cloudGain = cGain;

    this.initialized = true;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    }
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(enabled ? 0.32 : 0.0, this.ctx.currentTime, 0.12);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public update(telemetry: FlightTelemetry, isCockpit: boolean): void {
    if (!this.initialized || !this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const cockpitDamp = isCockpit ? 0.62 : 1.0;

    // Turbine RPM pitch tracking
    const rpm = 0.45 + telemetry.throttle * 0.55;
    this.turbineOsc1?.frequency.setTargetAtTime(190 + rpm * 290, now, 0.08);
    this.turbineOsc2?.frequency.setTargetAtTime(385 + rpm * 590, now, 0.08);
    this.turbineGain?.gain.setTargetAtTime((0.015 + telemetry.throttle * 0.025) * cockpitDamp, now, 0.08);

    // Exhaust roar
    this.exhaustFilter?.frequency.setTargetAtTime(
      (220 + telemetry.throttle * 520 + telemetry.afterburner * 620) * (isCockpit ? 0.7 : 1.0),
      now,
      0.08
    );
    this.exhaustGain?.gain.setTargetAtTime(
      (0.14 + telemetry.throttle * 0.24) * cockpitDamp,
      now,
      0.08
    );

    // Afterburner thunder rumble
    this.abFilter?.frequency.setTargetAtTime(85 + telemetry.afterburner * 145, now, 0.08);
    this.abGain?.gain.setTargetAtTime(telemetry.afterburner * 0.52 * cockpitDamp, now, 0.1);

    // Wind rush scales with Mach & G-load buffet
    const machNorm = Math.min(1.5, telemetry.mach / 1.4);
    const gBuffet = Math.max(0, Math.abs(telemetry.gForce) - 2.0) * 0.08;
    this.windFilter?.frequency.setTargetAtTime(620 + machNorm * 1150, now, 0.08);
    this.windGain?.gain.setTargetAtTime(
      Math.min(0.32, 0.04 + machNorm * 0.14 + gBuffet),
      now,
      0.08
    );

    // Cloud penetration enveloping swoosh
    const cloudLevel = Math.min(1.0, telemetry.cloudDensity * 2.5);
    this.cloudFilter?.frequency.setTargetAtTime(320 + cloudLevel * 480, now, 0.12);
    this.cloudGain?.gain.setTargetAtTime(cloudLevel * 0.34, now, 0.14);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
