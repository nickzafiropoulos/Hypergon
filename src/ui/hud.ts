import { WEAPONS, type WeaponKey } from '../game/catalogue';
import type { Game } from '../game/Game';

function formatHudTimer(seconds: number): string {
  const totalCs = Math.floor(Math.max(0, seconds) * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;
}

export class Hud {
  private shownScore = 0;
  private el: {
    score: HTMLElement;
    mult: HTMLElement;
    wave: HTMLElement;
    waveLbl: HTMLElement;
    timer: HTMLElement;
    timerLbl: HTMLElement;
    pips: HTMLElement;
    wname: HTMLElement;
    wfill: HTMLElement;
    wammo: HTMLElement;
    buffs: HTMLElement;
    hint: HTMLElement;
  };
  private lastPips = '';
  private lastBuffs = '';
  private lastTimer = '';

  constructor() {
    this.el = {
      score: document.getElementById('score')!,
      mult: document.getElementById('mult')!,
      wave: document.getElementById('wave')!,
      waveLbl: document.getElementById('wave-lbl')!,
      timer: document.getElementById('timer')!,
      timerLbl: document.getElementById('timer-lbl')!,
      pips: document.getElementById('pips')!,
      wname: document.getElementById('wname')!,
      wfill: document.getElementById('wfill')!,
      wammo: document.getElementById('wammo')!,
      buffs: document.getElementById('buffs')!,
      hint: document.getElementById('hint')!,
    };
  }

  setTouchHints(touch: boolean): void {
    this.el.hint.textContent = touch
      ? 'Left stick move · Right stick aim & fire'
      : 'Arrows move · Mouse aim & hold fire · Space bomb';
  }

  draw(game: Game): void {
    this.shownScore += (game.score - this.shownScore) * 0.18;
    this.el.score.textContent = Math.round(this.shownScore).toLocaleString('en-GB');
    this.el.mult.textContent = '×' + game.mult;
    this.el.mult.style.fontSize = 30 + Math.min(game.mult, 40) * 0.35 + 'px';
    if (game.mode === 'boss') {
      this.el.waveLbl.textContent = 'Boss';
      this.el.wave.textContent = game.bosses.progressLabel();
      this.el.wave.style.fontSize = '16px';
      this.el.timerLbl.classList.remove('hide');
      this.el.timer.classList.remove('hide');
      const stamp = formatHudTimer(game.elapsed);
      if (this.lastTimer !== stamp) {
        this.el.timer.textContent = stamp;
        this.lastTimer = stamp;
      }
    } else {
      this.el.waveLbl.textContent = 'Sector';
      this.el.wave.textContent = String(game.sector).padStart(2, '0');
      this.el.wave.style.fontSize = '';
      this.el.timerLbl.classList.add('hide');
      this.el.timer.classList.add('hide');
      this.lastTimer = '';
    }

    const pipKey = game.lives + '/' + game.bombs;
    if (this.lastPips !== pipKey) {
      let pips = '';
      for (let i = 0; i < 5; i++) pips += `<span class="pip ${i < game.lives ? '' : 'off'}"></span>`;
      for (let i = 0; i < 5; i++) pips += `<span class="pip b ${i < game.bombs ? '' : 'off'}"></span>`;
      this.el.pips.innerHTML = pips;
      this.lastPips = pipKey;
    }

    const w = WEAPONS[game.curW as WeaponKey];
    this.el.wname.textContent = w.name;
    this.el.wname.style.color = w.colour;
    this.el.wfill.style.background = w.colour;
    this.el.wfill.style.boxShadow = '0 0 12px ' + w.colour;
    const ammo = game.ammo[game.curW as WeaponKey];
    const frac = ammo === Infinity ? 1 : Math.max(0, Math.min(1, ammo / w.cap));
    this.el.wfill.style.transform = 'scaleX(' + frac + ')';
    this.el.wammo.textContent =
      ammo === Infinity ? 'UNLIMITED' : Math.ceil(ammo) + ' / ' + w.cap;

    const rows: [string, string, number][] = [];
    if (game.shieldHits > 0) rows.push(['AEGIS', '#63f7ff', game.shieldHits / 3]);
    if (game.buffs.overdrive > 0) rows.push(['OVERDRIVE', '#ffb02e', game.buffs.overdrive / 12]);
    if (game.buffs.timewarp > 0) rows.push(['STASIS', '#a98bff', game.buffs.timewarp / 9]);
    if (game.buffs.magnet > 0) rows.push(['LODESTONE', '#b8ff3d', game.buffs.magnet / 14]);
    if (game.buffs.drones > 0) rows.push(['WINGMEN', '#ff3fa4', game.buffs.drones / 16]);
    if (game.buffs.mirror > 0) rows.push(['REFLEX', '#e8f0ff', game.buffs.mirror / 9]);
    if (game.buffs.razor > 0) rows.push(['ORBIT', '#ff6b4a', game.buffs.razor / 11]);
    if (game.buffs.ghost > 0) rows.push(['PHASE', '#b8a0ff', game.buffs.ghost / 7]);
    let bh = '';
    for (const [n, c, f] of rows) {
      bh += `<div class="buff" style="color:${c}"><span>${n}</span><span class="bar"><i style="background:${c};transform:scaleX(${f.toFixed(3)})"></i></span></div>`;
    }
    if (this.lastBuffs !== bh) {
      this.el.buffs.innerHTML = bh;
      this.lastBuffs = bh;
    }
  }
}
