export type StickState = {
  mx: number;
  my: number;
  ax: number;
  ay: number;
  firing: boolean;
};

export type InputCallbacks = {
  onPause: () => void;
  onMute: () => void;
  onAutofire: () => void;
  onCycleWeapon: (dir: number) => void;
  onBomb: () => void;
  onStart: () => void;
  isPlaying: () => boolean;
  getPlayerPos: () => { x: number; y: number; ang: number };
  getSize: () => { W: number; H: number };
};

/**
 * Separates held movement keys from edge-triggered actions.
 * Arrows (+ WASD) move; mouse pointer aims and fires.
 */
export class InputSystem {
  readonly held: Record<string, boolean> = Object.create(null);
  pointer = { x: 0, y: 0, down: false, active: false };
  autofire = false;
  touchMove = { id: null as number | null, ox: 0, oy: 0, x: 0, y: 0 };
  touchAim = { id: null as number | null, ox: 0, oy: 0, x: 0, y: 0 };
  padsOk = true;
  private padBomb = false;
  private cbs: InputCallbacks;
  private canvas: HTMLCanvasElement;
  touchUiVisible = false;

  constructor(canvas: HTMLCanvasElement, cbs: InputCallbacks) {
    this.canvas = canvas;
    this.cbs = cbs;
    this.bind();
  }

  private bind(): void {
    addEventListener('keydown', (e) => {
      const block = [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Space',
        'KeyQ',
        'KeyE',
      ];
      if (block.includes(e.code)) e.preventDefault();

      const wasDown = !!this.held[e.code];
      this.held[e.code] = true;
      if (wasDown) return; // edge-triggered only

      if (e.code === 'KeyP' || e.code === 'Escape') this.cbs.onPause();
      if (e.code === 'KeyM') this.cbs.onMute();
      if (e.code === 'KeyF') {
        this.autofire = !this.autofire;
        this.cbs.onAutofire();
      }
      if (e.code === 'KeyQ') this.cbs.onCycleWeapon(-1);
      if (e.code === 'KeyE') this.cbs.onCycleWeapon(1);
      if (e.code === 'Space') this.cbs.onBomb();
      if (e.code === 'Enter' && !this.cbs.isPlaying()) this.cbs.onStart();
    });

    addEventListener('keyup', (e) => {
      this.held[e.code] = false;
    });

    // Pointer events — reliable simultaneous move + fire
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return; // handled by touch sticks / UI
      if (e.button === 2) {
        e.preventDefault();
        this.cbs.onBomb();
        return;
      }
      if (e.button !== 0) return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.down = true;
      this.pointer.active = true;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.active = true;
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button === 0) this.pointer.down = false;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });

    this.canvas.addEventListener('pointercancel', () => {
      this.pointer.down = false;
    });

    addEventListener('contextmenu', (e) => e.preventDefault());

    addEventListener('blur', () => {
      for (const k in this.held) this.held[k] = false;
      this.pointer.down = false;
      if (this.cbs.isPlaying()) this.cbs.onPause();
    });

    // Coarse pointer / touch detection for UI
    const mq = matchMedia('(pointer: coarse)');
    this.touchUiVisible = mq.matches || 'ontouchstart' in window;
    mq.addEventListener?.('change', () => {
      this.touchUiVisible = mq.matches || 'ontouchstart' in window;
    });
  }

  /** Virtual stick assignment from touch UI layer. */
  beginStick(kind: 'move' | 'aim', id: number, x: number, y: number): void {
    const st = kind === 'move' ? this.touchMove : this.touchAim;
    if (st.id !== null) return;
    st.id = id;
    st.ox = st.x = x;
    st.oy = st.y = y;
  }

  moveStick(id: number, x: number, y: number): void {
    for (const st of [this.touchMove, this.touchAim]) {
      if (st.id === id) {
        st.x = x;
        st.y = y;
      }
    }
  }

  endStick(id: number): void {
    for (const st of [this.touchMove, this.touchAim]) {
      if (st.id === id) st.id = null;
    }
  }

  readSticks(): StickState {
    let mx = 0;
    let my = 0;
    let ax = 0;
    let ay = 0;
    let firing = false;
    const keys = this.held;

    // Movement: arrows primary, WASD alternate
    if (keys.ArrowUp || keys.KeyW) my -= 1;
    if (keys.ArrowDown || keys.KeyS) my += 1;
    if (keys.ArrowLeft || keys.KeyA) mx -= 1;
    if (keys.ArrowRight || keys.KeyD) mx += 1;

    // Gamepad
    if (this.padsOk) {
      let pads: (Gamepad | null)[] | null = null;
      try {
        pads = navigator.getGamepads ? navigator.getGamepads() : null;
      } catch {
        this.padsOk = false;
        pads = null;
      }
      if (pads) {
        for (const p of pads) {
          if (!p) continue;
          const dz = (v: number) => (Math.abs(v) > 0.22 ? v : 0);
          mx += dz(p.axes[0] || 0);
          my += dz(p.axes[1] || 0);
          const rx = dz(p.axes[2] || 0);
          const ry = dz(p.axes[3] || 0);
          if (rx || ry) {
            ax += rx;
            ay += ry;
            firing = true;
          }
          if (p.buttons[7]?.pressed) firing = true;
          if (p.buttons[0] && p.buttons[0].value > 0.5 && !this.padBomb) {
            this.padBomb = true;
            this.cbs.onBomb();
          } else if (p.buttons[0] && p.buttons[0].value <= 0.5) {
            this.padBomb = false;
          }
          break;
        }
      }
    }

    // Touch sticks
    if (this.touchMove.id !== null) {
      const dx = this.touchMove.x - this.touchMove.ox;
      const dy = this.touchMove.y - this.touchMove.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        mx += dx / Math.max(d, 60);
        my += dy / Math.max(d, 60);
      }
    }
    if (this.touchAim.id !== null) {
      const player = this.cbs.getPlayerPos();
      const dx = this.touchAim.x - this.touchAim.ox;
      const dy = this.touchAim.y - this.touchAim.oy;
      const d = Math.hypot(dx, dy);
      if (d > 8) {
        ax += dx;
        ay += dy;
        firing = true;
      } else {
        ax = Math.cos(player.ang);
        ay = Math.sin(player.ang);
        firing = true;
      }
    }

    // Mouse aim / fire (desktop) — only when not using touch aim
    if (this.touchAim.id === null && !ax && !ay) {
      const player = this.cbs.getPlayerPos();
      ax = this.pointer.x - player.x;
      ay = this.pointer.y - player.y;
      if (this.pointer.down || this.autofire) firing = true;
    }

    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    return { mx, my, ax, ay, firing };
  }
}
