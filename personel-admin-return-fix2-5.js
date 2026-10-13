/* TURKMEDYA V62 - PERSONEL SECURE MOBILE FIX2.5 - ADMIN RETURN ROUTE FIX */
(function PersonnelAdminReturnFix25(global){
  'use strict';
  const VERSION='V62-PERSONEL-ADMIN-RETURN-FIX2.5-20261002';
  const RETURN_KEY='TM_PERSONNEL_RETURN_TO_ADMIN_FIX25';
  let wrapped=false, loginPromptShown=false;
  const byId=(id)=>document.getElementById(id);

  function forceAdminShell(){
    try { if (typeof isAdmin !== 'undefined') isAdmin = true; } catch (_) {}
    try {
      document.querySelectorAll('.admin-only').forEach(el=>{
        if(el.id==='capacityWarningBar'||el.id==='btnUndo') return;
        el.style.display='flex';
      });
    } catch (_) {}
    const talep=byId('persTalepArea'); if(talep) talep.style.display='none';
    const login=byId('loginOverlay'); if(login){login.style.display='none';login.style.opacity='0';}
    const modal=byId('adminLoginModal'); if(modal){modal.style.display='none';modal.classList.remove('show');}
    const app=byId('appMain'); if(app) app.style.display='block';
  }

  function openAdminSettings(){
    forceAdminShell();
    try {
      const side=byId('sidePanel');
      if(side && !side.classList.contains('open') && typeof global.toggleAdminPanel==='function') global.toggleAdminPanel();
      else if(side && side.classList.contains('open') && typeof global.tabDegistir==='function') global.tabDegistir('personel');
      global.showToast?.('✅ Yönetici moduna dönüldü.','success');
    } catch(e){ console.warn('[AdminReturn FIX2.5]',e); }
  }

  function showAdminLogin(){
    if(loginPromptShown) return;
    loginPromptShown=true;
    try { if (typeof isAdmin !== 'undefined') isAdmin = false; } catch (_) {}
    const app=byId('appMain'); if(app) app.style.display='none';
    const login=byId('loginOverlay'); if(login){login.style.display='flex';login.style.opacity='1';}
    try {
      if(typeof global.enterSystem==='function') global.enterSystem('admin');
      else { const modal=byId('adminLoginModal'); if(modal){modal.style.display='flex';setTimeout(()=>modal.classList.add('show'),10);} }
    } catch(e){ console.warn('[AdminReturn FIX2.5 login]',e); }
  }

  function processReturnMarker(){
    let requested=false;
    try { requested=sessionStorage.getItem(RETURN_KEY)==='1'; } catch (_) {}
    if(!requested) return;
    const auth=global.firebase?.auth?.();
    if(!auth){ setTimeout(processReturnMarker,100); return; }
    const unsub=auth.onAuthStateChanged(user=>{
      if(user){
        try{sessionStorage.removeItem(RETURN_KEY);}catch(_){}
        try{unsub();}catch(_){}
        setTimeout(openAdminSettings,650);
      } else {
        showAdminLogin();
      }
    });
  }

  function wrapReturnToAdmin(){
    if(wrapped) return true;
    const psm=global.PersonnelSecureMobile;
    if(!psm||typeof psm.returnToAdmin!=='function') return false;
    const original=psm.returnToAdmin.bind(psm);
    psm.returnToAdmin=async function(){
      try{sessionStorage.setItem(RETURN_KEY,'1');}catch(_){}
      return original();
    };
    psm.adminReturnFix=VERSION;
    wrapped=true;
    return true;
  }

  function init(){
    if(!wrapReturnToAdmin()){
      let tries=0;
      const t=setInterval(()=>{tries++; if(wrapReturnToAdmin()||tries>50) clearInterval(t);},100);
    }
    processReturnMarker();
    console.log(`[PersonnelAdminReturnFix25] ${VERSION} loaded.`);
  }

  global.PersonnelAdminReturnFix25={version:VERSION,openAdminSettings};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})(window);
