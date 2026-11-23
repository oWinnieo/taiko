import React from 'react';
import { audioEngine } from '../core/audio/audioEngine';

interface TitleScreenProps {
  onStart: () => void;
  onOpenSettings: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, onOpenSettings }) => {
  const handleStart = () => {
    audioEngine.ensureContext();
    audioEngine.playDrum('don', 'both');
    void audioEngine.playVoice('v_title');
    onStart();
  };

  return (
    <div className="screen title-screen">
      <div className="title-bg-pattern" />
      <div className="title-card">
        <div className="title-badge-row">
          <span className="festival-pill">WEB ARCADE EDITION</span>
          <span className="festival-pill pill-alt">支持 TJA 谱面导入</span>
        </div>

        <div className="title-hero-drum" onClick={handleStart} role="button" tabIndex={0}>
          <div className="hero-drum-outer">
            <div className="hero-drum-inner">
              <div className="hero-don-eyes">
                <span />
                <span />
              </div>
              <div className="hero-don-mouth" />
            </div>
          </div>
        </div>

        <h1 className="title-logo">太鼓の達人</h1>
        <p className="title-subtitle">TAIKO MATSURI WEB · 高精度 Web Audio 节奏引擎</p>

        <div className="title-actions">
          <button className="btn-primary btn-xl" onClick={handleStart}>
            敲响太鼓 · 进入选歌
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              audioEngine.ensureContext();
              audioEngine.playSynthSfx('menuDecide');
              onOpenSettings();
            }}
          >
            键位 / 音色 / 延迟校准
          </button>
        </div>

        <div className="title-key-guide">
          <div className="key-chip key-kat">
            <kbd>D</kbd> 左咔
          </div>
          <div className="key-chip key-don">
            <kbd>F</kbd> 左咚
          </div>
          <div className="key-chip key-don">
            <kbd>J</kbd> 右咚
          </div>
          <div className="key-chip key-kat">
            <kbd>K</kbd> 右咔
          </div>
          <div className="key-chip">
            <kbd>Esc</kbd> 暂停 · <kbd>F1</kbd> 自动演奏
          </div>
        </div>
      </div>
    </div>
  );
};
