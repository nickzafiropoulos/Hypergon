import type { BossDef } from './bosses';
import type { BossRuntime, DamageSource } from './types';

export type DamageCtx = {
  source: DamageSource;
  /** Incoming angle toward boss (atan2). */
  ang?: number;
  /** True when player has magnet buff (lodestone reverse). */
  magnetActive?: boolean;
  /** Living healing crystals / vents / nests count. */
  healCrystalsAlive?: number;
  ventsAlive?: number;
  nestsAlive?: number;
  satellitesAlive?: number;
  /** Arc specifically chained onto boss. */
  arcHit?: boolean;
  /** Rail during railbait telegraph. */
  railTelegraph?: boolean;
  /** Twin helix: which body index was hit (0 primary, 1 twin). */
  twinIndex?: number;
  /** Player bullet bounce count off reflective geometry. */
  ricochet?: number;
};

export type DamageResult = {
  applied: number;
  blocked: boolean;
  message?: string;
};

/** Compute final damage after weakness gates. Does not mutate boss. */
export function computeBossDamage(
  boss: BossRuntime,
  def: BossDef,
  amount: number,
  ctx: DamageCtx,
): DamageResult {
  if (boss.dead || boss.birth > 0) return { applied: 0, blocked: true };

  let mul = 1;
  let blocked = false;
  let message: string | undefined;

  switch (def.id) {
    case 'prism': {
      if (ctx.source !== 'rail' && ctx.source !== 'bomb' && ctx.source !== 'mine') {
        const hitAng = ctx.ang ?? 0;
        if (Math.abs(angWrap(hitAng - boss.sa)) < 1.2) {
          blocked = true;
          message = 'REFLECTED';
        }
      }
      if (ctx.source === 'rail') mul = 1.35;
      break;
    }
    case 'crown': {
      if ((ctx.satellitesAlive ?? 0) > 0 && ctx.source !== 'bomb') {
        mul = 0.15;
        message = 'SHIELDED';
      }
      break;
    }
    case 'aegis_titan': {
      if (boss.armor > 0 && ctx.source !== 'rail' && ctx.source !== 'bomb') {
        const hitAng = ctx.ang ?? 0;
        if (Math.abs(angWrap(hitAng - boss.sa)) < 1.25) {
          blocked = true;
          message = 'PLATED';
        }
      }
      if (ctx.source === 'rail') mul = 1.4;
      break;
    }
    case 'serpent_regent': {
      // Head-only enforced by caller hitbox; body hits shouldn't reach here.
      break;
    }
    case 'mirror_core': {
      if (ctx.source === 'arc' || ctx.arcHit) mul = 1.8;
      break;
    }
    case 'phase_lattice': {
      if (!boss.solid && ctx.source !== 'bomb') {
        blocked = true;
        message = 'PHASED';
      }
      break;
    }
    case 'starforge': {
      if ((ctx.ventsAlive ?? 0) === 0) mul = 1.5;
      break;
    }
    case 'crystal_nexus': {
      if ((ctx.healCrystalsAlive ?? 0) > 0) mul = 0.45;
      else mul = 2;
      break;
    }
    case 'pulse_maw': {
      if (!boss.open && ctx.source !== 'bomb' && ctx.source !== 'mine') {
        mul = 0.08;
        message = 'SHELL';
      } else if (boss.open) mul = 1.75;
      break;
    }
    case 'grid_reaver': {
      if ((boss.flags.recovery || 0) > 0) mul = 1.85;
      else mul = 0.55;
      break;
    }
    case 'lodestone': {
      if (ctx.magnetActive) mul = 1.9;
      break;
    }
    case 'arc_throne': {
      if ((boss.flags.opened || 0) <= 0 && ctx.source !== 'arc' && ctx.source !== 'bomb') {
        mul = 0.12;
        message = 'ARMORED';
      }
      if (ctx.source === 'arc') {
        mul = 2.2;
      }
      break;
    }
    case 'railbait': {
      if (ctx.source === 'rail' && (ctx.railTelegraph || (boss.flags.telegraph || 0) > 0)) {
        mul = 5.2;
        message = 'CRITICAL HIT';
      } else if (ctx.source === 'rail') mul = 1.1;
      break;
    }
    case 'nest_queen': {
      if ((ctx.nestsAlive ?? 0) > 0 && (boss.flags.nesting || 0) > 0) mul = 1.7;
      else if ((ctx.nestsAlive ?? 0) > 0) mul = 0.7;
      break;
    }
    case 'stasis_warden': {
      if ((boss.flags.inZone || 0) > 0) mul = 1.8;
      break;
    }
    case 'bulwark_colossus': {
      if (boss.armor > 0 && ctx.source !== 'bomb') {
        mul = 0.2;
        message = 'ARMORED';
      } else if (boss.armor <= 0) mul = 1.6;
      break;
    }
    case 'singularity_apex': {
      if (boss.phase >= 2 && !boss.solid && ctx.source !== 'bomb') {
        blocked = true;
        message = 'PHASED';
      }
      if (boss.phase >= 1 && (ctx.satellitesAlive ?? 0) > 0 && ctx.source !== 'rail') {
        mul *= 0.5;
      }
      if (ctx.source === 'rail') mul *= 1.25;
      break;
    }
    default:
      break;
  }

  if (blocked) return { applied: 0, blocked: true, message };

  // Environmental assists — ricochets and arena traps hit much harder.
  const bounces = ctx.ricochet ?? 0;
  if (bounces > 0 && ctx.source !== 'bomb') {
    mul *= 4.2 + Math.min(bounces - 1, 2) * 0.9;
    message = 'CRITICAL HIT';
  }
  if ((ctx.source === 'mine' || ctx.source === 'env') && !blocked) {
    mul *= 3.8;
    message = 'CRITICAL HIT';
  }

  const applied = Math.max(0, amount * mul);
  const keepMsg =
    message === 'CRITICAL HIT' ||
    message === 'PLATE STRIPPED' ||
    (message !== undefined && applied > amount * 1.35);
  return { applied, blocked: false, message: keepMsg ? message : undefined };
}

export function bombDamageFor(boss: BossRuntime, def: BossDef): DamageResult {
  if (boss.dead || boss.birth > 0) return { applied: 0, blocked: true };

  if (def.bombPolicy === 'peel' && boss.armor > 0) {
    return { applied: 0, blocked: false, message: 'PLATE STRIPPED' };
  }

  const chip = boss.maxhp * 0.08;
  return { applied: chip, blocked: false };
}

function angWrap(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}
