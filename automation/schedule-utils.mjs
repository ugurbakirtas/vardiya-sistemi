const DAY_MAP = new Map([
  ['SUNDAY', 0], ['PAZAR', 0], ['PAZ', 0],
  ['MONDAY', 1], ['PAZARTESI', 1], ['PAZARTESİ', 1], ['PZT', 1],
  ['TUESDAY', 2], ['SALI', 2], ['SAL', 2],
  ['WEDNESDAY', 3], ['CARSAMBA', 3], ['ÇARŞAMBA', 3], ['CAR', 3], ['ÇAR', 3],
  ['THURSDAY', 4], ['PERSEMBE', 4], ['PERŞEMBE', 4], ['PER', 4],
  ['FRIDAY', 5], ['CUMA', 5], ['CUM', 5],
  ['SATURDAY', 6], ['CUMARTESI', 6], ['CUMARTESİ', 6], ['CMT', 6]
]);

export function normalizeDay(value) {
  const raw = String(value ?? '').trim();
  if (/^[0-6]$/.test(raw)) return Number(raw);
  const key = raw.toLocaleUpperCase('tr-TR');
  if (!DAY_MAP.has(key)) throw new Error(`Geçersiz hafta günü: ${value}`);
  return DAY_MAP.get(key);
}

export function normalizeHour(value) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(n) || n < 0 || n > 23) throw new Error(`Geçersiz saat: ${value}`);
  return n;
}

export function istanbulParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const obj = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const dayLookup = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  return {
    weekday: dayLookup[obj.weekday],
    hour: Number(obj.hour),
    minute: Number(obj.minute),
    isoDate: `${obj.year}-${obj.month}-${obj.day}`,
    display: `${obj.day}.${obj.month}.${obj.year} ${obj.hour}:${obj.minute}`
  };
}

export function shouldRunScheduled({ date = new Date(), enabled, weekday, hour }) {
  if (!enabled) return { run:false, reason:'automation disabled' };
  const now = istanbulParts(date);
  const wantedDay = normalizeDay(weekday);
  const wantedHour = normalizeHour(hour);
  if (now.weekday !== wantedDay) return { run:false, reason:`weekday mismatch ${now.weekday} != ${wantedDay}`, now };
  if (now.hour !== wantedHour) return { run:false, reason:`hour mismatch ${now.hour} != ${wantedHour}`, now };
  return { run:true, reason:'scheduled window matched', now };
}

export function positiveWeeksAhead(value, fallback = 1) {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(n) && n >= 0 && n <= 12 ? n : fallback;
}
