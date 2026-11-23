import { COURSE_LABELS, PlayableNote } from '../chart/types';
import { GameSnapshot } from '../engine/gameEngine';
import { SOUL_CLEAR_THRESHOLD, SOUL_MAX } from '../engine/judge';

const LOGICAL_W = 1280;
const LOGICAL_H = 720;

const LANE_Y = 236;
const LANE_H = 148;
const JUDGE_X = 344;
const JUDGE_Y = LANE_Y + LANE_H / 2;
const LANE_LEFT_X = 258;

// Base pixels per beat at BPM 120, scroll 1.0 (~0.52 px/ms => ~1.8s lookahead across 936px lane)
const PIXELS_PER_BEAT_BASE = 260;

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private stageThemeIndex: number;
  private showDebugHud = false;
  private fps = 60;
  private lastFrameTs = 0;

  constructor(canvas: HTMLCanvasElement, genreId = 0) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;
    this.stageThemeIndex = (Math.abs(genreId) % 5) + 1;
    this.preloadImages();
  }

  setShowDebugHud(show: boolean): void {
    this.showDebugHud = show;
  }

  private preloadImages(): void {
    const paths: Record<string, string> = {
      notesHit: '/assets/img/notes/notes_hit.png',
      explosion: '/assets/img/notes/notes_explosion.png',
      balloon: '/assets/img/notes/balloon.png',
      difficulty: '/assets/img/ui/difficulty.png',
      stageBg: `/assets/img/bg/bg_song_${this.stageThemeIndex}a.png`,
      scoreP1: '/assets/img/bg/bg_score_p1.png',
      donBgA: `/assets/img/bg/bg_don_${Math.min(6, this.stageThemeIndex + 3)}a.png`,
      donBgB: `/assets/img/bg/bg_don_${Math.min(6, this.stageThemeIndex + 3)}b.png`,
      badgeAuto: '/assets/img/badges/badge_auto.png',
      badgeX2: '/assets/img/badges/badge_x2.png',
      badgeX3: '/assets/img/badges/badge_x3.png',
      badgeX4: '/assets/img/badges/badge_x4.png',
      badgeDoron: '/assets/img/badges/badge_doron.png',
      badgeDon: '/assets/img/badges/badge_don.png',
      badgeKat: '/assets/img/badges/badge_kat.png',
    };
    for (const [key, src] of Object.entries(paths)) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        this.images.set(key, img);
      };
    }
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(1, Math.round(rect.width * dpr));
    const targetH = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  render(snap: GameSnapshot, nowPerfMs: number): void {
    this.resize();
    if (this.lastFrameTs > 0) {
      const dt = nowPerfMs - this.lastFrameTs;
      if (dt > 0) this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
    }
    this.lastFrameTs = nowPerfMs;

    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, cw, ch);

    // Uniform 16:9 scale centered (letterbox dark festival backdrop if aspect differs)
    const scale = Math.min(cw / LOGICAL_W, ch / LOGICAL_H);
    const offsetX = (cw - LOGICAL_W * scale) / 2;
    const offsetY = (ch - LOGICAL_H * scale) / 2;

    ctx.fillStyle = '#140c18';
    ctx.fillRect(0, 0, cw, ch);

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    ctx.beginPath();
    ctx.rect(0, 0, LOGICAL_W, LOGICAL_H);
    ctx.clip();

    this.drawTopStage(ctx, snap);
    this.drawBottomStage(ctx, snap);
    this.drawSoulGauge(ctx, snap);
    this.drawSongHeader(ctx, snap);
    this.drawDonMascot(ctx, snap);
    this.drawTrack(ctx, snap);
    this.drawNotes(ctx, snap);
    this.drawLeftDrumPanel(ctx, snap);
    this.drawExplosionsAndPopups(ctx, snap);
    this.drawFlyingNotes(ctx, snap);
    this.drawActiveRollBubble(ctx, snap);

    if (this.showDebugHud) {
      this.drawDebugHud(ctx, snap);
    }

    ctx.restore();
  }

  private drawTopStage(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    // Rich upper sky backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, LANE_Y);
    if (snap.gogoActive) {
      grad.addColorStop(0, '#5c1428');
      grad.addColorStop(0.6, '#b83227');
      grad.addColorStop(1, '#f38c25');
    } else if (snap.cleared) {
      grad.addColorStop(0, '#1e3c78');
      grad.addColorStop(0.6, '#2f72b8');
      grad.addColorStop(1, '#68b6e8');
    } else {
      grad.addColorStop(0, '#1f2347');
      grad.addColorStop(0.6, '#34406e');
      grad.addColorStop(1, '#5d6b99');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL_W, LANE_Y);

    // Subtle scrolling tiled pattern from pulled bg_don_*
    const donBg = this.images.get('donBgA');
    if (donBg) {
      ctx.save();
      ctx.globalAlpha = snap.gogoActive ? 0.35 : 0.55;
      const scrollX = ((snap.songTimeMs * 0.04) % donBg.width + donBg.width) % donBg.width;
      for (let x = -scrollX; x < LOGICAL_W + donBg.width; x += donBg.width) {
        ctx.drawImage(donBg, x, 0, donBg.width, LANE_Y);
      }
      ctx.restore();
    }

    // Go-Go sunbeams
    if (snap.gogoActive) {
      ctx.save();
      ctx.translate(LOGICAL_W * 0.55, LANE_Y);
      const angleBase = (snap.songTimeMs * 0.0007) % (Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 224, 102, 0.14)';
      for (let i = 0; i < 12; i++) {
        const a = angleBase + (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 900, a, a + 0.14);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawBottomStage(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    const bottomY = LANE_Y + LANE_H;
    const bottomH = LOGICAL_H - bottomY;

    const grad = ctx.createLinearGradient(0, bottomY, 0, LOGICAL_H);
    grad.addColorStop(0, snap.gogoActive ? '#3f1520' : '#182538');
    grad.addColorStop(1, '#0d1320');
    ctx.fillStyle = grad;
    ctx.fillRect(0, bottomY, LOGICAL_W, bottomH);

    const stageBg = this.images.get('stageBg');
    if (stageBg) {
      ctx.save();
      ctx.globalAlpha = snap.gogoActive ? 0.92 : 0.82;
      ctx.drawImage(stageBg, 0, bottomY, LOGICAL_W, bottomH);
      ctx.restore();
    }

    // Festive subtle lantern dots during Go-Go or Clear
    if (snap.gogoActive || snap.cleared) {
      ctx.save();
      const beatPhase = (snap.songTimeMs / (60000 / Math.max(60, snap.currentBpm))) * Math.PI * 2;
      for (let i = 0; i < 8; i++) {
        const lx = 100 + i * 155;
        const ly = bottomY + 34 + Math.sin(beatPhase + i * 0.8) * 6;
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,95,70,0.85)' : 'rgba(255,209,75,0.85)';
        ctx.beginPath();
        ctx.ellipse(lx, ly, 16, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2d1208';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawSoulGauge(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    const gx = 460;
    const gy = 148;
    const segCount = 50;
    const segW = 13;
    const segGap = 1.5;
    const totalW = segCount * (segW + segGap);
    const barH = 38;
    const clearSeg = Math.round((SOUL_CLEAR_THRESHOLD / SOUL_MAX) * segCount); // 40

    // Outer backing frame
    ctx.save();
    ctx.fillStyle = 'rgba(15, 12, 24, 0.86)';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    this.roundRect(ctx, gx - 8, gy - 8, totalW + 64, barH + 16, 12);
    ctx.fill();
    ctx.stroke();

    const filledSegs = Math.floor((snap.soul / SOUL_MAX) * segCount);
    const pulse = 0.5 + 0.5 * Math.sin(snap.songTimeMs * 0.012);

    for (let i = 0; i < segCount; i++) {
      const sx = gx + i * (segW + segGap);
      const isClearZone = i >= clearSeg;
      const sh = isClearZone ? barH + 8 : barH;
      const sy = isClearZone ? gy - 8 : gy;

      if (i < filledSegs) {
        if (filledSegs >= segCount) {
          // Rainbow / golden full soul shimmer
          const hue = (i * 9 + snap.songTimeMs * 0.25) % 360;
          ctx.fillStyle = `hsl(${hue}, 92%, 58%)`;
        } else if (isClearZone) {
          ctx.fillStyle = `rgb(255, ${Math.round(215 + 35 * pulse)}, 60)`;
        } else {
          ctx.fillStyle = '#ff6b1a';
        }
      } else {
        ctx.fillStyle = isClearZone ? 'rgba(90, 62, 18, 0.55)' : 'rgba(65, 32, 32, 0.65)';
      }

      ctx.fillRect(sx, sy, segW, sh);
    }

    // Clear label
    const clearX = gx + clearSeg * (segW + segGap);
    ctx.fillStyle = snap.cleared ? '#ffe66d' : '#d6d6e2';
    ctx.font = 'bold 14px "TnT", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CLEAR', clearX + 18, gy - 14);

    // 魂 Medallion
    const medalX = gx + totalW + 26;
    const medalY = gy + barH / 2 - 2;
    ctx.beginPath();
    ctx.arc(medalX, medalY, 26, 0, Math.PI * 2);
    ctx.fillStyle = snap.soul >= SOUL_MAX ? '#ffd700' : snap.cleared ? '#ff5522' : '#3a2d3d';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = snap.cleared ? '#fff2a6' : '#80708a';
    ctx.stroke();

    ctx.fillStyle = snap.cleared ? '#fff' : '#8f849c';
    ctx.font = 'bold 26px "TnT", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('魂', medalX, medalY + 1);
    ctx.restore();
  }

  private drawSongHeader(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    ctx.save();
    // Top-right song title banner
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 30px "TnT", "Hiragino Sans", sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeText(snap.chart.meta.title, LOGICAL_W - 28, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(snap.chart.meta.title, LOGICAL_W - 28, 22);

    // Course pill + stars
    const cInfo = COURSE_LABELS[snap.chart.courseId];
    const pillText = `${cInfo.zh}  ★${snap.chart.level}`;
    ctx.font = 'bold 18px "TnT", sans-serif';
    const textW = ctx.measureText(pillText).width;
    const px = LOGICAL_W - 28 - textW - 24;
    const py = 62;
    ctx.fillStyle = cInfo.color;
    this.roundRect(ctx, px, py, textW + 24, 30, 15);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillText, px + (textW + 24) / 2, py + 16);

    // Active Mod Badges
    let bx = px - 44;
    const drawBadge = (key: string) => {
      const img = this.images.get(key);
      if (img) {
        ctx.drawImage(img, bx, py - 4, 38, 38);
        bx -= 42;
      }
    };
    if (snap.mods.autoPlay) drawBadge('badgeAuto');
    if (snap.mods.speed === 2) drawBadge('badgeX2');
    else if (snap.mods.speed === 3) drawBadge('badgeX3');
    else if (snap.mods.speed === 4) drawBadge('badgeX4');
    if (snap.mods.doron) drawBadge('badgeDoron');
    if (snap.mods.donOnly) drawBadge('badgeDon');
    if (snap.mods.katOnly) drawBadge('badgeKat');

    // Top-left Scoreboard
    const scoreImg = this.images.get('scoreP1');
    if (scoreImg) {
      ctx.drawImage(scoreImg, 16, 16, 250, 74);
    } else {
      ctx.fillStyle = '#d93829';
      this.roundRect(ctx, 16, 16, 250, 74, 12);
      ctx.fill();
    }
    ctx.strokeStyle = '#1d0d0d';
    ctx.lineWidth = 3;
    this.roundRect(ctx, 16, 16, 250, 74, 12);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px "TnT", monospace';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1a0c0c';
    const scoreStr = snap.displayScore.toString().padStart(7, '0');
    ctx.strokeText(scoreStr, 250, 56);
    ctx.fillStyle = '#fff7d6';
    ctx.fillText(scoreStr, 250, 56);

    ctx.restore();
  }

  /**
   * Procedural beat-synced Don-chan mascot (crisp vector art, zero copyright issues).
   */
  private drawDonMascot(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    const beatMs = 60000 / Math.max(60, snap.currentBpm);
    const beatPhase = (snap.songTimeMs / beatMs) * Math.PI * 2;
    const bounce = Math.abs(Math.sin(beatPhase * 0.5));
    const speedBounce = snap.donState === 'gogo' ? Math.abs(Math.sin(beatPhase)) * 18 : bounce * 10;
    const jumpExtra = snap.donState === '10combo' ? 14 : 0;

    const cx = 135;
    const cy = 166 - speedBounce - jumpExtra;
    const tilt = snap.donState === 'gogo' ? Math.sin(beatPhase) * 0.14 : Math.sin(beatPhase * 0.5) * 0.05;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    // Legs
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-18, 42);
    ctx.lineTo(-22, 58 - bounce * 4);
    ctx.moveTo(18, 42);
    ctx.lineTo(22, 58 - (1 - bounce) * 4);
    ctx.stroke();

    // Arms (raised in Go-Go / 10combo / Clear!)
    const armUp = snap.donState === 'gogo' || snap.donState === '10combo' || snap.donState === 'clear';
    ctx.beginPath();
    ctx.moveTo(-46, 4);
    ctx.lineTo(-64, armUp ? -24 : 18);
    ctx.moveTo(46, 4);
    ctx.lineTo(64, armUp ? -24 : 18);
    ctx.stroke();

    // Drum body (teal-blue rim)
    ctx.beginPath();
    ctx.ellipse(0, 0, 54, 48, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#43bfd4';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#161616';
    ctx.stroke();

    // Cream ring
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 39, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8e6';
    ctx.fill();

    // Vermilion face
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 32, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f34728';
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#111';
    if (snap.donState === 'gogo' || snap.donState === '10combo') {
      // Happy ^ ^ eyes
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(-13, -3, 6, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(13, -3, 6, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-13, -5, 4.5, 0, Math.PI * 2);
      ctx.arc(13, -5, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rosy cheeks
    ctx.fillStyle = 'rgba(255, 196, 175, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-22, 5, 6, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(22, 5, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.fillStyle = '#751212';
    ctx.beginPath();
    if (armUp) {
      ctx.arc(0, 6, 10, 0, Math.PI);
    } else {
      ctx.arc(0, 5, 6, 0, Math.PI);
    }
    ctx.fill();

    // Hachimaki headband during Go-Go!
    if (snap.donState === 'gogo') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-38, -32, 76, 10);
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(-14, -32, 28, 10);
    }

    ctx.restore();
  }

  private drawTrack(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    // Lane dark surface
    ctx.save();
    ctx.fillStyle = snap.gogoActive ? '#3b2421' : '#26242b';
    ctx.fillRect(LANE_LEFT_X, LANE_Y, LOGICAL_W - LANE_LEFT_X, LANE_H);

    // Go-Go warm golden glow inside lane
    if (snap.gogoActive) {
      const gGrad = ctx.createLinearGradient(0, LANE_Y, 0, LANE_Y + LANE_H);
      gGrad.addColorStop(0, 'rgba(255, 145, 0, 0.35)');
      gGrad.addColorStop(0.5, 'rgba(255, 220, 90, 0.14)');
      gGrad.addColorStop(1, 'rgba(255, 110, 0, 0.35)');
      ctx.fillStyle = gGrad;
      ctx.fillRect(LANE_LEFT_X, LANE_Y, LOGICAL_W - LANE_LEFT_X, LANE_H);
    }

    // Top & bottom borders
    ctx.fillStyle = '#111015';
    ctx.fillRect(0, LANE_Y - 8, LOGICAL_W, 8);
    ctx.fillRect(0, LANE_Y + LANE_H, LOGICAL_W, 8);
    ctx.fillStyle = snap.gogoActive ? '#ffd24c' : '#857d95';
    ctx.fillRect(LANE_LEFT_X, LANE_Y - 2, LOGICAL_W - LANE_LEFT_X, 2);
    ctx.fillRect(LANE_LEFT_X, LANE_Y + LANE_H, LOGICAL_W - LANE_LEFT_X, 2);

    // Hit flash on lane right behind judgement circle
    const hitActive =
      snap.songTimeMs < snap.drumFlash.leftDonUntil ||
      snap.songTimeMs < snap.drumFlash.rightDonUntil ||
      snap.songTimeMs < snap.drumFlash.leftKatUntil ||
      snap.songTimeMs < snap.drumFlash.rightKatUntil;
    const isDonFlash =
      snap.songTimeMs < snap.drumFlash.leftDonUntil || snap.songTimeMs < snap.drumFlash.rightDonUntil;

    if (hitActive) {
      const hGrad = ctx.createLinearGradient(LANE_LEFT_X, 0, JUDGE_X + 260, 0);
      hGrad.addColorStop(
        0,
        isDonFlash ? 'rgba(255, 76, 48, 0.35)' : 'rgba(58, 180, 229, 0.35)',
      );
      hGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hGrad;
      ctx.fillRect(LANE_LEFT_X, LANE_Y, 340, LANE_H);
    }

    // Barlines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 2.5;
    for (const bl of snap.chart.barlines) {
      const x = this.timeToX(bl.timeMs, snap.songTimeMs, bl.bpm, bl.scroll);
      if (x < LANE_LEFT_X - 20 || x > LOGICAL_W + 40) continue;
      ctx.beginPath();
      ctx.moveTo(x, LANE_Y + 4);
      ctx.lineTo(x, LANE_Y + LANE_H - 4);
      ctx.stroke();
    }

    // Procedural Go-Go flame behind judgement circle
    if (snap.gogoActive) {
      const t = snap.songTimeMs * 0.015;
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + t * 0.4;
        const r = 46 + Math.sin(t + i * 1.7) * 8;
        const fx = JUDGE_X + Math.cos(angle) * 14;
        const fy = JUDGE_Y + Math.sin(angle) * 10 - 6;
        const fGrad = ctx.createRadialGradient(fx, fy, 4, fx, fy, r);
        fGrad.addColorStop(0, 'rgba(255, 250, 160, 0.75)');
        fGrad.addColorStop(0.5, 'rgba(255, 120, 20, 0.45)');
        fGrad.addColorStop(1, 'rgba(255, 40, 0, 0)');
        ctx.fillStyle = fGrad;
        ctx.beginPath();
        ctx.arc(fx, fy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Judgement target circle
    ctx.beginPath();
    ctx.arc(JUDGE_X, JUDGE_Y, 44, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(JUDGE_X, JUDGE_Y, 29, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.stroke();

    ctx.restore();
  }

  private timeToX(targetMs: number, nowMs: number, bpm: number, scroll: number): number {
    const pxPerMs = (PIXELS_PER_BEAT_BASE * bpm * scroll) / 60000;
    return JUDGE_X + (targetMs - nowMs) * pxPerMs;
  }

  private drawNotes(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    if (snap.mods.doron) return; // stealth mode hides notes

    ctx.save();
    ctx.beginPath();
    ctx.rect(LANE_LEFT_X, LANE_Y - 12, LOGICAL_W - LANE_LEFT_X, LANE_H + 24);
    ctx.clip();

    const notes = snap.chart.notes;
    // Draw in reverse order so earlier notes always stay visually on top!
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      if (note.judged) continue;

      const x = this.timeToX(note.timeMs, snap.songTimeMs, note.bpm, note.scroll);
      const endX = this.timeToX(note.endTimeMs, snap.songTimeMs, note.bpm, note.scroll);

      if (endX < LANE_LEFT_X - 80 || x > LOGICAL_W + 90) continue;

      if (note.kind === 'drumroll' || note.kind === 'bigDrumroll') {
        this.drawDrumroll(ctx, x, endX, note.kind === 'bigDrumroll');
      } else if (note.kind === 'balloon' || note.kind === 'kusudama') {
        const clampedX = Math.max(JUDGE_X, Math.min(x, endX));
        const active = snap.songTimeMs >= note.timeMs && snap.songTimeMs <= note.endTimeMs;
        this.drawBalloonNote(ctx, active ? JUDGE_X : clampedX, note);
      } else {
        this.drawTapNote(ctx, x, note.kind);
      }
    }

    ctx.restore();
  }

  private drawTapNote(
    ctx: CanvasRenderingContext2D,
    x: number,
    kind: PlayableNote['kind'],
  ): void {
    const isBig = kind === 'bigDon' || kind === 'bigKat';
    const isDon = kind === 'don' || kind === 'bigDon';
    const r = isBig ? 43 : 30;

    // Drop shadow
    ctx.beginPath();
    ctx.arc(x, JUDGE_Y + 3, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    // Outer black outline
    ctx.beginPath();
    ctx.arc(x, JUDGE_Y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#141118';
    ctx.fill();

    // White ring
    ctx.beginPath();
    ctx.arc(x, JUDGE_Y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff9ee';
    ctx.fill();

    // Inner vibrant Don/Kat fill
    ctx.beginPath();
    ctx.arc(x, JUDGE_Y, r - (isBig ? 7 : 5.5), 0, Math.PI * 2);
    ctx.fillStyle = isDon ? '#f34728' : '#35b2e6';
    ctx.fill();

    // Subtle gloss highlight
    ctx.beginPath();
    ctx.ellipse(x - r * 0.22, JUDGE_Y - r * 0.28, r * 0.34, r * 0.18, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();

    // Cute Taiko face
    const eyeOffX = isBig ? 12 : 8;
    const eyeOffY = isBig ? -3 : -2;
    const eyeR = isBig ? 3.8 : 2.6;
    ctx.fillStyle = '#1a1111';
    ctx.beginPath();
    ctx.arc(x - eyeOffX, JUDGE_Y + eyeOffY, eyeR, 0, Math.PI * 2);
    ctx.arc(x + eyeOffX, JUDGE_Y + eyeOffY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1a1111';
    ctx.lineWidth = isBig ? 2.6 : 2;
    ctx.beginPath();
    ctx.arc(x, JUDGE_Y + (isBig ? 5 : 3.5), isBig ? 6 : 4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  private drawDrumroll(ctx: CanvasRenderingContext2D, x: number, endX: number, isBig: boolean): void {
    const r = isBig ? 43 : 30;
    const len = Math.max(8, endX - x);

    // Tail pill
    ctx.fillStyle = '#141118';
    this.roundRect(ctx, x - r - 4, JUDGE_Y - r - 4, len + (r + 4) * 2, (r + 4) * 2, r + 4);
    ctx.fill();

    ctx.fillStyle = '#f5b800';
    this.roundRect(ctx, x - r, JUDGE_Y - r, len + r * 2, r * 2, r);
    ctx.fill();

    // Inner shine band
    ctx.fillStyle = 'rgba(255, 245, 170, 0.45)';
    this.roundRect(ctx, x - r + 6, JUDGE_Y - r + 6, len + (r - 6) * 2, r * 0.65, r * 0.35);
    ctx.fill();

    // Leading yellow head
    ctx.beginPath();
    ctx.arc(x, JUDGE_Y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#141118';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, JUDGE_Y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff9ee';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, JUDGE_Y, r - (isBig ? 7 : 5.5), 0, Math.PI * 2);
    ctx.fillStyle = '#f5b800';
    ctx.fill();
  }

  private drawBalloonNote(ctx: CanvasRenderingContext2D, x: number, note: PlayableNote): void {
    const balloonImg = this.images.get('balloon');
    const remain = Math.max(0, note.balloonHits - note.hitCount);
    const inflate = 1 + (note.hitCount / Math.max(1, note.balloonHits)) * 0.42;

    if (balloonImg) {
      const bw = 96 * inflate;
      const bh = 52 * inflate;
      ctx.drawImage(balloonImg, x + 22, JUDGE_Y - bh / 2, bw, bh);
    } else {
      ctx.beginPath();
      ctx.ellipse(x + 64, JUDGE_Y, 40 * inflate, 24 * inflate, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5a1f';
      ctx.fill();
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    this.drawTapNote(ctx, x, 'don');

    // Remaining count badge
    ctx.font = 'bold 22px "TnT", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#111';
    ctx.strokeText(String(remain), x + 68, JUDGE_Y);
    ctx.fillStyle = '#fff799';
    ctx.fillText(String(remain), x + 68, JUDGE_Y);
  }

  private drawLeftDrumPanel(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    ctx.save();
    // Solid left panel behind drum so notes disappear cleanly under it
    ctx.fillStyle = '#d43a2b';
    ctx.fillRect(0, LANE_Y, LANE_LEFT_X, LANE_H);
    ctx.strokeStyle = '#180c0d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(LANE_LEFT_X, LANE_Y);
    ctx.lineTo(LANE_LEFT_X, LANE_Y + LANE_H);
    ctx.stroke();

    const cx = 192;
    const cy = JUDGE_Y;
    const r = 56;

    // Outer drum shell
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fillStyle = '#2d1c1b';
    ctx.fill();

    // Base cream drumhead
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f8eed9';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#6c5a4b';
    ctx.stroke();

    const now = snap.songTimeMs;
    const lKat = now < snap.drumFlash.leftKatUntil;
    const rKat = now < snap.drumFlash.rightKatUntil;
    const lDon = now < snap.drumFlash.leftDonUntil;
    const rDon = now < snap.drumFlash.rightDonUntil;

    // Left / Right Kat rim flashes (Blue)
    if (lKat) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.5, Math.PI * 1.5);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(53, 178, 230, 0.85)';
      ctx.fill();
    }
    if (rKat) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fillStyle = 'rgba(53, 178, 230, 0.85)';
      ctx.fill();
    }

    // Inner Don circle
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = '#efe2c7';
    ctx.fill();

    // Left / Right Don center flashes (Red)
    if (lDon) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, Math.PI * 0.5, Math.PI * 1.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(243, 71, 40, 0.92)';
      ctx.fill();
    }
    if (rDon) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.72, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(243, 71, 40, 0.92)';
      ctx.fill();
    }

    // Center divider subtly drawn
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Combo Counter (when combo >= 10, arcade style; show from 3+ for instant feedback)
    if (snap.combo >= 3) {
      const elapsed = Math.max(0, now - snap.lastComboAtMs);
      const popScale = elapsed < 110 ? 1 + (1 - elapsed / 110) * 0.3 : 1;
      ctx.save();
      ctx.translate(cx, cy - 4);
      ctx.scale(popScale, popScale);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 42px "TnT", sans-serif';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#160d0d';
      const txt = String(snap.combo);
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = snap.combo >= 100 ? '#ffdd33' : snap.combo >= 50 ? '#ff9d2e' : '#ffffff';
      ctx.fillText(txt, 0, 0);

      ctx.font = 'bold 14px "TnT", sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText('COMBO', 0, 28);
      ctx.fillStyle = '#fff';
      ctx.fillText('COMBO', 0, 28);
      ctx.restore();
    }

    // Mini accuracy counter on far left of panel
    ctx.textAlign = 'left';
    ctx.font = 'bold 15px "TnT", sans-serif';
    ctx.fillStyle = '#ffe58f';
    ctx.fillText(`良 ${snap.good}`, 18, LANE_Y + 42);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`可 ${snap.ok}`, 18, LANE_Y + 74);
    ctx.fillStyle = '#b9c6e8';
    ctx.fillText(`不可 ${snap.bad}`, 18, LANE_Y + 106);

    ctx.restore();
  }

  private drawExplosionsAndPopups(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    const expImg = this.images.get('explosion');
    const hitImg = this.images.get('notesHit');

    for (const fx of snap.explosions) {
      const age = snap.songTimeMs - fx.startedAtMs;
      if (age < 0 || age > 420) continue;
      const progress = age / 420;

      // Sprite explosion burst (for Good/OK)
      if (fx.grade !== 'bad' && expImg) {
        const frame = Math.min(3, Math.floor((age / 240) * 4));
        const col = fx.type;
        const sw = 222;
        const sh = 222;
        const size = fx.type >= 2 ? 210 : 165;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = Math.max(0, 1 - progress * 1.25);
        ctx.drawImage(
          expImg,
          col * sw,
          frame * sh,
          sw,
          sh,
          JUDGE_X - size / 2,
          JUDGE_Y - size / 2,
          size,
          size,
        );
        ctx.restore();
      }

      // Hit ring glow
      if (fx.grade !== 'bad' && hitImg && age < 160) {
        ctx.save();
        ctx.globalAlpha = 1 - age / 160;
        const row = fx.type >= 2 ? 3 : 1;
        ctx.drawImage(hitImg, 0, row * 128, 128, 128, JUDGE_X - 58, JUDGE_Y - 58, 116, 116);
        ctx.restore();
      }

      // Floating judgement text (良 / 可 / 不可)
      const label = fx.grade === 'good' ? '良' : fx.grade === 'ok' ? '可' : '不可';
      const color = fx.grade === 'good' ? '#ffe142' : fx.grade === 'ok' ? '#ffffff' : '#6aa7ff';
      const floatY = JUDGE_Y - 62 - progress * 24;

      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, progress - 0.55) / 0.45);
      ctx.font = 'bold 30px "TnT", "Hiragino Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#140c0c';
      ctx.strokeText(label, JUDGE_X, floatY);
      ctx.fillStyle = color;
      ctx.fillText(label, JUDGE_X, floatY);
      ctx.restore();
    }
  }

  private drawFlyingNotes(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    const targetX = 1150;
    const targetY = 165;
    for (const f of snap.flyingNotes) {
      const t = Math.max(0, Math.min(1, (snap.songTimeMs - f.startedAtMs) / f.durationMs));
      // Parabolic arc to soul gauge
      const x = JUDGE_X + (targetX - JUDGE_X) * t;
      const y = JUDGE_Y + (targetY - JUDGE_Y) * t - Math.sin(t * Math.PI) * 190;
      const isDon = f.kind === 'don' || f.kind === 'bigDon';

      ctx.save();
      ctx.globalAlpha = 1 - t * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, 20 * (1 - t * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = isDon ? '#f34728' : '#35b2e6';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawActiveRollBubble(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    const roll = snap.activeRoll;
    if (!roll) return;

    ctx.save();
    const bx = JUDGE_X + 18;
    const by = LANE_Y - 58;
    ctx.fillStyle = roll.kind === 'balloon' ? '#ff5126' : '#f5b800';
    ctx.strokeStyle = '#1a1111';
    ctx.lineWidth = 4;
    this.roundRect(ctx, bx - 72, by - 32, 144, 58, 28);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 30px "TnT", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1a1111';
    const label =
      roll.kind === 'balloon'
        ? roll.popped
          ? '割れた!'
          : `残り ${roll.count}`
        : `${roll.count} 連打`;
    ctx.strokeText(label, bx, by - 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, bx, by - 2);
    ctx.restore();
  }

  private drawDebugHud(ctx: CanvasRenderingContext2D, snap: GameSnapshot): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.roundRect(ctx, 16, LOGICAL_H - 96, 360, 80, 10);
    ctx.fill();
    ctx.fillStyle = '#8ef5a8';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`FPS: ${this.fps.toFixed(1)} | BPM: ${snap.currentBpm}`, 28, LOGICAL_H - 84);
    ctx.fillText(
      `Time: ${Math.round(snap.songTimeMs)}ms / ${Math.round(snap.chart.endTimeMs)}ms`,
      28,
      LOGICAL_H - 62,
    );
    ctx.fillText(
      `Last Delta: ${snap.lastTimingDeltaMs ?? '-'}ms | Auto: ${snap.mods.autoPlay ? 'ON' : 'OFF'}`,
      28,
      LOGICAL_H - 40,
    );
    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
