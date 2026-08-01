import { bankScale, depthScale, flipScale, projectBowl } from './depth';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const center = projectBowl(400, 300, 400, 300, 500, 0.12);
assert(center.x === 400 && center.y === 300, 'focus point stays put');
assert(center.depth === 0, 'focus depth is 0');

const flat = projectBowl(800, 600, 400, 300, 500, 0);
assert(flat.x === 800 && flat.y === 600, 'strength 0 is identity');

const edge = projectBowl(800, 300, 400, 300, 500, 0.15);
assert(edge.x < 800 && edge.x > 400, 'edge pulls toward focus on x');
assert(edge.y === 300, 'aligned y unchanged');
assert(edge.depth > 0.2, 'edge has measurable depth');

const farther = projectBowl(900, 300, 400, 300, 500, 0.15);
assert(farther.depth >= edge.depth, 'farther points have >= depth');

assert(Math.abs(depthScale(0) - 1.2) < 1e-9, 'near scale');
assert(Math.abs(depthScale(1) - 0.55) < 1e-9, 'far scale');
assert(depthScale(0.5) > 0.55 && depthScale(0.5) < 1.2, 'mid scale');

assert(Math.abs(flipScale(0) - 1) < 1e-9, 'flip face-on');
assert(flipScale(Math.PI / 2) === 0.22, 'flip edge clamped');
assert(flipScale(Math.PI / 2, 0.3) === 0.3, 'flip custom min');
assert(bankScale(0, 0) === 1, 'bank at rest');
assert(bankScale(300, 0) < 1 && bankScale(300, 0) >= 0.78, 'bank when moving');

console.log('depth tests passed');
