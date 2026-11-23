import React, { useEffect, useRef, useState } from 'react';
import { audioEngine, DRUM_PACKS } from '../core/audio/audioEngine';
import { GameSettings, KeyBindings } from '../platform/types';

interface SettingsModalProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}

const KEY_FIELDS: Array<{ field: keyof KeyBindings; label: string; color: string }> = [
  { field: 'leftKat', label: '左咔（蓝）', color: '#35b2e6' },
  { field: 'leftDon', label: '左咚（红）', color: '#f34728' },
  { field: 'rightDon', label: '右咚（红）', color: '#f34728' },
  { field: 'rightKat', label: '右咔（蓝）', color: '#35b2e6' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onChange, onClose }) => {
  const [rebinding, setRebinding] = useState<keyof KeyBindings | null>(null);

  // Calibration state (120 BPM = 500ms interval)
  const [calibrating, setCalibrating] = useState(false);
  const [calSamples, setCalSamples] = useState<number[]>([]);
  const [beatFlash, setBeatFlash] = useState(false);
  const calStartPerfRef = useRef(0);
  const calIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!rebinding) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === 'Escape') {
        setRebinding(null);
        return;
      }
      onChange({
        ...settings,
        keyBindings: {
          ...settings.keyBindings,
          [rebinding]: e.code,
        },
      });
      setRebinding(null);
      audioEngine.playSynthSfx('menuDecide');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rebinding, settings, onChange]);

  const stopCalibration = () => {
    if (calIntervalRef.current !== null) {
      window.clearInterval(calIntervalRef.current);
      calIntervalRef.current = null;
    }
    setCalibrating(false);
    setBeatFlash(false);
  };

  useEffect(() => {
    return () => stopCalibration();
  }, []);

  const startCalibration = () => {
    audioEngine.ensureContext();
    setCalSamples([]);
    setCalibrating(true);
    calStartPerfRef.current = performance.now();
    audioEngine.playCalibrationBeat();
    setBeatFlash(true);
    window.setTimeout(() => setBeatFlash(false), 120);

    calIntervalRef.current = window.setInterval(() => {
      audioEngine.playCalibrationBeat();
      setBeatFlash(true);
      window.setTimeout(() => setBeatFlash(false), 120);
    }, 500);
  };

  const recordCalibrationTap = () => {
    if (!calibrating) return;
    const elapsed = performance.now() - calStartPerfRef.current;
    const nearestBeat = Math.round(elapsed / 500) * 500;
    const delta = Math.round(elapsed - nearestBeat);
    if (Math.abs(delta) > 220) return;

    audioEngine.playDrum('don', 'both');
    setCalSamples((prev) => {
      const next = [...prev, delta].slice(-12);
      return next;
    });
  };

  useEffect(() => {
    if (!calibrating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (
        e.code === settings.keyBindings.leftDon ||
        e.code === settings.keyBindings.rightDon ||
        e.code === 'Space'
      ) {
        e.preventDefault();
        recordCalibrationTap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [calibrating, settings.keyBindings]);

  const avgCalOffset =
    calSamples.length > 0
      ? Math.round(calSamples.reduce((a, b) => a + b, 0) / calSamples.length)
      : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚙ 游戏设置与延迟校准</h3>
          <button className="btn-ghost" onClick={onClose}>
            ✕ 关闭
          </button>
        </div>

        <div className="settings-body">
          {/* Key bindings */}
          <div className="settings-section">
            <h4>键盘键位（点击按钮后按新键修改）</h4>
            <div className="keybind-grid">
              {KEY_FIELDS.map(({ field, label, color }) => (
                <button
                  key={field}
                  className={`keybind-btn ${rebinding === field ? 'keybind-listening' : ''}`}
                  style={{ borderColor: color }}
                  onClick={() => setRebinding(field)}
                >
                  <span>{label}</span>
                  <strong>{rebinding === field ? '请按键...' : settings.keyBindings[field]}</strong>
                </button>
              ))}
            </div>
          </div>

          {/* Drum sound pack */}
          <div className="settings-section">
            <h4>鼓音色包（共 31 套，支持实时试听）</h4>
            <div className="drum-pack-row">
              <select
                value={settings.drumPack}
                onChange={async (e) => {
                  const pack = e.target.value;
                  onChange({ ...settings, drumPack: pack });
                  await audioEngine.loadDrumPack(pack);
                  audioEngine.playDrum('don', 'both');
                }}
              >
                {DRUM_PACKS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                className="pill-btn"
                onClick={() => audioEngine.playDrum('don', 'left')}
              >
                🔴 试听 咚
              </button>
              <button
                className="pill-btn"
                onClick={() => audioEngine.playDrum('ka', 'right')}
              >
                🔵 试听 咔
              </button>
            </div>
          </div>

          {/* Volumes */}
          <div className="settings-section">
            <h4>音量调节</h4>
            <div className="slider-list">
              <label>
                <span>音乐音量 ({Math.round(settings.musicVolume * 100)}%)</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={settings.musicVolume}
                  onChange={(e) =>
                    onChange({ ...settings, musicVolume: parseFloat(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>鼓声与音效 ({Math.round(settings.sfxVolume * 100)}%)</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={settings.sfxVolume}
                  onChange={(e) =>
                    onChange({ ...settings, sfxVolume: parseFloat(e.target.value) })
                  }
                />
              </label>
              <label>
                <span>人声语音 ({Math.round(settings.voiceVolume * 100)}%)</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={settings.voiceVolume}
                  onChange={(e) =>
                    onChange({ ...settings, voiceVolume: parseFloat(e.target.value) })
                  }
                />
              </label>
            </div>
          </div>

          {/* Calibration */}
          <div className="settings-section">
            <h4>音频延迟偏移校准（Audio Offset）</h4>
            <div className="calibration-row">
              <label className="offset-slider">
                <span>当前偏移：{settings.audioOffsetMs > 0 ? `+${settings.audioOffsetMs}` : settings.audioOffsetMs} ms</span>
                <input
                  type="range"
                  min={-250}
                  max={250}
                  step={5}
                  value={settings.audioOffsetMs}
                  onChange={(e) =>
                    onChange({ ...settings, audioOffsetMs: parseInt(e.target.value, 10) })
                  }
                />
              </label>
            </div>
            <div className="calibration-wizard">
              {!calibrating ? (
                <button className="btn-secondary" onClick={startCalibration}>
                  🎯 启动节拍校准向导
                </button>
              ) : (
                <div className="cal-active-box">
                  <div className={`cal-pulse-dot ${beatFlash ? 'cal-pulse-lit' : ''}`} />
                  <span>跟着节拍按 F / J / 空格（已测 {calSamples.length} 次）</span>
                  <button className="pill-btn" onClick={recordCalibrationTap}>
                    点击敲击
                  </button>
                  {avgCalOffset !== null && (
                    <button
                      className="btn-primary"
                      onClick={() => {
                        onChange({ ...settings, audioOffsetMs: avgCalOffset });
                        stopCalibration();
                      }}
                    >
                      应用建议值 ({avgCalOffset > 0 ? `+${avgCalOffset}` : avgCalOffset}ms)
                    </button>
                  )}
                  <button className="btn-ghost" onClick={stopCalibration}>
                    停止
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Toggles */}
          <div className="settings-section settings-toggles">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.showTouchDrum}
                onChange={(e) => onChange({ ...settings, showTouchDrum: e.target.checked })}
              />
              <span>默认显示底部触控/鼠标鼓面</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={settings.showDebugHud}
                onChange={(e) => onChange({ ...settings, showDebugHud: e.target.checked })}
              />
              <span>演奏时显示调试信息（FPS / 判定偏差 ms）</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
