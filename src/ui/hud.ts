import { WEAPONS, type WeaponKey } from '../game/catalogue';
import type { Game } from '../game/Game';

export class Hud {
  private shownScore = 0;
  private el: {
    score: HTMLElement;
    mult: HTMLElement;
    wave: HTMLElement;
    pips: HTMLElement;
    wname: HTMLElement;
    wfill: HTMLElement;
    wammo: HTMLElement;
    buffs: HTMLElement;
    hint: HTMLElement;
  };
  private lastPips = '';
  private lastBuffs = '';

  constructor() {
    this.el = {
      score: document.getElementById('score')!,
      mult: document.getElementById('mult')!,
      wave: document.getElementById('wave')!,
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
    this.el.wave.textContent = String(game.sector).padStart(2, '0');

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
