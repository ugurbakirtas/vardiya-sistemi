import assert from 'node:assert/strict';
import { normalizeDay, normalizeHour, positiveWeeksAhead } from './schedule-utils.mjs';

assert.equal(normalizeDay('THURSDAY'), 4);
assert.equal(normalizeDay('Perşembe'), 4);
assert.equal(normalizeDay('PZT'), 1);
assert.equal(normalizeHour('10'), 10);
assert.equal(positiveWeeksAhead('1'), 1);
assert.equal(positiveWeeksAhead('99'), 1);
console.log('PASS schedule-utils');
