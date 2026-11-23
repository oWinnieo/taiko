import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '../audio/audioEngine';
import { KeyBindings } from '../../platform/types';
import { ConnectedGamepadInfo, GamepadDrumPoller, getConnectedGamepads } from './gamepadPoller';

export interface DrumMenuHandlers {
  enabled?: boolean;
  keyBindings?: KeyBindings;
  graceMs?: number; // Ignore inputs briefly after mounting (e.g. Result / Pause)
  menuCooldownMs?: number; // Prevent accidental double-step in menus
  onPrev: () => void; // Left Kat (or ArrowLeft / ArrowUp)
  onNext: () => void; // Right Kat (or ArrowRight / ArrowDown)
  onConfirm: () => void; // Left/Right Don (or Enter)
  onCancel?: () => void; // Escape / Gamepad Minus
  playSound?: boolean;
}

/**
 * Enables Switch / Arcade-style drum menu navigation on any non-gameplay UI:
 * - Left Kat  -> move left / previous option
 * - Right Kat -> move right / next option
 * - Don       -> confirm / press focused button
 * - Minus/Esc -> back / cancel
 */
export function useDrumMenuInput(handlers: DrumMenuHandlers): ConnectedGamepadInfo[] {
  const {
    enabled = true,
    keyBindings,
    graceMs = 120,
    menuCooldownMs = 135,
    playSound = true,
  } = handlers;

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [gamepads, setGamepads] = useState<ConnectedGamepadInfo[]>(() => getConnectedGamepads());

  useEffect(() => {
    const syncPads = () => setGamepads(getConnectedGamepads());
    window.addEventListener('gamepadconnected', syncPads);
    window.addEventListener('gamepaddisconnected', syncPads);
    const id = window.setInterval(syncPads, 1200);
    return () => {
      window.removeEventListener('gamepadconnected', syncPads);
      window.removeEventListener('gamepaddisconnected', syncPads);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const readyAt = performance.now() + graceMs;
    let lastNavAt = -Infinity;
    let lastConfirmAt = -Infinity;
    const poller = new GamepadDrumPoller(35);

    const triggerPrev = () => {
      const now = performance.now();
      if (now < readyAt || now - lastNavAt < menuCooldownMs) return;
      lastNavAt = now;
      if (playSound) {
        audioEngine.ensureContext();
        audioEngine.playDrum('ka', 'left');
      }
      handlersRef.current.onPrev();
    };

    const triggerNext = () => {
      const now = performance.now();
      if (now < readyAt || now - lastNavAt < menuCooldownMs) return;
      lastNavAt = now;
      if (playSound) {
        audioEngine.ensureContext();
        audioEngine.playDrum('ka', 'right');
      }
      handlersRef.current.onNext();
    };

    const triggerConfirm = () => {
      const now = performance.now();
      if (now < readyAt || now - lastConfirmAt < 220) return;
      lastConfirmAt = now;
      if (playSound) {
        audioEngine.ensureContext();
        audioEngine.playDrum('don', 'both');
      }
      handlersRef.current.onConfirm();
    };

    const triggerCancel = () => {
      const now = performance.now();
      if (now < readyAt || now - lastConfirmAt < 220) return;
      lastConfirmAt = now;
      if (playSound) {
        audioEngine.ensureContext();
        audioEngine.playSynthSfx('cancel');
      }
      handlersRef.current.onCancel?.();
    };

    // Keyboard drum keys + arrows also navigate menus seamlessly
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const kb = keyBindings;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || (kb && e.code === kb.leftKat)) {
        e.preventDefault();
        triggerPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || (kb && e.code === kb.rightKat)) {
        e.preventDefault();
        triggerNext();
      } else if (
        e.key === 'Enter' ||
        (kb && (e.code === kb.leftDon || e.code === kb.rightDon))
      ) {
        e.preventDefault();
        triggerConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        triggerCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    let rafId = 0;
    const tick = () => {
      poller.poll({
        onStrike: (side, hand) => {
          if (side === 'ka') {
            if (hand === 'left') triggerPrev();
            else triggerNext();
          } else {
            triggerConfirm();
          }
        },
        onCancel: triggerCancel,
      });
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.cancelAnimationFrame(rafId);
    };
  }, [enabled, keyBindings, graceMs, menuCooldownMs, playSound]);

  return gamepads;
}
