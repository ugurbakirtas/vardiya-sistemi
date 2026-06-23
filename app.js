const SHIFTS = {
    SABAH: "06:30–16:00",
    GUNDUZ: "09:00–18:00",
    OGLEN: "12:00–20:00",
    AKSAM: "16:00–00:00",
    GECE: "00:00–07:00",
    IZIN: "İZİNLİ",
    BOS: "BOŞ",
    YILLIK: "YILLIK İZİN",
    RAPOR: "RAPORLU"
};

const UNITS = {
    YONETMEN: "TEKNİK YÖNETMEN",
    SES: "SES OPERATÖRÜ",
    KJ: "KJ OPERATÖRÜ",
    PLAYOUT: "PLAYOUT OPERATÖRÜ",
    REJI: "REJİ OPERATÖRÜ",
    MCR24: "24TV MCR OPERATÖRÜ",
    MCR360: "360TV MCR OPERATÖRÜ",
    INGEST: "INGEST OPERATÖRÜ",
    BILGI_ISLEM: "24TV - 360TV BİLGİ İŞLEM",
    YAYIN_SISTEMLERI: "24TV - 360TV YAYIN SİSTEMLERİ",
    ISIK: "24TV - 360TV IŞIK",
    DEKOR: "24TV - 360TV DEKOR",
    KAMERAMANLAR: "24 TV - 360 TV KAMERAMANLAR",
    REKLAM: "24 TV REKLAM AKIŞ",
    YAYIN_YONETMENI: "24TV YAYIN YÖNETMENİ",
    GAZETE_ARSIV: "GAZETE ARŞİV",
    RENK_AYRIMI: "RENK AYRIMI"
};

const DEFAULT_SHIFT_COLORS = [
    "#e0f2fe", 
    "#f0fdf4", 
    "#fef3c7",
    "#faf5ff", 
    "#fff7ed"  
];

let TELEGRAM_API = ""; 
let TELEGRAM_ID = "";  
const firebaseConfig = { apiKey: "AIzaSyBY8dA7IQ0vcdjtG0haRVFuF0vTgZACU0M", authDomain: "teknik-vardiya-listesi.firebaseapp.com", databaseURL: "https://teknik-vardiya-listesi-default-rtdb.europe-west1.firebasedatabase.app", projectId: "teknik-vardiya-listesi", storageBucket: "teknik-vardiya-listesi.firebasestorage.app", messagingSenderId: "900931844150", appId: "1:900931844150:web:41c799492e85d62df8c097" };
firebase.initializeApp(firebaseConfig); const database = firebase.database();

// --- YILLIK İZİN (FIRESTORE) ÇİFT BAĞLANTISI ---
const firebaseConfigIzin = {
    apiKey: "AIzaSyBHEts1PhRYVRKcvYYVMZYKvNXuaVno7m8",
    authDomain: "yillik-izin-864ca.firebaseapp.com",
    projectId: "yillik-izin-864ca",
    storageBucket: "yillik-izin-864ca.firebasestorage.app",
    messagingSenderId: "1047036027627",
    appId: "1:1047036027627:web:3a6a6e8344b83fb5cd94ae",
    measurementId: "G-FNCJQPRE1C"
};
const appIzin = firebase.initializeApp(firebaseConfigIzin, "yillikIzinApp");
const dbIzin = appIzin.firestore();
// -----------------------------------------------

const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]; const PREFIX = ""; 
const BIRIM_RENKLERI = { 
    [UNITS.YONETMEN]: "#2563eb", [UNITS.SES]: "#7c3aed", [UNITS.KJ]: "#db2777", 
    [UNITS.PLAYOUT]: "#059669", [UNITS.REJI]: "#d97706", [UNITS.MCR24]: "#9333ea", 
    [UNITS.MCR360]: "#9333ea", [UNITS.INGEST]: "#06b6d4", [UNITS.BILGI_ISLEM]: "#4d7c0f", 
    [UNITS.YAYIN_SISTEMLERI]: "#0f766e", [UNITS.ISIK]: "#b45309", [UNITS.DEKOR]: "#4338ca", 
    [UNITS.KAMERAMANLAR]: "#be185d", [UNITS.REKLAM]: "#86198f", [UNITS.YAYIN_YONETMENI]: "#0369a1", 
    [UNITS.GAZETE_ARSIV]: "#a21caf", [UNITS.RENK_AYRIMI]: "#b91c1c" 
};
let isAdmin = false;

let hariciIzinler = [];

var state = { 
    birimler: JSON.parse(localStorage.getItem(PREFIX + "birimler")) || Object.values(UNITS), 
    saatler: JSON.parse(localStorage.getItem(PREFIX + "saatler")) || Object.values(SHIFTS).filter(s => s.includes(":")), 
    personeller: JSON.parse(localStorage.getItem(PREFIX + "personeller")) || [], 
    kapasite: JSON.parse(localStorage.getItem(PREFIX + "kapasite")) || {}, 
    manuelAtamalar: JSON.parse(localStorage.getItem(PREFIX + "manuelAtamalar")) || {}, 
    haftaIciSabitler: JSON.parse(localStorage.getItem(PREFIX + "haftaIciSabitler")) || {}, 
    mcrAyarlari: JSON.parse(localStorage.getItem(PREFIX + "mcrAyarlari")) || { baslangicTarihi: new Date().toISOString().split('T')[0], ofsetler: {} }, 
    geciciGorevler: JSON.parse(localStorage.getItem(PREFIX + "geciciGorevler")) || {},
    logs: JSON.parse(localStorage.getItem(PREFIX + "logs")) || [],
    duyuruMetni: JSON.parse(localStorage.getItem(PREFIX + "duyuruMetni")) || "",
    birimAyarlari: JSON.parse(localStorage.getItem(PREFIX + "birimAyarlari")) || {},
    saatAyarlari: JSON.parse(localStorage.getItem(PREFIX + "saatAyarlari")) || {},
    gorunum: JSON.parse(localStorage.getItem(PREFIX + "gorunum")) || { panelRenk: null, panelYaziRenk: null, isimRenk: null, isimKalinlik: 700 }
};

let undoStack = [];
function saveStateToHistory() {
    undoStack.push({
        manuelAtamalar: JSON.parse(JSON.stringify(state.manuelAtamalar)),
        geciciGorevler: JSON.parse(JSON.stringify(state.geciciGorevler))
    });
    if(undoStack.length > 20) undoStack.shift(); 
    const btn = document.getElementById('btnUndo');
    if(btn) btn.style.display = 'inline-flex';
}

function geriAl() {
    if(undoStack.length === 0) { showToast("Geri alınacak işlem yok!", "warning"); return; }
    const lastState = undoStack.pop();
    state.manuelAtamalar = lastState.manuelAtamalar;
    state.geciciGorevler = lastState.geciciGorevler;
    save();
    tabloyuOlustur();
    refreshUI();
    showToast("İşlem başarıyla geri alındı 🔙", "info");
    const btn = document.getElementById('btnUndo');
    if(undoStack.length === 0 && btn) btn.style.display = 'none';
}

function tabloFiltrele() {
    const val = document.getElementById('tabloArama').value.toLocaleLowerCase('tr-TR');
    document.querySelectorAll('.birim-card').forEach(card => {
        if (card.innerText.toLocaleLowerCase('tr-TR').includes(val)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }

function showToast(message, type = "info") {
    const container = document.getElementById('toastContainer');
    if (!container) return; 
    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;
    let icon = "ℹ️";
    if(type === "success") icon = "✅";
    if(type === "error") icon = "❌";
    if(type === "warning") icon = "⚠️";
    toast.innerHTML = `<span>${icon}</span> <div>${message}</div><div class="toast-progress"></div>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, 3000);
}

function getDateKey(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

var currentMonday = getMonday(new Date());

async function hassasAyarlariYukle() { 
    try { 
        const snap = await database.ref('config').once('value'); 
        if (snap.exists()) { 
            const config = snap.val(); 
            if(config.telegram_api) TELEGRAM_API = config.telegram_api; 
            if(config.telegram_id) TELEGRAM_ID = config.telegram_id; 
        } 
    } catch (error) { 
        console.error(error); 
    } 
}

function verileriGuvenliHaleGetir() {
    if(!state) state = {};

    if(state.birimler && typeof state.birimler === 'object' && !Array.isArray(state.birimler)) state.birimler = Object.values(state.birimler);
    if(!Array.isArray(state.birimler) || state.birimler.length === 0) state.birimler = Object.values(UNITS);

    if(state.saatler && typeof state.saatler === 'object' && !Array.isArray(state.saatler)) state.saatler = Object.values(state.saatler);
    if(!Array.isArray(state.saatler) || state.saatler.length === 0) state.saatler = Object.values(SHIFTS).filter(s => s.includes(":"));

    if(state.personeller && typeof state.personeller === 'object' && !Array.isArray(state.personeller)) {
        state.personeller = Object.values(state.personeller).filter(p => p !== null && p !== undefined);
    }
    if(!Array.isArray(state.personeller)) state.personeller = [];

    if(!state.manuelAtamalar) state.manuelAtamalar = {};
    if(!state.geciciGorevler) state.geciciGorevler = {};
    if(!state.kapasite) state.kapasite = {};
    if(!state.haftaIciSabitler) state.haftaIciSabitler = {};

    if(!state.mcrAyarlari) state.mcrAyarlari = { baslangicTarihi: new Date().toISOString().split('T')[0], ofsetler: {} };
    if(!state.mcrAyarlari.ofsetler) state.mcrAyarlari.ofsetler = {};

    if(state.logs && typeof state.logs === 'object' && !Array.isArray(state.logs)) state.logs = Object.values(state.logs);
    if(!state.logs) state.logs = [];
    
    if(!state.birimAyarlari || Object.keys(state.birimAyarlari).length === 0) {
        state.birimAyarlari = {};
        state.birimler.forEach(b => {
            let tip = "HAVUZ";
            let renk = BIRIM_RENKLERI[b] || "#64748b";
            if(b.includes("MCR")) tip = "DONGU8"; 
            if(b.includes("INGEST")) tip = "DONGU6"; 
            if(b.includes("PLAYOUT") || b.includes("SES") || b.includes("KJ")) tip = "GRUP_ABC"; 
            state.birimAyarlari[b] = { tip: tip, renk: renk };
        });
    }
    if(!state.saatAyarlari) state.saatAyarlari = {};
    if(!state.gorunum) state.gorunum = { panelRenk: null, panelYaziRenk: null, isimRenk: null, isimKalinlik: 700 };
}

function tumArayuzuCiz() {
    verileriGuvenliHaleGetir();
    try { gorunumAyarlariYukle(); } catch (e) { console.warn("gorunumAyarlariYukle hatası:", e); }
    try { tabloyuOlustur(); } catch (e) { console.error("tabloyuOlustur hatası:", e); }
    try { mobilListeyiGuncelle(); } catch (e) { console.warn("mobilListeyiGuncelle hatası:", e); }
    if (isAdmin) {
        try { refreshUI(); } catch (e) { console.error("refreshUI hatası:", e); }
    }
}

function veriyiBuluttanYukleVeCiz() {
    return database.ref('vardiya_data').once('value').then(snap => {
        if (snap.exists()) {
            state = snap.val();
        }
        tumArayuzuCiz();
        save();
    }).catch(err => {
        console.error("Bulut veri yükleme hatası:", err);
        tumArayuzuCiz();
    }).finally(() => {
        hideLoading();
    });
}

function izinleriBuluttanCek() {
    dbIzin.collection('izinler').onSnapshot(snapshot => {
        hariciIzinler = [];
        snapshot.forEach(doc => {
            hariciIzinler.push(doc.data());
        });
        renderLeaveCalendar();
        tabloyuOlustur();
    }, error => {
        console.error("Yıllık izinler çekilirken hata oluştu:", error);
    });
}

function isPersonOnAnnualLeave(pAd, dateStr) {
    return hariciIzinler.some(izin => {
        if(izin.durum !== "onaylandı" && izin.durum !== "Onaylandı") return false;
        if(izin.personel_adi !== pAd) return false;
        return dateStr >= izin.baslangic_tarihi && dateStr <= izin.bitis_tarihi;
    });
}

function renderLeaveCalendar() {
    const activeList = document.getElementById('activeLeavesList');
    const upcomingList = document.getElementById('upcomingLeavesList');
    if(!activeList || !upcomingList) return;
    activeList.innerHTML = ''; upcomingList.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    let activeCount = 0; let upcomingCount = 0;
    
    hariciIzinler.forEach(izin => {
        if(izin.durum !== 'onaylandı' && izin.durum !== 'Onaylandı') return;
        const div = document.createElement('li');
        div.style.padding = "8px"; div.style.background = "rgba(128,128,128,0.1)"; div.style.marginBottom = "5px"; div.style.borderRadius = "4px";
        div.innerHTML = `👤 ${izin.personel_adi} <span style="float:right; font-size:10px; background:#e2e8f0; color:#000; padding:2px 4px; border-radius:3px;">${izin.baslangic_tarihi} / ${izin.bitis_tarihi}</span>`;
        
        if(today >= izin.baslangic_tarihi && today <= izin.bitis_tarihi) {
            activeList.appendChild(div); activeCount++;
        } else if (izin.baslangic_tarihi > today) {
            upcomingList.appendChild(div); upcomingCount++;
        }
    });
    if(activeCount === 0) activeList.innerHTML = '<li style="color:var(--text); font-weight:normal; font-size:11px;">Şu an yıllık izinde personel bulunmuyor.</li>';
    if(upcomingCount === 0) upcomingList.innerHTML = '<div style="color:var(--text); font-weight:normal; font-size:11px;">Gelecek izin bulunmuyor.</div>';
}

function enterSystem(role) { 
    if (role === 'admin') { 
        document.getElementById('adminLoginModal').style.display = 'flex';
        setTimeout(() => document.getElementById('adminLoginModal').classList.add('show'), 10);
    } else { 
        isAdmin = false; 
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none'); 
        document.getElementById('persTalepArea').style.display = 'block'; 
        document.getElementById('loginOverlay').style.opacity = '0'; 
        showLoading();
        setTimeout(() => { 
            document.getElementById('loginOverlay').style.display = 'none'; 
            document.getElementById('appMain').style.display = 'block'; 
            veriyiBuluttanYukleVeCiz().then(() => {
                showToast("Sisteme hoş geldiniz.", "info");
            });
        }, 500); 
    } 
}

async function adminGirisYap() {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;

    if(!email || !password) {
        showToast("Lütfen e-posta ve şifrenizi girin.", "warning");
        return;
    }

    showLoading(); 
    try { 
        await firebase.auth().signInWithEmailAndPassword(email, password); 
        isAdmin = true; 
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex'); 
        document.getElementById('persTalepArea').style.display = 'none'; 
        checkUrlActions(); 

        document.getElementById('adminLoginModal').style.display = 'none';
        document.getElementById('loginOverlay').style.opacity = '0'; 
        setTimeout(() => { 
            document.getElementById('loginOverlay').style.display = 'none'; 
            document.getElementById('appMain').style.display = 'block'; 
            veriyiBuluttanYukleVeCiz().then(() => {
                showToast("Yönetici girişi başarılı!", "success"); 
            });
        }, 500); 

    } catch (error) { 
        hideLoading();
        console.error("FIREBASE LOGIN ERROR:", error);
        showToast("Hata: " + (error.code || error.message || "bilinmeyen_hata"), "error"); 
    } 
}

function checkUrlActions() { const urlParams = new URLSearchParams(window.location.search); const action = urlParams.get('action'); const talepId = urlParams.get('id'); if((action === 'onay' || action === 'red') && talepId) { talepIslem(talepId, action); window.history.replaceState({}, document.title, window.location.pathname); } }
function talepModalAc() { const sel = document.getElementById('talepPersonel'); sel.innerHTML = state.personeller.map(p => `<option value="${p.ad}">${p.ad}</option>`).join(''); document.getElementById('talepModal').style.display = 'flex'; }

function talepGonder() { 
    const ad = document.getElementById('talepPersonel').value; 
    const tarih = document.getElementById('talepTarih').value; 
    const tur = document.getElementById('talepTuru').value; 
    if(!tarih) { showToast("Lütfen tarih seçin!", "warning"); return; } 
    const secilenTarih = new Date(tarih); const pzt = getMonday(secilenTarih); 
    const hKey = getDateKey(pzt); const gunIdx = (secilenTarih.getDay() + 6) % 7; 
    const talepId = Date.now().toString(); 
    database.ref('talepler/' + talepId).set({ id: talepId, ad, tarih, gunIdx, tur, hKey, durum: "bekliyor" }); 
    
    if (TELEGRAM_API && TELEGRAM_ID) {
        fetch(`https://api.telegram.org/bot${TELEGRAM_API}/sendMessage`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                chat_id: TELEGRAM_ID, 
                text: `🔔 *YENİ VARDİYA TALEBİ*\n\n👤 *Personel:* ${ad}\n📅 *Tarih:* ${tarih}\n📝 *Vardiya:* ${tur}`, 
                parse_mode: 'Markdown', 
                reply_markup: { 
                    inline_keyboard: [[
                        { text: "✅ ONAYLA", callback_data: `onay_${talepId}` }, 
                        { text: "❌ REDDET", callback_data: `red_${talepId}` }
                    ]] 
                } 
            }) 
        }).catch(e => console.log("Telegram Bildirimi Gönderilemedi."));
    }
    
    showToast("Talebiniz yöneticiye iletildi.", "success"); 
    document.getElementById('talepModal').style.display = 'none'; 
}

function talepleriYukle() { database.ref('talepler').orderByChild('durum').equalTo('bekliyor').on('value', snap => { const liste = document.getElementById('gelenTaleplerListesi'); if(!snap.exists()) { liste.innerHTML = "<p style='text-align:center; padding:20px; opacity:0.5; color:var(--text);'>Bekleyen talep bulunmuyor.</p>"; return; } let html = ""; snap.forEach(item => { const t = item.val(); html += `<div style="background:var(--card-bg); border:1px solid var(--border); border-left:5px solid var(--warning); padding:12px; border-radius:8px; margin-bottom:10px; box-shadow:0 2px 4px rgba(0,0,0,0.05);"><div style="font-weight:800; color:var(--primary); font-size:12px; margin-bottom:4px;">${t.ad}</div><div style="font-size:11px; color:var(--text); margin-bottom:8px;">📅 ${t.tarih} (Hafta: ${t.hKey})<br>📝 İstek: <b>${t.tur}</b></div><div style="display:flex; gap:8px;"><button onclick="talepIslem('${t.id}', 'onay')" style="flex:1; background:var(--success); color:white; border:none; border-radius:6px; padding:8px; cursor:pointer; font-weight:700; font-size:10px;">ONAYLA</button><button onclick="talepIslem('${t.id}', 'red')" style="flex:1; background:var(--danger); color:white; border:none; border-radius:6px; padding:8px; cursor:pointer; font-weight:700; font-size:10px;">REDDET</button></div></div>`; }); liste.innerHTML = html; }); }
function talepIslem(id, tip) { database.ref('talepler/' + id).once('value', snap => { if(!snap.exists()) return; const t = snap.val(); if(tip === 'onay') { saveStateToHistory(); const mKey = `${t.hKey}_${t.ad}_${t.gunIdx}`; state.manuelAtamalar[mKey] = t.tur; save(); currentMonday = new Date(t.hKey); tabloyuOlustur(); database.ref('talepler/' + id).update({ durum: 'onaylandi' }); showToast(`✅ ${t.ad} için talep onaylandı.`, "success"); logKoy(`${t.ad} için talep onaylandı: ${t.tur}`); } else { database.ref('talepler/' + id).update({ durum: 'reddedildi' }); showToast("Talep reddedildi.", "error"); logKoy(`${t.ad} için talep reddedildi.`); } }); }
function getMonday(d) { d = new Date(d); let day = d.getDay(); return new Date(d.setDate(d.getDate() - day + (day == 0 ? -6 : 1))); }

var saveTimeout = null;
function save() { 
    if(saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        localStorage.setItem(PREFIX + "gorunum", JSON.stringify(state.gorunum));
        Object.keys(state).forEach(k => localStorage.setItem(PREFIX + k, JSON.stringify(state[k]))); 
    }, 300);
}

function getBirimColor(birim) { 
    if(state.birimAyarlari && state.birimAyarlari[birim]) return state.birimAyarlari[birim].renk;
    return BIRIM_RENKLERI[birim] || "#64748b"; 
}
function getGecerliBirim(p, g) { let d = new Date(currentMonday); d.setDate(d.getDate() + g); const dateKey = getDateKey(d); const key = `${dateKey}_${p.ad}`; return state.geciciGorevler[key] || p.birim; }

function logKoy(mesaj) {
    if(!state.logs) state.logs = [];
    const zaman = new Date().toLocaleString('tr-TR');
    const user = firebase.auth().currentUser ? firebase.auth().currentUser.email : "Anonim";
    state.logs.unshift({zaman, user, mesaj});
    if(state.logs.length > 200) state.logs.pop(); 
    save();
    if(isAdmin) refreshUI();
}

function isDinlenmeUygun(pAd, hedefGun, hedefSaat, tempProgMap, hKey) {
    if ([SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(hedefSaat)) return true;
    let aksamlar = [SHIFTS.AKSAM, SHIFTS.GECE];
    let sabahlar = [SHIFTS.SABAH, SHIFTS.GUNDUZ, SHIFTS.OGLEN];
    
    let dunVardiya = null;
    if (hedefGun > 0) {
        dunVardiya = tempProgMap[pAd][hedefGun - 1];
    } else {
        const prevMonday = new Date(currentMonday); prevMonday.setDate(prevMonday.getDate() - 7);
        const prevHKey = getDateKey(prevMonday);
        dunVardiya = state.manuelAtamalar[`${prevHKey}_${pAd}_6`];
    }
    
    if (dunVardiya && aksamlar.includes(dunVardiya) && sabahlar.includes(hedefSaat)) return false;
    
    let yarinVardiya = null;
    if (hedefGun < 6) {
        yarinVardiya = tempProgMap[pAd][hedefGun + 1];
    }
    
    if (yarinVardiya && aksamlar.includes(hedefSaat) && sabahlar.includes(yarinVardiya)) return false;
    
    return true;
}

function checkVisualConflict(pAd, gIdx, saat) {
    if ([SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(saat)) return false;
    const hKey = getDateKey(currentMonday);
    
    if (gIdx > 0) {
        let dunKey = `${hKey}_${pAd}_${gIdx - 1}`;
        let dunVardiya = state.manuelAtamalar[dunKey];
        if ([SHIFTS.AKSAM, SHIFTS.GECE].includes(dunVardiya) && [SHIFTS.SABAH, SHIFTS.GUNDUZ, SHIFTS.OGLEN].includes(saat)) return true;
    } else {
        let prevDate = new Date(currentMonday); prevDate.setDate(prevDate.getDate() - 1);
        let prevHKey = getDateKey(getMonday(prevDate));
        let dunVardiya = state.manuelAtamalar[`${prevHKey}_${pAd}_6`];
        if ([SHIFTS.AKSAM, SHIFTS.GECE].includes(dunVardiya) && [SHIFTS.SABAH, SHIFTS.GUNDUZ, SHIFTS.OGLEN].includes(saat)) return true;
    }

    if (gIdx === 5 && [SHIFTS.SABAH, SHIFTS.GUNDUZ, SHIFTS.OGLEN].includes(saat)) {
         let cumaVardiya = state.manuelAtamalar[`${hKey}_${pAd}_4`];
         if ([SHIFTS.AKSAM, SHIFTS.GECE].includes(cumaVardiya)) return true;
    }
    return false;
}

function uzmanlikGuncelle(ad, tip, eklenecekMi) {
    let p = state.personeller.find(x => x.ad === ad);
    if (!p) return;
    if (!p.uzmanlik) p.uzmanlik = [];
    
    if (eklenecekMi && !p.uzmanlik.includes(tip)) p.uzmanlik.push(tip);
    else if (!eklenecekMi) p.uzmanlik = p.uzmanlik.filter(u => u !== tip);
    
    save();
    showToast("Uzmanlık güncellendi.", "success");
}

function birimRenkGuncelle(birimAd, renk) {
    if(!state.birimAyarlari) state.birimAyarlari = {};
    if(!state.birimAyarlari[birimAd]) state.birimAyarlari[birimAd] = { tip: "HAVUZ" };
    
    state.birimAyarlari[birimAd].renk = renk;
    save();
    refreshUI();
    tabloyuOlustur();
    showToast(birimAd + " rengi güncellendi.", "success");
}

window.geciciBirimAta = function(pAd, gIdx, yeniBirim) {
    let d = new Date(currentMonday); d.setDate(d.getDate() + gIdx);
    const key = `${getDateKey(d)}_${pAd}`;
    if (yeniBirim) {
        if(!state.geciciGorevler) state.geciciGorevler = {};
        state.geciciGorevler[key] = yeniBirim;
    } else {
        if(state.geciciGorevler) delete state.geciciGorevler[key];
    }
    save();
    tabloyuOlustur();
    if(isAdmin) refreshUI();
    showToast("Geçici masa (birim) güncellendi.", "success");
};

function tabloyuOlustur() { 
    if(state.duyuruMetni) {
        document.getElementById('duyuruAlani').style.display = 'block';
        document.getElementById('duyuruMetniSpan').innerText = state.duyuruMetni;
    } else {
        document.getElementById('duyuruAlani').style.display = 'none';
    }

    const hKey = getDateKey(currentMonday); 
    const todayKey = getDateKey(new Date()); 

    document.getElementById("tarihAraligi").innerText = `${currentMonday.toLocaleDateString('tr-TR')} Haftası`; 
    
    document.getElementById("tableHeader").innerHTML = `<tr><th style="width:100px;">SAAT</th>${GUNLER.map((g, i) => { 
        let d = new Date(currentMonday); d.setDate(d.getDate() + i); 
        let dKey = getDateKey(d);
        let dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }); 
        let isToday = (dKey === todayKey) ? 'today-col' : '';
        return `<th class="${i>=5?'weekend-col':''} ${isToday}">${g}<div style="font-size:9px; opacity:0.7; font-weight:normal;">${dateStr}</div></th>`; 
    }).join('')}</tr>`;

    let prog = {}; let calis = {}; 
    if(state.personeller) {
        state.personeller.forEach(p => { 
            prog[p.ad] = Array(7).fill(null); calis[p.ad] = 0; 
            for(let i=0; i<7; i++) { 
                let mKey = `${hKey}_${p.ad}_${i}`; 
                if(state.manuelAtamalar[mKey]) prog[p.ad][i] = state.manuelAtamalar[mKey]; 
                if(prog[p.ad][i] && ![SHIFTS.IZIN,SHIFTS.BOS,null,SHIFTS.YILLIK,SHIFTS.RAPOR].includes(prog[p.ad][i])) calis[p.ad]++; 
            } 
        });
    }
    
    let getSanalBirim = (b) => (b && (b.includes("PLAYOUT") || b.includes("KJ"))) ? UNITS.REJI : b;

    document.getElementById("tableBody").innerHTML = state.saatler.map((s, sIdx) => { 
        const ozelRenk = (state.saatAyarlari && state.saatAyarlari[s]) ? state.saatAyarlari[s].renk : null;
        const rowStyle = ozelRenk ? `style="background-color:${ozelRenk}"` : ""; 
        
        let rowHtml = `<tr class="row-saat-${sIdx}" ${rowStyle}><td class="saat-col">${s}</td>`; 
        
        for(let g=0; g<7; g++) { 
            let d = new Date(currentMonday); d.setDate(d.getDate() + g); 
            let isToday = (getDateKey(d) === todayKey) ? 'today-col' : '';

            let sortedPers = state.personeller.filter(p => prog[p.ad][g] === s).sort((a, b) => { 
                let birimA = getSanalBirim(getGecerliBirim(a, g)); 
                let birimB = getSanalBirim(getGecerliBirim(b, g)); 
                return state.birimler.indexOf(birimA) - state.birimler.indexOf(birimB); 
            }); 
            
            let cellContent = ""; let lastBirim = ""; 
            
            sortedPers.forEach((p) => { 
                let gecerliBirim = getGecerliBirim(p, g); 
                let sanalBirim = gecerliBirim;
                let masaRozeti = "";
                
                if (gecerliBirim && (gecerliBirim.includes("PLAYOUT") || gecerliBirim.includes("KJ"))) {
                    sanalBirim = UNITS.REJI;
                    masaRozeti = gecerliBirim.includes("PLAYOUT")
                        ? " <span style='color:#0ea5e9; font-size:8px; font-weight:900;'>[PLAYOUT]</span>" 
                        : " <span style='color:#db2777; font-size:8px; font-weight:900;'>[KJ]</span>";
                }

                let ayiriciClass = (lastBirim !== "" && lastBirim !== sanalBirim) ? "birim-ayirici" : ""; 
                let clickAttr = isAdmin ? `onclick="vardiyaSecimiAc('${p.ad}',${g})"` : ""; 
                let dragAttr = isAdmin ? `draggable="true" ondragstart="drag(event, '${p.ad}', ${g}, '${s}')"` : ""; 
                
                let isConflict = isAdmin ? checkVisualConflict(p.ad, g, s) : false;
                let conflictHtml = isConflict ? `<span class="conflict-warn" title="Kural İhlali (Dinlenme Yetersiz)">⚠️</span>` : "";

                cellContent += `<div class="birim-card ${ayiriciClass}" style="border-left-color:${getBirimColor(sanalBirim)}; background-color:${getBirimColor(sanalBirim)}15;" ${dragAttr} ${clickAttr}>
                    <span class="birim-tag" style="background:${getBirimColor(sanalBirim)}">${sanalBirim}</span>
                    <span class="pers-name">${p.ad}${masaRozeti} ${conflictHtml}</span>
                </div>`; 
                
                lastBirim = sanalBirim; 
            }); 
            rowHtml += `<td class="${g>=5?'weekend-col':''} ${isToday}" data-label="${GUNLER[g]}" ondragover="event.preventDefault()" ondrop="drop(event, '${s}', ${g})">${cellContent}</td>`; 
        } return rowHtml + "</tr>"; 
    }).join('');
    
    let footerHtml = "";
    const footerTypes = [
        { label: "İZİN / BOŞ", shifts: [SHIFTS.IZIN, SHIFTS.BOS, null], rowClass: "row-izin", dropType: "BOŞ" },
        { label: "YILLIK İZİN", shifts: [SHIFTS.YILLIK], rowClass: "row-yillik", dropType: SHIFTS.YILLIK },
        { label: "RAPORLU", shifts: [SHIFTS.RAPOR], rowClass: "row-rapor", dropType: SHIFTS.RAPOR }
    ];

    footerTypes.forEach(ft => {
        let ftHtml = `<tr class="${ft.rowClass}"><td class="saat-col">${ft.label}</td>`;
        for(let g=0; g<7; g++) { 
            let d = new Date(currentMonday); d.setDate(d.getDate() + g); 
            let isToday = (getDateKey(d) === todayKey) ? 'today-col' : '';

            let sortedPers = state.personeller.filter(p => ft.shifts.includes(prog[p.ad][g])).sort((a, b) => { 
                let birimA = getSanalBirim(getGecerliBirim(a, g)); 
                let birimB = getSanalBirim(getGecerliBirim(b, g)); 
                return state.birimler.indexOf(birimA) - state.birimler.indexOf(birimB); 
            }); 
            
            let cellContent = ""; let lastBirim = ""; 
            
            sortedPers.forEach(p => { 
                let gecerliBirim = getGecerliBirim(p, g); 
                let sanalBirim = gecerliBirim;
                let masaRozeti = "";
                
                if (gecerliBirim && (gecerliBirim.includes("PLAYOUT") || gecerliBirim.includes("KJ"))) {
                    sanalBirim = UNITS.REJI;
                    masaRozeti = gecerliBirim.includes("PLAYOUT") 
                        ? " <span style='color:#0ea5e9; font-size:8px; font-weight:900;'>[PLAYOUT]</span>" 
                        : " <span style='color:#db2777; font-size:8px; font-weight:900;'>[KJ]</span>";
                }

                let ayiriciClass = (lastBirim !== "" && lastBirim !== sanalBirim) ? "birim-ayirici" : ""; 
                let clickAttr = isAdmin ? `onclick="vardiyaSecimiAc('${p.ad}',${g})"` : ""; 
                let dragAttr = isAdmin ? `draggable="true" ondragstart="drag(event, '${p.ad}', ${g}, '${ft.dropType}')"` : ""; 
                let countStyle = calis[p.ad] >= 6 ? 'color:var(--danger); font-weight:bold; font-size:11px;' : 'color:var(--text)'; 
                
                let bColor = getBirimColor(sanalBirim);
                let tBg = "";
                if(ft.label === "YILLIK İZİN") tBg = "background:var(--yillik-izin)";
                else if(ft.label === "RAPORLU") tBg = "background:var(--rapor-bg)";
                else tBg = prog[p.ad][g] === SHIFTS.IZIN ? "background:var(--danger)" : `background:${bColor}`;

                cellContent += `<div class="birim-card ${ayiriciClass}" style="border-left-color:${bColor};" ${dragAttr} ${clickAttr}>
                    <span class="birim-tag" style="${tBg}">${prog[p.ad][g] || 'BOŞ'}</span>
                    <span class="pers-name">${p.ad}${masaRozeti} <span style="${countStyle}">(${calis[p.ad]}G)</span></span>
                </div>`; 
                
                lastBirim = sanalBirim; 
            }); 
            ftHtml += `<td class="${g>=5?'weekend-col':''} ${isToday}" data-label="${GUNLER[g]}" ondragover="event.preventDefault()" ondrop="drop(event, '${ft.dropType}', ${g})">${cellContent}</td>`; 
        }
        ftHtml += `</tr>`;
        footerHtml += ftHtml;
    });

    document.getElementById("tableFooter").innerHTML = footerHtml;
    
    let yorgunlar = [];
    state.personeller.forEach(p => {
        if(calis[p.ad] >= 6) {
            yorgunlar.push(`<b>${p.ad}</b> (${calis[p.ad]} Gün)`);
        }
    });
    
    const uyariDiv = document.getElementById('yorgunlukUyari');
    if(yorgunlar.length > 0 && isAdmin) { 
        uyariDiv.innerHTML = "⚠️ DİKKAT (6-7 Gün Çalışanlar): " + yorgunlar.join(", ");
        uyariDiv.style.display = 'block';
    } else {
        uyariDiv.style.display = 'none';
    }

    let eksikKapasiteVarMi = false;
    state.birimler.forEach(birim => {
        for(let gun=0; gun<7; gun++) {
            state.saatler.forEach(saat => {
                if(saat === SHIFTS.IZIN) return;
                let hedef = (state.kapasite[`${birim}_${saat}`] || [0,0,0,0,0,0,0])[gun];
                let mevcut = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && prog[p.ad][gun] === saat).length;
                if(hedef > 0 && mevcut < hedef) { 
                    eksikKapasiteVarMi = true;
                }
            });
        }
    });
    const warningBar = document.getElementById('capacityWarningBar');
    if(warningBar) {
        if(eksikKapasiteVarMi && isAdmin) warningBar.style.display = 'block';
        else warningBar.style.display = 'none';
    }

    istatistikleriHesapla();
    mobilListeyiGuncelle();
    tabloFiltrele();
}

function cakismaKontrol(personelAd, hedefGun, hedefSaat) { const hKey = getDateKey(currentMonday); if ([SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(hedefSaat)) return; if (hedefGun > 0) { let dunKey = `${hKey}_${personelAd}_${hedefGun - 1}`; let dunVardiya = state.manuelAtamalar[dunKey]; let sabahVardiyalari = [SHIFTS.SABAH, SHIFTS.GUNDUZ, SHIFTS.OGLEN]; let aksamVardiyalari = [SHIFTS.AKSAM, SHIFTS.GECE]; if (aksamVardiyalari.includes(dunVardiya) && sabahVardiyalari.includes(hedefSaat)) showToast(`⚠️ DİKKAT: ${personelAd} dün AKŞAM/GECE vardiyasındaydı. Yetersiz dinlenme!`, "warning"); } if (hedefGun < 6) { let yarinKey = `${hKey}_${personelAd}_${hedefGun + 1}`; let yarinVardiya = state.manuelAtamalar[yarinKey]; let sabahVardiyalari = [SHIFTS.SABAH, SHIFTS.GUNDUZ, SHIFTS.OGLEN]; let aksamVardiyalari = [SHIFTS.AKSAM, SHIFTS.GECE]; if (aksamVardiyalari.includes(hedefSaat) && sabahVardiyalari.includes(yarinVardiya)) showToast(`⚠️ DİKKAT: ${personelAd} yarın SABAH görünüyor. Yetersiz dinlenme!`, "warning"); } }
function mulberry32(a) { return function() { var t = a += 0x6D2B79F5; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } }
function seededShuffle(array, seed) { let hash = 0; for (let i = 0; i < seed.length; i++) hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0; let rng = mulberry32(hash); let m = array.length, t, i; while (m) { i = Math.floor(rng() * m--); t = array[m]; array[m] = array[i]; array[i] = t; } return array; }

function yillikIzinIsle() { 
    saveStateToHistory(); 
    const pAd = document.getElementById('yillikIzinPersonel').value; const basTarih = document.getElementById('yillikBaslangic').value; const bitTarih = document.getElementById('yillikBitis').value; if(!pAd || !basTarih || !bitTarih) { showToast("Lütfen tüm alanları doldurun.", "error"); return; } let current = new Date(basTarih); let end = new Date(bitTarih); while(current <= end) { const hKey = getDateKey(getMonday(current)); let jsDay = current.getDay(); let gunIdx = (jsDay + 6) % 7; const mKey = `${hKey}_${pAd}_${gunIdx}`; state.manuelAtamalar[mKey] = SHIFTS.YILLIK; current.setDate(current.getDate() + 1); } save(); tabloyuOlustur(); showToast(`${pAd} için yıllık izin işlendi.`, "success"); logKoy(`${pAd} için YILLIK İZİN işlendi (${basTarih} - ${bitTarih})`); document.getElementById('yillikBaslangic').value = ""; document.getElementById('yillikBitis').value = ""; 
}

function vardiyaUretVeKaydet() {
    if(!isAdmin) return;
    saveStateToHistory(); 
    const hKey = getDateKey(currentMonday);
    const prevMonday = new Date(currentMonday); prevMonday.setDate(prevMonday.getDate() - 7);
    const prevHKey = getDateKey(prevMonday);
    
    let tempProg = {}; 
    let calis = {};
    verileriGuvenliHaleGetir();

    const safeAssign = (p, day, shift) => {
         if (tempProg[p.ad][day] !== null) return;
         if (shift === SHIFTS.IZIN) { tempProg[p.ad][day] = shift; return; }
         
         if (!isDinlenmeUygun(p.ad, day, shift, tempProg, hKey)) return;
         
         const cap = (state.kapasite[`${p.birim}_${shift}`] || [0,0,0,0,0,0,0])[day];
         let currentCount = 0;
         state.personeller.filter(x => x.birim === p.birim).forEach(x => { if(tempProg[x.ad][day] === shift) currentCount++; });
         if (currentCount < cap) tempProg[p.ad][day] = shift;
    };

    const calisGuncelle = () => {
         state.personeller.forEach(p => { 
             calis[p.ad] = 0; 
             for(let g=0; g<7; g++) { 
                 if(tempProg[p.ad][g] && ![SHIFTS.IZIN,SHIFTS.BOS,null,SHIFTS.YILLIK,SHIFTS.RAPOR].includes(tempProg[p.ad][g])) calis[p.ad]++; 
             } 
         });
    };

    function adim1_ManuelVeSabitleriYukle() {
        state.personeller.forEach(p => {
             tempProg[p.ad] = Array(7).fill(null);
             for(let g=0; g<7; g++) { 
                 let mKey = `${hKey}_${p.ad}_${g}`; 
                 if(state.manuelAtamalar[mKey]) tempProg[p.ad][g] = state.manuelAtamalar[mKey]; 
                 
                 let loopDate = new Date(currentMonday); loopDate.setDate(loopDate.getDate() + g);
                 let dateStr = loopDate.toISOString().split('T')[0];
                 if(isPersonOnAnnualLeave(p.ad, dateStr)) {
                     tempProg[p.ad][g] = SHIFTS.YILLIK;
                     state.manuelAtamalar[mKey] = SHIFTS.YILLIK;
                 }
             }
             if (state.haftaIciSabitler[p.ad]) { 
                 for(let i=0; i<5; i++) { 
                     if(!tempProg[p.ad][i]) tempProg[p.ad][i] = state.haftaIciSabitler[p.ad]; 
                 } 
                 if(!tempProg[p.ad][5]) tempProg[p.ad][5] = SHIFTS.IZIN; 
                 if(!tempProg[p.ad][6]) tempProg[p.ad][6] = SHIFTS.IZIN; 
             }
             if(p.izinGunleri) { 
                 p.izinGunleri.forEach(gi => { 
                     if(!tempProg[p.ad][gi]) tempProg[p.ad][gi] = SHIFTS.IZIN; 
                 }); 
             }
        });
        calisGuncelle();
    }

    function adim2_McrVeIngestDonguleri() {
        const mcrDongu = [SHIFTS.SABAH, SHIFTS.SABAH, SHIFTS.AKSAM, SHIFTS.AKSAM, SHIFTS.GECE, SHIFTS.GECE, SHIFTS.IZIN, SHIFTS.IZIN];
        const ingestDongu = [SHIFTS.SABAH, SHIFTS.SABAH, SHIFTS.AKSAM, SHIFTS.AKSAM, SHIFTS.IZIN, SHIFTS.IZIN];
        const baseDate = new Date(state.mcrAyarlari.baslangicTarihi);
        
        let eksikler = [];

        state.personeller.forEach(p => { 
            const birimAyar = state.birimAyarlari[p.birim] || { tip: "HAVUZ" };
            
            if (birimAyar.tip === "DONGU8" || birimAyar.tip === "DONGU6") {
                const persOfset = parseInt(state.mcrAyarlari.ofsetler[p.ad] || 0);
                const loopArr = (birimAyar.tip === "DONGU8") ? mcrDongu : ingestDongu;
                const modVal = loopArr.length;

                for(let g=0; g<7; g++) {
                    let d = new Date(currentMonday); d.setDate(d.getDate() + g);
                    const diffDays = Math.floor((d - baseDate) / (1000 * 60 * 60 * 24));
                    let beklenenSaat = loopArr[((diffDays + persOfset) % modVal + modVal) % modVal];

                    if(tempProg[p.ad][g] !== null) {
                        if (tempProg[p.ad][g] === SHIFTS.IZIN || tempProg[p.ad][g] === SHIFTS.YILLIK || tempProg[p.ad][g] === SHIFTS.RAPOR) {
                            if (beklenenSaat !== SHIFTS.IZIN) {
                                eksikler.push({ gun: g, birim: p.birim, saat: beklenenSaat });
                            }
                        }
                        continue; 
                    }
                    
                    if (isDinlenmeUygun(p.ad, g, beklenenSaat, tempProg, hKey)) {
                        tempProg[p.ad][g] = beklenenSaat;
                    }
                }
            }
        });
        calisGuncelle();
        return eksikler;
    }

    function adim2_5_McrEksikleriniDoldur(eksikler) {
        eksikler.forEach(eksik => {
            let reqUzmanlik = null;
            if(eksik.birim.includes("24")) reqUzmanlik = "24 MCR";
            else if(eksik.birim.includes("360")) reqUzmanlik = "360 MCR";
            else if(eksik.birim.includes("INGEST")) reqUzmanlik = "INGEST";

            let adaylar = state.personeller.filter(p => {
                if (tempProg[p.ad][eksik.gun] !== null) return false;
                if (reqUzmanlik && (!p.uzmanlik || !p.uzmanlik.includes(reqUzmanlik))) return false;
                if (calis[p.ad] >= 6) return false;
                if (!isDinlenmeUygun(p.ad, eksik.gun, eksik.saat, tempProg, hKey)) return false;
                
                if (!["PLAYOUT OPERATÖRÜ", "KJ OPERATÖRÜ", "REJİ OPERATÖRÜ"].includes(p.birim) && !p.birim.includes("MCR")) return false; 

                return true;
            });

            seededShuffle(adaylar, hKey + eksik.gun + eksik.saat);
            adaylar.sort((a,b) => calis[a.ad] - calis[b.ad]);

            if (adaylar.length > 0) {
                let secilen = adaylar[0];
                tempProg[secilen.ad][eksik.gun] = eksik.saat;
                calis[secilen.ad]++;
                let d = new Date(currentMonday); d.setDate(d.getDate() + eksik.gun);
                if(!state.geciciGorevler) state.geciciGorevler = {};
                state.geciciGorevler[`${getDateKey(d)}_${secilen.ad}`] = eksik.birim;
            }
        });
        calisGuncelle();
    }

    function adim3_GrupAbcVeKapasite() {
        state.birimler.forEach(birim => {
            const ayar = state.birimAyarlari[birim] || { tip: "HAVUZ" };
            if (ayar.tip !== "GRUP_ABC") return;

            let personelListesi = state.personeller.filter(p => p.birim === birim);
            if (personelListesi.length === 0) return;
             
             let grupA = []; let grupB = []; let grupC = [];
             let unassigned = [];
             personelListesi.forEach((p, index) => {
                let gecenPzt = state.manuelAtamalar[`${prevHKey}_${p.ad}_0`];
                if (gecenPzt === undefined) { unassigned.push(p); }
                else if ([SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(gecenPzt)) { grupA.push(p); } 
                else if (gecenPzt === SHIFTS.SABAH || gecenPzt === SHIFTS.GUNDUZ || gecenPzt === SHIFTS.OGLEN) { grupB.push(p); } 
                else { grupC.push(p); }
            });

            unassigned.forEach(p => {
                if (grupA.length <= grupB.length && grupA.length <= grupC.length) grupA.push(p);
                else if (grupB.length <= grupC.length) grupB.push(p);
                else grupC.push(p);
            });
            
            grupA.forEach(p => { safeAssign(p, 0, SHIFTS.SABAH); safeAssign(p, 1, SHIFTS.AKSAM); safeAssign(p, 2, SHIFTS.AKSAM); safeAssign(p, 5, SHIFTS.SABAH); safeAssign(p, 6, SHIFTS.SABAH); });
            grupB.forEach(p => { safeAssign(p, 0, SHIFTS.AKSAM); safeAssign(p, 3, SHIFTS.SABAH); safeAssign(p, 4, SHIFTS.SABAH); safeAssign(p, 5, SHIFTS.AKSAM); safeAssign(p, 6, SHIFTS.AKSAM); });
            
            seededShuffle(grupC, hKey);
            grupC.forEach((p, index) => {
                safeAssign(p, 1, SHIFTS.SABAH); safeAssign(p, 2, SHIFTS.SABAH); safeAssign(p, 3, SHIFTS.AKSAM); safeAssign(p, 4, SHIFTS.AKSAM);
                if (index % 2 === 0) {
                    let cmtAksamCap = (state.kapasite[`${birim}_${SHIFTS.AKSAM}`] || [0,0,0,0,0,0,0])[5];
                    if(cmtAksamCap > 0) { safeAssign(p, 5, SHIFTS.AKSAM); } 
                } else {
                    let pzSabahCap = (state.kapasite[`${birim}_${SHIFTS.SABAH}`] || [0,0,0,0,0,0,0])[6];
                    if(pzSabahCap > 0) { safeAssign(p, 6, SHIFTS.SABAH); } 
                }
            });

            calisGuncelle();

            let targetSatGunduz = (state.kapasite[`${birim}_${SHIFTS.GUNDUZ}`] || [])[5] || 0;
            let targetSatAksam = (state.kapasite[`${birim}_${SHIFTS.AKSAM}`] || [])[5] || 0;

            let currentSatGunduz = personelListesi.filter(p => tempProg[p.ad][5] === SHIFTS.GUNDUZ).length;
            let currentSatAksam = personelListesi.filter(p => tempProg[p.ad][5] === SHIFTS.AKSAM).length;

            let candidatesSabah = personelListesi.filter(p => { let friShift = tempProg[p.ad][4]; return friShift === SHIFTS.SABAH || friShift === SHIFTS.GUNDUZ || friShift === SHIFTS.OGLEN; });
            let candidatesAksam = personelListesi.filter(p => tempProg[p.ad][4] === SHIFTS.AKSAM);

            seededShuffle(candidatesSabah, hKey + "S");
            seededShuffle(candidatesAksam, hKey + "A");
            
            candidatesSabah.sort((a,b) => calis[a.ad] - calis[b.ad]);
            candidatesAksam.sort((a,b) => calis[a.ad] - calis[b.ad]);

            if (currentSatGunduz < targetSatGunduz) {
                for (let p of candidatesSabah) {
                    if (currentSatGunduz >= targetSatGunduz) break;
                    if (!state.manuelAtamalar[`${hKey}_${p.ad}_5`] && isDinlenmeUygun(p.ad, 5, SHIFTS.GUNDUZ, tempProg, hKey) && calis[p.ad] < 6) { 
                        tempProg[p.ad][5] = SHIFTS.GUNDUZ; 
                        calis[p.ad]++;
                        currentSatGunduz++; 
                    }
                }
            }
            if (currentSatAksam < targetSatAksam) {
                for (let p of candidatesAksam) {
                    if (currentSatAksam >= targetSatAksam) break;
                    if (!state.manuelAtamalar[`${hKey}_${p.ad}_5`] && isDinlenmeUygun(p.ad, 5, SHIFTS.AKSAM, tempProg, hKey) && calis[p.ad] < 6) { 
                        tempProg[p.ad][5] = SHIFTS.AKSAM; 
                        calis[p.ad]++;
                        currentSatAksam++; 
                    }
                }
            }
        });
        
        calisGuncelle();

        state.birimler.forEach(birim => {
            const ayar = state.birimAyarlari[birim] || { tip: "HAVUZ" };
            if (ayar.tip !== "GRUP_ABC") return;

            for (let gun = 0; gun < 7; gun++) {
                state.saatler.forEach(saat => {
                    if(saat === SHIFTS.IZIN) return;
                    const hedef = (state.kapasite[`${birim}_${saat}`] || [0,0,0,0,0,0,0])[gun];
                    let mevcut = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === saat).length;

                    if (mevcut < hedef) {
                        let yedekAdaylar = state.personeller.filter(p => {
                            let gBirim = getGecerliBirim(p, gun);
                            let birimUygun = (gBirim === birim);
                            
                            if (!birimUygun && (birim.includes("PLAYOUT") || birim.includes("KJ")) && gBirim && (gBirim.includes("PLAYOUT") || gBirim.includes("KJ"))) {
                                let arananUzmanlik = birim.includes("PLAYOUT") ? "PLAYOUT" : "KJ";
                                if (p.uzmanlik && p.uzmanlik.includes(arananUzmanlik)) {
                                    birimUygun = true; 
                                }
                            }

                            let bosta = (tempProg[p.ad][gun] === null); 
                            let yorgunDegil = calis[p.ad] < 6;
                            let dinlenmeTamam = isDinlenmeUygun(p.ad, gun, saat, tempProg, hKey);
                            let manuelVar = state.manuelAtamalar[`${hKey}_${p.ad}_${gun}`];
                            
                            return birimUygun && bosta && yorgunDegil && dinlenmeTamam && !manuelVar;
                        });

                        seededShuffle(yedekAdaylar, hKey + "yedek" + gun + saat);
                        yedekAdaylar.sort((a,b) => calis[a.ad] - calis[b.ad]);

                        for (let p of yedekAdaylar) {
                            if (mevcut < hedef) {
                                tempProg[p.ad][gun] = saat;
                                calis[p.ad]++;
                                mevcut++;
                                
                                let gercekBirim = getGecerliBirim(p, gun);
                                if (gercekBirim !== birim) {
                                    let d = new Date(currentMonday); d.setDate(d.getDate() + gun);
                                    if(!state.geciciGorevler) state.geciciGorevler = {};
                                    state.geciciGorevler[`${getDateKey(d)}_${p.ad}`] = birim;
                                }
                            }
                        }
                    }
                });
            }
        });
        calisGuncelle();
    }

    function adim4_AkilliHaftasonuKorumasi() {
        state.birimler.forEach(birim => {
            const ayar = state.birimAyarlari[birim] || { tip: "HAVUZ" };
            if (ayar.tip !== "AKILLI_HAFTASONU") return;
            
            for (let gun = 0; gun < 7; gun++) {
                let siralama = [...state.saatler]; 
                
                if (gun === 5) {
                    siralama = siralama.filter(s => s !== SHIFTS.SABAH && s !== SHIFTS.GUNDUZ && s !== SHIFTS.OGLEN);
                    siralama.unshift(SHIFTS.OGLEN);
                    siralama.unshift(SHIFTS.SABAH); 
                    siralama.unshift(SHIFTS.GUNDUZ); 
                }

                siralama.forEach(saat => {
                    if (saat === SHIFTS.IZIN) return;
                    
                    const hedef = (state.kapasite[`${birim}_${saat}`] || [0,0,0,0,0,0,0])[gun];
                    let mevcut = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === saat).length;
                    
                    if (mevcut < hedef) {
                        let adaylar = state.personeller.filter(p => {
                            if (getGecerliBirim(p, gun) !== birim) return false;
                            if (tempProg[p.ad][gun] !== null) return false;
                            if (calis[p.ad] >= 6) return false;
                            if (!isDinlenmeUygun(p.ad, gun, saat, tempProg, hKey)) return false;
                            return true;
                        });
                        
                        seededShuffle(adaylar, hKey + gun + saat);
                        adaylar.sort((a,b) => calis[a.ad] - calis[b.ad]);

                        for (let p of adaylar) {
                            if (mevcut < hedef) {
                                tempProg[p.ad][gun] = saat;
                                calis[p.ad]++;
                                mevcut++;
                            }
                        }
                    }
                });
            }
        });
        calisGuncelle();
    }

    function adim5_HavuzVeGecePuanSistemi() {
        for (let gun = 0; gun < 7; gun++) {
            state.birimler.forEach(birim => {
                const ayar = state.birimAyarlari[birim] || { tip: "HAVUZ" };
                if (ayar.tip !== "HAVUZ" && ayar.tip !== "GECE_ONCELIKLI") return; 

                const siralamaYap = (adaylar, isGece) => {
                    seededShuffle(adaylar, hKey);
                    if (ayar.tip === "GECE_ONCELIKLI" && isGece) {
                        adaylar.sort((a,b) => (b.yuzde || 0) - (a.yuzde || 0) || calis[a.ad] - calis[b.ad]);
                    } else {
                        adaylar.sort((a,b) => calis[a.ad] - calis[b.ad]);
                    }
                };

                const geceSaati = SHIFTS.GECE; 
                const hedefGece = (state.kapasite[`${birim}_${geceSaati}`] || [0,0,0,0,0,0,0])[gun];
                let atananGece = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === geceSaati).length;

                if (atananGece < hedefGece) {
                    let adaylar = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === null && (calis[p.ad] < 6) && isDinlenmeUygun(p.ad, gun, geceSaati, tempProg, hKey));
                    siralamaYap(adaylar, true); 
                    for (let p of adaylar) { if (atananGece < hedefGece) { tempProg[p.ad][gun] = geceSaati; calis[p.ad]++; atananGece++; } }
                }
                
                state.saatler.filter(s => s !== SHIFTS.GECE).forEach(saat => {
                    const hdf = (state.kapasite[`${birim}_${saat}`] || [0,0,0,0,0,0,0])[gun];
                    let mvc = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === saat).length;
                    
                    if (mvc < hdf) {
                        let ady = state.personeller.filter(p => {
                            let basic = getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === null;
                            return basic && (calis[p.ad] < 6) && isDinlenmeUygun(p.ad, gun, saat, tempProg, hKey);
                        });
                        siralamaYap(ady, false); 
                        for (let p of ady) { if (mvc < hdf) { tempProg[p.ad][gun] = saat; calis[p.ad]++; mvc++; } }
                    }
                });
            });
        }
        calisGuncelle();
    }

    function adim6_EksikleriKapatVeKaydet() {
        state.personeller.forEach(p => { for(let g=0; g<7; g++) { if(tempProg[p.ad][g] === null) tempProg[p.ad][g] = SHIFTS.IZIN; } });
        state.personeller.forEach(p => { for(let i=0; i<7; i++) if(tempProg[p.ad][i]) state.manuelAtamalar[`${hKey}_${p.ad}_${i}`] = tempProg[p.ad][i]; });
        
        save(); 
        logKoy("Otomatik vardiya oluşturuldu.");
        tabloyuOlustur(); 
        showToast("✅ Vardiya başarıyla oluşturuldu.", "success");
    }

    document.getElementById("isimKalinlikRange") ? "" : console.log("Init layout logic");
    adim1_ManuelVeSabitleriYukle();
    let mcrEksikler = adim2_McrVeIngestDonguleri();
    adim2_5_McrEksikleriniDoldur(mcrEksikler);
    adim3_GrupAbcVeKapasite();
    adim4_AkilliHaftasonuKorumasi();
    adim5_HavuzVeGecePuanSistemi();
    adim6_EksikleriKapatVeKaydet();
}

function exceldenVardiyaYukle() {
    const fileInput = document.getElementById('excelUploadInput');
    if (!fileInput.files.length) { showToast("Lütfen bir Excel dosyası seçin!", "warning"); return; }
    
    saveStateToHistory(); 
    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
            
            const hKey = getDateKey(currentMonday);
            let islenenSayisi = 0;

            jsonData.forEach(row => {
                if (!row || row.length < 2) return; 

                let satirBasligi = row[0];
                if(!satirBasligi || typeof satirBasligi !== 'string') return;
                
                let bosluksuzBaslikTR = satirBasligi.replace(/\s+/g, '').toLocaleUpperCase('tr-TR');
                let bosluksuzBaslikEN = satirBasligi.replace(/\s+/g, '').toUpperCase(); 
                
                let atanacakVardiya = null;

                if (bosluksuzBaslikTR.includes("İZİN") || bosluksuzBaslikEN.includes("IZIN") || bosluksuzBaslikEN.includes("OFF")) {
                    atanacakVardiya = SHIFTS.IZIN;
                } else if (bosluksuzBaslikTR.includes("YILLIK") || bosluksuzBaslikEN.includes("YILLIK")) {
                    atanacakVardiya = SHIFTS.YILLIK;
                } else if (bosluksuzBaslikTR.includes("RAPOR") || bosluksuzBaslikEN.includes("RAPOR")) {
                    atanacakVardiya = SHIFTS.RAPOR;
                } else {
                    let checkStr = satirBasligi.replace(/[:\-\s]/g, "");
                    atanacakVardiya = state.saatler.find(s => s.replace(/[:\-\s]/g, "").includes(checkStr));
                    
                    if(!atanacakVardiya) {
                        if(bosluksuzBaslikTR.startsWith("00") || bosluksuzBaslikTR.startsWith("24") || bosluksuzBaslikTR.includes("GECE")) {
                            atanacakVardiya = SHIFTS.GECE;
                        }
                        else if(bosluksuzBaslikTR.includes("06") || bosluksuzBaslikTR.includes("07")) {
                            atanacakVardiya = SHIFTS.SABAH;
                        }
                        else if(bosluksuzBaslikTR.includes("09") || bosluksuzBaslikTR.includes("10")) {
                            atanacakVardiya = SHIFTS.GUNDUZ;
                        }
                        else if(bosluksuzBaslikTR.includes("12") || bosluksuzBaslikTR.includes("13")) {
                            atanacakVardiya = SHIFTS.OGLEN;
                        }
                        else if(bosluksuzBaslikTR.includes("16") || bosluksuzBaslikTR.includes("15") || bosluksuzBaslikTR.includes("14")) {
                            atanacakVardiya = SHIFTS.AKSAM;
                        }
                    }
                }

                for (let i = 1; i <= 7; i++) {
                    let hucreVerisi = row[i];
                    if (hucreVerisi && typeof hucreVerisi === 'string') {
                        
                        let upCell = hucreVerisi.toLocaleUpperCase('tr-TR');
                        let cellVardiya = atanacakVardiya;
                        
                        let bosluksuzHucre = upCell.replace(/\s+/g, '');
                        if (bosluksuzHucre.includes("YILLIK")) cellVardiya = SHIFTS.YILLIK;
                        else if (bosluksuzHucre.includes("RAPOR")) cellVardiya = SHIFTS.RAPOR;
                        else if (bosluksuzHucre.includes("İZİN") || bosluksuzHucre.includes("IZIN") || bosluksuzHucre.includes("OFF")) cellVardiya = SHIFTS.IZIN;
                        
                        if (!cellVardiya) continue;

                        let temizIsim = upCell
                            .replace(/İ\s*Z\s*İ\s*N\s*L\s*İ/g, '')
                            .replace(/İ\s*Z\s*İ\s*N/g, '')
                            .replace(/I\s*Z\s*I\s*N/g, '')
                            .replace(/Y\s*I\s*L\s*L\s*I\s*K/g, '')
                            .replace(/R\s*A\s*P\s*O\s*R\s*L\s*U/g, '')
                            .replace(/R\s*A\s*P\s*O\s*R/g, '')
                            .replace(/O\s*F\s*F/g, '')
                            .split('*')[0] 
                            .split('-')[0] 
                            .replace(/[\d\(\)\.]/g, '') 
                            .trim();

                        let personel = state.personeller.find(p => p.ad === temizIsim);
                        
                        if (!personel && temizIsim.length > 2) {
                            personel = state.personeller.find(p => p.ad.replace(/\s/g,'').includes(temizIsim.replace(/\s/g,'')) || temizIsim.replace(/\s/g,'').includes(p.ad.replace(/\s/g,'')));
                        }
                        
                        if (personel) {
                            let gunIdx = i - 1;
                            state.manuelAtamalar[`${hKey}_${personel.ad}_${gunIdx}`] = cellVardiya;
                            islenenSayisi++;
                        }
                    }
                }
            });

            if (islenenSayisi > 0) {
                save();
                tabloyuOlustur();
                alert(`✅ Excel Başarıyla İşlendi!\n\nToplam ${islenenSayisi} hücre sisteme aktarıldı.`);
                logKoy(`Excel yüklendi (${islenenSayisi} atama)`);
            } else {
                showToast("⚠️ Excel okundu ancak eşleşen veri bulunamadı. Formatı veya isimleri kontrol edin.", "warning");
            }

        } catch (err) {
            console.error(err);
            showToast("Dosya okuma hatası: " + err.message, "error");
        }
    };
    reader.readAsArrayBuffer(file);
}

function gorunumModalAc() {
    gorunumAyarlariYukleUI();
    document.getElementById('gorunumModal').style.display = 'flex';
}

function panelRenkSec(renk) {
    if(!state.gorunum) state.gorunum = {};
    state.gorunum.panelRenk = renk;
    document.documentElement.style.setProperty('--custom-panel-bg', renk);
    save();
}

function panelRenkSifirla() {
    if(!state.gorunum) state.gorunum = {};
    state.gorunum.panelRenk = null;
    save();
    gorunumAyarlariYukle(); 
}

function panelYaziRenkSec(renk) {
    if(!state.gorunum) state.gorunum = {};
    state.gorunum.panelYaziRenk = renk;
    document.documentElement.style.setProperty('--custom-panel-text', renk);
    save();
}

function panelYaziRenkSifirla() {
    if(!state.gorunum) state.gorunum = {};
    state.gorunum.panelYaziRenk = null;
    save();
    gorunumAyarlariYukle();
}

function isimRenkSec(renk) {
    if(!state.gorunum) state.gorunum = {};
    state.gorunum.isimRenk = renk;
    document.documentElement.style.setProperty('--name-color', renk);
    save();
}

function isimRenkSifirla() {
    if(!state.gorunum) state.gorunum = {};
    state.gorunum.isimRenk = null;
    save();
    gorunumAyarlariYukle();
}

function isimKalinlikDegis(val) {
    if(!state.gorunum) state.gorunum = {};
    state.gorunum.isimKalinlik = val;
    document.documentElement.style.setProperty('--name-weight', val);
    save();
}

function gorunumAyarlariYukle() {
    if(state.gorunum && state.gorunum.panelRenk) {
        document.documentElement.style.setProperty('--custom-panel-bg', state.gorunum.panelRenk);
    } else {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.style.setProperty('--custom-panel-bg', isDark ? '#020617' : '#f1f5f9');
    }

    if(state.gorunum && state.gorunum.panelYaziRenk) {
        document.documentElement.style.setProperty('--custom-panel-text', state.gorunum.panelYaziRenk);
    } else {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.style.setProperty('--custom-panel-text', isDark ? '#f1f5f9' : '#334155');
    }

    if(state.gorunum && state.gorunum.isimRenk) {
        document.documentElement.style.setProperty('--name-color', state.gorunum.isimRenk);
    } else {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.style.setProperty('--name-color', isDark ? '#ffffff' : '#334155');
    }

    if(state.gorunum && state.gorunum.isimKalinlik) {
        document.documentElement.style.setProperty('--name-weight', state.gorunum.isimKalinlik);
    } else {
        document.documentElement.style.setProperty('--name-weight', '700');
    }
}

function gorunumAyarlariYukleUI() {
    if(state.gorunum) {
        if(state.gorunum.isimKalinlik) document.getElementById('isimKalinlikRange').value = state.gorunum.isimKalinlik;
        if(state.gorunum.panelYaziRenk) document.getElementById('panelTextPicker').value = state.gorunum.panelYaziRenk;
        if(state.gorunum.isimRenk) document.getElementById('isimRenkPicker').value = state.gorunum.isimRenk;
    }
}

window.onload = async () => { 
    if(localStorage.getItem(PREFIX + "theme") === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
    }

    showLoading(); 
    await hassasAyarlariYukle(); 

    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            console.log("Oturum açık:", user.email);
            isAdmin = true;

            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
            document.getElementById('persTalepArea').style.display = 'none';

            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('appMain').style.display = 'block'; 

            checkUrlActions();
            veriyiBuluttanYukleVeCiz();
            izinleriBuluttanCek();
        } else {
            hideLoading(); 
        }
    });

    anlikSenkronizasyonBaslat();
    talepleriYukle(); 
};
