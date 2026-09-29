import assert from 'node:assert/strict';
import { normalizeDay, normalizeHour, positiveWeeksAhead, shouldRunScheduled, istanbulParts } from './schedule-utils.mjs';

assert.equal(normalizeDay('FRIDAY'), 5);
assert.equal(normalizeDay('Cuma'), 5);
assert.equal(normalizeDay('CUM'), 5);
assert.equal(normalizeHour('16'), 16);
assert.equal(positiveWeeksAhead('1'), 1);
assert.equal(positiveWeeksAhead('99'), 1);

// 02.10.2026 13:07 UTC = Türkiye 16:07 (UTC+3), Cuma.
const friday1607 = new Date('2026-10-02T13:07:00Z');
const tr = istanbulParts(friday1607);
assert.equal(tr.weekday, 5);
assert.equal(tr.hour, 16);
assert.equal(shouldRunScheduled({date:friday1607,enabled:true,weekday:'CUMA',hour:'16'}).run, true);
assert.equal(shouldRunScheduled({date:friday1607,enabled:false,weekday:'CUMA',hour:'16'}).run, false);
assert.equal(shouldRunScheduled({date:new Date('2026-10-02T12:07:00Z'),enabled:true,weekday:'CUMA',hour:'16'}).run, false);

console.log('T45 PASS schedule parser: CUMA / 16');
console.log('T46 PASS Istanbul timezone gate: Friday 16:xx only');
console.log('T47 PASS disabled gate never runs');
