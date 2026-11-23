import React, { useState } from 'react';
import { audioEngine } from '../core/audio/audioEngine';
import { useDrumMenuInput } from '../core/input/useDrumMenuInput';
import { KeyBindings } from '../platform/types';

interface TitleScreenProps {
  keyBindings: KeyBindings;
  menuDisabled?: boolean;
  onStart: () => void;
  onOpenSettings: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  keyBindings,
  menuDisabled = false,
  onStart,
  onOpenSettings,
}) => {
  const [focusIdx, setFocusIdx] = useState<0 | 1>(0);

  const handleStart = (playDrumSound = true) => {
    audioEngine.ensureContext();
    if (playDrumSound) audioEngine.playDrum('don', 'both');
    void audioEngine.playVoice('v_title');
    onStart();
  };

  const handleSettings = () => {
    audioEngine.ensureContext();
    audioEngine.playSynthSfx('menuDecide');
    onOpenSettings();
  };

  const gamepads = useDrumMenuInput({
    enabled: !menuDisabled,
    keyBindings,
    onPrev: () => setFocusIdx((i) => (i === 0 ? 1 : 0)),
    onNext: () => setFocusIdx((i) => (i === 0 ? 1 : 0)),
    onConfirm: () => {
      if (focusIdx === 0) handleStart(false);
      else handleSettings();
    },
  });

  return (
    <div className="screen title-screen">
      <div className="title-bg-pattern" />
      <div className="title-card">
        <div className="title-badge-row">
          <span className="festival-pill">WEB ARCADE EDITION</span>
          <span className="festival-pill pill-alt">支持 TJA 谱面导入</span>
          {gamepads.length > 0 && (
            <span className="festival-pill pill-drum">
              🥁 已连接外设：{gamepads[0].id.slice(0, 22)}
            </span>
          )}
        </div>

        <div className="title-hero-drum" onClick={() => handleStart(true)} role="button" tabIndex={0}>
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
          <button
            className={`btn-primary btn-xl ${focusIdx === 0 ? 'drum-focused' : ''}`}
            onMouseEnter={() => setFocusIdx(0)}
            onClick={() => handleStart(true)}
          >
            敲响太鼓 · 进入选歌
          </button>
          <button
            className={`btn-secondary ${focusIdx === 1 ? 'drum-focused' : ''}`}
            onMouseEnter={() => setFocusIdx(1)}
            onClick={handleSettings}
          >
            键位 / 音色 / 延迟校准
          </button>
        </div>

        <div className="title-key-guide">
          <div className="key-chip key-kat">
            <kbd>D</kbd> / 左咔：向左切换
          </div>
          <div className="key-chip key-don">
            <kbd>F</kbd> <kbd>J</kbd> / 咚：确认进入
          </div>
          <div className="key-chip key-kat">
            <kbd>K</kbd> / 右咔：向右切换
          </div>
          <div className="key-chip">
            <kbd>Esc</kbd> 暂停 · <kbd>F1</kbd> 自动演奏
          </div>
        </div>
      </div>
    </div>
  );
};
