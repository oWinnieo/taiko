import { DrumHand, DrumSide } from '../audio/audioEngine';

export interface GamepadEventCallbacks {
  onStrike: (side: DrumSide, hand: DrumHand) => void;
  onPause?: () => void;
  onCancel?: () => void;
}

export interface ConnectedGamepadInfo {
  id: string;
  index: number;
  mapping: string;
}

export function getConnectedGamepads(): ConnectedGamepadInfo[] {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return [];
  }
  const result: ConnectedGamepadInfo[] = [];
  for (const pad of navigator.getGamepads()) {
    if (!pad || !pad.connected) continue;
    result.push({ id: pad.id, index: pad.index, mapping: pad.mapping || 'raw' });
  }
  return result;
}

type SensorKey = 'leftDon' | 'rightDon' | 'leftKat' | 'rightKat';

/**
 * Shared Gamepad / Switch TaTaCon (0x0f0d:0x00f0) poller with independent
 * per-sensor debounce so plastic drum shell rebound doesn't double-trigger
 * while preserving fast alternating L/R drumrolls.
 */
export class GamepadDrumPoller {
  private prevButtons = new Map<number, boolean[]>();
  private lastSensorAt: Record<SensorKey, number> = {
    leftDon: -Infinity,
    rightDon: -Infinity,
    leftKat: -Infinity,
    rightKat: -Infinity,
  };
  private debounceMs: number;

  constructor(debounceMs = 25) {
    this.debounceMs = debounceMs;
  }

  setDebounceMs(ms: number): void {
    this.debounceMs = Math.max(0, ms);
  }

  reset(): void {
    this.prevButtons.clear();
  }

  poll(callbacks: GamepadEventCallbacks, nowMs = performance.now()): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const pads = navigator.getGamepads();

    const triggerSensor = (key: SensorKey, side: DrumSide, hand: DrumHand) => {
      if (nowMs - this.lastSensorAt[key] < this.debounceMs) return;
      this.lastSensorAt[key] = nowMs;
      callbacks.onStrike(side, hand);
    };

    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const curr = pad.buttons.map((b) => b.pressed);
      const prev = this.prevButtons.get(pad.index);

      // On first sight of a gamepad, snapshot current state so held buttons don't fire immediately
      if (!prev) {
        this.prevButtons.set(pad.index, curr);
        continue;
      }

      const justPressed = (idx: number) => Boolean(curr[idx] && !prev[idx]);
      const isTaikoId = /0f0d.*00f0|taiko/i.test(pad.id);

      if (isTaikoId) {
        // Native HORI / DOBE Switch TaTaCon (VID 0x0f0d, PID 0x00f0):
        // L3=10 (leftDon), R3=11 (rightDon), ZL=6 (leftKat), ZR=7 (rightKat)
        // Also allow L=4 / R=5 as fallback kat, Plus=9 pause, Minus=8 or B=1 cancel
        if (justPressed(10)) triggerSensor('leftDon', 'don', 'left');
        if (justPressed(11)) triggerSensor('rightDon', 'don', 'right');
        if (justPressed(6) || justPressed(4)) triggerSensor('leftKat', 'ka', 'left');
        if (justPressed(7) || justPressed(5)) triggerSensor('rightKat', 'ka', 'right');
        if (justPressed(9)) callbacks.onPause?.();
        if (justPressed(8)) callbacks.onCancel?.();
      } else {
        // Generic standard gamepad mapping
        if (justPressed(13) || justPressed(15) || justPressed(10)) {
          triggerSensor('leftDon', 'don', 'left');
        }
        if (justPressed(0) || justPressed(2) || justPressed(11)) {
          triggerSensor('rightDon', 'don', 'right');
        }
        if (justPressed(4) || justPressed(6) || justPressed(14) || justPressed(12)) {
          triggerSensor('leftKat', 'ka', 'left');
        }
        if (justPressed(5) || justPressed(7) || justPressed(1) || justPressed(3)) {
          triggerSensor('rightKat', 'ka', 'right');
        }
        if (justPressed(9)) callbacks.onPause?.();
        if (justPressed(8)) callbacks.onCancel?.();
      }

      this.prevButtons.set(pad.index, curr);
    }
  }
}
