import type { InputSystem } from '../input/InputSystem';

/** Visible twin-stick + bomb/pause for touch devices. */
export class TouchControls {
  root: HTMLElement;
  private input: InputSystem;
  private onBomb: () => void;
  private onPause: () => void;
  private moveKnob: HTMLElement;
  private aimKnob: HTMLElement;
  private moveBase: HTMLElement;
  private aimBase: HTMLElement;

  constructor(
    input: InputSystem,
    hooks: { onBomb: () => void; onPause: () => void },
  ) {
    this.input = input;
    this.onBomb = hooks.onBomb;
    this.onPause = hooks.onPause;
    this.root = document.getElementById('touch-ui')!;
    this.moveBase = document.getElementById('stick-move')!;
    this.aimBase = document.getElementById('stick-aim')!;
    this.moveKnob = this.moveBase.querySelector('.knob')!;
    this.aimKnob = this.aimBase.querySelector('.knob')!;

    this.bindStick(this.moveBase, 'move', this.moveKnob);
    this.bindStick(this.aimBase, 'aim', this.aimKnob);

    document.getElementById('touch-bomb')!.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onBomb();
      },
      { passive: false },
    );
    document.getElementById('touch-pause')!.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onPause();
      },
      { passive: false },
    );
  }

  private bindStick(
    el: HTMLElement,
    kind: 'move' | 'aim',
    knob: HTMLElement,
  ): void {
    const resetKnob = () => {
      knob.style.transform = 'translate(-50%, -50%)';
    };

    el.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        this.input.beginStick(kind, e.pointerId, cx, cy);
        this.input.moveStick(e.pointerId, e.clientX, e.clientY);
        this.placeKnob(knob, cx, cy, e.clientX, e.clientY, rect.width * 0.38);
      },
      { passive: false },
    );

    el.addEventListener(
      'pointermove',
      (e) => {
        if (!el.hasPointerCapture(e.pointerId)) return;
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        this.input.moveStick(e.pointerId, e.clientX, e.clientY);
        this.placeKnob(knob, cx, cy, e.clientX, e.clientY, rect.width * 0.38);
      },
      { passive: false },
    );

    const end = (e: PointerEvent) => {
      this.input.endStick(e.pointerId);
      resetKnob();
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  private placeKnob(
    knob: HTMLElement,
    cx: number,
    cy: number,
    x: number,
    y: number,
    max: number,
  ): void {
    let dx = x - cx;
    let dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('show', v);
  }

  setPlaying(playing: boolean): void {
    this.root.classList.toggle('playing', playing);
  }
}
