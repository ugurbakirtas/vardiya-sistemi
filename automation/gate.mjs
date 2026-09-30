import fs from 'node:fs';

function istanbulDisplay(date = new Date()) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date);
}

const eventName = process.env.GITHUB_EVENT_NAME || 'manual';
const enabled = String(process.env.AUTO_ENABLED || '').toLowerCase() === 'true';
let result;

if (eventName === 'workflow_dispatch' || process.env.FORCE_RUN === 'true') {
  result = { run:true, reason:'manual workflow dispatch' };
} else if (eventName === 'schedule') {
  // FIX10: Cron zaten hedef zamanı seçer. GitHub job'u saatler sonra başlatırsa
  // gerçek başlangıç saatine bakıp işi yanlışlıkla SKIP etme.
  result = enabled
    ? { run:true, reason:'scheduled event accepted; delayed start is allowed' }
    : { run:false, reason:'automation disabled' };
} else {
  result = { run:false, reason:`unsupported event: ${eventName}` };
}

const line = `run=${result.run ? 'true' : 'false'}\nreason=${String(result.reason).replace(/\n/g,' ')}\n`;
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
console.log(`[AUTO GATE] run=${result.run} reason=${result.reason}`);
console.log(`[AUTO GATE] Istanbul actual start=${istanbulDisplay()}`);
