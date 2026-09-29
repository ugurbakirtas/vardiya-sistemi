import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { positiveWeeksAhead } from './schedule-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const parentRoot = path.resolve(__dirname, '..');
const ROOT = fs.existsSync(path.join(parentRoot, 'public', 'index.html'))
  ? path.join(parentRoot, 'public')
  : (fs.existsSync(path.join(parentRoot, 'index.html'))
      ? parentRoot
      : path.join(parentRoot, 'app'));
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

// Firebase RTDB JSON semantiği: null/undefined ve boş container çocukları
// sunucuda saklanmaz; array'ler numeric-key object olarak geri dönebilir.
// Drift/write verification bu eşdeğer temsilleri hata saymamalı.
function firebaseSemantic(value) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const out = {};
    for (let i = 0; i < value.length; i++) {
      const v = firebaseSemantic(value[i]);
      if (v !== undefined) out[String(i)] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const v = firebaseSemantic(value[key]);
      if (v !== undefined) out[key] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return value;
}
function sameFirebaseData(a,b) {
  return JSON.stringify(firebaseSemantic(a) ?? null) === JSON.stringify(firebaseSemantic(b) ?? null);
}

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
      `- Baz alınan önceki hafta: **${result.baselineWeek || '-'}**`,
      `- Önceki hafta atama kaydı: **${result.baselineAssignmentCount ?? '-'}**`,
      `- Önceki hafta Excel kaynaklı hücre: **${result.baselineExcelAssignmentCount ?? '-'}**`,
      `- Hedef haftadaki atama kaydı: **${result.targetAssignmentCount ?? '-'}**`,
      `- Güvenli minimum atama eşiği: **${result.minimumExpectedAssignments ?? '-'}**`,
      `- Personel sayısı: **${result.personCount ?? '-'}**`,
      `- Preflight otomasyon birimi: **${result.preflightManagedUnitCount ?? '-'}**`,
      `- Audit hedef matris SHA256: **${result.audit?.targetMatrixSha256 || '-'}**`,
      `- Audit kişi-gün satırı: **${result.audit?.rows?.length ?? '-'}**`,
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
    currentMonday.setHours(12,0,0,0);
    currentMonday.setDate(currentMonday.getDate() + (7 * weeksAhead));
    const targetWeek = getDateKey(currentMonday);

    const baselineMonday = new Date(currentMonday);
    baselineMonday.setDate(baselineMonday.getDate() - 7);
    const baselineWeek = getDateKey(baselineMonday);
    const baselinePrefix = `${baselineWeek}_`;
    const baselineEntries = Object.entries(state.manuelAtamalar || {}).filter(([k]) => k.startsWith(baselinePrefix));
    const sources = (state.schedulerV2 && state.schedulerV2.assignmentSource) || {};
    const baselineExcelAssignmentCount = Object.keys(sources).filter(k => k.startsWith(baselinePrefix) && sources[k] === 'EXCEL_IMPORT_V63').length;

    // FAIL-SAFE: Gelecek hafta, bir önceki gerçek haftayı baz alır. Bulutta baz hafta yoksa
    // algoritmayı körlemesine çalıştırıp production'a yazma.
    if (baselineEntries.length === 0) {
      return {
        ok:false,
        targetWeek,
        baselineWeek,
        baselineAssignmentCount:0,
        baselineExcelAssignmentCount,
        assignmentCount:0,
        annualRecordCount:Array.isArray(hariciIzinler) ? hariciIzinler.length : 0,
        errors:[`Baz hafta ${baselineWeek} bulutta boş. Önce mevcut haftayı BULUTA KAYDET ile yayınlayın.`],
        generatedState:null
      };
    }

    try { tabloyuOlustur(); } catch (_) {}

    // UI'deki OTO VARDİYA, V63 tarafından queueAutoRun() ile asenkron bir wrapper'a sarılır.
    // Otomasyon wrapper'ı çağırırsa wrapper hemen true döner, fakat gerçek scheduler 80 ms sonra
    // başlayacağı için headless run yalancı PASS verebilir. UI ile aynı preflight'ı çalıştırıp
    // ardından kabul edilmiş senkron scheduler core'unu doğrudan çağırıyoruz.
    let preflight = null;
    if (window.V63Addons && typeof window.V63Addons.smartAutoPreflight === 'function') {
      preflight = window.V63Addons.smartAutoPreflight();
    }
    const action = window.vardiyaUretVeKaydet;
    const core = (typeof action === 'function' && typeof action.__v63core === 'function')
      ? action.__v63core
      : action;
    if (typeof core !== 'function') {
      return {
        ok:false,
        targetWeek,
        baselineWeek,
        baselineAssignmentCount: baselineEntries.length,
        baselineExcelAssignmentCount,
        assignmentCount:0,
        annualRecordCount:Array.isArray(hariciIzinler) ? hariciIzinler.length : 0,
        errors:['Vardiya scheduler core bulunamadı.'],
        generatedState:null
      };
    }

    const ok = core.call(window) === true;
    const prefix = `${targetWeek}_`;
    const targetEntries = Object.entries(state.manuelAtamalar || {}).filter(([k]) => k.startsWith(prefix));

    // AUDIT-ONLY: DRY-RUN/PUBLISH öncesi üretilen hedef haftanın kişi-gün matrisi
    // automation-output.json içine eklenir. Scheduler/state üzerinde hiçbir değişiklik yapmaz.
    const assignmentSources = (state.schedulerV2 && state.schedulerV2.assignmentSource) || {};
    const tempSources = (state.schedulerV2 && state.schedulerV2.tempUnitSource) || {};
    const targetAudit = [];
    for (const p of (state.personeller || [])) {
      for (let day=0; day<7; day++) {
        const date = new Date(currentMonday);
        date.setDate(date.getDate() + day);
        const dateKey = getDateKey(date);
        const aKey = `${targetWeek}_${p.ad}_${day}`;
        const tKey = `${dateKey}_${p.ad}`;
        const shift = (state.manuelAtamalar || {})[aKey];
        const tempUnit = (state.geciciGorevler || {})[tKey] || null;
        targetAudit.push({
          person: p.ad,
          homeUnit: p.birim || null,
          day,
          date: dateKey,
          shift: shift ?? null,
          effectiveUnit: tempUnit || p.birim || null,
          tempUnit,
          source: assignmentSources[aKey] || null,
          tempSource: tempSources[tKey] || null
        });
      }
    }

    const audit = {
      targetWeek,
      rows: targetAudit,
      weeklyMorningAnchors: (state.schedulerV2 && state.schedulerV2.weeklyMorningAnchors && state.schedulerV2.weeklyMorningAnchors[targetWeek]) || null
    };

    // Fail-safe: Tam haftalık üretim birkaç kayıtla PASS sayılamaz. Normal V62 full generate
    // her personel için çalışma/izin/yıllık izin hücrelerini üretir. MIN5 alt sınırı, olası
    // legacy/destek istisnalarına rağmen güvenli bir sanity eşiğidir.
    const personCount = Array.isArray(state.personeller) ? state.personeller.length : 0;
    const minimumExpectedAssignments = Math.max(1, personCount * 5);
    const countOk = targetEntries.length >= minimumExpectedAssignments;
    const schedulerErrors = (window.__V62_LAST_REOPT_ERRORS || []).slice(0,20);
    const errors = [];
    if (!ok) errors.push(...(schedulerErrors.length ? schedulerErrors : ['Vardiya scheduler core false döndü.']));
    if (ok && !countOk) errors.push(`Hedef hafta eksik üretildi: ${targetEntries.length} kayıt; güvenli alt sınır ${minimumExpectedAssignments}.`);

    return {
      ok: ok && countOk,
      targetWeek,
      baselineWeek,
      baselineAssignmentCount: baselineEntries.length,
      baselineExcelAssignmentCount,
      assignmentCount: targetEntries.length,
      minimumExpectedAssignments,
      personCount,
      preflightManagedUnitCount: preflight && Array.isArray(preflight.managed) ? preflight.managed.length : null,
      annualRecordCount: Array.isArray(hariciIzinler) ? hariciIzinler.length : 0,
      errors,
      audit,
      generatedState: (ok && countOk) ? state : null
    };
  }, weeksAhead);

  result.targetWeek = generation.targetWeek;
  result.baselineWeek = generation.baselineWeek;
  result.baselineAssignmentCount = generation.baselineAssignmentCount;
  result.baselineExcelAssignmentCount = generation.baselineExcelAssignmentCount;
  result.targetAssignmentCount = generation.assignmentCount;
  result.minimumExpectedAssignments = generation.minimumExpectedAssignments;
  result.personCount = generation.personCount;
  result.preflightManagedUnitCount = generation.preflightManagedUnitCount;
  result.annualRecordCount = generation.annualRecordCount;
  if (generation.audit) {
    result.audit = generation.audit;
    result.audit.targetMatrixSha256 = crypto.createHash('sha256')
      .update(JSON.stringify(generation.audit.rows || []))
      .digest('hex');
  }

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
    if (!sameFirebaseData(initialCloud, liveBeforePublish)) {
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
      if (!sameFirebaseData(generation.generatedState, verify)) {
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
