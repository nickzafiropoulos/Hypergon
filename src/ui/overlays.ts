import type { Game } from '../game/Game';
import {
  fetchTopScores,
  isLeaderboardConfigured,
  submitScore,
  type ScoreRow,
} from '../leaderboard/supabase';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function boardHtml(rows: ScoreRow[]): string {
  if (!rows.length) {
    const msg = isLeaderboardConfigured()
      ? 'No scores yet - be the first.'
      : 'Leaderboard not configured.';
    return `<p class="board-empty">${msg}</p>`;
  }
  const rankW = String(rows.length).length;
  return `<div class="board-scroll"><ol class="board">${rows
    .map((r, i) => {
      const af = r.autofire
        ? `<span class="af" title="Auto-fire used">AF</span>`
        : '';
      const rank = String(i + 1).padStart(Math.max(2, rankW), '0');
      return `<li><span class="rank">${rank}</span><span class="who"><span class="who-name">${escapeHtml(r.name)}</span>${af}</span><span class="pts">${r.score.toLocaleString('en-GB')}</span></li>`;
    })
    .join('')}</ol></div>`;
}

function boardBlock(scores: ScoreRow[]): string {
  return `<div class="board-wrap">
        <h2 class="glyph board-title">Sector leaders</h2>
        ${boardHtml(scores)}
      </div>`;
}

export class Overlays {
  veil: HTMLElement;
  panel: HTMLElement;
  private game: Game;
  private onHideVeil: () => void;
  private onShowVeil: () => void;

  constructor(game: Game, opts: { onHideVeil: () => void; onShowVeil: () => void }) {
    this.game = game;
    this.veil = document.getElementById('veil')!;
    this.panel = document.getElementById('panel')!;
    this.onHideVeil = opts.onHideVeil;
    this.onShowVeil = opts.onShowVeil;
  }

  show(): void {
    this.veil.classList.remove('hide');
    this.onShowVeil();
  }

  hide(): void {
    this.veil.classList.add('hide');
    this.onHideVeil();
  }

  async menuPanel(): Promise<void> {
    const scores = await fetchTopScores();
    this.panel.innerHTML = `
      <h1 class="glyph">HYPERGON</h1>
      <div class="keys">
        <div class="key"><b>MOVE</b><span>Arrow keys &nbsp;/&nbsp; WASD &nbsp;/&nbsp; left stick</span></div>
        <div class="key"><b>AIM &amp; FIRE</b><span>Mouse position + hold click &nbsp;/&nbsp; right stick. F locks auto-fire.</span></div>
        <div class="key"><b>SHOCKWAVE</b><span>Space or right-click - clears the board</span></div>
        <div class="key"><b>SWAP WEAPON</b><span>Q / E through anything you're carrying</span></div>
        <div class="key"><b>PICKUPS</b><span>Hexagons are weapons. Stars are powers.</span></div>
        <div class="key"><b>MULTIPLIER</b><span>Cyan cores raise it. Dying resets it.</span></div>
      </div>
      ${boardBlock(scores)}
      <button class="cta" id="go" type="button">Launch</button>
      <p class="fine">P pause · M mute · F auto-fire</p>`;
    this.show();
    document.getElementById('go')!.onclick = () => {
      this.game.startRun();
    };
  }

  pausePanel(): void {
    this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">HOLDING</h1>
      <p class="tag">Score ${this.game.score.toLocaleString('en-GB')} · Sector ${this.game.sector} · ×${this.game.mult}</p>
      <button class="cta" id="go" type="button">Resume</button>
      <p class="fine">P or Esc</p>`;
    this.show();
    document.getElementById('go')!.onclick = () => {
      this.game.togglePause();
    };
  }

  async overPanel(stats: {
    score: number;
    best: number;
    kills: number;
    elapsed: number;
    sector: number;
    autofire: boolean;
  }): Promise<void> {
    const scores = await fetchTopScores();
    const canSubmit = isLeaderboardConfigured() && stats.score > 0;
    this.panel.innerHTML = `
      <h1 class="glyph" style="font-size:clamp(34px,7vw,74px)">SIGNAL LOST</h1>
      <div class="stats">
        <div><span class="lbl">Score</span><div class="val">${stats.score.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Best</span><div class="val" style="color:var(--acid)">${stats.best.toLocaleString('en-GB')}</div></div>
        <div><span class="lbl">Kills</span><div class="val">${stats.kills}</div></div>
        <div><span class="lbl">Survived</span><div class="val">${stats.elapsed.toFixed(0)}s</div></div>
      </div>
      ${
        canSubmit
          ? `<form class="submit-row" id="score-form">
        <label class="lbl" for="callsign">Callsign</label>
        <input id="callsign" name="callsign" maxlength="12" autocomplete="off" spellcheck="false" placeholder="YOUR NAME" />
        <button class="cta secondary" type="submit" id="submit-score">Transmit</button>
        <p class="form-msg" id="form-msg" role="status"></p>
      </form>`
          : ''
      }
      ${boardBlock(scores)}
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

    const form = document.getElementById('score-form') as HTMLFormElement | null;
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const input = document.getElementById('callsign') as HTMLInputElement;
        const msg = document.getElementById('form-msg')!;
        const btn = document.getElementById('submit-score') as HTMLButtonElement;
        btn.disabled = true;
        const result = await submitScore({
          name: input.value,
          score: stats.score,
          sector: stats.sector,
          kills: stats.kills,
          autofire: stats.autofire,
          elapsed: stats.elapsed,
        });
        if (!result.ok) {
          msg.textContent = result.reason;
          msg.classList.add('err');
          btn.disabled = false;
          return;
        }
        msg.textContent = 'Signal received.';
        msg.classList.remove('err');
        input.disabled = true;
        const refreshed = await fetchTopScores();
        const wrap = this.panel.querySelector('.board-wrap');
        if (wrap) wrap.outerHTML = boardBlock(refreshed);
      };
    }
  }
}
