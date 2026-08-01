import type { Game } from '../game/Game';
import {
  fetchBossScores,
  fetchTopScores,
  getSessionToken,
  isLeaderboardConfigured,
  submitScore,
  waitForGameSession,
  type BossScoreRow,
  type ScoreRow,
} from '../leaderboard/supabase';
import { sanitizeName } from '../leaderboard/profanity';
import { burstBoardConfetti, stopConfetti } from './confetti';
import { resumeAudio, SFX } from '../game/audio';
import { playMusic, setMusicDucked, unlockMusic } from '../game/music';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(seconds: number): string {
  const totalCs = Math.floor(Math.max(0, seconds) * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;
}

type SurvivalHighlight = { kind: 'survival'; name: string; score: number };
type BossHighlight = { kind: 'boss'; name: string; bosses: number; elapsed: number };
type BoardHighlight = SurvivalHighlight | BossHighlight;

function findSurvivalHighlight(rows: ScoreRow[], highlight?: BoardHighlight): number {
  if (!highlight || highlight.kind !== 'survival') return -1;
  const key = highlight.name.toLowerCase();
  return rows.findIndex((r) => r.name.toLowerCase() === key && r.score === highlight.score);
}

function findBossHighlight(rows: BossScoreRow[], highlight?: BoardHighlight): number {
  if (!highlight || highlight.kind !== 'boss') return -1;
  const key = highlight.name.toLowerCase();
  return rows.findIndex(
    (r) =>
      r.name.toLowerCase() === key &&
      r.bosses_killed === highlight.bosses &&
      Math.floor(r.elapsed * 1000) === Math.floor(highlight.elapsed * 1000),
  );
}

function survivalBoardHtml(rows: ScoreRow[], highlight?: BoardHighlight): string {
  if (!rows.length) {
    const msg = isLeaderboardConfigured()
      ? 'No scores yet - be the first.'
      : 'Leaderboard not configured.';
    return `<p class="board-empty">${msg}</p>`;
  }
  const rankW = String(rows.length).length;
  const mine = findSurvivalHighlight(rows, highlight);
  return `<div class="board-scroll"><ol class="board">${rows
    .map((r, i) => {
      const af = r.autofire
        ? `<span class="af" title="Auto-fire used">AF</span>`
        : '';
      const rank = String(i + 1).padStart(Math.max(2, rankW), '0');
      const mineCls = i === mine ? ' mine' : '';
      const mineId = i === mine ? ' id="board-row-mine"' : '';
      return `<li class="board-row${mineCls}"${mineId}><span class="rank">${rank}</span><span class="who"><span class="who-name">${escapeHtml(r.name)}</span>${af}</span><span class="pts">${r.score.toLocaleString('en-GB')}</span></li>`;
    })
    .join('')}</ol></div>`;
}

function bossBoardHtml(rows: BossScoreRow[], highlight?: BoardHighlight): string {
  if (!rows.length) {
    const msg = isLeaderboardConfigured()
      ? 'No boss clears yet - be the first.'
      : 'Leaderboard not configured.';
    return `<p class="board-empty">${msg}</p>`;
  }
  const rankW = String(rows.length).length;
  const mine = findBossHighlight(rows, highlight);
  return `<div class="board-scroll"><ol class="board board-boss">${rows
    .map((r, i) => {
      const af = r.autofire
        ? `<span class="af" title="Auto-fire used">AF</span>`
        : '';
      const rank = String(i + 1).padStart(Math.max(2, rankW), '0');
      const mineCls = i === mine ? ' mine' : '';
      const mineId = i === mine ? ' id="board-row-mine"' : '';
      const bosses = `${r.bosses_killed}/20`;
      return `<li class="board-row${mineCls}"${mineId}><span class="rank">${rank}</span><span class="who"><span class="who-name">${escapeHtml(r.name)}</span>${af}</span><span class="bosses">${bosses}</span><span class="pts">${formatTime(r.elapsed)}</span></li>`;
    })
    .join('')}</ol></div>`;
}

function boardTabsHtml(active: 'survival' | 'boss'): string {
  return `<div class="board-tabs" role="tablist" aria-label="Leaderboards">
        <button type="button" class="board-tab${active === 'survival' ? ' active' : ''}" data-board="survival" role="tab" aria-selected="${active === 'survival' ? 'true' : 'false'}">Survival</button>
        <button type="button" class="board-tab${active === 'boss' ? ' active' : ''}" data-board="boss" role="tab" aria-selected="${active === 'boss' ? 'true' : 'false'}">Beat the Bosses</button>
      </div>`;
}

function boardBodyHtml(
  mode: 'survival' | 'boss',
  scores: ScoreRow[] | BossScoreRow[],
  highlight?: BoardHighlight,
): string {
  return mode === 'boss'
    ? bossBoardHtml(scores as BossScoreRow[], highlight)
    : survivalBoardHtml(scores as ScoreRow[], highlight);
}

function boardBlock(
  mode: 'survival' | 'boss',
  scores: ScoreRow[] | BossScoreRow[],
  highlight?: BoardHighlight,
  opts?: { tabs?: boolean },
): string {
  const title = mode === 'boss' ? 'Boss leaders' : 'Sector leaders';
  const head = opts?.tabs
    ? boardTabsHtml(mode)
    : `<h2 class="glyph board-title">${title}</h2>`;
  return `<div class="board-stage" data-board-mode="${mode}">
        <div class="board-wrap">
          ${head}
          <div class="board-body">${boardBodyHtml(mode, scores, highlight)}</div>
        </div>
      </div>`;
}

function focusBoardRow(): void {
  const scroll = document.querySelector('.board-scroll') as HTMLElement | null;
  const row = document.getElementById('board-row-mine');
  if (row && scroll) {
    const rowRect = row.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const target =
      scroll.scrollTop +
      (rowRect.top - scrollRect.top) -
      scroll.clientHeight / 2 +
      row.clientHeight / 2;
    scroll.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  const veil = document.getElementById('veil');
  if (veil) burstBoardConfetti(veil);
  resumeAudio();
  SFX.transmit();
}

type RunStats = {
  score: number;
  best: number;
  kills: number;
  elapsed: number;
  sector: number;
  autofire: boolean;
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
  /** Landing-page leaderboard tab. */
  private menuBoardTab: 'survival' | 'boss' = 'survival';
  private menuSurvivalScores: ScoreRow[] = [];
  private menuBossScores: BossScoreRow[] = [];

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

  show(): void {
    this.veil.classList.remove('hide');
    this.onShowVeil();
  }

  hide(): void {
    stopConfetti();
    this.veil.classList.add('hide');
    this.onHideVeil();
  }

  async menuPanel(): Promise<void> {
    stopConfetti();
    this.selectingMode = false;
    setMusicDucked(false);
    playMusic('menu');
    const [survival, boss] = await Promise.all([fetchTopScores(), fetchBossScores()]);
    this.menuSurvivalScores = survival;
    this.menuBossScores = boss;
    const tab = this.menuBoardTab;
    const scores = tab === 'boss' ? boss : survival;
    this.panel.innerHTML = `
      <h1 class="glyph logo">HYPERGON</h1>
      <div class="keys">
        <div class="key"><b>MOVE</b><span>Arrow keys &nbsp;/&nbsp; WASD &nbsp;/&nbsp; left stick</span></div>
        <div class="key"><b>AIM &amp; FIRE</b><span>Mouse position + hold click &nbsp;/&nbsp; right stick. F locks auto-fire.</span></div>
        <div class="key"><b>SHOCKWAVE</b><span>Space or right-click - clears the board</span></div>
        <div class="key"><b>SWAP WEAPON</b><span>Q / E through anything you're carrying</span></div>
        <div class="key"><b>PICKUPS</b><span>Hexagons are weapons. Stars are powers.</span></div>
        <div class="key"><b>MULTIPLIER</b><span>Cyan cores raise it. Dying resets it.</span></div>
      </div>
      ${boardBlock(tab, scores, undefined, { tabs: true })}
      <button class="cta" id="go" type="button" data-sfx="launch">Launch</button>
      <p class="fine">P pause · M mute · F auto-fire</p>`;
    this.show();
    this.bindMenuBoardTabs();
    document.getElementById('go')!.onclick = () => {
      resumeAudio();
      SFX.launch();
      unlockMusic();
      playMusic('menu');
      this.modeSelectPanel();
    };
  }

  private bindMenuBoardTabs(): void {
    const tabs = this.panel.querySelectorAll<HTMLButtonElement>('.board-tab');
    tabs.forEach((btn) => {
      btn.onclick = () => {
        const next = btn.dataset.board === 'boss' ? 'boss' : 'survival';
        if (next === this.menuBoardTab) return;
        this.menuBoardTab = next;
        tabs.forEach((t) => {
          const on = t.dataset.board === next;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        const body = this.panel.querySelector('.board-body');
        const stage = this.panel.querySelector('.board-stage');
        if (body) {
          const scores = next === 'boss' ? this.menuBossScores : this.menuSurvivalScores;
          body.innerHTML = boardBodyHtml(next, scores);
        }
        if (stage) stage.setAttribute('data-board-mode', next);
      };
    });
  }

  modeSelectPanel(): void {
    stopConfetti();
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
          <span class="mode-card-blurb">Auto-scroll. 10 bosses. No leaderboard.</span>
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
      void this.menuPanel();
    };
  }

  pausePanel(): void {
    stopConfetti();
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

  private bindScoreForm(stats: RunStats, boardMode: 'survival' | 'boss'): void {
    const form = document.getElementById('score-form') as HTMLFormElement | null;
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = document.getElementById('callsign') as HTMLInputElement;
      const msg = document.getElementById('form-msg')!;
      const btn = document.getElementById('submit-score') as HTMLButtonElement;
      btn.disabled = true;
      const cleaned = sanitizeName(input.value);
      const bosses =
        boardMode === 'boss'
          ? stats.mode === 'boss' || this.game.mode === 'boss'
            ? this.game.bosses.cleared || stats.sector
            : stats.sector
          : 0;
      const result = await submitScore({
        name: input.value,
        mode: boardMode,
        score: stats.score,
        sector: stats.sector,
        kills: stats.kills,
        bosses_killed: bosses,
        autofire: stats.autofire,
        elapsed: stats.elapsed,
      });
      if (!result.ok) {
        msg.textContent = result.reason;
        msg.classList.add('err');
        btn.disabled = false;
        return;
      }
      form.outerHTML = `<div class="submit-done" role="status" aria-label="Score submitted">
        <svg class="submit-tick" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="hg-tick" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#63f7ff"/>
              <stop offset="55%" stop-color="#ff3fa4"/>
              <stop offset="100%" stop-color="#ffb02e"/>
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="28" fill="none" stroke="url(#hg-tick)" stroke-width="3.5"/>
          <path d="M18 33.5 L28 43.5 L46 22" fill="none" stroke="url(#hg-tick)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>`;
      const name = cleaned.ok ? cleaned.name : input.value.trim();
      const highlight: BoardHighlight =
        boardMode === 'boss'
          ? { kind: 'boss', name, bosses, elapsed: stats.elapsed }
          : { kind: 'survival', name, score: Math.floor(stats.score) };
      const refreshed =
        boardMode === 'boss' ? await fetchBossScores() : await fetchTopScores();
      const wrap = this.panel.querySelector('.board-stage') || this.panel.querySelector('.board-wrap');
      if (wrap) wrap.outerHTML = boardBlock(boardMode, refreshed, highlight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => focusBoardRow());
      });
    };
  }

  private submitBlock(canSubmit: boolean, sessionMissing: boolean): string {
    if (canSubmit) {
      return `<form class="submit-row" id="score-form">
        <label class="lbl" for="callsign">Callsign</label>
        <input id="callsign" name="callsign" maxlength="12" autocomplete="off" spellcheck="false" placeholder="YOUR NAME" />
        <button class="cta secondary" type="submit" id="submit-score">Transmit</button>
        <p class="form-msg" id="form-msg" role="status"></p>
      </form>`;
    }
    if (sessionMissing) {
      return `<p class="form-msg err" role="status">Online submit unavailable — session did not start (Edge Function / migrations). Score saved locally.</p>`;
    }
    return '';
  }

  async overPanel(stats: RunStats): Promise<void> {
    stopConfetti();
    this.selectingMode = false;
    const adventureMode = stats.mode === 'adventure' || this.game.mode === 'adventure';
    const bossMode = !adventureMode && (stats.mode === 'boss' || this.game.mode === 'boss');
    if (adventureMode) {
      const bossesCleared = this.game.bosses.cleared;
      this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">SIGNAL LOST</h1>
      <div class="stats">
        <div><span class="lbl">Score</span><div class="val">${stats.score.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Best</span><div class="val" style="color:var(--acid)">${stats.best.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Bosses</span><div class="val">${bossesCleared}</div></div>
        <div><span class="lbl">Time</span><div class="val">${formatTime(stats.elapsed)}</div></div>
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
        void this.menuPanel();
      };
      return;
    }
    const boardMode = bossMode ? 'boss' : 'survival';
    const bossesCleared = bossMode ? this.game.bosses.cleared : 0;
    const [scores] = await Promise.all([
      bossMode ? fetchBossScores() : fetchTopScores(),
      waitForGameSession(),
    ]);
    const hasSession = !!getSessionToken();
    const canSubmit = bossMode
      ? isLeaderboardConfigured() && bossesCleared > 0 && hasSession
      : isLeaderboardConfigured() && stats.score > 0 && hasSession;
    const sessionMissing = bossMode
      ? isLeaderboardConfigured() && bossesCleared > 0 && !hasSession
      : isLeaderboardConfigured() && stats.score > 0 && !hasSession;
    this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">SIGNAL LOST</h1>
      <div class="stats">
        <div><span class="lbl">Score</span><div class="val">${stats.score.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Best</span><div class="val" style="color:var(--acid)">${stats.best.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">${bossMode ? 'Bosses' : 'Kills'}</span><div class="val">${bossMode ? bossesCleared : stats.kills}</div></div>
        <div><span class="lbl">${bossMode ? 'Time' : 'Survived'}</span><div class="val">${formatTime(stats.elapsed)}</div></div>
      </div>
      ${this.submitBlock(canSubmit, sessionMissing)}
      ${boardBlock(boardMode, scores)}
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
      void this.menuPanel();
    };
    this.bindScoreForm(stats, boardMode);
  }

  async victoryPanel(stats: RunStats): Promise<void> {
    stopConfetti();
    this.selectingMode = false;
    const adventureMode = stats.mode === 'adventure' || this.game.mode === 'adventure';
    if (adventureMode) {
      this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">SECTOR CLEARED</h1>
      <p class="tag">10 bosses down</p>
      <div class="stats">
        <div><span class="lbl">Score</span><div class="val">${stats.score.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Best</span><div class="val" style="color:var(--acid)">${stats.best.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Bosses</span><div class="val">10</div></div>
        <div><span class="lbl">Time</span><div class="val">${formatTime(stats.elapsed)}</div></div>
      </div>
      <div class="cta-stack">
        <button class="cta" id="go" type="button">Try again</button>
        <button class="cta secondary" id="quit" type="button">Quit to start screen</button>
      </div>
      <p class="fine">or press Enter to try again</p>`;
      this.show();
      document.getElementById('go')!.onclick = () => {
        this.game.startRun('adventure');
      };
      document.getElementById('quit')!.onclick = () => {
        this.game.state = 'menu';
        void this.menuPanel();
      };
      return;
    }
    const [scores] = await Promise.all([fetchBossScores(), waitForGameSession()]);
    const hasSession = !!getSessionToken();
    const canSubmit = isLeaderboardConfigured() && hasSession;
    const sessionMissing = isLeaderboardConfigured() && !hasSession;
    this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">SECTOR CLEARED</h1>
      <p class="tag">20 bosses down</p>
      <div class="stats">
        <div><span class="lbl">Score</span><div class="val">${stats.score.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Best</span><div class="val" style="color:var(--acid)">${stats.best.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Bosses</span><div class="val">20</div></div>
        <div><span class="lbl">Time</span><div class="val">${formatTime(stats.elapsed)}</div></div>
      </div>
      ${this.submitBlock(canSubmit, sessionMissing)}
      ${boardBlock('boss', scores)}
      <div class="cta-stack">
        <button class="cta" id="go" type="button">Try again</button>
        <button class="cta secondary" id="quit" type="button">Quit to start screen</button>
      </div>
      <p class="fine">or press Enter to try again</p>`;
    this.show();
    document.getElementById('go')!.onclick = () => {
      this.game.startRun('boss');
    };
    document.getElementById('quit')!.onclick = () => {
      this.game.state = 'menu';
      void this.menuPanel();
    };
    this.bindScoreForm({ ...stats, sector: 20 }, 'boss');
  }
}
