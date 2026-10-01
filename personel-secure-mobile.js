/*
 * TURKMEDYA V62 - PERSONEL SECURE MOBILE FIX1
 * ------------------------------------------------------------
 * Bu katman scheduler-v2.js / vardiya algoritmasina dokunmaz.
 * Personel kimligini Cloudflare Worker oturumu ile dogrular,
 * talep sahibini browser seciminden degil imzali oturumdan alir,
 * mobil haftalik takvim + ayni vardiya + gunun ekibi gorunumunu ekler.
 */
(function PersonnelSecureMobile(global) {
  'use strict';

  const VERSION = 'V62-PERSONEL-SECURE-MOBILE-FIX1-20261001';
  const AUTH_BASE = 'https://turkmedya-personel-auth.ugurbakirtas.workers.dev';
  const STORAGE_KEY = 'TURKMEDYA_PERSONNEL_AUTH_V1';
  const OFF_VALUES = new Set(['', 'BOŞ', 'İZİNLİ', 'YILLIK İZİN', 'RAPORLU']);
  const POLL_MS = 30000;

  let session = { token: '', ad: '', birim: '', expiresAt: 0 };
  let selectedDay = null;
  let requestTimer = null;
  let requestsCache = [];
  let initialized = false;

  const core = {
    enterSystem: global.enterSystem,
    mobilListeyiGuncelle: global.mobilListeyiGuncelle,
    kisiselProgramiGoster: global.kisiselProgramiGoster,
    talepModalAc: global.talepModalAc,
    talepGonder: global.talepGonder,
    haftaDegistir: global.haftaDegistir,
    mobilVerileriYenile: global.mobilVerileriYenile,
    tumArayuzuCiz: global.tumArayuzuCiz
  };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function norm(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
  }

  function getPeople() {
    if (!global.state || !state.personeller) return [];
    return Array.isArray(state.personeller) ? state.personeller : Object.values(state.personeller || {});
  }

  function getPerson(name) {
    const wanted = norm(name);
    return getPeople().find(p => p && norm(p.ad) === wanted) || null;
  }

  function getCurrentMonday() {
    try {
      if (typeof currentMonday !== 'undefined' && currentMonday instanceof Date && !Number.isNaN(currentMonday.getTime())) {
        return new Date(currentMonday);
      }
    } catch (_) {}
    return typeof global.getMonday === 'function' ? global.getMonday(new Date()) : new Date();
  }

  function dayDate(day) {
    const d = getCurrentMonday();
    d.setDate(d.getDate() + Number(day || 0));
    d.setHours(12, 0, 0, 0);
    return d;
  }

  function dateKey(d) {
    if (typeof global.getDateKey === 'function') return global.getDateKey(d);
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  }

  function shiftFor(name, day) {
    let v = '';
    try { if (typeof global.vardiyaBul === 'function') v = global.vardiyaBul(name, day) || ''; } catch (_) {}
    return v && v !== 'BOŞ' ? String(v) : 'İZİNLİ';
  }

  function isWorking(shift) {
    return !OFF_VALUES.has(String(shift || '').trim());
  }

  function displayUnit(person, day, shift) {
    if (!person) return '';
    try {
      if (isWorking(shift) && typeof global.getGorevYeriGosterim === 'function') {
        const shown = String(global.getGorevYeriGosterim(person, day, shift) || '').trim();
        if (shown) return shown;
      }
      if (typeof global.getGecerliBirim === 'function') {
        const effective = String(global.getGecerliBirim(person, day) || '').trim();
        if (effective) return typeof global.gorevYeriBirimEtiketi === 'function'
          ? String(global.gorevYeriBirimEtiketi(effective) || effective)
          : effective;
      }
    } catch (_) {}
    return String(person.birim || '').trim();
  }

  function shiftMeta(shift) {
    const s = String(shift || '');
    if (s.includes('06:30')) return { icon:'🌅', cls:'sabah', label:s };
    if (s.includes('09:00')) return { icon:'☀️', cls:'gunduz', label:s };
    if (s.includes('12:00')) return { icon:'🌞', cls:'ogle', label:s };
    if (s.includes('16:00')) return { icon:'🌇', cls:'aksam', label:s };
    if (s.includes('18:00')) return { icon:'🌆', cls:'aksam', label:s };
    if (s.includes('00:00')) return { icon:'🌙', cls:'gece', label:s };
    if (s === 'YILLIK İZİN') return { icon:'✈️', cls:'yillik', label:s };
    if (s === 'RAPORLU') return { icon:'🩺', cls:'rapor', label:s };
    return { icon:'🏖️', cls:'izin', label:s || 'İZİNLİ' };
  }

  function saveSession() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch (_) {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.token) return null;
      return parsed;
    } catch (_) { return null; }
  }

  function clearSession(reload = false) {
    session = { token:'', ad:'', birim:'', expiresAt:0 };
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    stopRequestPolling();
    document.body.classList.remove('secure-personnel-session');
    if (reload) location.reload();
  }

  async function api(path, options = {}, needsAuth = false) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json; charset=utf-8');
    if (needsAuth) {
      if (!session.token) throw new Error('Personel oturumu bulunamadı.');
      headers.set('Authorization', `Bearer ${session.token}`);
    }
    const response = await fetch(`${AUTH_BASE}${path}`, { ...options, headers, cache:'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      const err = new Error(data?.error || `HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return data;
  }

  function injectStyles() {
    if (document.getElementById('personnelSecureStyles')) return;
    const style = document.createElement('style');
    style.id = 'personnelSecureStyles';
    style.textContent = `
      #personnelSecureLoginModal{position:fixed;inset:0;background:rgba(2,6,23,.88);z-index:10050;display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
      #personnelSecureLoginModal .psm-login{width:min(390px,100%);background:var(--card-bg);border:1px solid var(--border);border-top:4px solid var(--blue);border-radius:16px;padding:20px;box-shadow:0 25px 70px rgba(0,0,0,.35);color:var(--text)}
      #personnelSecureLoginModal h3{margin:0 0 5px;color:var(--primary);font-size:17px}#personnelSecureLoginModal .psm-sub{font-size:10px;opacity:.72;line-height:1.5;margin-bottom:14px}
      #personnelSecureLoginModal select,#personnelSecureLoginModal input{width:100%;box-sizing:border-box;padding:12px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit;margin-bottom:10px}
      #personnelSecureLoginModal input{font-size:18px;letter-spacing:3px;text-align:center;font-weight:800}.psm-actions{display:flex;gap:8px}.psm-actions button{flex:1;padding:11px;border:0;border-radius:9px;font-weight:800;cursor:pointer}.psm-primary{background:var(--blue);color:white}.psm-secondary{background:var(--bg);color:var(--text);border:1px solid var(--border)!important}
      .psm-error{min-height:18px;margin-top:9px;font-size:10px;color:var(--danger);font-weight:700;line-height:1.35}
      .secure-personnel-session #mobilPersonelPanel{border:2px solid rgba(37,99,235,.35)!important;box-shadow:0 8px 24px rgba(15,23,42,.08)}
      .secure-personnel-session #mobilPersonelPanel>div:first-of-type{display:none!important}.secure-personnel-session #v63MobileMyRequestsPanel,.secure-personnel-session #v63DesktopMyRequestsPanel{display:none!important}
      .psm-identity{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 11px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:10px}.psm-identity strong{font-size:12px;color:var(--primary)}.psm-identity small{display:block;font-size:9px;opacity:.7;margin-top:2px}.psm-identity-actions{display:flex;gap:5px}.psm-mini{border:1px solid var(--border);background:var(--card-bg);color:var(--text);border-radius:7px;padding:7px 8px;font-size:10px;font-weight:800;cursor:pointer}
      .psm-week{display:grid;grid-template-columns:repeat(7,minmax(76px,1fr));gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:10px}.psm-day{min-width:76px;border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:9px;padding:8px 6px;cursor:pointer;text-align:center}.psm-day.active{border:2px solid var(--blue);background:rgba(37,99,235,.08)}.psm-day-name{font-weight:900;font-size:10px}.psm-day-date{font-size:8px;opacity:.65;margin:2px 0 5px}.psm-day-shift{font-size:9px;font-weight:800;line-height:1.2}.psm-day-unit{font-size:8px;opacity:.72;margin-top:3px;line-height:1.2}
      .psm-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.psm-card{border:1px solid var(--border);background:var(--bg);border-radius:10px;padding:10px;color:var(--text)}.psm-card.full{grid-column:1/-1}.psm-card h4{margin:0 0 7px;color:var(--primary);font-size:11px}.psm-focus{display:flex;justify-content:space-between;align-items:center;gap:8px}.psm-focus-main{font-size:14px;font-weight:900}.psm-focus-unit{font-size:9px;opacity:.72;margin-top:3px}.psm-pill{border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;white-space:nowrap}.psm-names{font-size:10px;line-height:1.6}.psm-empty{font-size:9px;opacity:.65;line-height:1.45}.psm-roster-row{display:grid;grid-template-columns:92px 1fr;gap:7px;padding:5px 0;border-top:1px dashed var(--border);font-size:9px;line-height:1.35}.psm-roster-row:first-child{border-top:0}.psm-roster-shift{font-weight:900}.psm-roster-names{font-weight:600}
      .psm-myreq{margin-top:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg);padding:10px}.psm-myreq-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.psm-myreq-head h4{margin:0;color:var(--primary);font-size:11px}.psm-req-row{border:1px solid var(--border);border-radius:8px;background:var(--card-bg);padding:8px;margin-top:6px;font-size:9px}.psm-req-top{display:flex;justify-content:space-between;gap:8px}.psm-status{font-weight:900}.psm-status.bekliyor{color:#d97706}.psm-status.isleniyor{color:#2563eb}.psm-status.onaylandi{color:#16a34a}.psm-status.reddedildi,.psm-status.hata{color:#dc2626}
      .psm-security-note{font-size:9px;line-height:1.45;padding:8px;border-radius:8px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.18);margin-bottom:10px;color:var(--text)}
      @media(max-width:760px){.psm-detail-grid{grid-template-columns:1fr}.psm-card.full{grid-column:auto}.psm-week{grid-template-columns:repeat(7,82px)}.psm-identity{align-items:flex-start}.psm-roster-row{grid-template-columns:84px 1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureLoginModal() {
    if (document.getElementById('personnelSecureLoginModal')) return;
    const modal = document.createElement('div');
    modal.id = 'personnelSecureLoginModal';
    modal.innerHTML = `
      <div class="psm-login">
        <h3>🔐 Personel Girişi</h3>
        <div class="psm-sub">Adınızı seçin ve size verilen 8 haneli kişisel erişim kodunu girin. Talep sahibi bu doğrulanmış oturumdan belirlenir.</div>
        <select id="psmLoginName"><option value="">İsminizi Seçiniz...</option></select>
        <input id="psmLoginPin" type="password" inputmode="numeric" maxlength="8" autocomplete="one-time-code" placeholder="8 haneli kod">
        <div class="psm-actions"><button class="psm-secondary" type="button" id="psmLoginCancel">İPTAL</button><button class="psm-primary" type="button" id="psmLoginSubmit">GİRİŞ YAP</button></div>
        <div id="psmLoginError" class="psm-error"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('psmLoginCancel').addEventListener('click', () => { modal.style.display = 'none'; });
    document.getElementById('psmLoginSubmit').addEventListener('click', loginFromModal);
    document.getElementById('psmLoginPin').addEventListener('keydown', e => { if (e.key === 'Enter') loginFromModal(); });
  }

  function fillLoginNames(preferred = '') {
    const sel = document.getElementById('psmLoginName');
    if (!sel) return;
    const current = preferred || sel.value || '';
    const people = getPeople().filter(p => p && p.ad).sort((a,b) => String(a.ad).localeCompare(String(b.ad),'tr'));
    sel.innerHTML = '<option value="">İsminizi Seçiniz...</option>' + people.map(p => `<option value="${esc(p.ad)}">${esc(p.ad)}</option>`).join('');
    if (current && people.some(p => p.ad === current)) sel.value = current;
  }

  function showLoginModal() {
    ensureLoginModal();
    fillLoginNames(session.ad || '');
    const modal = document.getElementById('personnelSecureLoginModal');
    const err = document.getElementById('psmLoginError');
    const pin = document.getElementById('psmLoginPin');
    if (err) err.textContent = '';
    if (pin) pin.value = '';
    modal.style.display = 'flex';
    setTimeout(() => pin?.focus(), 50);
  }

  async function loginFromModal() {
    const name = String(document.getElementById('psmLoginName')?.value || '').trim();
    const pin = String(document.getElementById('psmLoginPin')?.value || '').trim();
    const err = document.getElementById('psmLoginError');
    const btn = document.getElementById('psmLoginSubmit');
    if (!name || !/^\d{8}$/.test(pin)) {
      if (err) err.textContent = 'Personel adı ve 8 haneli erişim kodu gerekli.';
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'DOĞRULANIYOR...'; }
    if (err) err.textContent = '';
    try {
      const data = await api('/login', { method:'POST', body:JSON.stringify({ ad:name, kod:pin }) });
      session = {
        token: String(data.token || ''),
        ad: String(data.ad || name),
        birim: String(data.birim || ''),
        expiresAt: Date.now() + Number(data.expiresIn || 0) * 1000
      };
      if (!session.token) throw new Error('Oturum anahtarı alınamadı.');
      saveSession();
      document.getElementById('personnelSecureLoginModal').style.display = 'none';
      await enterAuthenticatedPersonnel();
      global.showToast?.(`🔐 ${session.ad} olarak güvenli giriş yapıldı.`, 'success');
    } catch (e) {
      if (err) err.textContent = String(e?.message || e);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'GİRİŞ YAP'; }
    }
  }

  async function validateStoredSession() {
    const stored = loadSession();
    if (!stored?.token) return false;
    session = stored;
    try {
      const me = await api('/me', { method:'GET' }, true);
      session.ad = String(me.ad || session.ad || '');
      session.birim = String(me.birim || session.birim || '');
      saveSession();
      return !!session.ad;
    } catch (_) {
      clearSession(false);
      return false;
    }
  }

  async function enterAuthenticatedPersonnel() {
    if (!session.token || !session.ad) return showLoginModal();
    if (typeof core.enterSystem === 'function') core.enterSystem.call(global, 'personel');
    document.body.classList.add('secure-personnel-session');
    setTimeout(() => {
      activateSecurePanel();
      renderSecureProgram();
      refreshMyRequests();
      startRequestPolling();
    }, 300);
    setTimeout(() => { activateSecurePanel(); renderSecureProgram(); }, 1000);
  }

  function activateSecurePanel() {
    if (!session.ad) return;
    const panel = document.getElementById('mobilPersonelPanel');
    if (!panel) return;
    document.body.classList.add('secure-personnel-session');
    const title = panel.querySelector('h3');
    if (title) title.textContent = '🔐 Kişisel Vardiya Programım';

    const select = document.getElementById('mobilPersonelSecim');
    if (select) {
      select.innerHTML = `<option value="${esc(session.ad)}">${esc(session.ad)}</option>`;
      select.value = session.ad;
      select.disabled = true;
    }

    let identity = document.getElementById('psmIdentity');
    if (!identity) {
      identity = document.createElement('div');
      identity.id = 'psmIdentity';
      identity.className = 'psm-identity';
      if (title?.nextSibling) panel.insertBefore(identity, title.nextSibling); else panel.prepend(identity);
    }
    identity.innerHTML = `<div><strong>🔒 ${esc(session.ad)}</strong><small>${esc(session.birim || getPerson(session.ad)?.birim || '')} · doğrulanmış profil</small></div><div class="psm-identity-actions"><button class="psm-mini" onclick="PersonnelSecureMobile.refreshAll()">🔄</button><button class="psm-mini" onclick="PersonnelSecureMobile.logout()">PROFİL DEĞİŞTİR</button></div>`;

    let note = document.getElementById('psmSecurityNote');
    if (!note) {
      note = document.createElement('div');
      note.id = 'psmSecurityNote';
      note.className = 'psm-security-note';
      identity.insertAdjacentElement('afterend', note);
    }
    note.innerHTML = '🛡️ Talep oluştururken personel adı bu ekrandan alınmaz; doğrulanmış oturumunuz sunucu tarafından belirlenir.';
  }

  function defaultSelectedDay() {
    if (selectedDay !== null && selectedDay >= 0 && selectedDay <= 6) return selectedDay;
    const today = new Date(); today.setHours(12,0,0,0);
    const mon = getCurrentMonday(); mon.setHours(12,0,0,0);
    const diff = Math.round((today - mon) / 86400000);
    return diff >= 0 && diff <= 6 ? diff : 0;
  }

  function sameDutyPeople(unit, day) {
    return getPeople().filter(p => {
      if (!p?.ad) return false;
      const shift = shiftFor(p.ad, day);
      if (!isWorking(shift)) return false;
      return norm(displayUnit(p, day, shift)) === norm(unit);
    });
  }

  function rosterForUnit(unit, day) {
    const people = sameDutyPeople(unit, day);
    const order = ['06:30–16:00','09:00–18:00','12:00–20:00','16:00–00:00','18:00–02:00','00:00–07:00'];
    const map = new Map();
    people.forEach(p => {
      const shift = shiftFor(p.ad, day);
      if (!map.has(shift)) map.set(shift, []);
      map.get(shift).push(p.ad);
    });
    const keys = Array.from(map.keys()).sort((a,b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b,'tr');
      if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib;
    });
    return keys.map(shift => ({ shift, names: map.get(shift).sort((a,b)=>a.localeCompare(b,'tr')) }));
  }

  function renderSecureProgram() {
    if (!session.ad) return;
    activateSecurePanel();
    const root = document.getElementById('kisiselListeSonuc');
    if (!root) return;
    const person = getPerson(session.ad);
    if (!person) {
      root.innerHTML = '<div class="psm-card"><div class="psm-empty">Personel kaydı mevcut vardiya listesinde bulunamadı. Listeyi yenileyin.</div></div>';
      return;
    }

    const day = defaultSelectedDay(); selectedDay = day;
    const weekHtml = [0,1,2,3,4,5,6].map(i => {
      const d = dayDate(i);
      const shift = shiftFor(session.ad, i);
      const unit = displayUnit(person, i, shift);
      const meta = shiftMeta(shift);
      return `<button type="button" class="psm-day ${i===day?'active':''}" onclick="PersonnelSecureMobile.selectDay(${i})"><div class="psm-day-name">${esc(global.GUNLER?.[i] || ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'][i])}</div><div class="psm-day-date">${esc(d.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'}))}</div><div class="psm-day-shift">${meta.icon} ${esc(meta.label)}</div>${isWorking(shift)?`<div class="psm-day-unit">📍 ${esc(unit)}</div>`:''}</button>`;
    }).join('');

    const d = dayDate(day);
    const shift = shiftFor(session.ad, day);
    const unit = displayUnit(person, day, shift);
    const meta = shiftMeta(shift);
    const coworkers = isWorking(shift)
      ? sameDutyPeople(unit, day).filter(p => norm(p.ad) !== norm(session.ad) && shiftFor(p.ad, day) === shift).map(p => p.ad).sort((a,b)=>a.localeCompare(b,'tr'))
      : [];
    const roster = rosterForUnit(unit || person.birim, day);

    const coworkerHtml = isWorking(shift)
      ? (coworkers.length ? `<div class="psm-names">${coworkers.map(x=>`👤 ${esc(x)}`).join('<br>')}</div>` : '<div class="psm-empty">Bu saatte aynı görev yerinde başka personel görünmüyor.</div>')
      : '<div class="psm-empty">İzin/rapor gününde aynı vardiya arkadaşı bulunmaz.</div>';

    const rosterHtml = roster.length
      ? roster.map(r => `<div class="psm-roster-row"><div class="psm-roster-shift">${shiftMeta(r.shift).icon} ${esc(r.shift)}</div><div class="psm-roster-names">${r.names.map(esc).join(', ')}</div></div>`).join('')
      : '<div class="psm-empty">Bu görev yeri için çalışan ekip görünmüyor.</div>';

    root.innerHTML = `
      <div class="psm-week">${weekHtml}</div>
      <div class="psm-detail-grid">
        <div class="psm-card full"><div class="psm-focus"><div><div class="psm-focus-main">${esc(d.toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'}))}</div><div class="psm-focus-unit">${isWorking(shift)?`📍 ${esc(unit)}`:esc(person.birim || session.birim || '')}</div></div><span class="psm-pill ${esc(meta.cls)}">${meta.icon} ${esc(meta.label)}</span></div></div>
        <div class="psm-card"><h4>👥 Aynı vardiyadakiler</h4>${coworkerHtml}</div>
        <div class="psm-card"><h4>🗓️ ${esc(unit || person.birim)} · Günün Ekibi</h4>${rosterHtml}</div>
      </div>
      <div id="psmMyRequests" class="psm-myreq"><div class="psm-myreq-head"><h4>📋 Taleplerim</h4><button class="psm-mini" onclick="PersonnelSecureMobile.refreshMyRequests()">YENİLE</button></div><div id="psmMyRequestsList" class="psm-empty">Talepler yükleniyor...</div></div>`;
    renderMyRequests();
  }

  function selectDay(day) {
    selectedDay = Math.max(0, Math.min(6, Number(day) || 0));
    renderSecureProgram();
  }

  function statusLabel(status) {
    const s = String(status || 'bekliyor').toLocaleLowerCase('tr-TR');
    if (s === 'onaylandi' || s === 'onaylandı') return { key:'onaylandi', text:'✅ ONAYLANDI' };
    if (s === 'reddedildi') return { key:'reddedildi', text:'❌ REDDEDİLDİ' };
    if (s === 'isleniyor' || s === 'işleniyor') return { key:'isleniyor', text:'⚙️ İŞLENİYOR' };
    if (s === 'hata' || s === 'uygulanamadi' || s === 'uygulanamadı') return { key:'hata', text:'⚠️ UYGULANAMADI' };
    return { key:'bekliyor', text:'⏳ BEKLİYOR' };
  }

  function renderMyRequests() {
    const root = document.getElementById('psmMyRequestsList');
    if (!root) return;
    if (!requestsCache.length) {
      root.innerHTML = '<div class="psm-empty">Henüz bu doğrulanmış profile ait talep bulunmuyor.</div>';
      return;
    }
    const rows = requestsCache.slice(0, 12).map(r => {
      const st = statusLabel(r.durum);
      const tm = r.tarih ? new Date(`${r.tarih}T12:00:00`).toLocaleDateString('tr-TR') : '-';
      return `<div class="psm-req-row"><div class="psm-req-top"><strong>${esc(tm)} · ${esc(r.tur || '-')}</strong><span class="psm-status ${st.key}">${st.text}</span></div>${r.birim?`<div style="opacity:.7;margin-top:3px">📍 ${esc(r.birim)}</div>`:''}${r.hata?`<div style="color:var(--danger);margin-top:4px">${esc(r.hata)}</div>`:''}</div>`;
    }).join('');
    root.innerHTML = rows + (requestsCache.length > 12 ? `<div class="psm-empty" style="margin-top:6px">Son 12 kayıt gösteriliyor. Toplam ${requestsCache.length}.</div>` : '');
  }

  async function refreshMyRequests() {
    if (!session.token) return;
    try {
      const data = await api('/my-requests', { method:'GET' }, true);
      requestsCache = Array.isArray(data.items) ? data.items : [];
      renderMyRequests();
    } catch (e) {
      if (e?.status === 401) {
        clearSession(false);
        global.showToast?.('Personel oturumu geçersiz. Lütfen tekrar giriş yapın.', 'error');
        showLoginModal();
        return;
      }
      const root = document.getElementById('psmMyRequestsList');
      if (root) root.innerHTML = `<div class="psm-empty" style="color:var(--danger)">${esc(e?.message || e)}</div>`;
    }
  }

  function startRequestPolling() {
    stopRequestPolling();
    requestTimer = setInterval(() => { if (session.token && !document.hidden) refreshMyRequests(); }, POLL_MS);
  }

  function stopRequestPolling() {
    if (requestTimer) clearInterval(requestTimer);
    requestTimer = null;
  }

  function secureRequestModalOpen() {
    if (!session.token || !session.ad) return showLoginModal();
    if (typeof core.talepModalAc === 'function') core.talepModalAc.call(global);
    const modal = document.getElementById('talepModal');
    const sel = document.getElementById('talepPersonel');
    if (sel) {
      sel.innerHTML = `<option value="${esc(session.ad)}">🔒 ${esc(session.ad)}</option>`;
      sel.value = session.ad;
      sel.disabled = true;
    }
    const card = modal?.querySelector('.login-card');
    if (card) {
      let hint = document.getElementById('psmTalepIdentityHint');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'psmTalepIdentityHint';
        hint.className = 'psm-security-note';
        const firstSelect = card.querySelector('#talepPersonel');
        if (firstSelect) firstSelect.insertAdjacentElement('afterend', hint); else card.prepend(hint);
      }
      hint.innerHTML = `🔒 Talep <b>${esc(session.ad)}</b> adına güvenli oturum üzerinden gönderilecek. İsim değiştirilemez.`;
    }
    if (modal) modal.style.display = 'flex';
  }

  async function secureRequestSubmit() {
    if (!session.token || !session.ad) return showLoginModal();
    const tarih = String(document.getElementById('talepTarih')?.value || '').trim();
    const tur = String(document.getElementById('talepTuru')?.value || '').trim();
    if (!tarih) return global.showToast?.('Lütfen tarih seçin!', 'warning');
    const btn = document.querySelector('#talepModal button[onclick="talepGonder()"]');
    if (btn) { btn.disabled = true; btn.dataset.oldText = btn.textContent; btn.textContent = 'GÖNDERİLİYOR...'; }
    try {
      const data = await api('/request', { method:'POST', body:JSON.stringify({ tarih, tur }) }, true);
      const modal = document.getElementById('talepModal');
      if (modal) modal.style.display = 'none';
      global.showToast?.(`✅ Talebiniz ${data?.talep?.ad || session.ad} adına güvenli olarak iletildi.`, 'success');
      await refreshMyRequests();
    } catch (e) {
      if (e?.status === 401) {
        clearSession(false);
        global.showToast?.('Personel oturumu geçersiz. Tekrar giriş yapın.', 'error');
        showLoginModal();
      } else {
        global.showToast?.(`Talep gönderilemedi: ${e?.message || e}`, 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.oldText || 'TALEBİ GÖNDER'; }
    }
  }

  async function refreshAll() {
    try {
      if (typeof core.mobilVerileriYenile === 'function') await core.mobilVerileriYenile.call(global);
    } catch (_) {}
    activateSecurePanel();
    renderSecureProgram();
    await refreshMyRequests();
  }

  function installWrappers() {
    global.enterSystem = function(role) {
      if (role !== 'personel') return typeof core.enterSystem === 'function' ? core.enterSystem.apply(this, arguments) : undefined;
      if (session.token && session.ad) return enterAuthenticatedPersonnel();
      showLoginModal();
    };

    global.mobilListeyiGuncelle = function() {
      if (!session.token || !session.ad) return typeof core.mobilListeyiGuncelle === 'function' ? core.mobilListeyiGuncelle.apply(this, arguments) : undefined;
      activateSecurePanel();
      renderSecureProgram();
    };

    global.kisiselProgramiGoster = function() {
      if (!session.token || !session.ad) return typeof core.kisiselProgramiGoster === 'function' ? core.kisiselProgramiGoster.apply(this, arguments) : undefined;
      activateSecurePanel();
      renderSecureProgram();
    };

    global.talepModalAc = secureRequestModalOpen;
    global.talepGonder = secureRequestSubmit;

    global.haftaDegistir = function(v) {
      selectedDay = null;
      const r = typeof core.haftaDegistir === 'function' ? core.haftaDegistir.apply(this, arguments) : undefined;
      if (session.token) setTimeout(renderSecureProgram, 0);
      return r;
    };

    global.mobilVerileriYenile = async function() {
      const r = typeof core.mobilVerileriYenile === 'function' ? await core.mobilVerileriYenile.apply(this, arguments) : undefined;
      if (session.token) { activateSecurePanel(); renderSecureProgram(); await refreshMyRequests(); }
      return r;
    };

    global.tumArayuzuCiz = function() {
      const r = typeof core.tumArayuzuCiz === 'function' ? core.tumArayuzuCiz.apply(this, arguments) : undefined;
      if (session.token) setTimeout(() => { activateSecurePanel(); renderSecureProgram(); }, 0);
      return r;
    };
  }

  async function restoreOnLoad() {
    // Firebase admin oturumu varsa personel oturumunu otomatik acma.
    await new Promise(resolve => setTimeout(resolve, 800));
    if (global.isAdmin || global.firebase?.auth?.().currentUser) return;
    if (await validateStoredSession()) {
      await enterAuthenticatedPersonnel();
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    injectStyles();
    ensureLoginModal();
    installWrappers();
    setTimeout(fillLoginNames, 700);
    setTimeout(fillLoginNames, 1800);
    restoreOnLoad();
    console.log(`[PersonnelSecureMobile] ${VERSION} loaded.`);
  }

  global.PersonnelSecureMobile = {
    version: VERSION,
    selectDay,
    refreshMyRequests,
    refreshAll,
    render: renderSecureProgram,
    login: showLoginModal,
    logout: () => clearSession(true),
    getSession: () => ({ ad:session.ad, birim:session.birim, authenticated:!!session.token })
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})(window);
