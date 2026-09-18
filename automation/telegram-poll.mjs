import fs from 'node:fs';

const DB = 'https://teknik-vardiya-listesi-default-rtdb.europe-west1.firebasedatabase.app';
const TOKEN = String(process.env.VARDIYA_TELEGRAM_BOT_TOKEN || '').trim();
const CHAT_ID = String(process.env.VARDIYA_TELEGRAM_CHAT_ID || '').trim();
const OUT = 'telegram-poll-output.json';

if (!TOKEN) throw new Error('VARDIYA_TELEGRAM_BOT_TOKEN eksik.');
if (!CHAT_ID) throw new Error('VARDIYA_TELEGRAM_CHAT_ID eksik.');

const nowIso = () => new Date().toISOString();

async function jfetch(url, options = {}) {
  const r = await fetch(url, options);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

async function dbGet(path) {
  return jfetch(`${DB}/${path}.json`);
}

async function dbPatch(path, value) {
  return jfetch(`${DB}/${path}.json`, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(value)
  });
}

async function tg(method, body = {}) {
  const data = await jfetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  if (!data?.ok) throw new Error(`Telegram ${method}: ${JSON.stringify(data)}`);
  return data.result;
}

function requestText(id, r) {
  return [
    '🟡 YENİ VARDİYA TALEBİ',
    '',
    `👤 Personel: ${r.ad || '-'}`,
    `📅 Tarih: ${r.tarih || '-'}`,
    `📝 Talep: ${r.tur || '-'}`,
    `🏢 Birim: ${r.birim || '-'}`,
    `🆔 Talep: ${id}`,
    '',
    'Onay verirseniz FIX10 kurallarıyla yalnız ilgili birim yeniden dengelenecek.'
  ].join('\n');
}

async function editRequestMessage(r, text) {
  const chatId = r.telegramChatId || CHAT_ID;
  const messageId = r.telegramMessageId;
  if (!messageId) return;
  await tg('editMessageText', {chat_id: chatId, message_id: messageId, text});
}

const report = {
  ok: false,
  at: nowIso(),
  notified: [],
  approved: [],
  rejected: [],
  ignoredCallbacks: 0,
  maxUpdateId: null
};

try {
  let requests = await dbGet('talepler') || {};

  // 1) Yeni bekleyen talepleri Telegram'a bir kez gönder.
  for (const [id, r0] of Object.entries(requests)) {
    const r = r0 || {};
    if (String(r.durum || '').toLowerCase() !== 'bekliyor') continue;
    if (r.telegramMessageId) continue;

    const sent = await tg('sendMessage', {
      chat_id: CHAT_ID,
      text: requestText(id, r),
      reply_markup: {
        inline_keyboard: [[
          {text: '✅ ONAYLA', callback_data: `rq:a:${id}`},
          {text: '❌ REDDET', callback_data: `rq:r:${id}`}
        ]]
      }
    });

    await dbPatch(`talepler/${encodeURIComponent(id)}`, {
      telegramChatId: String(sent.chat.id),
      telegramMessageId: sent.message_id,
      telegramNotifiedAt: Date.now(),
      telegramNotifiedBy: 'github-poll'
    });
    report.notified.push(id);
  }

  // Bildirimlerden sonra en güncel talepleri tekrar oku.
  requests = await dbGet('talepler') || {};

  // 2) Telegram callback'lerini al.
  const updates = await tg('getUpdates', {
    timeout: 0,
    limit: 100,
    allowed_updates: ['callback_query']
  }) || [];

  let maxUpdateId = null;
  for (const u of updates) {
    if (Number.isInteger(u.update_id)) maxUpdateId = maxUpdateId == null ? u.update_id : Math.max(maxUpdateId, u.update_id);
    const q = u.callback_query;
    if (!q) continue;

    const cbChatId = String(q.message?.chat?.id ?? '');
    const m = /^rq:([ar]):(.+)$/.exec(String(q.data || ''));
    if (cbChatId !== CHAT_ID || !m) {
      report.ignoredCallbacks++;
      try { await tg('answerCallbackQuery', {callback_query_id: q.id, text: 'Yetkisiz veya geçersiz işlem.'}); } catch {}
      continue;
    }

    const action = m[1];
    const id = m[2];
    const r = requests[id] || await dbGet(`talepler/${encodeURIComponent(id)}`);
    if (!r) {
      await tg('answerCallbackQuery', {callback_query_id: q.id, text: 'Talep bulunamadı.'});
      continue;
    }

    const status = String(r.durum || '').toLowerCase();
    if (status !== 'bekliyor') {
      await tg('answerCallbackQuery', {callback_query_id: q.id, text: `Talep zaten işlendi: ${r.durum || '-'}`});
      continue;
    }

    if (action === 'r') {
      await dbPatch(`talepler/${encodeURIComponent(id)}`, {
        durum: 'reddedildi',
        processedBy: 'telegram-github-poll',
        processedAt: Date.now()
      });
      await tg('answerCallbackQuery', {callback_query_id: q.id, text: 'Talep reddedildi.'});
      await editRequestMessage(r, [
        '❌ VARDİYA TALEBİ REDDEDİLDİ', '',
        `👤 Personel: ${r.ad || '-'}`,
        `📅 Tarih: ${r.tarih || '-'}`,
        `📝 Talep: ${r.tur || '-'}`
      ].join('\n'));
      report.rejected.push(id);
      requests[id] = {...r, durum:'reddedildi'};
      continue;
    }

    await dbPatch(`talepler/${encodeURIComponent(id)}`, {
      durum: 'isleniyor',
      processedBy: 'telegram-github-poll',
      processedAt: Date.now()
    });
    await tg('answerCallbackQuery', {callback_query_id: q.id, text: 'Onay alındı. Vardiya uygulanıyor…'});
    await editRequestMessage(r, [
      '⏳ VARDİYA TALEBİ ONAYLANDI — İŞLENİYOR', '',
      `👤 Personel: ${r.ad || '-'}`,
      `📅 Tarih: ${r.tarih || '-'}`,
      `📝 Talep: ${r.tur || '-'}`
    ].join('\n'));
    report.approved.push(id);
    requests[id] = {...r, durum:'isleniyor'};
  }

  // 3) Callback onaylanmış ama önceki Action yarıda kalmışsa tekrar kuyruğa al.
  for (const [id, r] of Object.entries(requests)) {
    if (String(r?.durum || '').toLowerCase() === 'isleniyor' && String(r?.processedBy || '').startsWith('telegram-github-poll')) {
      if (!report.approved.includes(id)) report.approved.push(id);
    }
  }

  // 4) İşlenen callback'leri Telegram kuyruğundan düşür.
  if (maxUpdateId != null) {
    report.maxUpdateId = maxUpdateId;
    await tg('getUpdates', {offset: maxUpdateId + 1, timeout: 0, limit: 1, allowed_updates:['callback_query']});
  }

  report.ok = true;
} finally {
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    const ids = [...new Set(report.approved)];
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_approved=${ids.length ? 'true' : 'false'}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `approved_ids=${ids.join(',')}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `# Telegram Ücretsiz Poll\n\n- Yeni bildirim: **${report.notified.length}**\n- Onay: **${report.approved.length}**\n- Red: **${report.rejected.length}**\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}
