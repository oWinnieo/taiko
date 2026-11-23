import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';

export type DrumSide = 'don' | 'ka';
export type DrumHand = 'left' | 'right' | 'both';
export type SynthSfxName =
  | 'menuMove'
  | 'menuDecide'
  | 'cancel'
  | 'pause'
  | 'balloonPop'
  | 'clear'
  | 'fail'
  | 'crown';

export interface DrumPackOption {
  id: string;
  label: string;
  donUrl: string;
  kaUrl: string;
}

export const DRUM_PACKS: DrumPackOption[] = [
  {
    id: 'default',
    label: '经典太鼓（默认）',
    donUrl: '/assets/audio/drums/se_don.ogg',
    kaUrl: '/assets/audio/drums/se_ka.ogg',
  },
  ...Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    return {
      id: `neiro_${n}`,
      label: `音色包 #${n}`,
      donUrl: `/assets/audio/drums/neiro_${n}_don.ogg`,
      kaUrl: `/assets/audio/drums/neiro_${n}_ka.ogg`,
    };
  }),
];

/**
 * High-precision Web Audio engine.
 * - Uses AudioContext.currentTime as single master clock
 * - Pre-decodes drum hits to AudioBuffer for zero-latency playback
 * - Automatically falls back to WASM Ogg Vorbis decoding on Safari / WKWebView
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;

  private musicVolume = 0.78;
  private sfxVolume = 0.92;
  private voiceVolume = 0.85;

  private bufferCache = new Map<string, AudioBuffer>();
  private loadingPromises = new Map<string, Promise<AudioBuffer | null>>();

  private activeDrumPackId = 'default';
  private donBuffer: AudioBuffer | null = null;
  private kaBuffer: AudioBuffer | null = null;

  // Music playback clock state (supports negative lead-in time before audio t=0)
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicStartCtxTime = 0; // ctx.currentTime corresponding to song time 0ms
  private musicPausedAtMs: number | null = null;
  private musicPlaying = false;
  private musicScheduledStart = false;
  private previewSource: AudioBufferSourceNode | null = null;

  private oggDecoder: OggVorbisDecoder | null = null;

  ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.voiceGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.sfxGain.gain.value = this.sfxVolume;
      this.voiceGain.gain.value = this.voiceVolume;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.voiceGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  setVolumes(music: number, sfx: number, voice: number): void {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    this.voiceVolume = Math.max(0, Math.min(1, voice));
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    if (this.voiceGain) this.voiceGain.gain.value = this.voiceVolume;
  }

  getOutputLatencyMs(): number {
    if (!this.ctx) return 0;
    const base = this.ctx.baseLatency ?? 0;
    const out = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return (base + out) * 1000;
  }

  async decodeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const copy = arrayBuffer.slice(0);
    try {
      return await ctx.decodeAudioData(copy);
    } catch {
      // Fallback for Safari / macOS WKWebView when decoding Ogg Vorbis
      const bytes = new Uint8Array(arrayBuffer);
      const isOgg =
        bytes.length >= 4 &&
        bytes[0] === 0x4f &&
        bytes[1] === 0x67 &&
        bytes[2] === 0x67 &&
        bytes[3] === 0x53;
      if (!isOgg) {
        throw new Error('Failed to decode audio buffer');
      }
      if (!this.oggDecoder) {
        this.oggDecoder = new OggVorbisDecoder();
        await this.oggDecoder.ready;
      }
      const decoded = await this.oggDecoder.decodeFile(bytes);
      await this.oggDecoder.reset();
      const channels = Math.max(1, decoded.channelData.length);
      const length = decoded.channelData[0]?.length ?? 0;
      const audioBuf = ctx.createBuffer(channels, length, decoded.sampleRate || 44100);
      for (let ch = 0; ch < channels; ch++) {
        audioBuf.copyToChannel(new Float32Array(decoded.channelData[ch]), ch);
      }
      return audioBuf;
    }
  }

  async loadUrl(url: string): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(url);
    if (cached) return cached;

    const existing = this.loadingPromises.get(url);
    if (existing) return existing;

    const task = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const buf = await this.decodeAudioBuffer(arr);
        this.bufferCache.set(url, buf);
        return buf;
      } catch {
        return null;
      } finally {
        this.loadingPromises.delete(url);
      }
    })();

    this.loadingPromises.set(url, task);
    return task;
  }

  async loadDrumPack(packId: string): Promise<void> {
    const pack = DRUM_PACKS.find((p) => p.id === packId) ?? DRUM_PACKS[0];
    this.activeDrumPackId = pack.id;
    const [don, ka] = await Promise.all([this.loadUrl(pack.donUrl), this.loadUrl(pack.kaUrl)]);
    if (this.activeDrumPackId === pack.id) {
      this.donBuffer = don;
      this.kaBuffer = ka;
    }
  }

  playDrum(side: DrumSide, hand: DrumHand = 'both'): void {
    const ctx = this.ensureContext();
    const buf = side === 'don' ? this.donBuffer : this.kaBuffer;
    if (!buf || !this.sfxGain) {
      this.playSynthDrum(side);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    if (typeof ctx.createStereoPanner === 'function' && hand !== 'both') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = hand === 'left' ? -0.18 : 0.18;
      src.connect(panner);
      panner.connect(this.sfxGain);
    } else {
      src.connect(this.sfxGain);
    }
    src.start(0);
  }

  private playSynthDrum(side: DrumSide): void {
    const ctx = this.ensureContext();
    if (!this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = side === 'don' ? 'sine' : 'triangle';
    if (side === 'don') {
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.12);
    } else {
      osc.frequency.setValueAtTime(720, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.06);
    }
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (side === 'don' ? 0.16 : 0.08));
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  async playVoice(name: string): Promise<void> {
    const ctx = this.ensureContext();
    const url = `/assets/audio/voice/${name}.ogg`;
    const buf = await this.loadUrl(url);
    if (!buf || !this.voiceGain) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceGain);
    src.start(0);
  }

  async playSfxAsset(name: string): Promise<void> {
    const ctx = this.ensureContext();
    const url = `/assets/audio/sfx/${name}.ogg`;
    const buf = await this.loadUrl(url);
    if (!buf || !this.sfxGain) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sfxGain);
    src.start(0);
  }

  playComboVoice(combo: number): void {
    if (combo === 50) {
      void this.playVoice('v_combo_50');
    } else if (combo >= 100 && combo <= 5000 && combo % 100 === 0) {
      void this.playVoice(`v_combo_${combo}`);
    }
  }

  playCalibrationBeat(): void {
    const url = '/assets/audio/sfx/se_calibration.ogg';
    const cached = this.bufferCache.get(url);
    if (cached && this.ctx && this.sfxGain) {
      const src = this.ctx.createBufferSource();
      src.buffer = cached;
      src.connect(this.sfxGain);
      src.start(0);
      return;
    }
    void this.loadUrl(url);
    this.playSynthSfx('menuMove');
  }

  playSynthSfx(name: SynthSfxName): void {
    const ctx = this.ensureContext();
    if (!this.sfxGain) return;
    const now = ctx.currentTime;

    const tone = (
      freqStart: number,
      freqEnd: number,
      startOffset: number,
      dur: number,
      type: OscillatorType = 'triangle',
      vol = 0.25,
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now + startOffset);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + startOffset + dur);
      g.gain.setValueAtTime(vol, now + startOffset);
      g.gain.exponentialRampToValueAtTime(0.001, now + startOffset + dur);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + dur + 0.02);
    };

    switch (name) {
      case 'menuMove':
        tone(680, 520, 0, 0.045, 'triangle', 0.18);
        break;
      case 'menuDecide':
        tone(523, 784, 0, 0.09, 'triangle', 0.24);
        tone(784, 1046, 0.06, 0.12, 'sine', 0.22);
        break;
      case 'cancel':
        tone(420, 240, 0, 0.12, 'sawtooth', 0.14);
        break;
      case 'pause':
        tone(587, 440, 0, 0.08, 'sine', 0.2);
        tone(440, 330, 0.07, 0.1, 'sine', 0.18);
        break;
      case 'balloonPop':
        tone(320, 1280, 0, 0.09, 'square', 0.22);
        tone(1100, 180, 0.03, 0.18, 'sawtooth', 0.2);
        break;
      case 'clear':
        tone(523, 523, 0, 0.14, 'triangle', 0.22);
        tone(659, 659, 0.12, 0.14, 'triangle', 0.22);
        tone(784, 784, 0.24, 0.16, 'triangle', 0.24);
        tone(1046, 1046, 0.38, 0.35, 'triangle', 0.26);
        break;
      case 'fail':
        tone(392, 370, 0, 0.2, 'sawtooth', 0.14);
        tone(349, 311, 0.2, 0.25, 'sawtooth', 0.14);
        tone(293, 220, 0.45, 0.4, 'sawtooth', 0.14);
        break;
      case 'crown':
        tone(880, 1320, 0, 0.14, 'sine', 0.25);
        tone(1320, 1760, 0.12, 0.28, 'triangle', 0.25);
        break;
    }
  }

  /**
   * Start song music with an optional pre-roll leadInMs (e.g. 1600ms) so the
   * first notes scroll smoothly onto the lane before song audio starts at t=0.
   */
  startMusic(buffer: AudioBuffer | null, leadInMs = 1500): void {
    this.stopPreview();
    this.stopMusic();
    const ctx = this.ensureContext();
    this.musicBuffer = buffer;
    this.musicPausedAtMs = null;
    this.musicPlaying = true;
    this.musicScheduledStart = false;
    this.musicStartCtxTime = ctx.currentTime + leadInMs / 1000;

    if (buffer && this.musicGain) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.musicGain);
      src.start(this.musicStartCtxTime, 0);
      this.musicSource = src;
      this.musicScheduledStart = true;
    }
  }

  getSongTimeMs(): number {
    if (!this.ctx) return 0;
    if (this.musicPausedAtMs !== null) return this.musicPausedAtMs;
    if (!this.musicPlaying) return 0;
    return (this.ctx.currentTime - this.musicStartCtxTime) * 1000;
  }

  pauseMusic(): void {
    if (!this.musicPlaying || this.musicPausedAtMs !== null) return;
    this.musicPausedAtMs = this.getSongTimeMs();
    this.musicPlaying = false;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        // ignore if already ended
      }
      this.musicSource.disconnect();
      this.musicSource = null;
    }
  }

  resumeMusic(): void {
    if (this.musicPausedAtMs === null) return;
    const ctx = this.ensureContext();
    const resumeMs = this.musicPausedAtMs;
    this.musicPausedAtMs = null;
    this.musicPlaying = true;
    this.musicStartCtxTime = ctx.currentTime - resumeMs / 1000;

    if (this.musicBuffer && this.musicGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.musicBuffer;
      src.connect(this.musicGain);
      if (resumeMs < 0) {
        src.start(this.musicStartCtxTime, 0);
      } else {
        const offsetSec = resumeMs / 1000;
        if (offsetSec < this.musicBuffer.duration) {
          src.start(ctx.currentTime, offsetSec);
        }
      }
      this.musicSource = src;
      this.musicScheduledStart = true;
    }
  }

  stopMusic(): void {
    this.musicPlaying = false;
    this.musicPausedAtMs = null;
    this.musicScheduledStart = false;
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        // ignore
      }
      this.musicSource.disconnect();
      this.musicSource = null;
    }
    this.musicBuffer = null;
  }

  isMusicScheduled(): boolean {
    return this.musicScheduledStart;
  }

  async playPreview(buffer: AudioBuffer, startSec: number): Promise<void> {
    this.stopPreview();
    const ctx = this.ensureContext();
    if (!this.musicGain) return;
    const safeStart = startSec >= 0 && startSec < buffer.duration - 1 ? startSec : 0;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = safeStart;
    src.loopEnd = Math.min(buffer.duration, safeStart + 18);

    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0.001, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(0.75, ctx.currentTime + 0.4);

    src.connect(fade);
    fade.connect(this.musicGain);
    src.start(ctx.currentTime, safeStart);
    this.previewSource = src;
  }

  stopPreview(): void {
    if (this.previewSource) {
      try {
        this.previewSource.stop();
      } catch {
        // ignore
      }
      this.previewSource.disconnect();
      this.previewSource = null;
    }
  }
}

export const audioEngine = new AudioEngine();
