/*
 * TURKMEDYA V63 SAFE ADD-ONS / FIX16
 * Additive runtime UI/tools layer. Scheduler core is loaded separately and remains rule-compatible with FIX10.
 */
(function(global){
'use strict';

const VERSION = 'V63-SNAPSHOT-QUOTA-FIX6-20260929';
const EXPECTED_SCHEDULER = 'V62';
const FEATURES = Object.assign({
  requestCenterV2: true,
  auditTools: true,
  smartWarnings: true,
  systemHealth: true,
  weeklyReport: true,
  localSnapshots: true,
  draftPublishStatus: true,
  adminNameSearch: true,
  myRequests: true,
  roleSecurity: false,
  autoRollback: false
}, (()=>{ try { return JSON.parse(localStorage.getItem('v63_feature_flags')||'{}'); } catch(e){ return {}; } })());
global.V63_FEATURES = FEATURES;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
const hKeyNow = () => typeof getDateKey === 'function' ? getDateKey(currentMonday) : '';
const inactiveShifts = () => new Set([SHIFTS.IZIN, SHIFTS.BOS, SHIFTS.YILLIK, SHIFTS.RAPOR, null, undefined, '']);

function injectStyles(){
  if(document.getElementById('v63-addon-style')) return;
  const style=document.createElement('style');
  style.id='v63-addon-style';
  style.textContent=`
  .v63-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.v63-card{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:12px;color:var(--text)}
  .v63-card h4{margin:0 0 8px;font-size:12px;color:var(--primary)}.v63-kpi{font-size:20px;font-weight:900}.v63-small{font-size:10px;opacity:.78;line-height:1.45}
  .v63-status{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:800}.v63-ok{background:#dcfce7;color:#166534}.v63-warn{background:#fef3c7;color:#92400e}.v63-bad{background:#fee2e2;color:#991b1b}.v63-info{background:#dbeafe;color:#1e40af}
  .v63-toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.v63-btn{border:0;border-radius:7px;padding:8px 10px;font-size:10px;font-weight:800;cursor:pointer;background:var(--blue);color:white}.v63-btn.alt{background:#475569}.v63-btn.warn{background:#d97706}.v63-btn.danger{background:#dc2626}
  .v63-list{display:flex;flex-direction:column;gap:6px;max-height:390px;overflow:auto}.v63-item{border:1px solid var(--border);border-radius:8px;padding:9px;background:var(--bg);font-size:10px}.v63-item strong{font-size:11px}.v63-sev-high{border-left:5px solid #dc2626}.v63-sev-med{border-left:5px solid #d97706}.v63-sev-low{border-left:5px solid #2563eb}
  .v63-counter-row{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:8px}.v63-counter{padding:7px;border:1px solid var(--border);border-radius:7px;text-align:center;background:var(--bg);font-size:9px}.v63-counter b{display:block;font-size:15px}
  .v63-draft-badge{position:fixed;left:12px;bottom:12px;z-index:9998;padding:7px 10px;border-radius:9px;font-size:10px;font-weight:900;box-shadow:0 4px 15px rgba(0,0,0,.2);display:none}
  .v63-myreq{margin-top:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg);padding:11px}.v63-myreq h4{margin:0 0 8px;color:var(--primary);font-size:12px}.v63-myreq-list{display:flex;flex-direction:column;gap:6px}.v63-myreq-row{border:1px solid var(--border);border-radius:8px;background:var(--card-bg);padding:9px;font-size:10px;color:var(--text)}.v63-myreq-row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.v63-myreq-row strong{font-size:11px}.v63-myreq-note{font-size:9px;opacity:.72;line-height:1.4;margin-top:4px}.v63-myreq-select{width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-weight:700;font-size:11px;box-sizing:border-box}
  @media(max-width:760px){.v63-grid{grid-template-columns:1fr}.v63-counter-row{grid-template-columns:repeat(2,1fr)}#v63DesktopMyRequestsPanel{display:none!important}}`;
  document.head.appendChild(style);
}


function currentExcelProtectedUnits(){
  const h=hKeyNow();

  // FIX16-FIX5:
  // Scheduler'ın gerçek state alanı state.schedulerV2'dir.
  // Önceki FIX3/FIX4 yanlışlıkla state.scheduler'a bakıyordu; bu yüzden
  // TAM OTO ekrandaki Excel korumalarını temizlediğini sanıyor ama
  // scheduler-v2.js onları state.schedulerV2.externalUnitWeeks üzerinden
  // hâlâ korumaya devam ediyordu.
  const m = state &&
            state.schedulerV2 &&
            state.schedulerV2.externalUnitWeeks &&
            state.schedulerV2.externalUnitWeeks[h];

  return m ? Object.keys(m).filter(u=>m[u]).sort((a,b)=>a.localeCompare(b,'tr')) : [];
}

function clearCurrentWeekExcelProtection(){
  const h=hKeyNow();

  if(!state.schedulerV2 || typeof state.schedulerV2!=='object') state.schedulerV2={};
  const s=state.schedulerV2;
  if(!s.externalUnitWeeks || typeof s.externalUnitWeeks!=='object') s.externalUnitWeeks={};
  if(!s.manualLocks) s.manualLocks={};
  if(!s.assignmentSource) s.assignmentSource={};
  if(!s.manualUnitLocks) s.manualUnitLocks={};
  if(!s.tempUnitSource) s.tempUnitSource={};

  const old=currentExcelProtectedUnits();
  delete s.externalUnitWeeks[h];

  // EXCEL AUTHORITY FIX1:
  // NORMAL OTO Excel'i korur. TAM OTO veya stale-koruma temizliği seçildiğinde ise
  // yalnız EXCEL_IMPORT_V63 kaynaklı hücre/görev-yeri kilitleri kaldırılır.
  // MANUAL_V62 ve yıllık izin hard-lock'larına dokunulmaz.
  const excelSource='EXCEL_IMPORT_V63';
  for(const key of Object.keys(s.assignmentSource||{})){
    if(!String(key).startsWith(h+'_')) continue;
    if(s.assignmentSource[key]!==excelSource) continue;
    delete s.assignmentSource[key];
    delete s.manualLocks[key];
    if(state.manuelAtamalar) delete state.manuelAtamalar[key];
  }

  const monday=new Date(`${h}T12:00:00`);
  for(let d=0;d<7;d++){
    const dt=new Date(monday); dt.setDate(dt.getDate()+d);
    const dk=(typeof getDateKey==='function') ? getDateKey(dt) : dt.toISOString().slice(0,10);
    for(const p of (state.personeller||[])){
      const tk=`${dk}_${p.ad}`;
      if(s.tempUnitSource[tk]!==excelSource) continue;
      delete s.tempUnitSource[tk];
      delete s.manualUnitLocks[tk];
      if(state.geciciGorevler) delete state.geciciGorevler[tk];
    }
  }

  if(typeof save==='function') save();
  return old;
}


function capacityArray(unit, shift){
  const a = state && state.kapasite && state.kapasite[`${unit}_${shift}`];
  return Array.isArray(a) ? a.map(v=>Math.max(0,parseInt(v||0,10)||0)) : [0,0,0,0,0,0,0];
}

function weeklyCapacityForUnit(unit){
  let n=0;
  for(const s of (state.saatler||[])){
    const a=capacityArray(unit,s);
    for(let d=0;d<7;d++) n += a[d]||0;
  }
  return n;
}

function weekDateKey(weekKey, day){
  const d=new Date(`${weekKey}T12:00:00`);
  if(isNaN(d)) return null;
  d.setDate(d.getDate()+day);
  return (typeof getDateKey==='function') ? getDateKey(d) : d.toISOString().slice(0,10);
}

function historicalWeekKeys(){
  const out=new Set();
  for(const k of Object.keys((state&&state.manuelAtamalar)||{})){
    const m=String(k).match(/^(\d{4}-\d{2}-\d{2})_/);
    if(m) out.add(m[1]);
  }
  const now=hKeyNow();
  return Array.from(out).filter(x=>x<now).sort().reverse();
}

function historicalCapacityForUnit(unit, weekKey){
  const result={};
  let total=0;
  for(const s of (state.saatler||[])) result[s]=[0,0,0,0,0,0,0];

  for(const p of (state.personeller||[])){
    for(let d=0;d<7;d++){
      const aKey=`${weekKey}_${p.ad}_${d}`;
      const shift=state.manuelAtamalar && state.manuelAtamalar[aKey];
      if(!(state.saatler||[]).includes(shift)) continue;
      const dateKey=weekDateKey(weekKey,d);
      const tempKey=dateKey ? `${dateKey}_${p.ad}` : null;
      const effective=(tempKey && state.geciciGorevler && state.geciciGorevler[tempKey]) || p.birim;
      if(effective!==unit) continue;
      result[shift][d]++;
      total++;
    }
  }
  return {result,total};
}

function hasSessionExcelImport(weekKey=hKeyNow()){
  try { return sessionStorage.getItem(`v63_excel_imported_week_${weekKey}`)==='1'; }
  catch(e){ return false; }
}

function repairMissingCapacitiesFromHistory(onlyUnits=null){
  if(!state.kapasite) state.kapasite={};

  const allUnits=new Set([...(state.birimler||[])]);
  for(const p of (state.personeller||[])) if(p && p.birim) allUnits.add(p.birim);

  const only = onlyUnits===null ? null : new Set(onlyUnits||[]);
  const candidates=Array.from(allUnits).filter(u=>{
    if(!u) return false;
    if(only && !only.has(u)) return false;
    if(window.SchedulerV2 && SchedulerV2.isCycleUnit && SchedulerV2.isCycleUnit(u)) return false;
    if(window.SchedulerV2 && SchedulerV2.isPermanentLegacyExternalUnit && SchedulerV2.isPermanentLegacyExternalUnit(u)) return false;
    return (state.personeller||[]).some(p=>p.birim===u);
  });

  // FINAL RESTORE:
  // Kapasite kaybolduysa önce ekranda/bulutta bulunan AKTİF haftanın gerçek görevlerini,
  // sonra son 12 geçmiş haftayı referans al. Hiç görev geçmişi olmayan sıfır-kapasiteli
  // destek birimi (örn. UPLINK) eski FIX10 kuralı gereği otomasyon dışı kalır; bütün solve'u durdurmaz.
  const weeks=[hKeyNow(), ...historicalWeekKeys()].filter((v,i,a)=>v && a.indexOf(v)===i).slice(0,13);
  const repaired=[];
  const skipped=[];

  for(const unit of candidates){
    if(weeklyCapacityForUnit(unit)>0) continue;

    let found=null;
    for(const wk of weeks){
      const h=historicalCapacityForUnit(unit,wk);
      // Aktif haftadaki tek tük manuel/support görevi kapasite şablonu sayılmaz.
      // En az 5 gerçek görev yoksa aktif haftadan kapasite öğrenme; geçmiş tam haftalara bak.
      if(wk===hKeyNow() && h.total>0 && h.total<5) continue;
      if(h.total>0){ found={week:wk,...h}; break; }
    }

    if(!found){
      skipped.push(unit);
      continue;
    }

    for(const shift of (state.saatler||[])){
      state.kapasite[`${unit}_${shift}`]=found.result[shift].slice();
    }
    repaired.push({unit,week:found.week,total:found.total});
  }

  if(repaired.length && typeof save==='function') save();
  return {repaired,skipped,unresolved:[]};
}

function formatCapacityRepair(r){
  if(!r) return '';
  const a=(r.repaired||[]).map(x=>`${x.unit} ← ${x.week} (${x.total} görev)`);
  const b=(r.skipped||[]).map(x=>`${x}: geçmiş görev yok, FIX10 kuralıyla mevcut hali korunacak`);
  return [...a,...b].join('\n');
}

function smartAutoPreflight(options={}){
  const week=hKeyNow();
  const intentionalExcel = hasSessionExcelImport(week);
  let released=[];

  // Kullanıcı BU OTURUMDA Excel yüklemediyse buluttan/eski testlerden taşınmış hafta kilidi
  // OTO'nun yalnız MCR/INGEST üretmesine neden olmamalı. Yalnız yerel state'te temizlenir;
  // localhost'ta production'a yazma zaten kapalıdır. Bu oturumda gerçekten Excel yüklenmişse korunur.
  if(!intentionalExcel && options.keepExcel!==true){
    released=clearCurrentWeekExcelProtection();
  }

  const repair=repairMissingCapacitiesFromHistory(released);
  const managed=(window.SchedulerV2 && SchedulerV2.autoManagedUnits)
    ? SchedulerV2.autoManagedUnits((state.birimler||[]).slice())
    : [];

  return {week,intentionalExcel,released,repair,managed};
}

function reportSmartPreflight(pre){
  if(!pre) return;
  if(pre.released.length && typeof showToast==='function'){
    showToast(`🧹 ${pre.released.length} eski Excel hafta kilidi temizlendi; tüm otomasyona açık birimler çözülecek.`, 'success');
  }
  if(pre.repair.repaired.length && typeof showToast==='function'){
    showToast(`🧰 ${pre.repair.repaired.length} birimin kayıp kapasitesi gerçek listelerden geri kazanıldı.`, 'success');
  }
  if(pre.repair.skipped.length && typeof showToast==='function'){
    showToast(`ℹ️ Kapasitesi/görev geçmişi olmayan destek birimleri mevcut haliyle korunuyor: ${pre.repair.skipped.join(', ')}`, 'info');
  }
  if(typeof showToast==='function'){
    showToast(`⚙️ OTO kapsamı: ${pre.managed.length} birim — ${pre.managed.join(', ')}`, 'info');
  }
}

function ensureAutoBusyModal(){
  let modal=document.getElementById('v63AutoBusyModal');
  if(modal) return modal;
  modal=document.createElement('div');
  modal.id='v63AutoBusyModal';
  modal.style.cssText='position:fixed;inset:0;z-index:30060;background:rgba(2,6,23,.76);display:none;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML=`<div style="width:min(520px,92vw);background:var(--card-bg,#fff);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:14px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.38);text-align:center">
    <div style="font-size:26px;margin-bottom:8px">⚙️</div>
    <div id="v63AutoBusyTitle" style="font-size:15px;font-weight:900;margin-bottom:8px">Vardiya hesaplanıyor…</div>
    <div id="v63AutoBusyText" style="font-size:11px;line-height:1.55;opacity:.82">Kurallar ve kapasite kontrol ediliyor. Bu işlem yoğun haftalarda 30–90 saniye sürebilir.<br><b>İkinci kez basmayın ve sayfayı kapatmayın.</b></div>
  </div>`;
  document.body.appendChild(modal);
  return modal;
}

function showAutoBusy(title,text){
  const modal=ensureAutoBusyModal();
  const t=modal.querySelector('#v63AutoBusyTitle');
  const b=modal.querySelector('#v63AutoBusyText');
  if(t) t.textContent=title||'Vardiya hesaplanıyor…';
  if(b && text) b.innerHTML=text;
  modal.style.display='flex';
}

function hideAutoBusy(){
  const modal=document.getElementById('v63AutoBusyModal');
  if(modal) modal.style.display='none';
}

function queueAutoRun(label, runner){
  if(global.__V63_AUTO_RUNNING){
    if(typeof showToast==='function') showToast('⏳ Vardiya hesabı zaten devam ediyor. İkinci kez basmayın.', 'warning');
    return false;
  }
  global.__V63_AUTO_RUNNING=true;
  showAutoBusy(`⚙️ ${label} HESAPLANIYOR`, 'Kurallar, yıllık izinler, uzmanlık, dinlenme ve kapasite birlikte çözülüyor.<br>Yoğun haftalarda <b>30–90 saniye</b> sürebilir.<br><b>İkinci kez basmayın ve sayfayı kapatmayın.</b>');

  // Ağır scheduler aynı click call-stack'inde başlarsa tarayıcı modalı boyayamaz.
  // Bir tick erteleyerek kullanıcıya anında "hesaplanıyor" geri bildirimi veriyoruz.
  setTimeout(()=>{
    try {
      runner();
    } catch(err) {
      console.error(`${label} beklenmeyen hata:`,err);
      if(typeof showToast==='function') showToast(`❌ ${label} beklenmeyen hata verdi.`, 'error');
      alert(`${label} BEKLENMEYEN HATA\n\n${err && err.message ? err.message : err}`);
    } finally {
      global.__V63_AUTO_RUNNING=false;
      hideAutoBusy();
    }
  },80);
  return true;
}

function fullAutoGenerate(){
  if(!isAdmin) {
    if(typeof showToast==='function') showToast('TAM OTO yalnız yönetici oturumunda çalışır.', 'warning');
    return false;
  }

  const week=hKeyNow();
  const protectedUnits=currentExcelProtectedUnits();
  const msg =
    `${protectedUnits.length ? `Bu haftada Excel koruması olan ${protectedUnits.length} birim var:\n${protectedUnits.join(', ')}\n\n` : ''}`+
    `TAM OTO, aktif haftanın Excel korumasını kaldırıp kapasitesi tanımlı tüm normal birimleri yeniden üretecek.\n`+
    `Kapasitesi hiç tanımlanmamış ve geçmişte de görev görmemiş destek birimleri FIX10 kuralıyla mevcut haliyle kalacak.\n`+
    `MCR/INGEST sabit döngüsü, yıllık izin HARD LOCK, uzmanlık, dinlenme, haftalık sabah rotasyonu ve kapasite kuralları korunacak.\n\nDevam edilsin mi?`;

  if(!confirm(msg)) return false;

  return queueAutoRun('TAM OTO',()=>{
    const before=clone(state);
    takeSnapshot('tam-oto-öncesi');

    try {
      const released=clearCurrentWeekExcelProtection();
      try { sessionStorage.removeItem(`v63_excel_imported_week_${week}`); } catch(e) {}

      const stillProtected=currentExcelProtectedUnits();
      if(stillProtected.length) throw new Error(`Excel koruması temizlenemedi: ${stillProtected.join(', ')}`);

      const repair=repairMissingCapacitiesFromHistory(null);
      const managed=(window.SchedulerV2 && SchedulerV2.autoManagedUnits)
        ? SchedulerV2.autoManagedUnits((state.birimler||[]).slice())
        : [];

      if(released.length && typeof showToast==='function') showToast(`🧹 ${released.length} birimin bu haftaki Excel koruması kaldırıldı.`, 'success');
      if(repair.repaired.length && typeof showToast==='function') showToast(`🧰 ${repair.repaired.length} birimin kayıp kapasitesi geri kazanıldı.`, 'success');
      if(typeof showToast==='function') showToast(`⚙️ TAM OTO kapsamı: ${managed.length} birim — ${managed.join(', ')}`, 'info');

      const action=global.vardiyaUretVeKaydet;
      const core=(typeof action==='function' && typeof action.__v63core==='function') ? action.__v63core : action;
      if(typeof core!=='function') throw new Error('Vardiya üretim motoru bulunamadı.');

      const ok=core.call(global);
      if(ok!==true) throw new Error('Vardiya motoru TAM OTO üretimini tamamlayamadı.');
      setTimeout(renderControl,600);
    } catch(err) {
      state=clone(before);
      if(typeof verileriGuvenliHaleGetir==='function') verileriGuvenliHaleGetir();
      if(typeof save==='function') save();
      if(typeof tabloyuOlustur==='function') tabloyuOlustur();
      if(isAdmin && typeof refreshUI==='function') refreshUI();
      if(typeof showToast==='function') showToast('❌ TAM OTO uygulanamadı; başlangıç listesi geri yüklendi.', 'error');
      alert(`TAM OTO DURDURULDU.\n\n${err && err.message ? err.message : err}\n\nListe ve kurallar başlangıç haline geri alındı.`);
      setTimeout(renderControl,300);
    }
  });
}

function addFullAutoButton(){
  const oto = Array.from(document.querySelectorAll('button')).find(b => (b.innerText||'').includes('OTO VARDİYA'));
  if(!oto || document.getElementById('v63FullAutoBtn')) return;
  const b=document.createElement('button');
  b.id='v63FullAutoBtn';
  b.onclick=fullAutoGenerate;
  b.style.cssText='background:#7c3aed;color:white;';
  b.innerHTML='🧹✨<br>TAM OTO';
  b.title='Bu haftaki Excel korumasını kaldırıp kapasitesi tanımlı tüm normal birimleri yeniden üretir.';
  oto.insertAdjacentElement('afterend', b);
}

function addAdminTab(){
  const tabs=document.querySelector('.admin-tabs');
  const panel=document.querySelector('.panel-content');
  if(!tabs||!panel||document.getElementById('btn-tab-kontrol')) return;
  const btn=document.createElement('button');
  btn.id='btn-tab-kontrol'; btn.className='tab-btn'; btn.setAttribute('onclick',"tabDegistir('kontrol')"); btn.innerHTML='<i>🛡️</i>Kontrol';
  tabs.appendChild(btn);
  const content=document.createElement('div');
  content.id='tab-kontrol'; content.className='tab-content hidden';
  content.innerHTML=`<div id="v63ControlRoot"><div class="v63-small">Kontrol merkezi hazırlanıyor...</div></div>`;
  panel.appendChild(content);
}

function weekAssignmentsOnly(srcState=state){
  const h=hKeyNow(); const out={};
  Object.keys(srcState.manuelAtamalar||{}).filter(k=>k.startsWith(h+'_')).sort().forEach(k=>out[k]=srcState.manuelAtamalar[k]);
  return out;
}
function stableStringify(obj){
  if(obj===null||typeof obj!=='object') return JSON.stringify(obj);
  if(Array.isArray(obj)) return '['+obj.map(stableStringify).join(',')+']';
  return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+stableStringify(obj[k])).join(',')+'}';
}
function simpleHash(str){ let h=2166136261>>>0; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)} return ('00000000'+(h>>>0).toString(16)).slice(-8).toUpperCase(); }

async function getDraftStatus(){
  if(!FEATURES.draftPublishStatus) return {status:'OFF'};
  try{
    const snap=await database.ref('vardiya_data').once('value');
    const cloud=snap.exists()?snap.val():{};
    const localWeek=weekAssignmentsOnly(state), cloudWeek=weekAssignmentsOnly(cloud);
    const lh=simpleHash(stableStringify(localWeek)), ch=simpleHash(stableStringify(cloudWeek));
    const localKeys=Object.keys(localWeek), cloudKeys=Object.keys(cloudWeek);
    const all=new Set([...localKeys,...cloudKeys]); let diff=0;
    all.forEach(k=>{if((localWeek[k]??null)!==(cloudWeek[k]??null)) diff++;});
    return {status:lh===ch?'PUBLISHED':'DRAFT',diff,localHash:lh,cloudHash:ch};
  }catch(e){return {status:'ERROR',error:e.message};}
}

// Firebase RTDB sağlık durumu gerçek bağlantı üzerinden izlenir.
// Not: app.js içindeki `database` top-level const olduğu için window.database değildir.
// Eski kontrol `global.database` aradığı için bağlantı çalışırken bile yanlış kırmızı gösteriyordu.
const rtdbHealthState={connected:null,readOk:null,error:'',checkedAt:null,monitorInstalled:false,readProbeRunning:false};

function rtdbErrorText(err){
  if(!err) return 'RTDB bağlantısı yok';
  const msg=String(err.message||err||'').trim();
  return msg || 'RTDB bağlantısı yok';
}

function updateFirebaseHealthDom(){
  const row=document.getElementById('v63FirebaseHealth');
  const detail=document.getElementById('v63FirebaseHealthDetail');
  if(!row) return;
  const ok=rtdbHealthState.connected===true && rtdbHealthState.readOk===true;
  row.style.color=ok?'#16a34a':'#dc2626';
  row.style.fontWeight='800';
  row.textContent=`${ok?'✅':'❌'} Firebase RTDB`;
  if(detail){
    if(ok){
      detail.textContent='Bağlı · okuma başarılı';
      detail.style.color='#16a34a';
    }else{
      const reason=rtdbHealthState.error || (rtdbHealthState.connected===false?'Canlı RTDB bağlantısı kesik':rtdbHealthState.readOk===false?'RTDB okuması başarısız':'Bağlantı kontrol ediliyor');
      detail.textContent='↳ '+reason;
      detail.style.color='#dc2626';
    }
  }
}

function withRtdbTimeout(promise,ms,label){
  let timer=null;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label||'RTDB zaman aşımı')),ms);});
  return Promise.race([promise,timeout]).finally(()=>{if(timer) clearTimeout(timer);});
}

async function verifyFirebaseRead(){
  if(rtdbHealthState.readProbeRunning) return rtdbHealthState.readOk===true;
  rtdbHealthState.readProbeRunning=true;
  try{
    if(typeof database==='undefined' || !database || typeof database.ref!=='function') throw new Error('Firebase database nesnesi bulunamadı');
    await withRtdbTimeout(database.ref('vardiya_data').limitToFirst(1).once('value'),6000,'RTDB okuma zaman aşımı');
    rtdbHealthState.readOk=true;
    if(rtdbHealthState.connected===true) rtdbHealthState.error='';
    rtdbHealthState.checkedAt=Date.now();
    return true;
  }catch(e){
    rtdbHealthState.readOk=false;
    rtdbHealthState.error=rtdbErrorText(e);
    rtdbHealthState.checkedAt=Date.now();
    return false;
  }finally{
    rtdbHealthState.readProbeRunning=false;
    updateFirebaseHealthDom();
  }
}

function installFirebaseHealthMonitor(){
  if(rtdbHealthState.monitorInstalled) return;
  rtdbHealthState.monitorInstalled=true;
  try{
    if(typeof database==='undefined' || !database || typeof database.ref!=='function') throw new Error('Firebase database nesnesi bulunamadı');
    database.ref('.info/connected').on('value',snap=>{
      const connected=snap.val()===true;
      rtdbHealthState.connected=connected;
      rtdbHealthState.checkedAt=Date.now();
      if(!connected){
        rtdbHealthState.readOk=false;
        rtdbHealthState.error='Canlı RTDB bağlantısı kesik';
        updateFirebaseHealthDom();
      }else{
        rtdbHealthState.error='';
        updateFirebaseHealthDom();
        verifyFirebaseRead();
      }
    },err=>{
      rtdbHealthState.connected=false;
      rtdbHealthState.readOk=false;
      rtdbHealthState.error=rtdbErrorText(err);
      rtdbHealthState.checkedAt=Date.now();
      updateFirebaseHealthDom();
    });
  }catch(e){
    rtdbHealthState.connected=false;
    rtdbHealthState.readOk=false;
    rtdbHealthState.error=rtdbErrorText(e);
    rtdbHealthState.checkedAt=Date.now();
    updateFirebaseHealthDom();
  }
}

async function probeFirebaseHealth(){
  installFirebaseHealthMonitor();
  try{
    if(typeof database==='undefined' || !database || typeof database.ref!=='function') throw new Error('Firebase database nesnesi bulunamadı');
    const snap=await withRtdbTimeout(database.ref('.info/connected').once('value'),4000,'RTDB bağlantı kontrolü zaman aşımı');
    rtdbHealthState.connected=snap.val()===true;
    if(!rtdbHealthState.connected){
      rtdbHealthState.readOk=false;
      rtdbHealthState.error='Canlı RTDB bağlantısı kesik';
    }else{
      await verifyFirebaseRead();
    }
  }catch(e){
    rtdbHealthState.connected=false;
    rtdbHealthState.readOk=false;
    rtdbHealthState.error=rtdbErrorText(e);
  }
  rtdbHealthState.checkedAt=Date.now();
  updateFirebaseHealthDom();
  return {
    ok:rtdbHealthState.connected===true && rtdbHealthState.readOk===true,
    connected:rtdbHealthState.connected===true,
    readOk:rtdbHealthState.readOk===true,
    error:rtdbHealthState.error||''
  };
}

function getHealth(rtdb){
  const approved=(hariciIzinler||[]).map(x=>typeof normalizeExternalLeaveRecord==='function'?normalizeExternalLeaveRecord(x):x).filter(x=>x && (x.__approved || (typeof izinDurumOnayli==='function' && izinDurumOnayli(x.durum))));
  return {
    scheduler: !!global.SchedulerV2,
    schedulerVersion: global.SchedulerV2?.version || '-',
    xlsx: !!global.XLSX,
    firebase: !!(rtdb && rtdb.ok),
    firebaseDetail:(rtdb && rtdb.error)||'',
    annualRecords:(hariciIzinler||[]).length,
    annualApproved:approved.length,
    admin:!!isAdmin,
    currentWeek:hKeyNow()
  };
}

function warningScan(){
  const warnings=[]; const h=hKeyNow(); const inactive=inactiveShifts();
  const persons=state.personeller||[]; const shifts=state.saatler||[]; const units=state.birimler||[];
  const assignment=(p,d)=>state.manuelAtamalar?.[`${h}_${p.ad}_${d}`] ?? null;
  const unitFor=(p,d)=>typeof getGecerliBirim==='function'?getGecerliBirim(p,d):p.birim;
  // Annual leave conflicts and qualification
  persons.forEach(p=>{
    let work=0;
    for(let d=0;d<7;d++){
      const v=assignment(p,d); if(v && !inactive.has(v)) work++;
      const date=new Date(currentMonday); date.setDate(date.getDate()+d); const ds=typeof getDateKey==='function'?getDateKey(date):'';
      const annual=global.SchedulerV2?.isPersonOnAnnualLeave?.(p.ad,ds) || (typeof isPersonOnAnnualLeave==='function' && isPersonOnAnnualLeave(p.ad,ds));
      if(annual && v && v!==SHIFTS.YILLIK) warnings.push({sev:'high',title:'Yıllık izin çakışması',detail:`${p.ad} · ${GUNLER[d]} · ${v}`});
      const unit=unitFor(p,d);
      if(v && !inactive.has(v) && global.SchedulerV2?.isQualifiedForUnit && !global.SchedulerV2.isQualifiedForUnit(p,unit)) warnings.push({sev:'high',title:'Uzmanlık dışı atama',detail:`${p.ad} → ${unit} · ${GUNLER[d]}`});
      if(d>0){ const prev=assignment(p,d-1); if([SHIFTS.AKSAM,SHIFTS.GECE].includes(prev) && [SHIFTS.SABAH,SHIFTS.GUNDUZ,SHIFTS.OGLEN].includes(v)) warnings.push({sev:'high',title:'Dinlenme ihlali',detail:`${p.ad}: ${GUNLER[d-1]} ${prev} → ${GUNLER[d]} ${v}`}); }
    }
    const managed=global.SchedulerV2?.autoManagedUnits?.([p.birim])?.length>0;
    if(managed && work>0 && work<5) warnings.push({sev:'med',title:'Düşük çalışma günü',detail:`${p.ad}: ${work} gün`});
    if(managed && work>6) warnings.push({sev:'med',title:'Yüksek çalışma günü',detail:`${p.ad}: ${work} gün`});
  });
  // Capacity floor
  units.forEach(unit=>shifts.forEach(shift=>{
    const cap=state.kapasite?.[`${unit}_${shift}`]; if(!Array.isArray(cap)) return;
    for(let d=0;d<7;d++){
      const target=Number(cap[d]||0); if(target<=0) continue;
      let count=0; persons.forEach(p=>{if(unitFor(p,d)===unit && assignment(p,d)===shift) count++;});
      if(count<target) warnings.push({sev:'med',title:'Kapasite eksik',detail:`${unit} · ${GUNLER[d]} · ${shift}: ${count}/${target}`});
    }
  }));
  return warnings;
}

function snapshotKey(){return 'v63_local_snapshots';}
function getSnapshots(){try{return JSON.parse(localStorage.getItem(snapshotKey())||'[]')}catch(e){return[]}}
function isSnapshotQuotaError(err){
  const name=String(err && err.name || '');
  const msg=String(err && err.message || '').toLocaleLowerCase('tr-TR');
  return name==='QuotaExceededError' || name==='NS_ERROR_DOM_QUOTA_REACHED' || Number(err && err.code)===22 || msg.includes('quota') || msg.includes('exceeded');
}
function saveSnapshots(arr){
  const list=Array.isArray(arr)?arr:[];
  let lastErr=null;

  // FIX6: full state snapshots are intentionally limited. Older builds kept up to 12
  // complete state copies in localStorage and could exhaust the browser's ~5 MB quota,
  // preventing OTO/TAM OTO before the scheduler was even called.
  for(const keep of [3,2,1]){
    try{
      const out=list.slice(0,keep);
      localStorage.setItem(snapshotKey(),JSON.stringify(out));
      return {ok:true,count:out.length,pruned:list.length>out.length};
    }catch(err){
      lastErr=err;
      if(!isSnapshotQuotaError(err)) throw err;
    }
  }

  // If even one full snapshot cannot fit, clear only the optional V63 snapshot key.
  // Production schedule state is stored under the normal PREFIX keys / Firebase and is
  // never deleted here. Snapshot failure must never block scheduling or cloud publish.
  try{ localStorage.removeItem(snapshotKey()); }catch(_){ }
  return {ok:false,count:0,pruned:true,error:lastErr};
}
function takeSnapshot(reason='manuel'){
  try{
    const arr=getSnapshots();
    arr.unshift({at:nowIso(),week:hKeyNow(),reason,state:clone(state)});
    const r=saveSnapshots(arr);
    if(r.ok){
      showToast?.(r.pruned ? `📦 Yerel geri dönüş noktası alındı; eski snapshotlar kota için budandı (${r.count}).` : '📦 Yerel geri dönüş noktası alındı.','success');
    }else{
      console.warn('[V63] Yerel snapshot alınamadı; localStorage kotası dolu. Ana işlem snapshot olmadan devam ediyor.',r.error||'');
      showToast?.('⚠️ Yerel snapshot kotası dolu. Eski V63 snapshotları temizlendi; ana işlem devam ediyor.','warning');
    }
    renderControl();
    return r.ok;
  }catch(err){
    // Snapshot yardımcı özelliği hiçbir koşulda OTO/TAM OTO/BULUTA KAYDET'i durduramaz.
    console.warn('[V63] Snapshot yardımcı özelliği atlandı; ana işlem devam ediyor.',err);
    try{ if(isSnapshotQuotaError(err)) localStorage.removeItem(snapshotKey()); }catch(_){ }
    showToast?.('⚠️ Yerel snapshot alınamadı; ana işlem güvenli şekilde devam ediyor.','warning');
    try{ renderControl(); }catch(_){ }
    return false;
  }
}
function restoreLatestSnapshot(){
  const arr=getSnapshots(); if(!arr.length){showToast?.('Geri dönüş noktası yok.','warning');return;}
  if(!confirm(`Son yerel yedeğe dönülsün mü?\n${new Date(arr[0].at).toLocaleString('tr-TR')} · ${arr[0].reason}`)) return;
  state=clone(arr[0].state); if(typeof verileriGuvenliHaleGetir==='function') verileriGuvenliHaleGetir(); if(typeof save==='function') save(); if(typeof tumArayuzuCiz==='function') tumArayuzuCiz(); showToast?.('↩️ Yerel yedek geri yüklendi. Buluta kaydetmeden production değişmez.','info');
}
function downloadSnapshots(){ const blob=new Blob([JSON.stringify(getSnapshots(),null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Vardiya_Local_Snapshots_${hKeyNow()}.json`;a.click();URL.revokeObjectURL(a.href); }

function buildReportRows(){
  const h=hKeyNow(), inactive=inactiveShifts(), rows=[];
  (state.personeller||[]).forEach(p=>{
    let total=0,night=0,weekend=0,annual=0,off=0; const by={};
    for(let d=0;d<7;d++){ const v=state.manuelAtamalar?.[`${h}_${p.ad}_${d}`]??''; if(v===SHIFTS.YILLIK) annual++; else if(v===SHIFTS.IZIN||v===SHIFTS.BOS||!v) off++; else if(!inactive.has(v)){total++; if(v===SHIFTS.GECE)night++; if(d>=5)weekend++; by[v]=(by[v]||0)+1;} }
    rows.push({Personel:p.ad,'Ana Birim':p.birim,'Çalışma Günü':total,'Gece':night,'Hafta Sonu':weekend,'Yıllık İzin':annual,'İzin/Boş':off,...by});
  }); return rows;
}
function downloadWeeklyReport(){
  if(!global.XLSX){showToast?.('XLSX kütüphanesi yüklenmedi.','error');return;}
  const ws=XLSX.utils.json_to_sheet(buildReportRows()); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Hafta Raporu');
  const warnings=warningScan().map(x=>({Seviye:x.sev,Başlık:x.title,Detay:x.detail})); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(warnings),'Uyarılar');
  XLSX.writeFile(wb,`Vardiya_Hafta_Raporu_${hKeyNow()}.xlsx`);
}

function enhanceAudit(){
  if(!FEATURES.auditTools) return;
  const tab=document.getElementById('tab-loglar'); if(!tab||document.getElementById('v63AuditToolbar')) return;
  const bar=document.createElement('div');bar.id='v63AuditToolbar';bar.className='v63-toolbar';bar.innerHTML=`<input id="v63AuditSearch" placeholder="Log ara..." style="flex:1;min-width:140px;padding:8px;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text)"><button class="v63-btn alt" onclick="V63Addons.filterAudit()">ARA</button><button class="v63-btn" onclick="V63Addons.exportAudit()">CSV İNDİR</button>`;
  tab.insertBefore(bar,tab.children[1]||null);
}
function filterAudit(){
  const q=(document.getElementById('v63AuditSearch')?.value||'').toLocaleLowerCase('tr-TR');
  const root=document.getElementById('logListesi'); if(!root) return;
  Array.from(root.children).forEach(el=>{el.style.display=(el.innerText||'').toLocaleLowerCase('tr-TR').includes(q)?'':'none';});
}
function exportAudit(){
  const rows=(state.logs||[]).map(x=>[x.zaman||'',x.user||'',x.mesaj||'']); const csv='Zaman;Kullanıcı;İşlem\n'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Vardiya_Audit_${hKeyNow()}.csv`;a.click();URL.revokeObjectURL(a.href);
}

let requestCache={}; let requestFilter='all';
function requestIsCompletedStatus(raw){
  const s=normStatus(raw);
  return s==='onaylandı'||s==='reddedildi'||s==='hata';
}
async function deleteRequest(id){
  if(!isAdmin){ showToast?.('Bu işlem yalnız yönetici tarafından yapılabilir.','error'); return; }
  const key=String(id||'').trim(); if(!key) return;
  const t=requestCache[key]||{};
  if(!confirm(`${t.ad||'Bu personel'} talebi kalıcı olarak silinsin mi?\n${t.tarih||''} · ${t.tur||''}`)) return;
  try{
    await database.ref('talepler/'+key).remove();
    showToast?.('🗑️ Talep geçmişten silindi.','success');
    logKoy?.(`${t.ad||'-'} talebi silindi: ${t.tarih||'-'} ${t.tur||'-'}`);
  }catch(err){ showToast?.('Talep silinemedi: '+String(err?.message||err),'error'); }
}
async function deleteCompletedRequests(){
  if(!isAdmin){ showToast?.('Bu işlem yalnız yönetici tarafından yapılabilir.','error'); return; }
  const done=Object.entries(requestCache).filter(([,t])=>requestIsCompletedStatus(t&&t.durum));
  if(!done.length){ showToast?.('Silinecek tamamlanmış talep yok.','info'); return; }
  if(!confirm(`${done.length} adet ONAYLANDI / REDDEDİLDİ / UYGULANAMADI talep kalıcı olarak silinsin mi?\nBEKLEYEN ve İŞLENİYOR talepler korunacaktır.`)) return;
  const patch={}; done.forEach(([id])=>{ patch[id]=null; });
  try{
    await database.ref('talepler').update(patch);
    showToast?.(`🧹 ${done.length} tamamlanmış talep silindi.`,'success');
    logKoy?.(`${done.length} tamamlanmış talep geçmişten temizlendi.`);
  }catch(err){ showToast?.('Talep geçmişi temizlenemedi: '+String(err?.message||err),'error'); }
}
function installRequestCenterV2(){
  if(!FEATURES.requestCenterV2) return;
  global.talepleriYukle=function(){
    database.ref('talepler').on('value',snap=>{
      requestCache={}; if(snap.exists()) snap.forEach(ch=>{requestCache[ch.key]=ch.val()||{}}); renderRequests();
    });
  };
}
function normStatus(s){ const x=String(s||'bekliyor').toLocaleLowerCase('tr-TR'); if(x==='onaylandi')return'onaylandı'; if(x==='isleniyor')return'işleniyor'; if(x==='reddedildi')return'reddedildi'; if(x==='hata')return'hata'; return x; }
function renderRequests(){
  const root=document.getElementById('gelenTaleplerListesi'); if(!root) return;
  const items=Object.entries(requestCache).map(([id,t])=>({id,...t,_status:normStatus(t.durum)})).sort((a,b)=>String(b.id).localeCompare(String(a.id)));
  const cats=['bekliyor','işleniyor','onaylandı','reddedildi','hata']; const counts=Object.fromEntries(cats.map(x=>[x,items.filter(t=>t._status===x).length]));
  const filtered=requestFilter==='all'?items:items.filter(t=>t._status===requestFilter);
  const completedCount=items.filter(t=>requestIsCompletedStatus(t.durum)).length;
  const badge=(s)=>s==='bekliyor'?'v63-warn':s==='işleniyor'?'v63-info':s==='onaylandı'?'v63-ok':s==='reddedildi'?'v63-bad':'v63-bad';
  root.innerHTML=`<div class="v63-counter-row">${cats.map(c=>`<div class="v63-counter"><b>${counts[c]}</b>${c.toLocaleUpperCase('tr-TR')}</div>`).join('')}</div><div class="v63-toolbar"><select id="v63RequestFilter" onchange="V63Addons.setRequestFilter(this.value)" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text)"><option value="all">Tümü</option>${cats.map(c=>`<option value="${c}" ${requestFilter===c?'selected':''}>${c}</option>`).join('')}</select>${completedCount?`<button class="v63-btn danger" onclick="V63Addons.deleteCompletedRequests()">🧹 TAMAMLANANLARI SİL (${completedCount})</button>`:''}</div><div class="v63-list">${filtered.length?filtered.map(t=>`<div class="v63-item"><div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(t.ad||'-')}</strong><span class="v63-status ${badge(t._status)}">${esc(t._status.toLocaleUpperCase('tr-TR'))}</span></div><div class="v63-small">📅 ${esc(t.tarih||'-')} · 📝 ${esc(t.tur||'-')}<br>Kaynak: ${esc(t.processedBy||t.source||'web')} ${t.processedAt?`· ${esc(t.processedAt)}`:''}</div>${t._status==='bekliyor'?`<div class="v63-toolbar" style="margin-top:7px;margin-bottom:0"><button class="v63-btn" onclick="talepIslem('${esc(t.id)}','onay')">ONAYLA</button><button class="v63-btn danger" onclick="talepIslem('${esc(t.id)}','red')">REDDET</button></div>`:requestIsCompletedStatus(t.durum)?`<div class="v63-toolbar" style="margin-top:7px;margin-bottom:0"><button class="v63-btn alt" onclick="V63Addons.deleteRequest('${esc(t.id)}')">🗑️ SİL</button></div>`:''}</div>`).join(''):'<div class="v63-small" style="padding:16px;text-align:center">Bu filtrede talep yok.</div>'}</div>`;
}
function setRequestFilter(v){requestFilter=v;renderRequests();}

// ------------------------------------------------------------
// PERSONEL "TALEPLERIM" - REALTIME DURUM TAKIBI
// Yalniz talepler/ okunur ve ekranda filtrelenir. Vardiya state'ine yazmaz.
// Telegram/GitHub veya yonetici durum alanini degistirdiginde aninda guncellenir.
// ------------------------------------------------------------
let myRequestsRef=null;
let myRequestsCb=null;
let myRequestsName='';
let myRequestsCache=[];
let myRequestsShowAll=false;

function myReqNormStatus(raw){
  const s=String(raw||'bekliyor').toLocaleLowerCase('tr-TR');
  if(s==='onaylandi'||s==='onaylandı') return 'onaylandi';
  if(s==='reddedildi'||s==='red') return 'reddedildi';
  if(s==='isleniyor'||s==='işleniyor') return 'isleniyor';
  if(s==='hata') return 'hata';
  return 'bekliyor';
}
function myReqStatusMeta(raw){
  const s=myReqNormStatus(raw);
  if(s==='onaylandi') return {label:'ONAYLANDI', icon:'✅', cls:'v63-ok'};
  if(s==='reddedildi') return {label:'REDDEDİLDİ', icon:'❌', cls:'v63-bad'};
  if(s==='isleniyor') return {label:'ONAYLANDI · UYGULANIYOR', icon:'⏳', cls:'v63-info'};
  if(s==='hata') return {label:'UYGULANAMADI', icon:'⚠️', cls:'v63-bad'};
  return {label:'BEKLİYOR', icon:'🟡', cls:'v63-warn'};
}
function myReqTime(t,id){
  let v=t && (t.processedAt||t.telegramNotifiedAt||t.createdAt||t.olusturmaZamani);
  if(!v && /^\d{11,}$/.test(String(id||''))) v=Number(id);
  if(typeof v==='object' && v && '.sv' in v) return '';
  const n=Number(v); if(Number.isFinite(n) && n>100000000000) v=n;
  const d=v ? new Date(v) : null;
  return d && !isNaN(d) ? d.toLocaleString('tr-TR') : '';
}
function populateDesktopMyRequestsPersonel(preferred){
  const sel=document.getElementById('v63DesktopMyRequestsPersonel'); if(!sel) return;
  const current=String(preferred||sel.value||myRequestsName||document.getElementById('mobilPersonelSecim')?.value||'').trim();
  const names=Array.from(new Set(((state&&state.personeller)||[]).map(p=>String(p&&p.ad||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'tr'));
  sel.innerHTML='<option value="">İsminizi Seçiniz...</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if(current && names.includes(current)) sel.value=current;
}
function ensureMyRequestsPanel(){
  if(!FEATURES.myRequests) return null;
  const host=document.getElementById('mobilPersonelPanel');
  let panel=document.getElementById('v63MyRequestsPanel');
  if(host && !panel){
    panel=document.createElement('div');
    panel.id='v63MyRequestsPanel';
    panel.className='v63-myreq';
    panel.innerHTML=`<h4>📋 Taleplerim</h4><div id="v63MyRequestsHint" class="v63-small">Yukarıdan isminizi seçtiğinizde gönderdiğiniz talepler ve sonuçları burada anlık görünür.</div><div id="v63MyRequestsList" class="v63-myreq-list" style="margin-top:8px"></div>`;
    host.appendChild(panel);
  }
  const requestArea=document.getElementById('persTalepArea');
  let desktop=document.getElementById('v63DesktopMyRequestsPanel');
  if(requestArea && !desktop){
    desktop=document.createElement('div');
    desktop.id='v63DesktopMyRequestsPanel';
    desktop.className='v63-myreq';
    desktop.style.cssText='text-align:left;margin:0 0 15px 0';
    desktop.innerHTML=`<h4>📋 Taleplerim</h4><select id="v63DesktopMyRequestsPersonel" class="v63-myreq-select" onchange="V63Addons.syncMyRequestsSelection(this.value)"><option value="">İsminizi Seçiniz...</option></select><div id="v63DesktopMyRequestsHint" class="v63-small" style="margin-top:8px">İsminizi seçtiğinizde gönderdiğiniz talepler ve sonuçları burada anlık görünür.</div><div id="v63DesktopMyRequestsList" class="v63-myreq-list" style="margin-top:8px"></div>`;
    requestArea.appendChild(desktop);
  }
  const mobileSel=document.getElementById('mobilPersonelSecim');
  if(mobileSel && !mobileSel.__v63myreqListener){
    mobileSel.addEventListener('change',()=>watchMyRequests(String(mobileSel.value||'').trim()));
    mobileSel.__v63myreqListener=true;
  }
  populateDesktopMyRequestsPersonel();
  return panel||desktop;
}
function renderMyRequests(){
  ensureMyRequestsPanel();
  populateDesktopMyRequestsPersonel(myRequestsName);
  const hints=[document.getElementById('v63MyRequestsHint'),document.getElementById('v63DesktopMyRequestsHint')].filter(Boolean);
  const roots=[document.getElementById('v63MyRequestsList'),document.getElementById('v63DesktopMyRequestsList')].filter(Boolean);
  if(!roots.length) return;
  if(!myRequestsName){
    hints.forEach(h=>h.textContent='İsminizi seçtiğinizde gönderdiğiniz talepler ve sonuçları burada anlık görünür.');
    roots.forEach(r=>r.innerHTML=''); return;
  }
  const all=(myRequestsCache||[]).slice().sort((a,b)=>Number(b.id||0)-Number(a.id||0));
  const active=all.filter(t=>['bekliyor','isleniyor'].includes(myReqNormStatus(t.durum)));
  const completed=all.filter(t=>!['bekliyor','isleniyor'].includes(myReqNormStatus(t.durum)));
  const items=myRequestsShowAll ? all : [...active,...completed.slice(0,2)];
  hints.forEach(h=>h.innerHTML=`<b>${esc(myRequestsName)}</b> · ${active.length} aktif talep · ${completed.length} geçmiş sonuç. ${myRequestsShowAll?'Tüm geçmiş gösteriliyor.':'Ekranı uzatmamak için yalnız aktif talepler ve son 2 sonuç gösteriliyor.'}`);
  let html='';
  if(!items.length){
    html='<div class="v63-small" style="padding:10px;text-align:center">Bu personel adına henüz talep bulunmuyor.</div>';
  } else {
    html=items.map(t=>{
      const m=myReqStatusMeta(t.durum), tm=myReqTime(t,t.id);
      const err=myReqNormStatus(t.durum)==='hata' && t.hata ? `<div class="v63-myreq-note">Talep uygulanamadı. Ayrıntı için yöneticinize başvurun.</div>` : '';
      return `<div class="v63-myreq-row"><div class="v63-myreq-row-top"><div><strong>📅 ${esc(t.tarih||'-')}</strong><div class="v63-myreq-note">📝 ${esc(t.tur||'-')}</div></div><span class="v63-status ${m.cls}">${m.icon} ${m.label}</span></div>${tm?`<div class="v63-myreq-note">Son işlem: ${esc(tm)}</div>`:''}${err}</div>`;
    }).join('');
    if(completed.length>2){
      html+=`<div class="v63-toolbar" style="margin:8px 0 0"><button class="v63-btn alt" onclick="V63Addons.toggleMyRequestsHistory()">${myRequestsShowAll?'▲ GEÇMİŞİ GİZLE':`▼ TÜM GEÇMİŞİ GÖSTER (${completed.length})`}</button></div>`;
    }
  }
  roots.forEach(r=>r.innerHTML=html);
}
function toggleMyRequestsHistory(){ myRequestsShowAll=!myRequestsShowAll; renderMyRequests(); }
function stopMyRequestsWatch(){
  try{ if(myRequestsRef && myRequestsCb) myRequestsRef.off('value',myRequestsCb); }catch(_){ }
  myRequestsRef=null; myRequestsCb=null;
}
function watchMyRequests(name){
  ensureMyRequestsPanel();
  const wanted=String(name||'').trim();
  if(wanted===myRequestsName && myRequestsRef) { renderMyRequests(); return; }
  stopMyRequestsWatch();
  myRequestsName=wanted; myRequestsCache=[]; myRequestsShowAll=false; renderMyRequests();
  if(!wanted || typeof database==='undefined' || !database) return;
  const ref=database.ref('talepler');
  const cb=(snap)=>{
    const arr=[];
    if(snap && snap.exists()) snap.forEach(ch=>{ const t=ch.val()||{}; if(String(t.ad||'').trim()===wanted) arr.push({id:t.id||ch.key,...t}); });
    myRequestsCache=arr; renderMyRequests();
  };
  myRequestsRef=ref; myRequestsCb=cb;
  ref.on('value',cb,()=>{ myRequestsCache=[]; renderMyRequests(); });
}
function selectedPersonalName(){
  return String(document.getElementById('mobilPersonelSecim')?.value||'').trim();
}
function syncMyRequestsSelection(name){
  const wanted=String(name||'').trim();
  const sel=document.getElementById('mobilPersonelSecim');
  if(sel && wanted && Array.from(sel.options||[]).some(o=>o.value===wanted)){
    sel.value=wanted;
    try{ localStorage.setItem(PREFIX+'mobilSecim',wanted); }catch(_){ }
  }
  populateDesktopMyRequestsPersonel(wanted);
  const dsel=document.getElementById('v63DesktopMyRequestsPersonel');
  if(dsel && wanted && Array.from(dsel.options||[]).some(o=>o.value===wanted)) dsel.value=wanted;
  watchMyRequests(wanted||selectedPersonalName());
}
function wrapPersonalProgramForRequests(){
  ensureMyRequestsPanel();
  if(typeof global.kisiselProgramiGoster==='function' && !global.kisiselProgramiGoster.__v63myreq){
    const old=global.kisiselProgramiGoster;
    const w=function(){ const r=old.apply(this,arguments); setTimeout(()=>watchMyRequests(selectedPersonalName()),0); return r; };
    w.__v63myreq=true; w.__v63core=old; global.kisiselProgramiGoster=w;
  }
  const remembered=(()=>{try{return localStorage.getItem(PREFIX+'mobilSecim')||'';}catch(_){return '';}})();
  setTimeout(()=>{ ensureMyRequestsPanel(); populateDesktopMyRequestsPersonel(remembered); if(remembered) syncMyRequestsSelection(remembered); else renderMyRequests(); },600);
  setTimeout(()=>{ ensureMyRequestsPanel(); populateDesktopMyRequestsPersonel(myRequestsName||selectedPersonalName()); },1600);
}
function wrapFullUIForMyRequests(){
  if(typeof global.tumArayuzuCiz!=='function' || global.tumArayuzuCiz.__v63myreq) return;
  const old=global.tumArayuzuCiz;
  const w=function(){
    const r=old.apply(this,arguments);
    setTimeout(()=>{ ensureMyRequestsPanel(); populateDesktopMyRequestsPersonel(myRequestsName||selectedPersonalName()); renderMyRequests(); },0);
    return r;
  };
  w.__v63myreq=true; w.__v63core=old; global.tumArayuzuCiz=w;
}
function wrapRequestActionsForMyRequests(){
  if(typeof global.talepModalAc==='function' && !global.talepModalAc.__v63myreq){
    const old=global.talepModalAc;
    const w=function(){
      const r=old.apply(this,arguments);
      setTimeout(()=>{
        const sel=document.getElementById('talepPersonel');
        const current=selectedPersonalName();
        if(sel){
          if(current && Array.from(sel.options||[]).some(o=>o.value===current)) sel.value=current;
          sel.onchange=function(){ syncMyRequestsSelection(this.value); };
        }
        const card=document.querySelector('#talepModal .login-card');
        if(card && !document.getElementById('v63TalepStatusHint')){
          const hint=document.createElement('div'); hint.id='v63TalepStatusHint'; hint.className='v63-small';
          hint.style.cssText='margin-top:10px;padding:8px;border-radius:7px;background:var(--bg);border:1px solid var(--border);text-align:left';
          hint.innerHTML='📋 Talebinizin sonucu <b>Kişisel Vardiya Programım → Taleplerim</b> alanında anlık görünür.';
          card.appendChild(hint);
        }
      },0);
      return r;
    };
    w.__v63myreq=true; w.__v63core=old; global.talepModalAc=w;
  }
  if(typeof global.talepGonder==='function' && !global.talepGonder.__v63myreq){
    const old=global.talepGonder;
    const w=function(){
      const ad=String(document.getElementById('talepPersonel')?.value||'').trim();
      const tarih=String(document.getElementById('talepTarih')?.value||'').trim();
      const r=old.apply(this,arguments);
      if(ad && tarih) setTimeout(()=>syncMyRequestsSelection(ad),250);
      return r;
    };
    w.__v63myreq=true; w.__v63core=old; global.talepGonder=w;
  }
}

async function renderControl(){
  const root=document.getElementById('v63ControlRoot'); if(!root) return;
  const rtdb=await probeFirebaseHealth();
  const health=getHealth(rtdb), warnings=warningScan(), draft=await getDraftStatus(), snaps=getSnapshots();
  const hi=warnings.filter(x=>x.sev==='high').length, med=warnings.filter(x=>x.sev==='med').length;
  root.innerHTML=`
  <div class="v63-grid">
    <div class="v63-card"><h4>🩺 SİSTEM SAĞLIĞI</h4><div class="v63-small">
      <div id="v63FirebaseHealth" style="color:${health.firebase?'#16a34a':'#dc2626'};font-weight:800">${health.firebase?'✅':'❌'} Firebase RTDB</div><div id="v63FirebaseHealthDetail" style="font-size:9px;color:${health.firebase?'#16a34a':'#dc2626'}">${health.firebase?'Bağlı · okuma başarılı':'↳ '+esc(health.firebaseDetail||'Bağlantı yok')}</div><div>${health.scheduler?'✅':'❌'} SchedulerV2 ${esc(health.schedulerVersion)}</div><div>${health.xlsx?'✅':'❌'} Excel/XLSX</div><div>🏖️ Yıllık izin: ${health.annualRecords} kayıt / ${health.annualApproved} onaylı</div><div>📅 Hafta: ${esc(health.currentWeek)}</div>
    </div></div>
    <div class="v63-card"><h4>📝 TASLAK / YAYIN DURUMU</h4><div class="v63-kpi">${draft.status==='PUBLISHED'?'✅ YAYINDA':draft.status==='DRAFT'?'🟡 TASLAK':'⚠️ '+esc(draft.status)}</div><div class="v63-small">${draft.status==='DRAFT'?`${draft.diff} atama buluttaki listeden farklı. BULUTA KAYDET demeden personel production değişmez.`:draft.status==='PUBLISHED'?'Yerel hafta ile bulut aynı.':esc(draft.error||'')}</div></div>
    <div class="v63-card"><h4>⚠️ AKILLI UYARILAR</h4><div class="v63-kpi">${warnings.length}</div><div class="v63-small">Kritik: ${hi} · Uyarı: ${med}</div></div>
    <div class="v63-card"><h4>📦 GERİ DÖNÜŞ NOKTALARI</h4><div class="v63-kpi">${snaps.length}</div><div class="v63-small">Son: ${snaps[0]?new Date(snaps[0].at).toLocaleString('tr-TR'):'yok'}</div></div>
  </div>
  <div class="v63-card" style="margin-top:10px"><h4>🧹 EXCEL KORUMASI / TAM OTO</h4><div class="v63-small">Bu hafta Excel korumalı birimler: <b>${esc(currentExcelProtectedUnits().join(', ')||'yok')}</b><br><b>OTO VARDİYA</b> artık akıllı tam-kapsam çalışır: bu oturumda gerçekten Excel yüklediyseniz o birimleri korur; buluttan/eski testlerden taşınmış stale Excel kilitlerini temizler ve diğer tüm otomasyona açık birimleri üretir. Kayıp kapasiteyi aktif/önceki gerçek listelerden geri kazanır. Görev geçmişi olmayan sıfır-kapasiteli destek birimleri FIX10 kuralıyla mevcut haliyle korunur.</div><div class="v63-toolbar" style="margin-top:8px;margin-bottom:0"><button class="v63-btn warn" onclick="V63Addons.fullAutoGenerate()">🧹✨ TAM OTO VARDİYA</button></div></div>
  <div class="v63-toolbar" style="margin-top:10px"><button class="v63-btn" onclick="V63Addons.takeSnapshot('manuel-kontrol')">📦 SNAPSHOT AL</button><button class="v63-btn alt" onclick="V63Addons.restoreLatestSnapshot()">↩️ SON SNAPSHOT</button><button class="v63-btn alt" onclick="V63Addons.downloadSnapshots()">⬇️ YEDEKLERİ İNDİR</button><button class="v63-btn" onclick="V63Addons.downloadWeeklyReport()">📊 HAFTA RAPORU</button><button class="v63-btn alt" onclick="V63Addons.renderControl()">🔄 YENİLE</button></div>
  <div class="v63-card"><h4>⚠️ UYARI DETAYI</h4><div class="v63-list">${warnings.length?warnings.slice(0,120).map(w=>`<div class="v63-item v63-sev-${w.sev}"><strong>${esc(w.title)}</strong><div class="v63-small">${esc(w.detail)}</div></div>`).join(''):'<div class="v63-status v63-ok">Kritik uyarı bulunmadı</div>'}</div></div>
  <div class="v63-card" style="margin-top:10px"><h4>🔐 ÖZELLİK DURUMU</h4><div class="v63-small">Talep Merkezi V2 ✅ · Audit araçları ✅ · Akıllı uyarılar ✅ · Sistem sağlığı ✅ · Haftalık rapor ✅ · Yerel snapshot ✅ · Taslak/Yayın göstergesi ✅<br><br><b>Rol bazlı Firebase güvenliği:</b> canlı kuralları değiştirmemek için bu pakette kapalı. Bu gerçek bir güvenlik değişikliğidir ve ayrı kabul testi gerektirir.<br><b>Otomatik rollback:</b> yanlış durumda production verisini otomatik geri çevirmemesi için kapalı; manuel snapshot geri dönüşü aktiftir.</div></div>`;
  updateDraftBadge(draft);
}

function updateDraftBadge(draft){
  let el=document.getElementById('v63DraftBadge'); if(!el){el=document.createElement('div');el.id='v63DraftBadge';el.className='v63-draft-badge';document.body.appendChild(el);}
  if(!isAdmin){el.style.display='none';return;}
  el.style.display='block'; if(draft.status==='DRAFT'){el.style.background='#f59e0b';el.style.color='#111827';el.textContent=`🟡 TASLAK · ${draft.diff} fark`;}
  else if(draft.status==='PUBLISHED'){el.style.background='#16a34a';el.style.color='white';el.textContent='✅ BULUTLA AYNI';}
  else {el.style.background='#64748b';el.style.color='white';el.textContent='⚠️ YAYIN DURUMU BİLİNMİYOR';}
}

// ------------------------------------------------------------
// YONETIM PANELI ISIM ARAMA
// Personel/uzmanlik, yillik izin, birim degisimi, gunluk swap ve sabitler.
// Yalniz gorunumu filtreler; state/veri/atama degistirmez.
// ------------------------------------------------------------
function adminSearchNorm(v){
  return String(v||'').trim().toLocaleLowerCase('tr-TR');
}
function filterAdminSelect(selectId, query){
  const sel=document.getElementById(selectId); if(!sel) return;
  const q=adminSearchNorm(query);
  Array.from(sel.options||[]).forEach((opt,idx)=>{
    const placeholder = idx===0 || !String(opt.value||'').trim();
    const hit = !q || placeholder || adminSearchNorm(opt.textContent||opt.innerText||'').includes(q) || opt.selected;
    opt.hidden=!hit;
  });
}
function filterAdminCards(rootId, selector, query){
  const root=document.getElementById(rootId); if(!root) return;
  const q=adminSearchNorm(query);
  Array.from(root.querySelectorAll(selector)).forEach(el=>{
    el.style.display=(!q || adminSearchNorm(el.textContent||el.innerText||'').includes(q)) ? '' : 'none';
  });
}
function applyAdminSearchFilters(){
  if(!FEATURES.adminNameSearch) return;
  const personQ=document.getElementById('v63PersonSearch')?.value||'';
  filterAdminCards('persListesiAdmin','[data-v63-person-card="1"]',personQ);

  const annualQ=document.getElementById('v63AnnualSearch')?.value||'';
  filterAdminSelect('yillikIzinPersonel',annualQ);

  const transferQ=document.getElementById('v63TransferSearch')?.value||'';
  ['takasPers1','takasPers2','transferPersSecim'].forEach(id=>filterAdminSelect(id,transferQ));

  const swapQ=document.getElementById('v63SwapSearch')?.value||'';
  ['swapKaynakPersonel','swapHedefPersonel'].forEach(id=>filterAdminSelect(id,swapQ));

  const fixedQ=document.getElementById('v63FixedSearch')?.value||'';
  filterAdminCards('sabitListeAdmin','[data-v63-fixed-row="1"]',fixedQ);
}
function wrapRefreshUIForSearch(){
  if(typeof global.refreshUI!=='function' || global.refreshUI.__v63searchwrapped) return;
  const old=global.refreshUI;
  const w=function(){
    const r=old.apply(this,arguments);
    setTimeout(applyAdminSearchFilters,0);
    return r;
  };
  w.__v63searchwrapped=true;
  w.__v63core=old;
  global.refreshUI=w;
}

function wrapCoreActions(){
  // FINAL RESTORE: OTO tek başına bütün sistemi çözer.
  // Bu oturumda gerçekten Excel yüklenmişse o birimler korunur; eski/stale hafta kilitleri
  // otomatik temizlenir. Kayıp kapasite, mevcut/önceki gerçek listelerden geri kazanılır.
  if(typeof global.vardiyaUretVeKaydet==='function' && !global.vardiyaUretVeKaydet.__v63wrapped){
    const old=global.vardiyaUretVeKaydet;
    const w=function(){
      const self=this;
      const args=Array.from(arguments);
      return queueAutoRun('OTO VARDİYA',()=>{
        takeSnapshot('oto-vardiya-öncesi');
        const pre=smartAutoPreflight();
        reportSmartPreflight(pre);
        old.apply(self,args);
        setTimeout(renderControl,500);
      });
    };
    w.__v63wrapped=true;
    w.__v63core=old;
    global.vardiyaUretVeKaydet=w;
  }
  if(typeof global.bulutaKaydet==='function' && !global.bulutaKaydet.__v63wrapped){
    const old=global.bulutaKaydet; const w=function(){takeSnapshot('buluta-kaydet-öncesi'); const r=old.apply(this,arguments); setTimeout(renderControl,800); return r;};w.__v63wrapped=true;global.bulutaKaydet=w;
  }
}

function patchTabChange(){
  if(typeof global.tabDegistir!=='function'||global.tabDegistir.__v63wrapped) return;
  const old=global.tabDegistir; const w=function(t){const r=old.apply(this,arguments); if(t==='kontrol') setTimeout(renderControl,20); if(t==='loglar') setTimeout(enhanceAudit,20); if(['personel','transfer','degisim','yillik','sabitle'].includes(t)) setTimeout(applyAdminSearchFilters,20); return r;};w.__v63wrapped=true;global.tabDegistir=w;
}

function init(){
  injectStyles(); addAdminTab(); addFullAutoButton(); installRequestCenterV2(); enhanceAudit(); wrapRefreshUIForSearch(); patchTabChange(); wrapCoreActions(); applyAdminSearchFilters(); installFirebaseHealthMonitor(); ensureMyRequestsPanel(); wrapFullUIForMyRequests(); wrapPersonalProgramForRequests(); wrapRequestActionsForMyRequests();
  setTimeout(()=>{ if(isAdmin) renderControl(); },1500);
  setInterval(()=>{ if(isAdmin && document.getElementById('tab-kontrol') && !document.getElementById('tab-kontrol').classList.contains('hidden')) renderControl(); },30000);
  console.log(`[V63Addons] ${VERSION} loaded. Weekly morning rotation + admin search + Taleplerim realtime UI active.`);
}

global.V63Addons={version:VERSION,features:FEATURES,renderControl,probeFirebaseHealth,installFirebaseHealthMonitor,warningScan,takeSnapshot,restoreLatestSnapshot,downloadSnapshots,downloadWeeklyReport,filterAudit,exportAudit,setRequestFilter,renderRequests,deleteRequest,deleteCompletedRequests,renderMyRequests,toggleMyRequestsHistory,watchMyRequests,syncMyRequestsSelection,ensureMyRequestsPanel,populateDesktopMyRequestsPersonel,currentExcelProtectedUnits,clearCurrentWeekExcelProtection,hasSessionExcelImport,smartAutoPreflight,fullAutoGenerate,weeklyCapacityForUnit,repairMissingCapacitiesFromHistory,historicalWeekKeys,historicalCapacityForUnit,applyAdminSearchFilters,filterAdminSelect,filterAdminCards};

// Run immediately so talepleriYukle is replaced before window.onload invokes it.
init();
})(window);
