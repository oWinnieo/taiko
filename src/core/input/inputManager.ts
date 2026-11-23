import { DrumHand, DrumSide } from '../audio/audioEngine';
import { KeyBindings } from '../../platform/types';
import { GamepadDrumPoller } from './gamepadPoller';

export interface InputCallbacks {
  onStrike: (side: DrumSide, hand: DrumHand) => void;
  onPauseToggle: () => void;
  onAutoToggle: () => void;
}

export class InputManager {
  private bindings: KeyBindings;
  private callbacks: InputCallbacks;
  private gamepadPoller: GamepadDrumPoller;
  private attached = false;

  constructor(bindings: KeyBindings, callbacks: InputCallbacks, gamepadDebounceMs = 25) {
    this.bindings = { ...bindings };
    this.callbacks = callbacks;
    this.gamepadPoller = new GamepadDrumPoller(gamepadDebounceMs);
  }

  updateBindings(bindings: KeyBindings): void {
    this.bindings = { ...bindings };
  }

  setGamepadDebounceMs(ms: number): void {
    this.gamepadPoller.setDebounceMs(ms);
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
    this.gamepadPoller.poll({
      onStrike: this.callbacks.onStrike,
      onPause: this.callbacks.onPauseToggle,
    });
  }
}
