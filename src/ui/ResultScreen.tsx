import React, { useEffect, useState } from 'react';
import { audioEngine } from '../core/audio/audioEngine';
import { COURSE_LABELS, CourseId } from '../core/chart/types';
import { GameResultSummary } from '../core/engine/gameEngine';
import { SOUL_CLEAR_THRESHOLD, SOUL_MAX } from '../core/engine/judge';
import { useDrumMenuInput } from '../core/input/useDrumMenuInput';
import { KeyBindings, SongCatalogEntry } from '../platform/types';

interface ResultScreenProps {
  song: SongCatalogEntry;
  courseId: CourseId;
  result: GameResultSummary;
  isNewRecord: boolean;
  keyBindings: KeyBindings;
  onRetry: () => void;
  onBackSelect: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  song,
  courseId,
  result,
  isNewRecord,
  keyBindings,
  onRetry,
  onBackSelect,
}) => {
  const [focusIdx, setFocusIdx] = useState<0 | 1>(1); // Default focus on 返回选歌 (or switch with Kat)

  useEffect(() => {
    if (result.crown === 'donderful') {
      void audioEngine.playVoice('v_results_fullcombo2');
    } else if (result.crown === 'fullcombo') {
      void audioEngine.playVoice('v_results_fullcombo');
    } else {
      void audioEngine.playVoice('v_results');
    }
  }, [result.crown]);

  // 600ms grace delay so end-of-song leftover strikes don't skip the result screen
  useDrumMenuInput({
    enabled: true,
    keyBindings,
    graceMs: 600,
    onPrev: () => setFocusIdx((i) => (i === 0 ? 1 : 0)),
    onNext: () => setFocusIdx((i) => (i === 0 ? 1 : 0)),
    onConfirm: () => {
      if (focusIdx === 0) onRetry();
      else onBackSelect();
    },
    onCancel: onBackSelect,
  });

  const cInfo = COURSE_LABELS[courseId];
  const soulPct = Math.round((result.soul / SOUL_MAX) * 100);
  const clearPct = Math.round((SOUL_CLEAR_THRESHOLD / SOUL_MAX) * 100);

  const bannerMap = {
    donderful: { text: '👑 全良 · DONDERFUL COMBO!', cls: 'banner-gold' },
    fullcombo: { text: '🥈 全连 · FULL COMBO!', cls: 'banner-silver' },
    clear: { text: '🎉 演奏过关 · STAGE CLEAR!', cls: 'banner-clear' },
    none: { text: '💪 差一点 · STAGE FAILED', cls: 'banner-fail' },
  };
  const banner = bannerMap[result.crown];

  return (
    <div className="screen result-screen">
      <div className="result-card">
        <div className={`result-banner ${banner.cls}`}>{banner.text}</div>

        <div className="result-song-head">
          <h2>{song.title}</h2>
          <span className="course-pill-inline" style={{ backgroundColor: cInfo.color }}>
            {cInfo.zh} ★{song.courses[courseId] ?? 5}
          </span>
          {result.autoUsed && <span className="tag-auto">AUTO 演奏（不计最佳纪录）</span>}
          {isNewRecord && !result.autoUsed && <span className="tag-new">NEW RECORD!</span>}
        </div>

        <div className="result-score-box">
          <div className="result-score-label">最终得分</div>
          <div className="result-score-value">{result.score.toLocaleString()}</div>
        </div>

        <div className="result-soul-wrap">
          <div className="result-soul-meta">
            <span>魂槽：{soulPct}%</span>
            <span>过关线：{clearPct}%</span>
          </div>
          <div className="result-soul-track">
            <div
              className={`result-soul-fill ${result.soul >= SOUL_CLEAR_THRESHOLD ? 'soul-cleared' : ''}`}
              style={{ width: `${soulPct}%` }}
            />
            <div className="result-soul-line" style={{ left: `${clearPct}%` }} />
          </div>
        </div>

        <div className="result-stats-grid">
          <div className="stat-box stat-good">
            <span>良</span>
            <strong>{result.good}</strong>
          </div>
          <div className="stat-box stat-ok">
            <span>可</span>
            <strong>{result.ok}</strong>
          </div>
          <div className="stat-box stat-bad">
            <span>不可</span>
            <strong>{result.bad}</strong>
          </div>
          <div className="stat-box">
            <span>最大连击</span>
            <strong>{result.maxCombo}</strong>
          </div>
          <div className="stat-box">
            <span>连打数</span>
            <strong>{result.drumrollHits}</strong>
          </div>
          <div className="stat-box">
            <span>准确率</span>
            <strong>{result.accuracy.toFixed(1)}%</strong>
          </div>
        </div>

        <div className="result-actions">
          <button
            className={`btn-primary btn-lg ${focusIdx === 0 ? 'drum-focused' : ''}`}
            onMouseEnter={() => setFocusIdx(0)}
            onClick={() => {
              audioEngine.playDrum('don', 'both');
              onRetry();
            }}
          >
            🥁 再来一局
          </button>
          <button
            className={`btn-secondary btn-lg ${focusIdx === 1 ? 'drum-focused' : ''}`}
            onMouseEnter={() => setFocusIdx(1)}
            onClick={() => {
              audioEngine.playSynthSfx('menuDecide');
              onBackSelect();
            }}
          >
            返回选歌
          </button>
        </div>
        <div className="pause-drum-hint">🔵 左/右咔切换 · 🔴 咚确认</div>
      </div>
    </div>
  );
};
