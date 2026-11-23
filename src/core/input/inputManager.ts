import { DrumHand, DrumSide } from '../audio/audioEngine';
import { KeyBindings } from '../../platform/types';

export interface InputCallbacks {
  onStrike: (side: DrumSide, hand: DrumHand) => void;
  onPauseToggle: () => void;
  onAutoToggle: () => void;
}

export class InputManager {
  private bindings: KeyBindings;
  private callbacks: InputCallbacks;
  private prevGamepadButtons = new Map<number, boolean[]>();
  private attached = false;

  constructor(bindings: KeyBindings, callbacks: InputCallbacks) {
    this.bindings = { ...bindings };
    this.callbacks = callbacks;
  }

  updateBindings(bindings: KeyBindings): void {
    this.bindings = { ...bindings };
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;

    if (e.code === 'Escape') {
      e.preventDefault();
      this.callbacks.onPauseToggle();
      return;
    }
    if (e.code === 'F1') {
      e.preventDefault();
      this.callbacks.onAutoToggle();
      return;
    }

    if (e.code === this.bindings.leftKat) {
      e.preventDefault();
      this.callbacks.onStrike('ka', 'left');
    } else if (e.code === this.bindings.leftDon) {
      e.preventDefault();
      this.callbacks.onStrike('don', 'left');
    } else if (e.code === this.bindings.rightDon) {
      e.preventDefault();
      this.callbacks.onStrike('don', 'right');
    } else if (e.code === this.bindings.rightKat) {
      e.preventDefault();
      this.callbacks.onStrike('ka', 'right');
    }
  };

  /**
   * Poll connected Gamepad / TaTaCon controllers on each animation frame.
   */
  pollGamepads(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      const prev = this.prevGamepadButtons.get(pad.index) ?? [];
      const curr = pad.buttons.map((b) => b.pressed);

      const justPressed = (idx: number) => Boolean(curr[idx] && !prev[idx]);

      // Standard gamepad + Switch TaTaCon common button mapping:
      // Left Don: D-pad Down/Right (13, 15) or L3 (10)
      // Right Don: Face Down/Left (0, 2) or R3 (11)
      // Left Kat: L1/L2 (4, 6) or D-pad Left/Up (14, 12)
      // Right Kat: R1/R2 (5, 7) or Face Right/Up (1, 3)
      if (justPressed(13) || justPressed(15) || justPressed(10)) {
        this.callbacks.onStrike('don', 'left');
      }
      if (justPressed(0) || justPressed(2) || justPressed(11)) {
        this.callbacks.onStrike('don', 'right');
      }
      if (justPressed(4) || justPressed(6) || justPressed(14) || justPressed(12)) {
        this.callbacks.onStrike('ka', 'left');
      }
      if (justPressed(5) || justPressed(7) || justPressed(1) || justPressed(3)) {
        this.callbacks.onStrike('ka', 'right');
      }
      if (justPressed(9)) {
        this.callbacks.onPauseToggle();
      }

      this.prevGamepadButtons.set(pad.index, curr);
    }
  }
}
