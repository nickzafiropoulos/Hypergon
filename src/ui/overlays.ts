import type { Game } from '../game/Game';
import { resumeAudio, SFX } from '../game/audio';
import { playMusic, setMusicDucked, unlockMusic } from '../game/music';

function formatTime(seconds: number): string {
  const totalCs = Math.floor(Math.max(0, seconds) * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;
}

function howToPlayKeysHtml(): string {
  return `<div class="keys">
        <div class="key"><b>MOVE</b><span>Arrow keys &nbsp;/&nbsp; WASD &nbsp;/&nbsp; left stick</span></div>
        <div class="key"><b>AIM &amp; FIRE</b><span>Mouse position + hold click &nbsp;/&nbsp; right stick. F locks auto-fire.</span></div>
        <div class="key"><b>SHOCKWAVE</b><span>Space or right-click - clears the board</span></div>
        <div class="key"><b>SWAP WEAPON</b><span>Q / E through anything you're carrying</span></div>
        <div class="key"><b>PICKUPS</b><span>Hexagons are weapons. Stars are powers.</span></div>
        <div class="key"><b>MULTIPLIER</b><span>Cyan cores raise it. Dying resets it.</span></div>
      </div>`;
}

type RunStats = {
  score: number;
  best: number;
  kills: number;
  elapsed: number;
  sector: number;
  mode?: 'survival' | 'boss' | 'adventure';
};

export class Overlays {
  veil: HTMLElement;
  panel: HTMLElement;
  private game: Game;
  private onHideVeil: () => void;
  private onShowVeil: () => void;
  /** True while mode-select panel is showing (state stays menu). */
  selectingMode = false;
  /** How-to-play modal open on the landing page. */
  private howtoOpen = false;
  private howtoEscHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(game: Game, opts: { onHideVeil: () => void; onShowVeil: () => void }) {
    this.game = game;
    this.veil = document.getElementById('veil')!;
    this.panel = document.getElementById('panel')!;
    this.onHideVeil = opts.onHideVeil;
    this.onShowVeil = opts.onShowVeil;
    this.panel.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement | null)?.closest('button');
      if (!t || !this.panel.contains(t)) return;
      // Launch plays its own long tone from the button handler.
      if (t.dataset.sfx === 'launch') return;
      resumeAudio();
      SFX.uiClick();
    });
    this.panel.addEventListener('pointerover', (e) => {
      const t = (e.target as HTMLElement | null)?.closest('button');
      if (!t || !this.panel.contains(t)) return;
      const from = e.relatedTarget as Node | null;
      if (from && t.contains(from)) return;
      resumeAudio();
      SFX.uiHover();
    });
  }

  /** Close how-to modal if open. Returns true when it consumed the action. */
  closeHowtoIfOpen(): boolean {
    if (!this.howtoOpen) return false;
    this.closeHowto();
    return true;
  }

  show(): void {
    this.veil.classList.remove('hide');
    this.onShowVeil();
  }

  hide(): void {
    this.veil.classList.add('hide');
    this.onHideVeil();
  }

  menuPanel(): void {
    this.selectingMode = false;
    this.closeHowto();
    setMusicDucked(false);
    playMusic('menu');
    this.panel.innerHTML = `
      <h1 class="glyph logo">HYPERGON</h1>
      <div class="cta-stack">
        <button class="cta" id="go" type="button" data-sfx="launch">Launch</button>
        <button class="cta secondary" id="howto" type="button">How to play</button>
      </div>
      <p class="fine">P pause · M mute · F auto-fire</p>
      <div class="howto-modal hide" id="howto-modal" role="dialog" aria-modal="true" aria-labelledby="howto-title" hidden>
        <div class="howto-card">
          <h2 class="glyph howto-title" id="howto-title">How to play</h2>
          ${howToPlayKeysHtml()}
          <button class="cta secondary" id="howto-close" type="button">Got it</button>
        </div>
      </div>`;
    this.show();
    document.getElementById('go')!.onclick = () => {
      this.closeHowto();
      resumeAudio();
      SFX.launch();
      unlockMusic();
      playMusic('menu');
      this.modeSelectPanel();
    };
    document.getElementById('howto')!.onclick = () => this.openHowto();
    const modal = document.getElementById('howto-modal');
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) this.closeHowto();
    });
    document.getElementById('howto-close')!.onclick = () => this.closeHowto();
  }

  private openHowto(): void {
    const modal = document.getElementById('howto-modal');
    if (!modal) return;
    this.howtoOpen = true;
    modal.classList.remove('hide');
    modal.hidden = false;
    document.getElementById('howto-close')?.focus();
    if (!this.howtoEscHandler) {
      this.howtoEscHandler = (e: KeyboardEvent) => {
        if (e.code !== 'Escape' || !this.howtoOpen) return;
        e.preventDefault();
        this.closeHowto();
      };
      window.addEventListener('keydown', this.howtoEscHandler, true);
    }
  }

  private closeHowto(): void {
    this.howtoOpen = false;
    const modal = document.getElementById('howto-modal');
    if (modal) {
      modal.classList.add('hide');
      modal.hidden = true;
    }
    if (this.howtoEscHandler) {
      window.removeEventListener('keydown', this.howtoEscHandler, true);
      this.howtoEscHandler = null;
    }
  }

  modeSelectPanel(): void {
    this.closeHowto();
    this.game.state = 'menu';
    this.selectingMode = true;
    resumeAudio();
    unlockMusic();
    playMusic('menu');
    this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">SELECT MODE</h1>
      <p class="tag">choose your gauntlet</p>
      <div class="mode-cards">
        <button type="button" class="mode-card" id="mode-survival">
          <span class="mode-card-title">SURVIVAL</span>
          <span class="mode-card-blurb">Endless sectors. Survive the swarm.</span>
        </button>
        <button type="button" class="mode-card" id="mode-boss">
          <span class="mode-card-title">BEAT THE BOSSES</span>
          <span class="mode-card-blurb">Defeat 20 bosses in a row.</span>
        </button>
        <button type="button" class="mode-card" id="mode-adventure">
          <span class="mode-card-title">ADVENTURE</span>
          <span class="mode-card-blurb">Auto-scroll. 10 bosses.</span>
        </button>
      </div>
      <button class="cta secondary" id="back" type="button">Back</button>
      <p class="fine">or press Enter for Survival</p>`;
    this.show();
    document.getElementById('mode-survival')!.onclick = () => {
      this.selectingMode = false;
      this.game.startRun('survival');
    };
    document.getElementById('mode-boss')!.onclick = () => {
      this.selectingMode = false;
      this.game.startRun('boss');
    };
    document.getElementById('mode-adventure')!.onclick = () => {
      this.selectingMode = false;
      this.game.startRun('adventure');
    };
    document.getElementById('back')!.onclick = () => {
      this.menuPanel();
    };
  }

  pausePanel(): void {
    this.selectingMode = false;
    const modeTag =
      this.game.mode === 'boss'
        ? `Boss ${this.game.bosses.progressLabel()} · ${formatTime(this.game.elapsed)} · ×${this.game.mult}`
        : this.game.mode === 'adventure'
          ? `Level ${this.game.adventure.progressLabel()} · ${formatTime(this.game.elapsed)} · ×${this.game.mult}`
          : `Sector ${this.game.sector} · ×${this.game.mult}`;
    this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">HOLDING</h1>
      <p class="tag">Score ${this.game.score.toLocaleString('en-GB')} · ${modeTag}</p>
      <button class="cta" id="go" type="button" data-sfx="launch">Resume</button>
      <p class="fine">P or Esc</p>`;
    this.show();
    document.getElementById('go')!.onclick = () => {
      resumeAudio();
      SFX.launch();
      this.game.togglePause();
    };
  }

  overPanel(stats: RunStats): void {
    this.selectingMode = false;
    const adventureMode = stats.mode === 'adventure' || this.game.mode === 'adventure';
    const bossMode = !adventureMode && (stats.mode === 'boss' || this.game.mode === 'boss');
    const bossesCleared = this.game.bosses.cleared;
    const thirdLabel = adventureMode || bossMode ? 'Bosses' : 'Kills';
    const thirdVal = adventureMode || bossMode ? bossesCleared : stats.kills;
    const timeLabel = adventureMode || bossMode ? 'Time' : 'Survived';
    this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">SIGNAL LOST</h1>
      <div class="stats">
        <div><span class="lbl">Score</span><div class="val">${stats.score.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Best</span><div class="val" style="color:var(--acid)">${stats.best.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">${thirdLabel}</span><div class="val">${thirdVal}</div></div>
        <div><span class="lbl">${timeLabel}</span><div class="val">${formatTime(stats.elapsed)}</div></div>
      </div>
      <div class="cta-stack">
        <button class="cta" id="go" type="button">Try again</button>
        <button class="cta secondary" id="quit" type="button">Quit to start screen</button>
      </div>
      <p class="fine">or press Enter to try again</p>`;
    this.show();
    document.getElementById('go')!.onclick = () => {
      this.game.startRun();
    };
    document.getElementById('quit')!.onclick = () => {
      this.game.state = 'menu';
      this.menuPanel();
    };
  }

  victoryPanel(stats: RunStats): void {
    this.selectingMode = false;
    const adventureMode = stats.mode === 'adventure' || this.game.mode === 'adventure';
    const bosses = adventureMode ? 10 : 20;
    const retryMode = adventureMode ? 'adventure' : 'boss';
    this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">SECTOR CLEARED</h1>
      <p class="tag">${bosses} bosses down</p>
      <div class="stats">
        <div><span class="lbl">Score</span><div class="val">${stats.score.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Best</span><div class="val" style="color:var(--acid)">${stats.best.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Bosses</span><div class="val">${bosses}</div></div>
        <div><span class="lbl">Time</span><div class="val">${formatTime(stats.elapsed)}</div></div>
      </div>
      <div class="cta-stack">
        <button class="cta" id="go" type="button">Try again</button>
        <button class="cta secondary" id="quit" type="button">Quit to start screen</button>
      </div>
      <p class="fine">or press Enter to try again</p>`;
    this.show();
    document.getElementById('go')!.onclick = () => {
      this.game.startRun(retryMode);
    };
    document.getElementById('quit')!.onclick = () => {
      this.game.state = 'menu';
      this.menuPanel();
    };
  }
}
