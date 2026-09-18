import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { positiveWeeksAhead } from './schedule-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const parentRoot = path.resolve(__dirname, '..');
const ROOT = fs.existsSync(path.join(parentRoot, 'index.html')) ? parentRoot : path.join(parentRoot, 'app');
const PORT = Number(process.env.LOCAL_PORT || 8765);
const HOST = '127.0.0.1';
const email = process.env.VARDIYA_ADMIN_EMAIL || '';
const password = process.env.VARDIYA_ADMIN_PASSWORD || '';
const publish = String(process.env.AUTO_PUBLISH || '').toLowerCase() === 'true';
const weeksAhead = positiveWeeksAhead(process.env.WEEKS_AHEAD, 1);
const telegramNotify = String(process.env.AUTO_TELEGRAM_NOTIFY || '').toLowerCase() === 'true';
const telegramToken = process.env.VARDIYA_TELEGRAM_BOT_TOKEN || '';
const telegramChatId = process.env.VARDIYA_TELEGRAM_CHAT_ID || '';
const outPath = path.join(__dirname, 'automation-output.json');

if (!email || !password) {
  throw new Error('VARDIYA_ADMIN_EMAIL ve VARDIYA_ADMIN_PASSWORD GitHub Secrets olarak tanımlanmalıdır.');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}
function sameData(a,b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
  '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8'
};

function startServer() {
  return new Promise((resolve,reject) => {
    const server = http.createServer((req,res) => {
      try {
        let p = decodeURIComponent((req.url || '/').split('?')[0]);
        if (p === '/') p = '/index.html';
        const full = path.resolve(ROOT, '.' + p);
        if (!full.startsWith(ROOT + path.sep) && full !== ROOT) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        fs.stat(full,(err,st) => {
          if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, {'Content-Type': mime[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store'});
          fs.createReadStream(full).pipe(res);
        });
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    server.on('error',reject);
    server.listen(PORT,HOST,()=>resolve(server));
  });
}

async function notifyTelegram(result) {
  if (!telegramNotify || !telegramToken || !telegramChatId) return false;
  const icon = result.ok ? '✅' : '❌';
  const mode = result.publish ? (result.published ? 'PUBLISH' : 'PUBLISH-ABORT') : 'DRY-RUN';
  const text = [
    `${icon} TÜRKMEDYA VARDİYA OTOMASYON`,
    `Hafta: ${result.targetWeek || '-'}`,
    `Mod: ${mode}`,
    `Sonuç: ${result.ok ? 'PASS' : 'FAIL'}`,
    result.message || ''
  ].join('\n').slice(0, 3900);
  const r = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:telegramChatId,text})
  });
  if (!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
  return true;
}

async function writeSummary(result) {
  fs.writeFileSync(outPath, JSON.stringify(result,null,2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# TürkMedya Vardiya — Haftalık Otomasyon',
      '',
      `- Sonuç: **${result.ok ? 'PASS' : 'FAIL'}**`,
      `- Hedef hafta: **${result.targetWeek || '-'}**`,
      `- Mod: **${result.publish ? 'PUBLISH' : 'DRY-RUN'}**`,
      `- Firebase yazma: **${result.published ? 'YAPILDI' : 'YAPILMADI'}**`,
      `- Yıllık izin kaydı: **${result.annualRecordCount ?? '-'}**`,
      `- Hedef haftadaki atama kaydı: **${result.targetAssignmentCount ?? '-'}**`,
      '',
      result.message || ''
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

let server;
let browser;
let result = { ok:false, publish, published:false, weeksAhead };
try {
  server = await startServer();
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({timezoneId:'Europe/Istanbul'});
  const page = await context.newPage();
  page.on('console', msg => console.log(`[BROWSER ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.error('[BROWSER ERROR]', err));

  await page.goto(`http://${HOST}:${PORT}/`, {waitUntil:'domcontentloaded', timeout:60000});
  await page.waitForFunction(() => typeof firebase !== 'undefined' && typeof database !== 'undefined', null, {timeout:30000});

  await page.evaluate(async ({email,password}) => {
    await firebase.auth().signInWithEmailAndPassword(email,password);
  }, {email,password});

  await page.waitForFunction(() => typeof isAdmin !== 'undefined' && isAdmin === true, null, {timeout:30000});
  await page.evaluate(async () => { await veriyiBuluttanYukleVeCiz(); });

  // Otomasyon kendi snapshotı üzerinde çalışsın. Realtime izin listener'ı mevcut haftayı
  // otomatik re-optimize etmesin; izin kayıtlarını aşağıda doğrudan okuyacağız.
  await page.evaluate(() => {
    if (window.__V62_ANNUAL_UNSUB) {
      try { window.__V62_ANNUAL_UNSUB(); } catch (_) {}
      window.__V62_ANNUAL_UNSUB = null;
    }
  });

  const initialCloud = await page.evaluate(async () => {
    const s = await database.ref('vardiya_data').once('value');
    return s.exists() ? s.val() : null;
  });
  if (!initialCloud) throw new Error('Firebase vardiya_data bulunamadı.');

  await page.evaluate(async (cloud) => {
    state = cloud;
    verileriGuvenliHaleGetir();
    const snap = await dbIzin.collection('izinler').get();
    hariciIzinler = [];
    snap.forEach(doc => hariciIzinler.push(doc.data()));
  }, initialCloud);

  const generation = await page.evaluate((weeksAhead) => {
    currentMonday = getMonday(new Date());
    currentMonday.setDate(currentMonday.getDate() + (7 * weeksAhead));
    const targetWeek = getDateKey(currentMonday);
    try { tabloyuOlustur(); } catch (_) {}
    const ok = vardiyaUretVeKaydet() === true;
    const prefix = `${targetWeek}_`;
    const targetEntries = Object.entries(state.manuelAtamalar || {}).filter(([k]) => k.startsWith(prefix));
    return {
      ok,
      targetWeek,
      assignmentCount: targetEntries.length,
      annualRecordCount: Array.isArray(hariciIzinler) ? hariciIzinler.length : 0,
      errors: (window.__V62_LAST_REOPT_ERRORS || []).slice(0,20),
      generatedState: ok ? state : null
    };
  }, weeksAhead);

  result.targetWeek = generation.targetWeek;
  result.targetAssignmentCount = generation.assignmentCount;
  result.annualRecordCount = generation.annualRecordCount;

  if (!generation.ok || !generation.generatedState) {
    result.message = `Algoritma liste oluşturamadı. ${(generation.errors || []).join(' | ')}`;
    await writeSummary(result);
    process.exitCode = 2;
  } else if (!publish) {
    result.ok = true;
    result.message = 'DRY-RUN başarılı. Algoritma listeyi oluşturdu; Firebase production verisine yazılmadı.';
    await writeSummary(result);
  } else {
    const liveBeforePublish = await page.evaluate(async () => {
      const s = await database.ref('vardiya_data').once('value');
      return s.exists() ? s.val() : null;
    });
    if (!sameData(initialCloud, liveBeforePublish)) {
      result.message = 'Yayın iptal edildi: otomasyon çalışırken vardiya_data başka bir istemci tarafından değiştirildi. Mevcut veri korunmuştur.';
      await writeSummary(result);
      process.exitCode = 3;
    } else {
      await page.evaluate(async (newState) => {
        await database.ref('vardiya_data').set(newState);
      }, generation.generatedState);
      const verify = await page.evaluate(async () => {
        const s = await database.ref('vardiya_data').once('value');
        return s.exists() ? s.val() : null;
      });
      if (!sameData(generation.generatedState, verify)) {
        throw new Error('Firebase write verification başarısız.');
      }
      result.ok = true;
      result.published = true;
      result.message = 'Liste başarıyla oluşturuldu, drift kontrolünden geçti ve Firebase vardiya_data atomik olarak güncellendi.';
      await writeSummary(result);
    }
  }
} catch (err) {
  result.message = String(err && err.stack || err);
  await writeSummary(result);
  process.exitCode = process.exitCode || 1;
} finally {
  if (browser) await browser.close().catch(()=>{});
  if (server) await new Promise(resolve => server.close(resolve));
  try {
    const sent = await notifyTelegram(result);
    if (sent) console.log('[TELEGRAM] notification sent');
  } catch (e) {
    console.error('[TELEGRAM] notification failed:', e.message || e);
  }
  console.log(JSON.stringify(result,null,2));
}
