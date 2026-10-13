/*
 * TURKMEDYA V62 - PERSONEL SECURE MOBILE FIX2.2
 * STANDARD ADDRESS VERIFICATION + FIREBASE EMAIL/PASSWORD + SELF 8 DIGIT PIN
 * -------------------------------------------------------------------------
 * Email-link sign-in KULLANMAZ. Spark planda 5/gun email-link kotasina girmez.
 * Ilk aktivasyon: address verification email. Normal giris: Ad + kullanicinin kendi PIN'i.
 * PIN unutma: Firebase password-reset email.
 * scheduler-v2.js / app.js / vardiya algoritmasi degismez.
 */
(function PersonnelEmailPinFix22(global) {
  'use strict';

  const VERSION = 'V62-PERSONEL-SECURE-MOBILE-FIX2.6-VERIFY-EMAIL-PIN-20261002';
  const AUTH_BASE = 'https://turkmedya-personel-auth.ugurbakirtas.workers.dev';
  const APP_SESSION_KEY = 'TURKMEDYA_PERSONNEL_AUTH_V1';
  const EMAIL_PENDING_KEY = 'TURKMEDYA_PERSONNEL_EMAIL_PENDING_V22';
  const EMAIL_APP_NAME = 'turkmedyaPersonnelEmailAuth';
  const EMAIL_PENDING_MAX_MS = 24 * 60 * 60 * 1000;

  const EMAIL_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyADNOTIXGHzSGa5CntNMegtfPzh3NLZLh4',
    authDomain: 'turkmedya-personel-auth.firebaseapp.com',
    projectId: 'turkmedya-personel-auth',
    storageBucket: 'turkmedya-personel-auth.firebasestorage.app',
    messagingSenderId: '10397517778',
    appId: '1:10397517778:web:767449a5a8f981e532aa0b'
  };

  let emailAuth = null;
  let loginPatched = false;

  function esc(value) {
    return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json; charset=utf-8');
    return fetch(`${AUTH_BASE}${path}`, { ...options, headers, cache:'no-store' }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        const e = new Error(data?.error || `HTTP ${response.status}`); e.status=response.status; throw e;
      }
      return data;
    });
  }

  function getEmailAuth() {
    if (emailAuth) return emailAuth;
    if (!global.firebase?.initializeApp) throw new Error('Firebase Auth SDK yüklenemedi.');
    let app;
    try { app = global.firebase.app(EMAIL_APP_NAME); }
    catch (_) { app = global.firebase.initializeApp(EMAIL_FIREBASE_CONFIG, EMAIL_APP_NAME); }
    emailAuth = app.auth();
    emailAuth.languageCode = 'tr';
    return emailAuth;
  }

  function pendingGet() {
    try {
      const x=JSON.parse(localStorage.getItem(EMAIL_PENDING_KEY)||'null');
      if (!x || !x.ts || Date.now()-Number(x.ts)>EMAIL_PENDING_MAX_MS) return null;
      return x;
    } catch (_) { return null; }
  }
  function pendingSet(x){ try{localStorage.setItem(EMAIL_PENDING_KEY,JSON.stringify(x));}catch(_){} }
  function pendingClear(){ try{localStorage.removeItem(EMAIL_PENDING_KEY);}catch(_){} }

  function mainAdminUser() {
    try { return global.firebase?.app?.()?.auth?.().currentUser || global.firebase?.auth?.().currentUser || null; } catch (_) { return null; }
  }

  function saveAppSession(data) {
    if (!data?.token || !data?.ad) throw new Error('Güvenli personel oturumu oluşturulamadı.');
    const session={ token:String(data.token), ad:String(data.ad), birim:String(data.birim||''), expiresAt:Date.now()+Number(data.expiresIn||0)*1000 };
    const raw=JSON.stringify(session);
    // FIX2.6: Kullanıcı açıkça ÇIKIŞ diyene kadar tarayıcı/telefon oturumu kalıcıdır.
    localStorage.setItem(APP_SESSION_KEY,raw);
    sessionStorage.removeItem(APP_SESSION_KEY);
    return session;
  }

  async function exchangeUser(user, requestedName='') {
    if (!user) throw new Error('Firebase kullanıcı oturumu bulunamadı.');
    await user.reload();
    user = getEmailAuth().currentUser || user;
    if (!user.emailVerified) throw new Error('Kurumsal e-posta henüz doğrulanmadı. E-postadaki doğrulama bağlantısına dokunun.');
    const idToken=await user.getIdToken(true);
    const data=await api('/auth/exchange',{method:'POST',body:JSON.stringify({idToken,ad:requestedName||''})});
    const saved=saveAppSession(data);
    // Güvenli Worker oturumu alındıktan sonra ayrı Firebase Auth oturumu arkada bırakılmaz.
    try { await getEmailAuth().signOut(); } catch (_) {}
    return saved;
  }

  function selectedName(){ return String(document.getElementById('psmLoginName')?.value||'').trim(); }

  function ensureStyles(){
    if(document.getElementById('psmV22Styles'))return;
    const s=document.createElement('style');s.id='psmV22Styles';s.textContent=`
      .psm-v22-links{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.psm-v22-link{padding:9px 7px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:9px;font-weight:900;cursor:pointer}.psm-v22-link:hover{border-color:var(--blue)}
      #psmV22ActivationModal,#psmV22ForgotModal,#psmV22InfoModal{position:fixed;inset:0;background:rgba(2,6,23,.9);z-index:10090;display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}.psm-v22-card{width:min(420px,100%);background:var(--card-bg);color:var(--text);border:1px solid var(--border);border-top:4px solid var(--blue);border-radius:16px;padding:20px;box-shadow:0 25px 70px rgba(0,0,0,.4)}.psm-v22-card h3{margin:0 0 6px;color:var(--primary);font-size:17px}.psm-v22-card p{font-size:10px;line-height:1.55;opacity:.82;margin:0 0 14px}.psm-v22-card select,.psm-v22-card input{width:100%;box-sizing:border-box;padding:12px;border-radius:9px;border:1px solid var(--border);background:var(--bg);color:var(--text);font:inherit;margin-bottom:10px}.psm-v22-card input[type=password]{font-size:18px;letter-spacing:3px;text-align:center;font-weight:900}.psm-v22-actions{display:flex;gap:8px}.psm-v22-actions button{flex:1;padding:11px;border-radius:9px;border:0;font-weight:900;cursor:pointer}.psm-v22-primary{background:var(--blue);color:white}.psm-v22-cancel{background:var(--bg);color:var(--text);border:1px solid var(--border)!important}.psm-v22-msg{min-height:18px;margin-top:9px;font-size:10px;line-height:1.45;font-weight:800}.psm-v22-note{font-size:9px;line-height:1.45;padding:8px;border-radius:8px;background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.18);margin:7px 0 11px}
      @media(max-width:480px){.psm-v22-links{grid-template-columns:1fr}.psm-v22-card{padding:17px}}
    `;document.head.appendChild(s);
  }

  function fillNames(targetId,preferred=''){
    const target=document.getElementById(targetId),source=document.getElementById('psmLoginName');
    if(!target||!source)return;const current=preferred||source.value||'';target.innerHTML=source.innerHTML;if(current)target.value=current;
  }

  function ensureModals(){
    if(!document.getElementById('psmV22ActivationModal')){
      const m=document.createElement('div');m.id='psmV22ActivationModal';m.innerHTML=`<div class="psm-v22-card"><h3>✉️ İlk Giriş / PIN Oluşturma</h3><p>Adınızı seçin ve kullanmak istediğiniz 8 haneli PIN'i belirleyin. Kurumsal e-posta adresinize standart doğrulama e-postası gönderilir. Bağlantıya dokunduktan sonra PIN'iniz aktif olur.</p><select id="psmV22ActivationName"><option value="">İsminizi Seçiniz...</option></select><input id="psmV22Pin1" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="8 haneli PIN"><input id="psmV22Pin2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="PIN'i tekrar yazın"><div class="psm-v22-note">PIN yalnız 8 rakam olmalı. Bu PIN'i daha sonraki normal girişlerinizde kullanacaksınız.</div><div class="psm-v22-actions"><button type="button" class="psm-v22-cancel" id="psmV22ActivationCancel">İPTAL</button><button type="button" class="psm-v22-primary" id="psmV22ActivationSend">DOĞRULAMA MAİLİ GÖNDER</button></div><div id="psmV22ActivationMsg" class="psm-v22-msg"></div></div>`;document.body.appendChild(m);
      document.getElementById('psmV22ActivationCancel').onclick=()=>m.style.display='none';document.getElementById('psmV22ActivationSend').onclick=sendVerification;
    }
    if(!document.getElementById('psmV22ForgotModal')){
      const m=document.createElement('div');m.id='psmV22ForgotModal';m.innerHTML=`<div class="psm-v22-card"><h3>🔁 PIN'imi Unuttum</h3><p>Adınızı seçin. Kurumsal e-posta adresinize Firebase PIN/şifre sıfırlama bağlantısı gönderilecektir.</p><select id="psmV22ForgotName"><option value="">İsminizi Seçiniz...</option></select><div class="psm-v22-note">Sıfırlama sayfasında yeni parola olarak <b>yalnız 8 rakamdan oluşan PIN</b> belirleyin.</div><div class="psm-v22-actions"><button type="button" class="psm-v22-cancel" id="psmV22ForgotCancel">İPTAL</button><button type="button" class="psm-v22-primary" id="psmV22ForgotSend">PIN SIFIRLAMA MAİLİ GÖNDER</button></div><div id="psmV22ForgotMsg" class="psm-v22-msg"></div></div>`;document.body.appendChild(m);
      document.getElementById('psmV22ForgotCancel').onclick=()=>m.style.display='none';document.getElementById('psmV22ForgotSend').onclick=sendReset;
    }
    if(!document.getElementById('psmV22InfoModal')){
      const m=document.createElement('div');m.id='psmV22InfoModal';m.innerHTML=`<div class="psm-v22-card"><h3 id="psmV22InfoTitle">Bilgi</h3><div id="psmV22InfoText" style="font-size:11px;line-height:1.55"></div><div class="psm-v22-actions" style="margin-top:15px"><button type="button" class="psm-v22-primary" id="psmV22InfoOk">TAMAM</button></div></div>`;document.body.appendChild(m);document.getElementById('psmV22InfoOk').onclick=()=>m.style.display='none';
    }
  }

  function showInfo(title,html){ensureModals();document.getElementById('psmV22InfoTitle').textContent=title;document.getElementById('psmV22InfoText').innerHTML=html;document.getElementById('psmV22InfoModal').style.display='flex';}

  function openActivation(){ensureModals();fillNames('psmV22ActivationName',selectedName());document.getElementById('psmV22Pin1').value='';document.getElementById('psmV22Pin2').value='';const msg=document.getElementById('psmV22ActivationMsg');msg.textContent='';msg.style.color='var(--danger)';document.getElementById('psmV22ActivationModal').style.display='flex';}
  function openForgot(){ensureModals();fillNames('psmV22ForgotName',selectedName());const msg=document.getElementById('psmV22ForgotMsg');msg.textContent='';msg.style.color='var(--danger)';document.getElementById('psmV22ForgotModal').style.display='flex';}

  function friendlyAuthError(e){
    const code=String(e?.code||'');
    if(code.includes('wrong-password')||code.includes('invalid-credential')||code.includes('invalid-login-credentials'))return 'Bu hesap için farklı bir PIN kayıtlı. PIN\'İMİ UNUTTUM seçeneğini kullanın.';
    if(code.includes('too-many-requests'))return 'Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin.';
    if(code.includes('weak-password'))return 'PIN 8 rakam olmalıdır.';
    if(code.includes('network-request-failed'))return 'İnternet bağlantısı kurulamadı.';
    return String(e?.message||e||'İşlem tamamlanamadı.');
  }

  async function sendVerification(){
    const ad=String(document.getElementById('psmV22ActivationName')?.value||'').trim(),p1=String(document.getElementById('psmV22Pin1')?.value||'').trim(),p2=String(document.getElementById('psmV22Pin2')?.value||'').trim();
    const msg=document.getElementById('psmV22ActivationMsg'),btn=document.getElementById('psmV22ActivationSend');msg.style.color='var(--danger)';
    if(!ad){msg.textContent='Önce personel adını seçin.';return;}if(!/^\d{8}$/.test(p1)){msg.textContent='PIN tam 8 rakam olmalıdır.';return;}if(p1!==p2){msg.textContent='İki PIN aynı değil.';return;}
    btn.disabled=true;btn.textContent='HAZIRLANIYOR...';msg.textContent='';
    try{
      const start=await api('/email/start',{method:'POST',body:JSON.stringify({ad})});const auth=getEmailAuth();try{await auth.signOut();}catch(_){}
      let user;
      try{const cr=await auth.createUserWithEmailAndPassword(start.email,p1);user=cr.user;}
      catch(e){
        if(String(e?.code||'').includes('email-already-in-use')){
          try{const si=await auth.signInWithEmailAndPassword(start.email,p1);user=si.user;}
          catch(se){throw new Error(friendlyAuthError(se));}
        }else throw e;
      }
      await user.reload();user=auth.currentUser||user;
      if(user.emailVerified){const session=await exchangeUser(user,ad);pendingClear();document.getElementById('psmV22ActivationModal').style.display='none';global.showToast?.(`✅ ${session.ad}: güvenli giriş açıldı.`,'success');setTimeout(()=>location.reload(),500);return;}
      const continueUrl=`${location.origin}${location.pathname}?psmVerifyFinish=1`;
      await user.sendEmailVerification({url:continueUrl,handleCodeInApp:false});
      pendingSet({ad:start.ad,email:start.email,maskedEmail:start.maskedEmail,ts:Date.now()});
      msg.style.color='var(--success)';msg.innerHTML=`✅ Doğrulama e-postası <b>${esc(start.maskedEmail||start.email)}</b> adresine gönderildi.<br>E-postadaki <b>Doğrula</b> bağlantısına dokunun. Sonra bu sayfaya dönüp kendi PIN'inizle giriş yapabilirsiniz.`;btn.textContent='MAİL GÖNDERİLDİ';
    }catch(e){msg.style.color='var(--danger)';msg.textContent=friendlyAuthError(e);btn.disabled=false;btn.textContent='DOĞRULAMA MAİLİ GÖNDER';}
  }

  async function sendReset(){
    const ad=String(document.getElementById('psmV22ForgotName')?.value||'').trim(),msg=document.getElementById('psmV22ForgotMsg'),btn=document.getElementById('psmV22ForgotSend');msg.style.color='var(--danger)';if(!ad){msg.textContent='Önce personel adını seçin.';return;}
    btn.disabled=true;btn.textContent='GÖNDERİLİYOR...';msg.textContent='';
    try{const start=await api('/email/start',{method:'POST',body:JSON.stringify({ad})});const auth=getEmailAuth();await auth.sendPasswordResetEmail(start.email,{url:`${location.origin}${location.pathname}?psmResetDone=1`});msg.style.color='var(--success)';msg.innerHTML=`✅ PIN sıfırlama e-postası <b>${esc(start.maskedEmail||start.email)}</b> adresine gönderildi.<br>Bağlantıda yeni parola olarak <b>yalnız 8 rakamlık PIN</b> belirleyin.`;btn.textContent='MAİL GÖNDERİLDİ';}
    catch(e){msg.style.color='var(--danger)';msg.textContent=friendlyAuthError(e);btn.disabled=false;btn.textContent='PIN SIFIRLAMA MAİLİ GÖNDER';}
  }

  async function secureLogin(name,pin){
    if(!name||!/^\d{8}$/.test(pin))throw new Error('Personel adı ve 8 haneli PIN gerekli.');
    const ident=await api('/identity/resolve',{method:'POST',body:JSON.stringify({ad:name})});const auth=getEmailAuth();
    let result;try{result=await auth.signInWithEmailAndPassword(ident.email,pin);}catch(e){throw new Error(friendlyAuthError(e));}
    await result.user.reload();const user=auth.currentUser||result.user;if(!user.emailVerified)throw new Error('Kurumsal e-posta henüz doğrulanmadı. İlk Giriş / PIN Oluştur bölümünden doğrulama mailini gönderin.');
    return exchangeUser(user,name);
  }

  async function loginFromModal(){
    const name=String(document.getElementById('psmLoginName')?.value||'').trim(),pin=String(document.getElementById('psmLoginPin')?.value||'').trim(),err=document.getElementById('psmLoginError'),btn=document.getElementById('psmLoginSubmit');
    if(!name||!/^\d{8}$/.test(pin)){if(err)err.textContent='Personel adı ve kendi 8 haneli PIN\'iniz gerekli.';return;}
    if(btn){btn.disabled=true;btn.textContent='DOĞRULANIYOR...';}if(err)err.textContent='';
    try{const session=await secureLogin(name,pin);global.showToast?.(`🔐 ${session.ad} olarak güvenli giriş yapıldı.`,'success');setTimeout(()=>location.reload(),450);}
    catch(e){if(err)err.textContent=String(e?.message||e);if(btn){btn.disabled=false;btn.textContent='GİRİŞ YAP';}}
  }

  function patchLoginModal(){
    const modal=document.getElementById('personnelSecureLoginModal'),box=modal?.querySelector('.psm-login');if(!box)return false;
    const sub=box.querySelector('.psm-sub');if(sub)sub.textContent='Adınızı seçin ve kendi belirlediğiniz 8 haneli PIN ile giriş yapın. İlk kullanımda kurumsal e-postanızı bir kez doğrulayın.';
    let pin=document.getElementById('psmLoginPin'),btn=document.getElementById('psmLoginSubmit');
    if(pin&&!pin.dataset.v22){const n=pin.cloneNode(true);n.dataset.v22='1';n.placeholder='Kendi 8 haneli PIN\'iniz';pin.replaceWith(n);pin=n;}
    if(btn&&!btn.dataset.v22){const n=btn.cloneNode(true);n.dataset.v22='1';btn.replaceWith(n);btn=n;}
    if(btn){btn.onclick=loginFromModal;}if(pin){pin.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();loginFromModal();}};}
    if(!document.getElementById('psmV22LoginLinks')){const links=document.createElement('div');links.id='psmV22LoginLinks';links.className='psm-v22-links';links.innerHTML=`<button type="button" class="psm-v22-link" id="psmV22FirstBtn">✉️ İLK GİRİŞ / PIN OLUŞTUR</button><button type="button" class="psm-v22-link" id="psmV22ForgotBtn">🔁 PIN'İMİ UNUTTUM</button>`;const err=document.getElementById('psmLoginError');if(err)err.insertAdjacentElement('beforebegin',links);else box.appendChild(links);document.getElementById('psmV22FirstBtn').onclick=openActivation;document.getElementById('psmV22ForgotBtn').onclick=openForgot;}
    loginPatched=true;return true;
  }

  async function handleReturn(){
    const q=new URLSearchParams(location.search);if(q.get('psmResetDone')==='1'){history.replaceState({},document.title,location.pathname);showInfo('🔁 PIN Sıfırlama','Sıfırlama işlemini tamamladıysanız yeni <b>8 haneli PIN</b> ile Personel Girişi yapabilirsiniz.');return;}
    if(q.get('psmVerifyFinish')!=='1')return;
    history.replaceState({},document.title,location.pathname);
    const auth=getEmailAuth(),pending=pendingGet();
    if(auth.currentUser){try{await auth.currentUser.reload();if(auth.currentUser.emailVerified){const session=await exchangeUser(auth.currentUser,pending?.ad||'');pendingClear();global.showToast?.(`✅ ${session.ad}: e-posta doğrulandı, güvenli giriş açıldı.`,'success');setTimeout(()=>location.reload(),500);return;}}catch(e){console.warn('[FIX2.2 verify return]',e);}}
    showInfo('✅ E-posta Doğrulaması','E-posta doğrulama bağlantısı işlendi. Şimdi <b>Personel Girişi</b> ekranından adınızı seçip oluşturduğunuz 8 haneli PIN ile giriş yapın.');
  }

  async function init(){
    ensureStyles();ensureModals();try{getEmailAuth();}catch(e){console.error('[PersonnelEmailPinFix22] Firebase init:',e);}
    let tries=0;const timer=setInterval(()=>{tries++;if(patchLoginModal()||tries>30)clearInterval(timer);},200);
    try{await handleReturn();}catch(e){console.error('[PersonnelEmailPinFix22] return:',e);}
    console.log(`[PersonnelEmailPinFix22] ${VERSION} loaded.`);
  }

  global.PersonnelEmailPinFix22={version:VERSION,openFirstActivation:openActivation,openReset:openForgot,loginWithPin:secureLogin};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
