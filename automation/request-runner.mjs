import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.LOCAL_PORT || 8765);
const HOST = '127.0.0.1';
const requestId = String(process.env.REQUEST_ID || '').trim();
const email = process.env.VARDIYA_ADMIN_EMAIL || '';
const password = process.env.VARDIYA_ADMIN_PASSWORD || '';
const telegramToken = process.env.VARDIYA_TELEGRAM_BOT_TOKEN || '';
const telegramChatId = process.env.VARDIYA_TELEGRAM_CHAT_ID || '';
const outPath = path.join(__dirname, 'request-output.json');

if (!requestId) throw new Error('REQUEST_ID eksik.');
if (!email || !password) throw new Error('VARDIYA_ADMIN_EMAIL / VARDIYA_ADMIN_PASSWORD eksik.');

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

async function telegram(method, body) {
  if (!telegramToken) return null;
  const r = await fetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Telegram ${method} HTTP ${r.status}`);
  return r.json();
}

async function finalizeTelegram(result) {
  if (!telegramToken || !telegramChatId) return;
  const req = result.request || {};
  const icon = result.ok ? '✅' : '❌';
  const status = result.ok ? 'ONAYLANDI VE LİSTE GÜNCELLENDİ' : 'ONAY UYGULANAMADI';
  const text = [
    `${icon} *VARDİYA TALEBİ ${status}*`,
    '',
    `👤 *Personel:* ${req.ad || '-'}`,
    `📅 *Tarih:* ${req.tarih || '-'}`,
    `📝 *Talep:* ${req.tur || '-'}`,
    `🏢 *Birim:* ${result.unit || req.birim || '-'}`,
    result.ok ? '🔄 Yalnız ilgili birim yeniden dengelendi.' : `⚠️ ${result.message || 'Bilinmeyen hata'}`
  ].join('\n').slice(0,3900);
  if (req.telegramMessageId) {
    await telegram('editMessageText', {
      chat_id: telegramChatId,
      message_id: req.telegramMessageId,
      text,
      parse_mode:'Markdown'
    });
  } else {
    await telegram('sendMessage', {chat_id:telegramChatId,text,parse_mode:'Markdown'});
  }
}

async function writeSummary(result) {
  fs.writeFileSync(outPath, JSON.stringify(result,null,2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const r = result.request || {};
    const lines = [
      '# TürkMedya Vardiya — Telegram Talep İşleme', '',
      `- Sonuç: **${result.ok ? 'PASS' : 'FAIL'}**`,
      `- Talep ID: **${requestId}**`,
      `- Personel: **${r.ad || '-'}**`,
      `- Tarih: **${r.tarih || '-'}**`,
      `- Talep: **${r.tur || '-'}**`,
      `- Birim: **${result.unit || '-'}**`,
      `- Firebase vardiya_data yazma: **${result.published ? 'YAPILDI' : 'YAPILMADI'}**`, '',
      result.message || ''
    ];
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

let server;
let browser;
const result = {ok:false,published:false,requestId};
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
  await page.waitForFunction(() => typeof isAdmin !== 'undefined' && isAdmin === true && window.SchedulerV2, null, {timeout:30000});

  // Realtime annual listener otomatik re-opt yapmasın; runner kontrollü snapshot üzerinde çalışır.
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

  const request = await page.evaluate(async (id) => {
    const s = await database.ref('talepler/' + id).once('value');
    return s.exists() ? s.val() : null;
  }, requestId);
  if (!request) throw new Error(`Talep bulunamadı: ${requestId}`);
  result.request = request;
  if (!['isleniyor','bekliyor'].includes(String(request.durum || '').toLowerCase())) {
    throw new Error(`Talep işlenebilir durumda değil: ${request.durum}`);
  }

  await page.evaluate(async (cloud) => {
    state = cloud;
    verileriGuvenliHaleGetir();
    const snap = await dbIzin.collection('izinler').get();
    hariciIzinler = [];
    snap.forEach(doc => hariciIzinler.push(doc.data()));
  }, initialCloud);

  const apply = await page.evaluate((t) => {
    currentMonday = new Date(`${t.hKey}T12:00:00`);
    if (isNaN(currentMonday)) throw new Error(`Geçersiz hafta: ${t.hKey}`);
    try { SchedulerV2.applyExternalAnnualLocks(hariciIzinler,{reoptimize:false}); } catch (_) {}
    const p = state.personeller.find(x => x && x.ad === t.ad);
    if (!p) return {ok:false,message:'Talep personeli bulunamadı.'};
    const unit = getGecerliBirim(p, Number(t.gunIdx));
    if (!unit) return {ok:false,message:'Personelin birimi belirlenemedi.'};
    if (SchedulerV2.isAnnualHardLocked(t.ad, Number(t.gunIdx)) && t.tur !== SHIFTS.YILLIK) {
      return {ok:false,unit,message:`${t.ad} bu tarihte onaylı yıllık izinde.`};
    }
    const workShifts = new Set([SHIFTS.SABAH,SHIFTS.GUNDUZ,SHIFTS.OGLEN,SHIFTS.AKSAM,SHIFTS.GECE]);
    if (workShifts.has(t.tur) && !SchedulerV2.isQualifiedForUnit(p,unit)) {
      return {ok:false,unit,message:`${t.ad}, ${unit} için gerekli uzmanlığa sahip değil.`};
    }
    SchedulerV2.markManualAssignment(t.ad, Number(t.gunIdx), t.tur, 'REQUEST_V62_TELEGRAM');
    const ok = SchedulerV2.reoptimizeUnits([unit], `Telegram onaylı talep: ${t.ad} ${t.tur}`);
    if (!ok) {
      return {ok:false,unit,message:(window.__V62_LAST_REOPT_ERRORS || []).join(' | ') || 'Talep hard kurallarla birlikte çözülemedi.'};
    }
    const prefix = `${t.hKey}_`;
    const weekCount = Object.keys(state.manuelAtamalar || {}).filter(k=>k.startsWith(prefix)).length;
    return {ok:true,unit,weekCount,generatedState:state};
  }, request);

  result.unit = apply.unit || null;
  if (!apply.ok || !apply.generatedState) {
    result.message = apply.message || 'Talep uygulanamadı.';
    await page.evaluate(async ({id,msg}) => {
      await database.ref('talepler/' + id).update({durum:'hata', hata:msg, processedAt:firebase.database.ServerValue.TIMESTAMP, processedBy:'telegram'});
    }, {id:requestId,msg:result.message});
    await writeSummary(result);
    process.exitCode = 2;
  } else {
    // Drift kontrolü: plan oluşturulurken bir yönetici vardiya_data'yı değiştirdiyse insan değişikliğini ezme.
    const liveBeforePublish = await page.evaluate(async () => {
      const s = await database.ref('vardiya_data').once('value');
      return s.exists() ? s.val() : null;
    });
    if (!sameData(initialCloud, liveBeforePublish)) {
      result.message = 'Yayın iptal edildi: işlem sırasında vardiya_data başka bir istemci tarafından değiştirildi.';
      await page.evaluate(async ({id,msg}) => {
        await database.ref('talepler/' + id).update({durum:'hata', hata:msg, processedAt:firebase.database.ServerValue.TIMESTAMP, processedBy:'telegram'});
      }, {id:requestId,msg:result.message});
      await writeSummary(result);
      process.exitCode = 3;
    } else {
      await page.evaluate(async (newState) => {
        await database.ref('vardiya_data').set(newState);
      }, apply.generatedState);
      const verify = await page.evaluate(async () => {
        const s = await database.ref('vardiya_data').once('value');
        return s.exists() ? s.val() : null;
      });
      if (!sameData(apply.generatedState, verify)) throw new Error('Firebase write verification başarısız.');
      await page.evaluate(async (id) => {
        await database.ref('talepler/' + id).update({durum:'onaylandi', hata:null, processedAt:firebase.database.ServerValue.TIMESTAMP, processedBy:'telegram'});
      }, requestId);
      result.ok = true;
      result.published = true;
      result.message = `${request.ad} talebi uygulandı; yalnız ${apply.unit} yeniden dengelendi ve Firebase güncellendi.`;
      await writeSummary(result);
    }
  }
} catch (err) {
  result.message = String(err && err.stack || err);
  try {
    if (browser) {
      const pages = browser.contexts().flatMap(c=>c.pages());
      if (pages[0]) await pages[0].evaluate(async ({id,msg}) => {
        await database.ref('talepler/' + id).update({durum:'hata', hata:msg, processedAt:firebase.database.ServerValue.TIMESTAMP, processedBy:'telegram'});
      }, {id:requestId,msg:result.message.slice(0,1000)});
    }
  } catch (_) {}
  await writeSummary(result);
  process.exitCode = process.exitCode || 1;
} finally {
  try { await finalizeTelegram(result); } catch (e) { console.error('[TELEGRAM FINAL]', e.message || e); }
  if (browser) await browser.close().catch(()=>{});
  if (server) await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify(result,null,2));
}
