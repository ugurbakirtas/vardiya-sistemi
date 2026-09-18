import fs from 'node:fs';
import { shouldRunScheduled } from './schedule-utils.mjs';

const eventName = process.env.GITHUB_EVENT_NAME || 'manual';
const manual = eventName === 'workflow_dispatch' || process.env.FORCE_RUN === 'true';
let result;

if (manual) {
  result = { run:true, reason:'manual workflow dispatch' };
} else {
  result = shouldRunScheduled({
    enabled: String(process.env.AUTO_ENABLED || '').toLowerCase() === 'true',
    weekday: process.env.AUTO_WEEKDAY || 'THURSDAY',
    hour: process.env.AUTO_HOUR_TR || '10'
  });
}

const line = `run=${result.run ? 'true' : 'false'}\nreason=${String(result.reason).replace(/\n/g,' ')}\n`;
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
console.log(`[AUTO GATE] run=${result.run} reason=${result.reason}`);
if (result.now) console.log(`[AUTO GATE] Istanbul=${result.now.display}`);
