import React, { useEffect, useRef, useState } from 'react';
import { audioEngine, DrumHand, DrumSide } from '../core/audio/audioEngine';
import { PlayableChart, GameMods } from '../core/chart/types';
import { GameResultSummary, TaikoGameEngine } from '../core/engine/gameEngine';
import { InputManager } from '../core/input/inputManager';
import { useDrumMenuInput } from '../core/input/useDrumMenuInput';
import { CanvasRenderer } from '../core/renderer/canvasRenderer';
import { GameSettings } from '../platform/types';

interface PlayScreenProps {
  chart: PlayableChart;
  audioBuffer: AudioBuffer | null;
  genreId: number;
  mods: GameMods;
  settings: GameSettings;
  onFinish: (result: GameResultSummary) => void;
  onRestart: () => void;
  onExit: () => void;
}

export const PlayScreen: React.FC<PlayScreenProps> = ({
  chart,
  audioBuffer,
  genreId,
  mods,
  settings,
  onFinish,
  onRestart,
  onExit,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TaikoGameEngine | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseFocus, setPauseFocus] = useState<0 | 1 | 2>(0);
  const [autoOn, setAutoOn] = useState(mods.autoPlay);
  const [touchDrumVisible, setTouchDrumVisible] = useState(
    () => settings.showTouchDrum || (typeof window !== 'undefined' && 'ontouchstart' in window),
  );

  // Switch-style drum navigation while paused
  useDrumMenuInput({
    enabled: paused,
    keyBindings: settings.keyBindings,
    graceMs: 260,
    onPrev: () => setPauseFocus((i) => ((i + 2) % 3) as 0 | 1 | 2),
    onNext: () => setPauseFocus((i) => ((i + 1) % 3) as 0 | 1 | 2),
    onConfirm: () => {
      if (pauseFocus === 0) {
        engineRef.current?.setPaused(false);
        setPaused(false);
      } else if (pauseFocus === 1) {
        audioEngine.stopMusic();
        onRestart();
      } else {
        audioEngine.stopMusic();
        onExit();
      }
    },
    onCancel: () => {
      engineRef.current?.setPaused(false);
      setPaused(false);
    },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CanvasRenderer(canvas, genreId);
    renderer.setShowDebugHud(settings.showDebugHud);

    const engine = new TaikoGameEngine(
      chart,
      mods,
      audioEngine,
      settings.audioOffsetMs,
      onFinish,
    );
    engineRef.current = engine;

    const input = new InputManager(
      settings.keyBindings,
      {
        onStrike: (side, hand) => {
          if (!engine.isPaused()) engine.handleStrike(side, hand);
        },
        onPauseToggle: () => {
          const next = !engine.isPaused();
          engine.setPaused(next);
          if (next) setPauseFocus(0);
          setPaused(next);
        },
        onAutoToggle: () => {
          const nextAuto = engine.toggleAutoPlay();
          setAutoOn(nextAuto);
        },
      },
      settings.gamepadDebounceMs ?? 25,
    );

    input.attach();
    audioEngine.startMusic(audioBuffer, 1600);

    let rafId = 0;
    const loop = (ts: number) => {
      if (!engine.isPaused()) {
        input.pollGamepads();
      }
      const snap = engine.update();
      renderer.render(snap, ts);
      rafId = window.requestAnimationFrame(loop);
    };
    rafId = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(rafId);
      input.detach();
      audioEngine.stopMusic();
      engineRef.current = null;
    };
  }, [chart, audioBuffer, genreId, mods, settings, onFinish]);

  const handleTouchDrumPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.bottom;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const drumRadius = Math.min(rect.width * 0.44, rect.height * 0.92);

    const hand: DrumHand = dx < 0 ? 'left' : 'right';
    const side: DrumSide = dist <= drumRadius * 0.72 ? 'don' : 'ka';
    engineRef.current?.handleStrike(side, hand);
  };

  return (
    <div className="screen play-screen">
      <canvas ref={canvasRef} className="game-canvas" />

      <div className="play-controls">
        <button
          className="hud-btn"
          onClick={() => {
            const eng = engineRef.current;
            if (!eng) return;
            const next = !eng.isPaused();
            eng.setPaused(next);
            if (next) setPauseFocus(0);
            setPaused(next);
          }}
        >
          ⏸ 暂停 (Esc)
        </button>
        <button
          className={`hud-btn ${autoOn ? 'hud-btn-active' : ''}`}
          onClick={() => {
            const eng = engineRef.current;
            if (!eng) return;
            setAutoOn(eng.toggleAutoPlay());
          }}
        >
          🤖 Auto: {autoOn ? 'ON' : 'OFF'} (F1)
        </button>
        <button
          className={`hud-btn ${touchDrumVisible ? 'hud-btn-active' : ''}`}
          onClick={() => setTouchDrumVisible((v) => !v)}
        >
          🥁 触控鼓面
        </button>
      </div>

      {touchDrumVisible && (
        <div
          className="touch-drum-zone"
          onPointerDown={handleTouchDrumPointer}
        >
          <img
            src="/assets/img/ui/touch_drum.png"
            alt="Touch Drum"
            className="touch-drum-img"
            draggable={false}
          />
          <div className="touch-drum-hint">外圈蓝色 = 咔 · 内圈红色 = 咚</div>
        </div>
      )}

      {paused && (
        <div className="modal-backdrop">
          <div className="pause-modal">
            <h3>演奏暂停</h3>
            <p className="pause-song-name">{chart.meta.title}</p>
            <div className="pause-actions">
              <button
                className={`btn-primary ${pauseFocus === 0 ? 'drum-focused' : ''}`}
                onMouseEnter={() => setPauseFocus(0)}
                onClick={() => {
                  engineRef.current?.setPaused(false);
                  setPaused(false);
                }}
              >
                继续演奏
              </button>
              <button
                className={`btn-secondary ${pauseFocus === 1 ? 'drum-focused' : ''}`}
                onMouseEnter={() => setPauseFocus(1)}
                onClick={() => {
                  audioEngine.stopMusic();
                  onRestart();
                }}
              >
                重新开始
              </button>
              <button
                className={`btn-ghost ${pauseFocus === 2 ? 'drum-focused' : ''}`}
                onMouseEnter={() => setPauseFocus(2)}
                onClick={() => {
                  audioEngine.stopMusic();
                  onExit();
                }}
              >
                返回选歌
              </button>
            </div>
            <div className="pause-drum-hint">🔵 左/右咔切换 · 🔴 咚确认</div>
          </div>
        </div>
      )}
    </div>
  );
};
