import { sanitizeName } from './profanity';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(sanitizeName('Ace').ok === true, 'Ace should pass');
assert(sanitizeName('f').ok === false, 'too short');
assert(sanitizeName('thisnameistoolong').ok === false, 'too long');
assert(sanitizeName('f u c k').ok === false, 'spaced profanity');
assert(sanitizeName('sh1t').ok === false, 'leet shit');
assert(sanitizeName('Pilot-01').ok === true, 'Pilot-01 should pass');

console.log('profanity tests passed');
