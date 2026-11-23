import { AudioEngine, DrumHand, DrumSide } from '../audio/audioEngine';
import { GameMods, PlayableChart, PlayableNote } from '../chart/types';
import { CrownRank } from '../../platform/types';
import {
  calculateHitScore,
  calculateSoulDelta,
  computeCrown,
  evaluateTiming,
  getJudgeWindows,
  isBalloonNote,
  isBigTapNote,
  isDrumrollNote,
  isNoteDon,
  isNoteKat,
  isTapNote,
  JudgeGrade,
  JudgeWindows,
  SOUL_CLEAR_THRESHOLD,
  SOUL_MAX,
} from './judge';

export interface ExplosionEffect {
  id: number;
  startedAtMs: number;
  type: 0 | 1 | 2 | 3; // 0: good, 1: ok, 2: big good, 3: big ok
  grade: JudgeGrade;
  scorePopup: number;
  timingDeltaMs: number;
}

export interface FlyingNoteEffect {
  id: number;
  kind: PlayableNote['kind'];
  startedAtMs: number;
  durationMs: number;
}

export interface DrumFlashState {
  leftDonUntil: number;
  rightDonUntil: number;
  leftKatUntil: number;
  rightKatUntil: number;
}

export interface ActiveRollDisplay {
  kind: 'drumroll' | 'balloon';
  count: number; // hits scored for drumroll, remaining hits for balloon
  maxHits: number;
  updatedAtMs: number;
  popped: boolean;
}

export interface GameResultSummary {
  score: number;
  good: number;
  ok: number;
  bad: number;
  maxCombo: number;
  drumrollHits: number;
  soul: number;
  crown: CrownRank;
  accuracy: number;
  autoUsed: boolean;
}

export interface GameSnapshot {
  chart: PlayableChart;
  mods: GameMods;
  songTimeMs: number;
  currentBpm: number;
  gogoActive: boolean;
  score: number;
  displayScore: number;
  combo: number;
  maxCombo: number;
  good: number;
  ok: number;
  bad: number;
  drumrollHits: number;
  soul: number;
  cleared: boolean;
  paused: boolean;
  finished: boolean;
  donState: 'normal' | '10combo' | 'gogo' | 'clear';
  donStateUntilMs: number;
  lastComboAtMs: number;
  drumFlash: DrumFlashState;
  explosions: ExplosionEffect[];
  flyingNotes: FlyingNoteEffect[];
  activeRoll: ActiveRollDisplay | null;
  lastTimingDeltaMs: number | null;
}

const BIG_DOUBLE_WINDOW_MS = 45;
const AUTO_ROLL_INTERVAL_MS = 62;

export class TaikoGameEngine {
  readonly chart: PlayableChart;
  readonly mods: GameMods;
  private readonly audio: AudioEngine;
  private readonly windows: JudgeWindows;
  private audioOffsetMs: number;
  private onFinish?: (result: GameResultSummary) => void;

  private songTimeMs = -1500;
  private score = 0;
  private displayScore = 0;
  private combo = 0;
  private maxCombo = 0;
  private good = 0;
  private ok = 0;
  private bad = 0;
  private drumrollHits = 0;
  private soul = 0;
  private paused = false;
  private finished = false;
  private autoUsed = false;

  private donState: GameSnapshot['donState'] = 'normal';
  private donStateUntilMs = -Infinity;
  private lastComboAtMs = -Infinity;
  private lastTimingDeltaMs: number | null = null;
  private lastAutoRollMs = -Infinity;
  private wasGogo = false;
  private gogoVoicePlayed = false;

  private drumFlash: DrumFlashState = {
    leftDonUntil: -Infinity,
    rightDonUntil: -Infinity,
    leftKatUntil: -Infinity,
    rightKatUntil: -Infinity,
  };

  private explosions: ExplosionEffect[] = [];
  private flyingNotes: FlyingNoteEffect[] = [];
  private activeRoll: ActiveRollDisplay | null = null;
  private nextFxId = 1;

  constructor(
    chart: PlayableChart,
    mods: GameMods,
    audio: AudioEngine,
    audioOffsetMs: number,
    onFinish?: (result: GameResultSummary) => void,
  ) {
    this.chart = chart;
    this.mods = { ...mods };
    this.audio = audio;
    this.windows = getJudgeWindows(chart.courseId);
    this.audioOffsetMs = audioOffsetMs;
    this.autoUsed = mods.autoPlay;
    this.onFinish = onFinish;
  }

  setAudioOffset(offsetMs: number): void {
    this.audioOffsetMs = offsetMs;
  }

  toggleAutoPlay(): boolean {
    this.mods.autoPlay = !this.mods.autoPlay;
    if (this.mods.autoPlay) this.autoUsed = true;
    return this.mods.autoPlay;
  }

  setPaused(paused: boolean): void {
    if (this.finished) return;
    if (paused && !this.paused) {
      this.paused = true;
      this.audio.pauseMusic();
      this.audio.playSynthSfx('pause');
    } else if (!paused && this.paused) {
      this.paused = false;
      this.audio.resumeMusic();
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  update(): GameSnapshot {
    if (!this.paused && !this.finished) {
      // Positive user audioOffsetMs shifts judgement later to match audio latency
      this.songTimeMs = this.audio.getSongTimeMs() - this.audioOffsetMs;

      if (this.mods.autoPlay) {
        this.runAutoPlay();
      }

      this.sweepMissedNotes();

      const gogoNow = this.isGogoAt(this.songTimeMs);
      if (gogoNow && !this.wasGogo && !this.gogoVoicePlayed) {
        this.gogoVoicePlayed = true;
      }
      this.wasGogo = gogoNow;

      // Clear stale roll bubble
      if (this.activeRoll && this.songTimeMs - this.activeRoll.updatedAtMs > 950) {
        this.activeRoll = null;
      }

      // Smooth rolling display score
      if (this.displayScore < this.score) {
        const diff = this.score - this.displayScore;
        this.displayScore += Math.max(10, Math.ceil(diff * 0.25));
        if (this.displayScore > this.score) this.displayScore = this.score;
      }

      // Prune expired visual effects
      this.explosions = this.explosions.filter((e) => this.songTimeMs - e.startedAtMs < 460);
      this.flyingNotes = this.flyingNotes.filter(
        (f) => this.songTimeMs - f.startedAtMs < f.durationMs + 60,
      );

      if (this.songTimeMs >= this.chart.endTimeMs) {
        this.finishSong();
      }
    }

    return this.getSnapshot();
  }

  handleStrike(side: DrumSide, hand: DrumHand): void {
    if (this.paused || this.finished) return;

    const nowMs = this.songTimeMs;
    this.audio.playDrum(side, hand);

    // Drum flash feedback
    const flashUntil = nowMs + 110;
    if (side === 'don') {
      if (hand === 'left' || hand === 'both') this.drumFlash.leftDonUntil = flashUntil;
      if (hand === 'right' || hand === 'both') this.drumFlash.rightDonUntil = flashUntil;
    } else {
      if (hand === 'left' || hand === 'both') this.drumFlash.leftKatUntil = flashUntil;
      if (hand === 'right' || hand === 'both') this.drumFlash.rightKatUntil = flashUntil;
    }

    // 1. Check active big-note second-hand bonus hit
    for (const note of this.chart.notes) {
      if (
        note.judged &&
        !note.doubleHitAwarded &&
        isBigTapNote(note.kind) &&
        note.firstHitTimeMs !== null &&
        nowMs - note.firstHitTimeMs <= BIG_DOUBLE_WINDOW_MS &&
        note.firstHitHand !== hand
      ) {
        const matchesSide =
          (side === 'don' && isNoteDon(note.kind)) || (side === 'ka' && isNoteKat(note.kind));
        if (matchesSide) {
          note.doubleHitAwarded = true;
          const bonus = calculateHitScore('good', this.chart.baseScore, note.gogo, false);
          this.score += bonus;
          this.explosions.push({
            id: this.nextFxId++,
            startedAtMs: nowMs,
            type: 2,
            grade: 'good',
            scorePopup: bonus,
            timingDeltaMs: 0,
          });
          return;
        }
      }
    }

    // 2. Check active balloon / kusudama (Don only)
    for (const note of this.chart.notes) {
      if (
        !note.judged &&
        isBalloonNote(note.kind) &&
        nowMs >= note.timeMs - this.windows.ok &&
        nowMs <= note.endTimeMs + 30
      ) {
        if (side === 'don') {
          note.hitCount += 1;
          this.drumrollHits += 1;
          const remaining = Math.max(0, note.balloonHits - note.hitCount);
          const popped = remaining === 0;
          const pts = popped ? 5000 : 300;
          this.score += pts;
          this.activeRoll = {
            kind: 'balloon',
            count: remaining,
            maxHits: note.balloonHits,
            updatedAtMs: nowMs,
            popped,
          };
          if (popped) {
            note.judged = true;
            this.audio.playSynthSfx('balloonPop');
            this.explosions.push({
              id: this.nextFxId++,
              startedAtMs: nowMs,
              type: 2,
              grade: 'good',
              scorePopup: pts,
              timingDeltaMs: 0,
            });
          } else {
            this.explosions.push({
              id: this.nextFxId++,
              startedAtMs: nowMs,
              type: 0,
              grade: 'good',
              scorePopup: pts,
              timingDeltaMs: 0,
            });
          }
        }
        return;
      }
    }

    // 3. Check active drumroll (any side hits)
    for (const note of this.chart.notes) {
      if (
        isDrumrollNote(note.kind) &&
        nowMs >= note.timeMs - this.windows.good &&
        nowMs <= note.endTimeMs + 30
      ) {
        note.hitCount += 1;
        this.drumrollHits += 1;
        const pts = (note.kind === 'bigDrumroll' ? 200 : 100) * (note.gogo ? 1.2 : 1);
        const rounded = Math.round(pts / 10) * 10;
        this.score += rounded;
        this.activeRoll = {
          kind: 'drumroll',
          count: note.hitCount,
          maxHits: 0,
          updatedAtMs: nowMs,
          popped: false,
        };
        this.explosions.push({
          id: this.nextFxId++,
          startedAtMs: nowMs,
          type: note.kind === 'bigDrumroll' ? 2 : 0,
          grade: 'good',
          scorePopup: rounded,
          timingDeltaMs: 0,
        });
        this.flyingNotes.push({
          id: this.nextFxId++,
          kind: side === 'don' ? 'don' : 'kat',
          startedAtMs: nowMs,
          durationMs: 420,
        });
        return;
      }
    }

    // 4. Find earliest unjudged tap note within bad window
    let candidate: PlayableNote | null = null;
    for (const note of this.chart.notes) {
      if (note.judged || !isTapNote(note.kind)) continue;
      const delta = nowMs - note.timeMs;
      if (delta < -this.windows.bad) break; // sorted by timeMs
      if (Math.abs(delta) <= this.windows.bad) {
        candidate = note;
        break;
      }
    }

    if (!candidate) return;

    const matchesSide =
      (side === 'don' && isNoteDon(candidate.kind)) ||
      (side === 'ka' && isNoteKat(candidate.kind));

    if (!matchesSide) {
      // Wrong color inside hit window -> ignored unless inside good/ok? Standard Taiko ignores wrong color cleanly
      return;
    }

    const deltaMs = nowMs - candidate.timeMs;
    const grade = evaluateTiming(Math.abs(deltaMs), this.windows);
    if (!grade) return;

    this.applyTapJudgement(candidate, grade, deltaMs, hand === 'both' ? 'left' : hand, hand === 'both');
  }

  private applyTapJudgement(
    note: PlayableNote,
    grade: JudgeGrade,
    deltaMs: number,
    hand: 'left' | 'right',
    isInstantDouble: boolean,
  ): void {
    note.judged = true;
    note.firstHitTimeMs = this.songTimeMs;
    note.firstHitHand = hand;
    this.lastTimingDeltaMs = Math.round(deltaMs);

    const isBig = isBigTapNote(note.kind);
    const doubleBig = isBig && isInstantDouble;
    if (doubleBig) note.doubleHitAwarded = true;

    const soulDelta = calculateSoulDelta(grade, this.chart.totalComboNotes, this.chart.courseId);
    this.soul = Math.max(0, Math.min(SOUL_MAX, this.soul + soulDelta));

    if (grade === 'bad') {
      this.bad += 1;
      this.combo = 0;
      this.explosions.push({
        id: this.nextFxId++,
        startedAtMs: this.songTimeMs,
        type: 1,
        grade: 'bad',
        scorePopup: 0,
        timingDeltaMs: deltaMs,
      });
      return;
    }

    if (grade === 'good') this.good += 1;
    else this.ok += 1;

    this.combo += 1;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.lastComboAtMs = this.songTimeMs;

    const pts = calculateHitScore(grade, this.chart.baseScore, note.gogo, doubleBig);
    this.score += pts;

    if (this.combo > 0 && this.combo % 10 === 0 && !this.isGogoAt(this.songTimeMs)) {
      this.donState = '10combo';
      this.donStateUntilMs = this.songTimeMs + 950;
    }
    this.audio.playComboVoice(this.combo);

    const fxType: 0 | 1 | 2 | 3 =
      grade === 'good' ? (isBig ? 2 : 0) : isBig ? 3 : 1;

    this.explosions.push({
      id: this.nextFxId++,
      startedAtMs: this.songTimeMs,
      type: fxType,
      grade,
      scorePopup: pts,
      timingDeltaMs: deltaMs,
    });
    this.flyingNotes.push({
      id: this.nextFxId++,
      kind: note.kind,
      startedAtMs: this.songTimeMs,
      durationMs: 460,
    });
  }

  private runAutoPlay(): void {
    const nowMs = this.songTimeMs;
    for (const note of this.chart.notes) {
      if (note.judged) continue;
      if (note.timeMs > nowMs) break;

      if (isTapNote(note.kind)) {
        const side: DrumSide = isNoteDon(note.kind) ? 'don' : 'ka';
        const isBig = isBigTapNote(note.kind);
        const hand: DrumHand = isBig ? 'both' : note.id % 2 === 0 ? 'left' : 'right';
        this.audio.playDrum(side, hand);
        const flashUntil = nowMs + 100;
        if (side === 'don') {
          if (hand === 'left' || hand === 'both') this.drumFlash.leftDonUntil = flashUntil;
          if (hand === 'right' || hand === 'both') this.drumFlash.rightDonUntil = flashUntil;
        } else {
          if (hand === 'left' || hand === 'both') this.drumFlash.leftKatUntil = flashUntil;
          if (hand === 'right' || hand === 'both') this.drumFlash.rightKatUntil = flashUntil;
        }
        this.applyTapJudgement(note, 'good', 0, hand === 'right' ? 'right' : 'left', isBig);
      } else if (
        (isDrumrollNote(note.kind) || isBalloonNote(note.kind)) &&
        nowMs >= note.timeMs &&
        nowMs <= note.endTimeMs
      ) {
        if (nowMs - this.lastAutoRollMs >= AUTO_ROLL_INTERVAL_MS) {
          this.lastAutoRollMs = nowMs;
          const hand: DrumHand = Math.floor(nowMs / AUTO_ROLL_INTERVAL_MS) % 2 === 0 ? 'left' : 'right';
          this.handleStrike('don', hand);
        }
      }
    }
  }

  private sweepMissedNotes(): void {
    const nowMs = this.songTimeMs;
    for (const note of this.chart.notes) {
      if (note.judged) continue;
      if (isTapNote(note.kind)) {
        if (nowMs - note.timeMs > this.windows.bad) {
          note.judged = true;
          this.bad += 1;
          this.combo = 0;
          const soulDelta = calculateSoulDelta(
            'bad',
            this.chart.totalComboNotes,
            this.chart.courseId,
          );
          this.soul = Math.max(0, Math.min(SOUL_MAX, this.soul + soulDelta));
        }
      } else if (nowMs > note.endTimeMs + 50) {
        note.judged = true;
      }
    }
  }

  private isGogoAt(timeMs: number): boolean {
    for (const r of this.chart.gogoRanges) {
      if (timeMs >= r.startMs && timeMs <= r.endMs) return true;
    }
    return false;
  }

  private getBpmAt(timeMs: number): number {
    let bpm = this.chart.meta.bpm || 120;
    for (const ev of this.chart.bpmEvents) {
      if (ev.timeMs <= timeMs) bpm = ev.bpm;
      else break;
    }
    return bpm;
  }

  private finishSong(): void {
    if (this.finished) return;
    this.finished = true;
    this.displayScore = this.score;

    const crown = computeCrown(
      this.soul,
      this.good,
      this.ok,
      this.bad,
      this.chart.totalComboNotes,
    );

    if (crown === 'donderful') {
      void this.audio.playSfxAsset('se_gamedonderfulcombo');
    } else if (crown === 'fullcombo') {
      void this.audio.playVoice('v_fullcombo');
      this.audio.playSynthSfx('clear');
    } else if (crown === 'clear') {
      this.audio.playSynthSfx('clear');
    } else {
      this.audio.playSynthSfx('fail');
    }

    const total = Math.max(1, this.chart.totalComboNotes);
    const accuracy = ((this.good + this.ok * 0.5) / total) * 100;

    this.onFinish?.({
      score: this.score,
      good: this.good,
      ok: this.ok,
      bad: this.bad,
      maxCombo: this.maxCombo,
      drumrollHits: this.drumrollHits,
      soul: this.soul,
      crown,
      accuracy,
      autoUsed: this.autoUsed,
    });
  }

  getSnapshot(): GameSnapshot {
    const gogoActive = this.isGogoAt(this.songTimeMs);
    const cleared = this.soul >= SOUL_CLEAR_THRESHOLD;
    let activeDonState: GameSnapshot['donState'] = 'normal';
    if (gogoActive) activeDonState = 'gogo';
    else if (this.songTimeMs < this.donStateUntilMs) activeDonState = this.donState;
    else if (cleared) activeDonState = 'clear';

    return {
      chart: this.chart,
      mods: this.mods,
      songTimeMs: this.songTimeMs,
      currentBpm: this.getBpmAt(this.songTimeMs),
      gogoActive,
      score: this.score,
      displayScore: this.displayScore,
      combo: this.combo,
      maxCombo: this.maxCombo,
      good: this.good,
      ok: this.ok,
      bad: this.bad,
      drumrollHits: this.drumrollHits,
      soul: this.soul,
      cleared,
      paused: this.paused,
      finished: this.finished,
      donState: activeDonState,
      donStateUntilMs: this.donStateUntilMs,
      lastComboAtMs: this.lastComboAtMs,
      drumFlash: { ...this.drumFlash },
      explosions: this.explosions,
      flyingNotes: this.flyingNotes,
      activeRoll: this.activeRoll,
      lastTimingDeltaMs: this.lastTimingDeltaMs,
    };
  }
}
