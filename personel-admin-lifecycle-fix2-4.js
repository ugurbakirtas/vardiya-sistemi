/*
 * TURKMEDYA V62 - PERSONEL LIFECYCLE + SESSION FINAL FIX2.4
 * ---------------------------------------------------------
 * - Yeni personelde ad + birim + kurumsal e-posta tek panelden yönetilir.
 * - Personel silme canlı Firebase'e tek işlemde yayınlanır ve Secure Mobile oturumu iptal edilir.
 * - scheduler-v2.js / vardiya motoru değişmez.
 */
(function PersonnelAdminLifecycleFix24(global){
  'use strict';

  const VERSION = 'V62-PERSONEL-LIFECYCLE-FIX2.4-20261002';
  const AUTH_BASE = 'https://turkmedya-personel-auth.ugurbakirtas.workers.dev';
  let installed = false;
  let coreRefreshUI = null;

  function normName(v){ return String(v||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('tr-TR'); }
  function normEmail(v){ return String(v||'').trim().toLocaleLowerCase('en-US'); }
  function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(v)); }

  function getPeople(){
    try { return Array.isArray(state.personeller) ? state.personeller : Object.values(state.personeller||{}); }
    catch(_){ return []; }
  }

  function ensureNewPersonEmailInput(){
    const name = document.getElementById('yeniPersInp');
    if(!name || document.getElementById('yeniPersEmailInp')) return;
    const input = document.createElement('input');
    input.type = 'email';
    input.id = 'yeniPersEmailInp';
    input.placeholder = 'Kurumsal E-posta (örn. ad.soyad@turkmedya.com.tr)';
    input.autocomplete = 'off';
    input.style.cssText = 'width:100%;padding:12px;margin-bottom:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);box-sizing:border-box;';
    name.insertAdjacentElement('afterend', input);

    const hint = document.createElement('div');
    hint.id = 'personelEmailAdminHint';
    hint.style.cssText = 'font-size:9px;line-height:1.45;color:var(--text);opacity:.72;margin:-4px 0 9px 0;';
    hint.textContent = 'Secure Mobile için yeni personelde gerçek kurumsal e-posta zorunludur. İki/üç isimli personelde adresi burada birebir yazın; Cloudflare kodu düzenlemeniz gerekmez.';
    input.insertAdjacentElement('afterend', hint);
  }

  function resolvedEmailText(p){
    const email = normEmail(p?.email);
    return email || 'Otomatik mevcut eşleme kullanılıyor';
  }

  function injectPersonCards(){
    const root = document.getElementById('persListesiAdmin');
    if(!root) return;
    const cards = Array.from(root.querySelectorAll(':scope > [data-v63-person-card="1"]'));
    cards.forEach((card, i) => {
      const p = getPeople()[i];
      if(!p) return;

      if(!card.querySelector('[data-person-email-row="1"]')){
        const row = document.createElement('div');
        row.dataset.personEmailRow = '1';
        row.style.cssText = 'margin-top:7px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;';
        row.innerHTML = `
          <div style="font-size:9px;font-weight:800;color:var(--text);margin-bottom:5px;">📧 KURUMSAL E-POSTA</div>
          <input type="email" value="${String(p.email||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" placeholder="${resolvedEmailText(p)}" data-person-email-index="${i}" style="width:100%;box-sizing:border-box;padding:8px;border-radius:5px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-size:10px;">
          <div style="font-size:8px;opacity:.65;margin-top:4px;">Boşsa mevcut otomatik/istisna eşlemesi kullanılır. Yeni personelde e-posta alanı zorunludur.</div>`;
        const header = card.firstElementChild;
        if(header?.nextSibling) card.insertBefore(row, header.nextSibling); else card.appendChild(row);
        const inp = row.querySelector('input');
        inp.addEventListener('change', () => global.personelEmailGuncelle(i, inp.value));
      }

      const buttons = Array.from(card.querySelectorAll('button'));
      const del = buttons.find(b => String(b.textContent||'').trim().toLocaleUpperCase('tr-TR') === 'SİL');
      if(del && !del.dataset.secureLifecycle){
        del.dataset.secureLifecycle = '1';
        del.textContent = 'AYRILDI / SİL';
        del.title = 'Personeli vardiya listesinden çıkarır ve Secure Mobile erişimini kapatır.';
        del.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); global.personelGuvenliSil(i); return false; };
      }
    });
  }

  function inject(){
    try { ensureNewPersonEmailInput(); injectPersonCards(); } catch(e){ console.warn('[Lifecycle FIX2.4 inject]', e); }
  }

  async function publishState(){
    if(typeof global.bulutaKaydet !== 'function') throw new Error('Buluta Kaydet fonksiyonu bulunamadı.');
    const ok = await global.bulutaKaydet();
    if(ok === false) throw new Error('Canlı Firebase kaydı başarısız oldu.');
    return true;
  }

  async function revokeSecureAccess(ad){
    try{
      const admin = global.firebase?.auth?.().currentUser;
      if(!admin) return {ok:false, skipped:true, reason:'Yönetici Firebase oturumu yok'};
      const idToken = await admin.getIdToken(true);
      const r = await fetch(`${AUTH_BASE}/admin/personnel/revoke`, {
        method:'POST',
        headers:{'Content-Type':'application/json; charset=utf-8','Authorization':`Bearer ${idToken}`},
        body:JSON.stringify({ad}),
        cache:'no-store'
      });
      const data = await r.json().catch(()=>({}));
      if(!r.ok || data?.ok===false) throw new Error(data?.error || `HTTP ${r.status}`);
      return data;
    }catch(e){
      console.warn('[Lifecycle FIX2.4 revoke]', e);
      return {ok:false,error:String(e?.message||e)};
    }
  }

  function cleanupPersonSettings(ad){
    try{
      if(state.mcrAyarlari?.ofsetler) delete state.mcrAyarlari.ofsetler[ad];
      if(state.haftaIciSabitler) delete state.haftaIciSabitler[ad];
      if(state.haftaIciSabitGorevYerleri) delete state.haftaIciSabitGorevYerleri[ad];
      if(state.haftaSonuYedekler) delete state.haftaSonuYedekler[ad];
    }catch(_){ }
  }

  global.personelEkle = async function(){
    if(typeof isAdmin !== 'undefined' && !isAdmin){ global.showToast?.('Bu işlem yalnız yönetici içindir.','error'); return; }
    const nameEl = document.getElementById('yeniPersInp');
    const unitEl = document.getElementById('yeniPersBirimSec');
    const emailEl = document.getElementById('yeniPersEmailInp');
    const ad = normName(nameEl?.value);
    const birim = String(unitEl?.value||'').trim();
    const email = normEmail(emailEl?.value);
    if(!ad){ global.showToast?.('Personel adı gerekli.','warning'); return; }
    if(!birim){ global.showToast?.('Birim seçin.','warning'); return; }
    if(!validEmail(email)){ global.showToast?.('Geçerli kurumsal e-posta girin.','warning'); emailEl?.focus(); return; }
    if(getPeople().some(p=>normName(p.ad)===ad)){ global.showToast?.('Bu personel zaten mevcut.','warning'); return; }
    if(getPeople().some(p=>normEmail(p.email)===email && normEmail(p.email))){ global.showToast?.('Bu kurumsal e-posta başka bir personele kayıtlı.','warning'); return; }

    const person = {ad, birim, email, izinGunleri:[], yuzde:0, uzmanlik:[]};
    state.personeller.push(person);
    try{
      global.save?.();
      coreRefreshUI?.(); inject();
      global.tabloyuOlustur?.();
      await publishState();
      if(nameEl) nameEl.value=''; if(emailEl) emailEl.value='';
      global.showToast?.(`✅ ${ad} eklendi ve canlıya kaydedildi.`,'success');
    }catch(e){
      const idx = state.personeller.indexOf(person); if(idx>=0) state.personeller.splice(idx,1);
      global.save?.(); coreRefreshUI?.(); inject(); global.tabloyuOlustur?.();
      global.showToast?.('Personel eklenemedi: '+String(e?.message||e),'error');
    }
  };

  global.personelEmailGuncelle = async function(index, value){
    const p = getPeople()[Number(index)]; if(!p) return;
    const old = p.email || '';
    const email = normEmail(value);
    if(email && !validEmail(email)){ global.showToast?.('Geçerli bir e-posta girin.','warning'); coreRefreshUI?.(); inject(); return; }
    if(email && getPeople().some((x,j)=>j!==Number(index) && normEmail(x.email)===email)){ global.showToast?.('Bu e-posta başka bir personele kayıtlı.','warning'); coreRefreshUI?.(); inject(); return; }
    p.email = email;
    try{
      global.save?.();
      await publishState();
      global.showToast?.(`📧 ${p.ad} kurumsal e-postası güncellendi.`,'success');
    }catch(e){
      p.email = old; global.save?.(); coreRefreshUI?.(); inject();
      global.showToast?.('E-posta kaydedilemedi: '+String(e?.message||e),'error');
    }
  };

  global.personelGuvenliSil = async function(index){
    if(typeof isAdmin !== 'undefined' && !isAdmin){ global.showToast?.('Bu işlem yalnız yönetici içindir.','error'); return; }
    const i=Number(index), p=getPeople()[i]; if(!p) return;
    if(!confirm(`⚠️ ${p.ad} sistemden çıkarılsın mı?\n\n• Vardiya personel listesinden kaldırılır.\n• Secure Mobile erişimi kapatılır.\n• Geçmiş vardiya kayıtları arşiv amacıyla silinmez.`)) return;

    const backup = JSON.parse(JSON.stringify(p));
    state.personeller.splice(i,1); cleanupPersonSettings(p.ad);
    global.save?.(); coreRefreshUI?.(); inject(); global.tabloyuOlustur?.();
    try{
      await publishState();
      const rev = await revokeSecureAccess(p.ad);
      if(rev.ok) global.showToast?.(`✅ ${p.ad} çıkarıldı; Secure Mobile oturumları iptal edildi.`,'success');
      else global.showToast?.(`✅ ${p.ad} çıkarıldı. Canlı personel listesinde olmadığı için Secure Mobile erişimi kapalı.`,'success');
    }catch(e){
      state.personeller.splice(Math.min(i,state.personeller.length),0,backup);
      global.save?.(); coreRefreshUI?.(); inject(); global.tabloyuOlustur?.();
      global.showToast?.('Personel silme canlıya kaydedilemedi; işlem geri alındı: '+String(e?.message||e),'error');
    }
  };

  function install(){
    if(installed) return; installed=true;
    coreRefreshUI = global.refreshUI;
    if(typeof coreRefreshUI==='function'){
      global.refreshUI = function(){ const r=coreRefreshUI.apply(this,arguments); setTimeout(inject,0); return r; };
    }
    setTimeout(inject,300); setTimeout(inject,1200);
    console.log(`[PersonnelAdminLifecycleFix24] ${VERSION} loaded.`);
  }

  global.PersonnelAdminLifecycleFix24={version:VERSION,inject};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})(window);
