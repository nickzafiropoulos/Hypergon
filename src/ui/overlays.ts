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
    return `<p class="fine">${isLeaderboardConfigured() ? 'No scores yet — be the first.' : 'Leaderboard not configured.'}</p>`;
  }
  return `<ol class="board">${rows
    .map(
      (r, i) =>
        `<li><span class="rank">${String(i + 1).padStart(2, '0')}</span><span class="who">${escapeHtml(r.name)}</span><span class="pts">${r.score.toLocaleString('en-GB')}</span></li>`,
    )
    .join('')}</ol>`;
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
    const scores = await fetchTopScores(10);
    this.panel.innerHTML = `
      <h1 class="glyph">HYPERGON</h1>
      <p class="tag">Twin-stick vector arena · nine hostile geometries · six weapons</p>
      <div class="keys">
        <div class="key"><b>MOVE</b><span>Arrow keys &nbsp;/&nbsp; WASD &nbsp;/&nbsp; left stick</span></div>
        <div class="key"><b>AIM &amp; FIRE</b><span>Mouse position + hold click &nbsp;/&nbsp; right stick. F locks auto-fire.</span></div>
        <div class="key"><b>SHOCKWAVE</b><span>Space or right-click — clears the board</span></div>
        <div class="key"><b>SWAP WEAPON</b><span>Q / E through anything you're carrying</span></div>
        <div class="key"><b>PICKUPS</b><span>Hexagons are weapons. Stars are powers.</span></div>
        <div class="key"><b>MULTIPLIER</b><span>Cyan cores raise it. Dying resets it.</span></div>
      </div>
      <div class="board-wrap">
        <p class="lbl board-title">Sector leaders</p>
        ${boardHtml(scores)}
      </div>
      <button class="cta" id="go" type="button">Launch</button>
      <p class="fine">Best ${this.game.best.toLocaleString('en-GB')} &nbsp;·&nbsp; P pause · M mute · B bloom · F auto-fire</p>`;
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
  }): Promise<void> {
    const scores = await fetchTopScores(10);
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
      <div class="board-wrap">
        <p class="lbl board-title">Sector leaders</p>
        ${boardHtml(scores)}
      </div>
      <button class="cta" id="go" type="button">Run it back</button>
      <p class="fine">or press Enter</p>`;
    this.show();
    document.getElementById('go')!.onclick = () => {
      this.game.startRun();
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
        const refreshed = await fetchTopScores(10);
        const wrap = this.panel.querySelector('.board-wrap');
        if (wrap) {
          wrap.innerHTML = `<p class="lbl board-title">Sector leaders</p>${boardHtml(refreshed)}`;
        }
      };
    }
  }
}
