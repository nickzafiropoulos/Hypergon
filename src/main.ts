import './styles/main.css';
import { Game } from './game/Game';
import { Hud } from './ui/hud';
import { Overlays } from './ui/overlays';
import { TouchControls } from './ui/touch';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const toastEl = document.getElementById('toast')!;
const toastTxt = document.getElementById('toasttxt')!;
const toastSub = document.getElementById('toastsub')!;
const orientHint = document.getElementById('orient-hint')!;

let toastT = 0;

function toast(txt: string, sub = '', ms = 1000, col = '#eaf6ff'): void {
  toastTxt.textContent = txt;
  toastSub.textContent = sub;
  toastEl.style.color = col;
  toastEl.style.opacity = '1';
  toastT = ms / 1000;
}

let overlays!: Overlays;
let touch!: TouchControls;
const hud = new Hud();

const game = new Game(canvas, {
  toast,
  onPause: () => {
    overlays.pausePanel();
    touch.setPlaying(false);
  },
  onResume: () => {
    overlays.hide();
    touch.setPlaying(true);
  },
  onEnterPlay: () => {
    overlays.hide();
    touch.setPlaying(true);
  },
  onGameOver: (stats) => {
    touch.setPlaying(false);
    void overlays.overPanel(stats);
  },
});

overlays = new Overlays(game, {
  onHideVeil: () => {
    if (game.state === 'play') touch.setPlaying(true);
  },
  onShowVeil: () => {
    touch.setPlaying(false);
  },
});

touch = new TouchControls(game.input, {
  onBomb: () => game.fireBomb(),
  onPause: () => game.togglePause(),
});

const showTouch = game.input.touchUiVisible;
touch.setVisible(showTouch);
hud.setTouchHints(showTouch);

function updateOrientHint(): void {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const short = window.innerHeight < 420;
  orientHint.classList.toggle('show', coarse && short);
}
updateOrientHint();
addEventListener('resize', updateOrientHint);

void overlays.menuPanel();

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 1 / 30);
  if (game.hitstop > 0) {
    game.hitstop -= dt;
    dt *= 0.18;
  }

  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) toastEl.style.opacity = '0';
  }

  if (game.state === 'play' || game.state === 'over') {
    if (game.state === 'play') game.update(dt);
    else {
      game.grid.update(dt);
      for (let i = game.parts.length - 1; i >= 0; i--) {
        const p = game.parts[i]!;
        p.life -= dt;
        if (p.life <= 0) {
          game.parts.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      game.shake = Math.max(0, game.shake - dt * 46);
    }
    game.render();
    hud.draw(game);
  } else if (game.state === 'paused') {
    game.render();
  } else {
    game.renderAttract(dt);
  }
}

requestAnimationFrame(frame);

// Expose for debugging in prototype phase
(window as unknown as { __hypergon?: Game }).__hypergon = game;
