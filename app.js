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
    RENK_AYRIMI: "RENK AYRIMI",
    SISTEM_SORUMLULARI: "SİSTEM SORUMLULARI",
    UPLINK: "24TV - 360TV UPLINK",
    RESIM_SECICI: "360TV RESİM SEÇİCİ",
    TV_ARSIV: "TV ARŞİV"
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

const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]; const PREFIX = ""; 
const BIRIM_RENKLERI = { 
    [UNITS.YONETMEN]: "#2563eb", [UNITS.SES]: "#7c3aed", [UNITS.KJ]: "#db2777", 
    [UNITS.PLAYOUT]: "#059669", [UNITS.REJI]: "#d97706", [UNITS.MCR24]: "#9333ea", 
    [UNITS.MCR360]: "#9333ea", [UNITS.INGEST]: "#06b6d4", [UNITS.BILGI_ISLEM]: "#4d7c0f", 
    [UNITS.YAYIN_SISTEMLERI]: "#0f766e", [UNITS.ISIK]: "#b45309", [UNITS.DEKOR]: "#4338ca", 
    [UNITS.KAMERAMANLAR]: "#be185d", [UNITS.REKLAM]: "#86198f", [UNITS.YAYIN_YONETMENI]: "#0369a1", 
    [UNITS.GAZETE_ARSIV]: "#a21caf", [UNITS.RENK_AYRIMI]: "#b91c1c",
    [UNITS.SISTEM_SORUMLULARI]: "#334155", [UNITS.UPLINK]: "#0891b2",
    [UNITS.RESIM_SECICI]: "#7c2d12", [UNITS.TV_ARSIV]: "#475569"
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
    haftaSonuYedekler: JSON.parse(localStorage.getItem(PREFIX + "haftaSonuYedekler")) || {}, 
    mcrAyarlari: JSON.parse(localStorage.getItem(PREFIX + "mcrAyarlari")) || { baslangicTarihi: new Date().toISOString().split('T')[0], ofsetler: {} }, 
    geciciGorevler: JSON.parse(localStorage.getItem(PREFIX + "geciciGorevler")) || {},
    logs: JSON.parse(localStorage.getItem(PREFIX + "logs")) || [],
    duyuruMetni: JSON.parse(localStorage.getItem(PREFIX + "duyuruMetni")) || "",
    birimAyarlari: JSON.parse(localStorage.getItem(PREFIX + "birimAyarlari")) || {},
    saatAyarlari: JSON.parse(localStorage.getItem(PREFIX + "saatAyarlari")) || {},
    gorunum: JSON.parse(localStorage.getItem(PREFIX + "gorunum")) || { panelRenk: null, panelYaziRenk: null, isimRenk: null, isimKalinlik: 700 }
};

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
        const meta = (card.getAttribute('data-search') || '').toLocaleLowerCase('tr-TR');
        const visible = (card.innerText || '').toLocaleLowerCase('tr-TR');
        card.style.display = (visible.includes(val) || meta.includes(val)) ? 'block' : 'none';
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
    if(!state.haftaSonuYedekler) state.haftaSonuYedekler = {};

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

function formatTarih(t) {
    if (!t) return "";
    if (t.includes('.')) return t.split('.').reverse().join('-');
    if (t.includes('/')) return t.split('/').reverse().join('-');
    return t; 
}

function otomatikIzinleriTabloyaIsle() {
    let degisiklikVar = false;
    if (!state.personeller || !state.manuelAtamalar) return;
    
    hariciIzinler.forEach(izin => {
        const durum = (izin.durum || "").toLocaleLowerCase('tr-TR');
        if (durum !== 'onaylandı') return;
        
        let basTarih = formatTarih(izin.baslangic_tarihi);
        let bitTarih = formatTarih(izin.bitis_tarihi);
        
        let current = new Date(basTarih);
        let end = new Date(bitTarih);
        
        if (isNaN(current) || isNaN(end)) return;

        let loops = 0;
        while(current <= end && loops < 100) {
            const hKey = getDateKey(getMonday(current));
            let jsDay = current.getDay();
            let gunIdx = (jsDay + 6) % 7;
            const mKey = `${hKey}_${izin.personel_adi}_${gunIdx}`;

            let p = state.personeller.find(x => x.ad === izin.personel_adi);
            if (p && state.manuelAtamalar[mKey] !== SHIFTS.YILLIK) {
                state.manuelAtamalar[mKey] = SHIFTS.YILLIK;
                degisiklikVar = true;
            }
            current.setDate(current.getDate() + 1);
            loops++;
        }
    });
    
    if (degisiklikVar) {
        save();
        tabloyuOlustur();
    }
}

// MANUEL TETİKLENEN GÜNCELLEME FONKSİYONU
async function izinleriGuncelleVeCek() {
    showLoading();
    try {
        const snapshot = await dbIzin.collection('izinler').get();
        hariciIzinler = [];
        snapshot.forEach(doc => {
            hariciIzinler.push(doc.data());
        });
        renderLeaveCalendar();
        otomatikIzinleriTabloyaIsle();
        tabloyuOlustur();
        showToast("✅ İzinler başarıyla güncellendi.", "success");
        logKoy("İzinler manuel olarak çekildi ve güncellendi.");
    } catch (error) {
        console.error("Yıllık izinler çekilirken hata oluştu:", error);
        showToast("Hata: İzinler çekilemedi!", "error");
    } finally {
        hideLoading();
    }
}

function renderLeaveCalendar() {
    const activeList = document.getElementById('activeLeavesList');
    const upcomingList = document.getElementById('upcomingLeavesList');
    if(!activeList || !upcomingList) return;
    activeList.innerHTML = ''; upcomingList.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    let activeCount = 0; let upcomingCount = 0;
    
    hariciIzinler.forEach(izin => {
        const durum = (izin.durum || "").toLocaleLowerCase('tr-TR');
        if(durum !== 'onaylandı') return;
        
        let basTarih = formatTarih(izin.baslangic_tarihi);
        let bitTarih = formatTarih(izin.bitis_tarihi);
        
        const div = document.createElement('li');
        div.style.padding = "8px"; div.style.background = "rgba(128,128,128,0.1)"; div.style.marginBottom = "5px"; div.style.borderRadius = "4px";
        div.innerHTML = `👤 ${izin.personel_adi} <span style="float:right; font-size:10px; background:#e2e8f0; color:#000; padding:2px 4px; border-radius:3px;">${izin.baslangic_tarihi} / ${izin.bitis_tarihi}</span>`;
        
        if(today >= basTarih && today <= bitTarih) {
            activeList.appendChild(div); activeCount++;
        } else if (basTarih > today) {
            upcomingList.appendChild(div); upcomingCount++;
        }
    });
    if(activeCount === 0) activeList.innerHTML = '<li style="color:var(--text); font-weight:normal; font-size:11px;">Şu an yıllık izinde personel bulunmuyor.</li>';
    if(upcomingCount === 0) upcomingList.innerHTML = '<div style="color:var(--text); font-weight:normal; font-size:11px;">Gelecek izin bulunmuyor.</div>';
}function enterSystem(role) { 
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


function v62AtamaKaynagi(pAd, gIdx) {
    try {
        const hKey = getDateKey(currentMonday);
        return state.schedulerV2 && state.schedulerV2.assignmentSource
            ? (state.schedulerV2.assignmentSource[`${hKey}_${pAd}_${gIdx}`] || '')
            : '';
    } catch(e) { return ''; }
}

function v62YedekBilgisi(pAd, gIdx) {
    try {
        const hKey = getDateKey(currentMonday);
        const reps = state.schedulerV2 && state.schedulerV2.mcrReplacements
            ? state.schedulerV2.mcrReplacements[hKey]
            : null;
        if (!reps) return null;
        for (const k of Object.keys(reps)) {
            const r = reps[k];
            if (!r || r.substitute !== pAd) continue;
            const job = Array.isArray(r.jobs) ? r.jobs.find(j => Number(j.day) === Number(gIdx)) : null;
            if (!job) continue;
            return { absent:r.absent, substitute:r.substitute, unit:r.unit, shift:job.shift };
        }
    } catch(e) {}
    return null;
}

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
                let v62Rep = v62YedekBilgisi(p.ad, g);
                let v62RepHtml = v62Rep
                    ? ` <span style="display:inline-block;margin-left:4px;padding:1px 4px;border-radius:4px;background:#f59e0b;color:#111827;font-size:7px;font-weight:900;" title="${v62Rep.absent} yerine izin süresince vekil">↪ ${v62Rep.absent} YERİNE</span>`
                    : "";
                const kartBirim = gecerliBirim || sanalBirim;
                const kartRenk = getBirimColor(kartBirim);
                // Excel'de PLAYOUT altında görevliyse kartta PLAYOUT yazsın; personelin ana birimi etiketi bunu ezmesin.
                if (gecerliBirim && (gecerliBirim.includes("PLAYOUT") || gecerliBirim.includes("KJ"))) masaRozeti = "";
                let searchMeta = `${p.ad} ${gecerliBirim || ''} ${sanalBirim || ''} ${s || ''} ${v62Rep ? v62Rep.absent + ' vekil yedek' : ''}`;

                cellContent += `<div class="birim-card ${ayiriciClass}" data-search="${searchMeta.replace(/"/g,'&quot;')}" style="border-left-color:${kartRenk}; background-color:${kartRenk}15;" ${dragAttr} ${clickAttr}>
                    <span class="birim-tag" style="background:${kartRenk}">${kartBirim}</span>
                    <span class="pers-name">${p.ad}${masaRozeti}${v62RepHtml} ${conflictHtml}</span>
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

                const v62Source = v62AtamaKaynagi(p.ad, g);
                const isCycleOff = (prog[p.ad][g] === SHIFTS.IZIN && v62Source === 'AUTO_V62_CYCLE_LOCK');
                const isIngestEmergencyOff = (prog[p.ad][g] === SHIFTS.IZIN && v62Source === 'AUTO_V62_INGEST_ACIL');
                const izinEtiket = isIngestEmergencyOff ? 'INGEST ACİL İZNİ' : (isCycleOff ? 'DÖNGÜ İZNİ' : (prog[p.ad][g] || 'BOŞ'));
                const birimBadge = gecerliBirim
                    ? ` <span style="font-size:7px;font-weight:900;color:${bColor};">[${gecerliBirim}]</span>`
                    : '';
                const searchMeta = `${p.ad} ${gecerliBirim || ''} ${sanalBirim || ''} ${izinEtiket} ${ft.label}`;

                cellContent += `<div class="birim-card ${ayiriciClass}" data-search="${searchMeta.replace(/"/g,'&quot;')}" style="border-left-color:${bColor};" ${dragAttr} ${clickAttr}>
                    <span class="birim-tag" style="${tBg}">${izinEtiket}</span>
                    <span class="pers-name">${p.ad}${masaRozeti}${birimBadge} <span style="${countStyle}">(${calis[p.ad]}G)</span></span>
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

    adim1_ManuelVeSabitleriYukle();
    let mcrEksikler = adim2_McrVeIngestDonguleri();
    adim2_5_McrEksikleriniDoldur(mcrEksikler);
    adim3_GrupAbcVeKapasite();
    adim4_AkilliHaftasonuKorumasi();
    adim5_HavuzVeGecePuanSistemi();
    adim6_EksikleriKapatVeKaydet();
}

function excelHtmlOlustur() {
    const hKey = getDateKey(currentMonday);
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
        <meta charset="UTF-8">
        <style>
            @page { mso-page-orientation: landscape; }
            table { border-collapse: collapse; font-family: 'Arial', sans-serif; width: 100%; table-layout: fixed; }
            col { width: 190px; }
            td, th { 
                font-family: 'Arial', sans-serif;
                font-size: 7pt;
                font-weight: bold;
                height: 19px; 
                line-height: 14px;
                text-align: center; 
                vertical-align: middle;
                border: 0.5pt solid #000000;
                white-space: normal; 
                word-wrap: break-word; 
            }
            .title { background: #1e293b; color: white; font-size: 12pt; padding:10px; border: 2pt solid #000; }
            .header { background: #f8fafc; color: #1e293b; font-size: 10pt; padding:8px; border: 1pt solid #000; }
            .unit-header {
                font-family: 'Arial', sans-serif;
                font-size: 12pt;
                font-weight: bold;
                color: white;
                border-top: 2.0pt solid #000000;
                border-bottom: 2.0pt solid #000000;
                border-left: 2.0pt solid #000000;
                border-right: 2.0pt solid #000000;
            }
            .first-col { border-right: 1.0pt solid #000000; }
        </style>
    </head>
    <body>
        <table>
            <colgroup><col span="8" width="190"></colgroup>
            <tr><th colspan="8" class="title">TEKNİK PERSONEL ÇALIŞMA LİSTESİ</th></tr>
            <tr><th class="header">SAAT</th>${GUNLER.map(g => `<th class="header">${g.toUpperCase()}</th>`).join('')}</tr>`;
    
    state.birimler.forEach(birim => {
        html += `<tr><td colspan="8" class="unit-header" style="background:${getBirimColor(birim)};">${birim}</td></tr>`;
        
        [...state.saatler, "İZİN"].forEach((s, index) => {
            let pByDay = []; let maxRow = 1;
            
            for(let i=0; i<7; i++) {
                let list = state.personeller.filter(p => {
                    let v = state.manuelAtamalar[`${hKey}_${p.ad}_${i}`];
                    if(s === "İZİN") return p.birim === birim && [SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(v);
                    return p.birim === birim && v === s;
                });
                pByDay[i] = list; if(list.length > maxRow) maxRow = list.length;
            }

            let rowColor = (state.saatAyarlari && state.saatAyarlari[s]) ? state.saatAyarlari[s].renk : (DEFAULT_SHIFT_COLORS[index] || '#ffffff');
            if(s === "İZİN") rowColor = "#fef2f2"; 

            for(let r=0; r<maxRow; r++) {
                html += `<tr>`;
                if(r === 0) html += `<td rowspan="${maxRow}" class="first-col" style="background-color:${rowColor};">${s}</td>`;
                for(let i=0; i<7; i++) {
                    let pName = pByDay[i][r] ? pByDay[i][r].ad : "";
                    html += `<td style="background-color:${rowColor};">${pName}</td>`;
                }
                html += `</tr>`;
            }
        });
    });
    
    html += `</table></body></html>`;
    return html;
}

function excelIndir() {
    const html = excelHtmlOlustur();
    const hKey = getDateKey(currentMonday);
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Vardiya_${hKey}.xls`; a.click();
}

function ulastirmaExcelIndir() {
    const hKey = getDateKey(currentMonday);
    let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
        <meta charset="UTF-8">
        <style>
            table { border-collapse: collapse; font-family: 'Arial', sans-serif; width: 100%; table-layout: fixed; }
            col { width: 200px; }
            td, th { 
                font-family: 'Arial', sans-serif;
                font-size: 8pt; 
                font-weight: bold;
                height: 20px;
                border: 0.5pt solid #000;
                text-align: center; 
                vertical-align: middle; 
                padding: 5px;
                white-space: normal;
                word-wrap: break-word;
            }
            .header-main { background-color: #881337; color: #ffffff; font-size: 14pt; height: 40px; border: 2pt solid #000; }
            .header-day { background-color: #881337; color: #ffffff; font-size: 11pt; height: 30px; border: 1pt solid #000; }
            .time-col { background-color: #881337; color: #ffffff; width: 80px; font-size: 12pt; border: 2pt solid #000; }
            .shift-off { background-color: #fca5a5; color: #000000; }
            .name-box { margin-bottom: 2px; font-size: 10pt; display: block; }
        </style>
    </head>
    <body>
        <table>
            <colgroup><col span="8" width="200"></colgroup>
            <tr>
                <th class="header-main">SAAT</th>
                ${GUNLER.map((g, i) => {
                    let d = new Date(currentMonday);
                    d.setDate(d.getDate() + i);
                    let dateStr = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    return `<th class="header-day">${dateStr}<br>${g.toUpperCase()}</th>`;
                }).join('')}
            </tr>`;

    state.saatler.forEach((s, index) => {
        let bgColor = (state.saatAyarlari && state.saatAyarlari[s]) ? state.saatAyarlari[s].renk : (DEFAULT_SHIFT_COLORS[index] || '#dbeafe');
        let textColor = "#000000";

        html += `<tr>`;
        html += `<td class="time-col">${s.split('–')[0]}<br><span style="font-size:8pt;">${s.split('–')[1]}</span></td>`;

        for(let i=0; i<7; i++) {
            let calisanlar = state.personeller.filter(p => {
                let v = state.manuelAtamalar[`${hKey}_${p.ad}_${i}`];
                if ([SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(v)) return false;
                return v === s;
            });

            calisanlar.sort((a, b) => {
                let birimA = getGecerliBirim(a, i);
                let birimB = getGecerliBirim(b, i);
                return state.birimler.indexOf(birimA) - state.birimler.indexOf(birimB);
            });

            let cellContent = calisanlar.map(p => {
                return `<span class="name-box">${p.ad}</span>`;
            }).join('<br>');

            html += `<td style="background-color:${bgColor}; color:${textColor};">${cellContent}</td>`;
        }
        html += `</tr>`;
    });

    html += `<tr><td class="time-col" style="background-color:#991b1b;">İZİN</td>`;
    for(let i=0; i<7; i++) {
        let izinliler = state.personeller.filter(p => {
            let v = state.manuelAtamalar[`${hKey}_${p.ad}_${i}`];
            return [SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(v);
        });
        
        let cellContent = izinliler.map(p => {
            let v = state.manuelAtamalar[`${hKey}_${p.ad}_${i}`];
            let ek = v === SHIFTS.YILLIK ? " (YILLIK)" : (v === SHIFTS.RAPOR ? " (RAPOR)" : "");
            return `<span class="name-box">${p.ad}${ek}</span>`;
        }).join('<br>');
        
        html += `<td class="shift-off">${cellContent}</td>`;
    }
    html += `</tr>`;

    html += `</table></body></html>`;
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Ulastirma_Listesi_${hKey}.xls`;
    a.click();
}

function toggleAdminPanel() { 
    if(!isAdmin) return;
    const p = document.getElementById("sidePanel"); 
    const o = document.getElementById("panelOverlay"); 
    p.classList.toggle("open"); 
    o.style.display = p.classList.contains("open") ? "block" : "none"; 
    if(p.classList.contains("open")) tabDegistir('personel'); 
}

function tabDegistir(t) { document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden')); document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); document.getElementById('tab-' + t).classList.remove('hidden'); document.getElementById('btn-tab-' + t).classList.add('active'); refreshUI(); }

function bulutaKaydet() { database.ref('vardiya_data').set(state).then(() => showToast("Buluta başarıyla kaydedildi.", "success")).catch(e => showToast("Kayıt Hatası: " + e.message, "error")); }
function buluttanYukle() { 
    if(!isAdmin) return;
    showLoading();
    database.ref('vardiya_data').once('value').then(snap => { 
        if(snap.exists()){ 
            state = snap.val(); 
            verileriGuvenliHaleGetir(); 
            save(); 
            tabloyuOlustur(); 
            refreshUI();
            showToast("Veriler buluttan yüklendi ve ekran güncellendi!", "success");
        } else {
            showToast("Bulutta veri bulunamadı.", "warning");
        }
        hideLoading();
    }).catch(e => {
        hideLoading();
        showToast("Hata: " + e.message, "error");
    }); 
}

function loglariTemizle() {
    if(confirm("Loglar silinsin mi?")) {
        state.logs = [];
        save();
        refreshUI();
    }
}

function istatistikleriHesapla() {
    const hKey = getDateKey(currentMonday);
    let stats = {};
    
    if(!state.personeller) return;
    
    state.personeller.forEach(p => {
        stats[p.ad] = { toplamGun: 0, gece: 0, haftasonu: 0 };
        for(let i=0; i<7; i++) {
            let mKey = `${hKey}_${p.ad}_${i}`;
            let v = state.manuelAtamalar[mKey];
            if(v && ![SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(v)) {
                stats[p.ad].toplamGun++;
                if(v === SHIFTS.GECE) stats[p.ad].gece++;
                if(i >= 5) stats[p.ad].haftasonu++;
            }
        }
    });
    
    let html = "<div style='display:flex; flex-direction:column; gap:10px;'>";
    Object.keys(stats).sort().forEach(ad => {
        const s = stats[ad];
        let percent = (s.toplamGun / 7) * 100;
        let barColor = s.toplamGun >= 6 ? 'var(--danger)' : 'var(--blue)'; 
        
        html += `
        <div style="background:var(--card-bg); padding:10px; border-radius:8px; border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; font-size:11px; font-weight:800; color:var(--text);">
                <span>${ad}</span>
                <span style="color:${barColor}">${s.toplamGun} Gün</span>
            </div>
            <div style="width:100%; background:var(--border); height:8px; border-radius:4px; overflow:hidden;">
                <div style="width:${percent}%; background:${barColor}; height:100%; transition:width 0.8s cubic-bezier(0.4, 0, 0.2, 1);"></div>
            </div>
            <div style="display:flex; justify-content:space-between; margin-top:5px; font-size:10px; color:var(--text); opacity:0.8; font-weight:600;">
                <span>🌙 Gece: ${s.gece}</span>
                <span>🔵 H.Sonu: ${s.haftasonu}</span>
            </div>
        </div>`;
    });
    html += "</div>";
    document.getElementById('istatistikListesi').innerHTML = html;
}

function duyuruGuncelle() {
    const yeniMetin = document.getElementById('adminDuyuruInp').value;
    state.duyuruMetni = yeniMetin;
    save();
    bulutaKaydet(); 
    showToast("Duyuru güncellendi!", "success");
    tabloyuOlustur();
}

function odakModuAc() {
    const ad = prompt("İsminiz nedir? (Tam eşleşme gerekir)");
    if(!ad) {
        document.body.classList.remove('focus-active');
        document.querySelectorAll('.birim-card').forEach(el => el.classList.remove('focused'));
        return;
    }
    
    document.body.classList.add('focus-active');
    document.querySelectorAll('.birim-card').forEach(el => {
        if(el.querySelector('.pers-name').innerText.includes(ad)) {
            el.classList.add('focused');
        } else {
            el.classList.remove('focused');
        }
    });
}

function refreshUI() {
    // Manuel İzin Güncelleme Butonunu Yönetim Paneline Ekle
    const adminTab = document.getElementById("tab-personel"); // Yönetim paneli alanı
    if (adminTab && !document.getElementById('btnIzinGuncelle')) {
        const btn = document.createElement('button');
        btn.id = 'btnIzinGuncelle';
        btn.innerHTML = "🔄 İzinleri Güncelle";
        btn.onclick = izinleriGuncelleVeCek;
        btn.style.cssText = "width:100%; background:var(--blue); color:white; border:none; padding:10px; border-radius:5px; margin-bottom:10px; cursor:pointer;";
        adminTab.prepend(btn);
    }

    document.getElementById("yeniPersBirimSec").innerHTML = state.birimler.map(b => `<option value="${b}">${b}</option>`).join('');
    
    document.getElementById("persListesiAdmin").innerHTML = state.personeller.map((p, i) => {
        let mcrHtml = "";
        if(p.birim && (p.birim.includes("MCR") || p.birim.includes("INGEST"))) {
            mcrHtml = `<div class="mcr-ayarlar" style="background:var(--saat1); border-color:var(--border);">
                <span style="color:var(--text);">${p.birim.includes("INGEST") ? 'INGEST' : 'MCR'} Döngü Ofseti: </span>
                <input type="number" value="${state.mcrAyarlari.ofsetler[p.ad] || 0}" style="width:50px" onchange="mcrOfsetGuncelle('${p.ad}', this.value)">
            </div>`;
        }
        let yuzdeHtml = `<div style="margin-top:5px; font-size:10px;">
            <span style="font-weight:bold; color:var(--text);">Vardiya Öncelik Puanı (%):</span>
            <input type="number" value="${p.yuzde || 0}" style="width:50px; padding:6px; border-radius:4px; border:1px solid var(--border);" onchange="yuzdeGuncelle(${i}, this.value)">
        </div>`;
        
        if(!p.uzmanlik) p.uzmanlik = [];
        let uzmanlikHtml = `
        <div style="margin-top:5px; font-size:10px; background:var(--bg); padding:8px; border-radius:4px; border:1px solid var(--border);">
            <span style="font-weight:bold; color:var(--text);">UZMANLIK BİLGİSİ (Değişim/Swap İçin):</span><br>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">
                <label><input type="checkbox" ${p.uzmanlik.includes("PLAYOUT")?'checked':''} onchange="uzmanlikGuncelle('${p.ad}', 'PLAYOUT', this.checked)"> Playout</label>
                <label><input type="checkbox" ${p.uzmanlik.includes("KJ")?'checked':''} onchange="uzmanlikGuncelle('${p.ad}', 'KJ', this.checked)"> KJ</label>
                <label><input type="checkbox" ${p.uzmanlik.includes("24 MCR")?'checked':''} onchange="uzmanlikGuncelle('${p.ad}', '24 MCR', this.checked)"> 24 MCR</label>
                <label><input type="checkbox" ${p.uzmanlik.includes("360 MCR")?'checked':''} onchange="uzmanlikGuncelle('${p.ad}', '360 MCR', this.checked)"> 360 MCR</label>
                <label><input type="checkbox" ${p.uzmanlik.includes("INGEST")?'checked':''} onchange="uzmanlikGuncelle('${p.ad}', 'INGEST', this.checked)"> INGEST</label>
            </div>
        </div>`;

        return `<div style="background:var(--card-bg); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:5px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span><strong style="color:var(--text);">${p.ad}</strong> <small style="color:var(--text); opacity:0.6;">(${p.birim})</small></span>
                <button onclick="state.personeller.splice(${i},1); save(); refreshUI(); tabloyuOlustur(); showToast('Personel silindi', 'info');" style="color:var(--danger); border:none; background:none; cursor:pointer;">Sil</button>
            </div>
            <div style="margin-top:5px;">${GUNLER.map((g, gi) => `<span class="izin-gun-pill ${p.izinGunleri?.includes(gi)?'active':''}" onclick="izinGunuTetikle(${i},${gi})">${g}</span>`).join('')}</div>
            ${yuzdeHtml}
            ${uzmanlikHtml}
            ${mcrHtml}
        </div>`;
    }).join('');
    
    const optionsHtml = "<option value=''>Seçiniz...</option>" + state.personeller.sort((a,b) => a.ad.localeCompare(b.ad)).map(p => `<option value="${p.ad}">${p.ad} (${p.birim})</option>`).join('');
    
    const swapKaynak = document.getElementById('swapKaynakPersonel');
    const swapHedef = document.getElementById('swapHedefPersonel');
    if(swapKaynak) swapKaynak.innerHTML = optionsHtml;
    if(swapHedef) swapHedef.innerHTML = optionsHtml;
    
    const yillikSel = document.getElementById('yillikIzinPersonel');
    if(yillikSel) yillikSel.innerHTML = optionsHtml;

    const transferPers = document.getElementById('transferPersSecim');
    const transferBirim = document.getElementById('transferBirimSecim');
    const takas1 = document.getElementById('takasPers1');
    const takas2 = document.getElementById('takasPers2');
    
    if(transferPers) transferPers.innerHTML = optionsHtml;
    if(takas1) takas1.innerHTML = optionsHtml;
    if(takas2) takas2.innerHTML = optionsHtml;
    if(transferBirim) transferBirim.innerHTML = "<option value=''>Birim Seçiniz...</option>" + state.birimler.map(b => `<option value="${b}">${b}</option>`).join('');

    if(!state.geciciGorevler) state.geciciGorevler = {};
    let degisimHtml = "<strong style='color:var(--text);'>Aktif Değişimler (Bu Hafta):</strong><br>";
    let hasDegisim = false;
    Object.keys(state.geciciGorevler).forEach(k => {
        const [dateStr, pName] = k.split('_');
        const targetUnit = state.geciciGorevler[k];
        let d = new Date(dateStr);
        let nextMonday = new Date(currentMonday); nextMonday.setDate(nextMonday.getDate() + 7);
        
        if(d >= currentMonday && d < nextMonday) {
            degisimHtml += `<div style="font-size:10px; border-bottom:1px solid var(--border); padding:4px; color:var(--text);">📅 ${dateStr} - <b>${pName}</b> ➡️ ${targetUnit}</div>`;
            hasDegisim = true;
        }
    });
    document.getElementById("aktifDegisimlerListesi").innerHTML = hasDegisim ? degisimHtml : `<div style='font-size:10px; color:var(--text); opacity:0.6;'>Bu hafta için günlük aktif değişim yok.</div>`;

    if(state.logs) {
        document.getElementById('logListesi').innerHTML = state.logs.map(l => 
            `<div class="log-item"><span style="color:var(--text);">${l.mesaj} <br><i style="color:var(--text); opacity:0.6;">(${l.user})</i></span> <span class="log-time">${l.zaman}</span></div>`
        ).join('');
    }

    document.getElementById('adminDuyuruInp').value = state.duyuruMetni || "";

    let capHtml = ""; state.birimler.forEach(b => { 
        capHtml += `<div style="margin-bottom:15px; background:var(--card-bg); padding:10px; border-radius:8px; border:1px solid var(--border)"><strong style="color:var(--text);">${b}</strong>`; 
        state.saatler.forEach(s => { 
            const v = state.kapasite[`${b}_${s}`] || [0,0,0,0,0,0,0]; 
            capHtml += `<div style="font-size:9px; margin-top:5px; color:var(--text); opacity:0.8;">${s}</div><div style="display:grid; grid-template-columns:repeat(7,1fr); gap:2px;">
            ${GUNLER.map((g, gi) => {
                let d = new Date(currentMonday); d.setDate(d.getDate() + gi);
                let dateStr = d.toLocaleDateString('tr-TR', {day:'numeric', month:'numeric'});
                return `<div style="text-align:center;"><small style="font-size:8px; color:var(--text);">${g} <br>${dateStr}</small><input type="number" value="${v[gi]}" style="width:100%; text-align:center; padding:4px; font-weight:bold;" onchange="capUp('${b}_${s}',${gi},this.value)"></div>`;
            }).join('')}
            </div>`; 
        }); 
        capHtml += `</div>`; 
    });
    document.getElementById("kapasiteTable").innerHTML = capHtml;
    
    let mcrSistemHtml = `<div style="background:var(--saat1); padding:10px; border-radius:8px; margin-bottom:10px;">
        <strong style="color:var(--text);">MCR/INGEST Döngü Başlangıç Tarihi:</strong><br>
        <input type="date" value="${state.mcrAyarlari.baslangicTarihi}" onchange="state.mcrAyarlari.baslangicTarihi = this.value; save();" style="width:100%; padding:8px; margin-top:5px;">
    </div>`;
    
    document.getElementById("sabitListeAdmin").innerHTML = mcrSistemHtml + `
        <div style="font-size:10px; line-height:1.45; margin:8px 0 10px; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text);">
            <b>Hafta içi sabit personel:</b> Pzt-Cum seçilen sabit saatte çalışır; Cmt-Paz varsayılan olarak HARD İZİNLİDİR.<br>
            <b>Hafta sonu kapasite yedeği</b> işaretli olanlar sadece normal uygun personelle kapasite dolmuyorsa son çare olarak kullanılabilir.
        </div>` + state.personeller.filter(p => p.birim && !p.birim.includes("MCR") && !p.birim.includes("INGEST")).map(p => {
        const sabit = !!state.haftaIciSabitler[p.ad];
        const yedek = !!state.haftaSonuYedekler[p.ad];
        return `<div style="display:grid; grid-template-columns:minmax(180px,1fr) minmax(130px,180px); gap:6px 10px; align-items:center; margin-bottom:5px; background:var(--card-bg); padding:8px; border-radius:5px; border:1px solid var(--border);">
            <label style="color:var(--text);"><input type="checkbox" ${sabit?'checked':''} onchange="sabitTetikle('${p.ad}')"> ${p.ad}</label>
            <select onchange="sabitSaatGuncelle('${p.ad}', this.value)" ${!sabit?'disabled':''}>${state.saatler.map(s => `<option value="${s}" ${state.haftaIciSabitler[p.ad] === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
            <label style="grid-column:1 / -1; font-size:10px; color:var(--text); opacity:${sabit?'1':'0.45'};"><input type="checkbox" ${yedek?'checked':''} ${!sabit?'disabled':''} onchange="haftaSonuYedekTetikle('${p.ad}', this.checked)"> Cmt/Paz kapasite yedeği olabilir (son çare)</label>
        </div>`;
    }).join('');
    
    document.getElementById("birimListesiAdmin").innerHTML = `
        <div style="margin-bottom:10px; display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
            <input type="text" id="yeniBirimInp" placeholder="Yeni Birim Adı" style="flex:1; min-width:120px;">
            <input type="color" id="yeniBirimRenk" value="#3b82f6" title="Birim Rengi">
            <select id="yeniBirimTipi">
                <option value="HAVUZ">Standart (Havuz)</option>
                <option value="GECE_ONCELIKLI">🌙 Gece Öncelikli (Puanlı)</option>
                <option value="DONGU8">MCR Tipi (8'li Döngü)</option>
                <option value="DONGU6">Ingest Tipi (6'lı Döngü)</option>
                <option value="GRUP_ABC">3'lü Grup (Playout/Ses/KJ)</option>
                <option value="AKILLI_HAFTASONU">Akıllı Haftasonu (Cuma Korumalı)</option>
            </select>
            <button onclick="birimEkle()" class="btn-main-action" style="background:var(--success); padding:8px 12px;">EKLE</button>
        </div>
        <div style="margin-top:5px; font-size:10px; color:var(--text); opacity:0.7; margin-bottom:10px;">
            * <b>Standart:</b> Kapasiteye göre boş olanı atar<br>
            * <b>Döngü:</b> 7/24 Sıralı sistem<br>
            * <b>3'lü Grup:</b> Sabah/Akşam/İzin grubu (Playout mantığı)
        </div>
        ${state.birimler.map((b, i) => {
            let ayar = state.birimAyarlari[b] || {tip:"HAVUZ", renk:"#3b82f6"};
            let tipYazi = ayar.tip === "DONGU8" ? "8'li Döngü" : 
                         (ayar.tip === "DONGU6" ? "6'lı Döngü" : 
                         (ayar.tip === "GRUP_ABC" ? "3'lü Grup" : 
                         (ayar.tip === "AKILLI_HAFTASONU" ? "Akıllı H.Sonu" : 
                         (ayar.tip === "GECE_ONCELIKLI" ? "Gece Puanlı" : "Standart"))));
            return `
            <div style="padding:8px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--card-bg); border-left: 5px solid ${getBirimColor(b)}">
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="color" value="${getBirimColor(b)}" onchange="birimRenkGuncelle('${b}', this.value)" style="width:25px; height:25px; padding:0; border:none; border-radius:4px; cursor:pointer;" title="Birim Rengini Değiştir">
                    <div>
                        <span style="font-weight:bold; color:var(--text);">${b}</span>
                        <span style="font-size:9px; background:var(--border); color:var(--text); padding:2px 4px; border-radius:3px; margin-left:5px;">${tipYazi}</span>
                    </div>
                </div>
                <button onclick="birimSil(${i})" style="background:var(--danger); color:white; border:none; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:10px;">Sil</button>
            </div>`;
        }).join('')}`;

    document.getElementById("saatListesiAdmin").innerHTML = `
        <div style="margin-bottom:10px; display:flex; gap:5px;">
            <input type="text" id="yeniSaatInp" placeholder="Örn: 10:00–19:00" style="flex:1;">
            <button onclick="saatEkle()" class="btn-main-action" style="background:var(--success); padding:5px 10px;">EKLE</button>
        </div>
        ${state.saatler.map((s, i) => {
            let mevcutRenk = (state.saatAyarlari && state.saatAyarlari[s]) ? state.saatAyarlari[s].renk : "#ffffff";
            return `
            <div style="padding:8px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--card-bg);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="color" value="${mevcutRenk}" onchange="saatRenkGuncelle('${s}', this.value)" title="Saat Rengini Değiştir">
                    <span style="color:var(--text);">${s}</span>
                </div>
                <button onclick="saatSil(${i})" style="background:var(--danger); color:white; border:none; border-radius:4px; padding:2px 6px; cursor:pointer; font-size:10px;">Sil</button>
            </div>
        `}).join('')}`;
}

function saatRenkGuncelle(saat, renk) {
    if(!state.saatAyarlari) state.saatAyarlari = {};
    if(!state.saatAyarlari[saat]) state.saatAyarlari[saat] = {};
    
    state.saatAyarlari[saat].renk = renk;
    save();
    refreshUI(); 
    tabloyuOlustur(); 
}

function vardiyaBul(pAd, gIdx) {
    const hKey = getDateKey(currentMonday);
    const mKey = `${hKey}_${pAd}_${gIdx}`;
    if (state.manuelAtamalar[mKey]) return state.manuelAtamalar[mKey];
    const p = state.personeller.find(pers => pers.ad === pAd);
    if (!p) return null;
    const mcrDongu = [SHIFTS.SABAH, SHIFTS.SABAH, SHIFTS.AKSAM, SHIFTS.AKSAM, SHIFTS.GECE, SHIFTS.GECE, SHIFTS.IZIN, SHIFTS.IZIN];
    const ingestDongu = [SHIFTS.SABAH, SHIFTS.SABAH, SHIFTS.AKSAM, SHIFTS.AKSAM, SHIFTS.IZIN, SHIFTS.IZIN];
    const baseDate = new Date(state.mcrAyarlari.baslangicTarihi);
    let d = new Date(currentMonday);
    d.setDate(d.getDate() + gIdx);
    
    const birimAyar = state.birimAyarlari[p.birim];
    if (birimAyar && (birimAyar.tip === "DONGU8" || birimAyar.tip === "DONGU6")) {
        const persOfset = parseInt(state.mcrAyarlari.ofsetler[p.ad] || 0);
        const loopArr = (birimAyar.tip === "DONGU8") ? mcrDongu : ingestDongu;
        const modVal = loopArr.length;
        const diffDays = Math.floor((d - baseDate) / (1000 * 60 * 60 * 24));
        return loopArr[((diffDays + persOfset) % modVal + modVal) % modVal];
    }
    
    if (state.haftaIciSabitler[p.ad] && gIdx < 5) return state.haftaIciSabitler[p.ad];
    return null;
}

function kaliciTransferYap() {
    const pAd = document.getElementById('transferPersSecim').value;
    const yBirim = document.getElementById('transferBirimSecim').value;
    if(!pAd || !yBirim) { showToast("Lütfen personel ve birim seçin.", "warning"); return; }
    
    const p = state.personeller.find(x => x.ad === pAd);
    if(p) {
        saveStateToHistory();
        p.birim = yBirim;
        save(); bulutaKaydet(); tabloyuOlustur(); refreshUI();
        showToast(`${pAd} personeli kalıcı olarak ${yBirim} birimine transfer edildi!`, "success");
        logKoy(`${pAd} -> ${yBirim} kalıcı transfer.`);
    }
}

function karsilikliTakasYap() {
    const p1Ad = document.getElementById('takasPers1').value;
    const p2Ad = document.getElementById('takasPers2').value;
    if(!p1Ad || !p2Ad || p1Ad === p2Ad) { showToast("Farklı iki personel seçin.", "warning"); return; }
    
    const p1 = state.personeller.find(x => x.ad === p1Ad);
    const p2 = state.personeller.find(x => x.ad === p2Ad);
    
    if(p1 && p2) {
        saveStateToHistory();
        
        let tempBirim = p1.birim;
        p1.birim = p2.birim;
        p2.birim = tempBirim;
        
        const hKey = getDateKey(currentMonday);
        for(let i=0; i<7; i++) {
            let k1 = `${hKey}_${p1.ad}_${i}`;
            let k2 = `${hKey}_${p2.ad}_${i}`;
            let v1 = state.manuelAtamalar[k1];
            let v2 = state.manuelAtamalar[k2];
            
            if(v2) state.manuelAtamalar[k1] = v2; else delete state.manuelAtamalar[k1];
            if(v1) state.manuelAtamalar[k2] = v1; else delete state.manuelAtamalar[k2];
        }
        
        save(); bulutaKaydet(); tabloyuOlustur(); refreshUI();
        showToast(`${p1Ad} ve ${p2Ad} başarıyla takas edildi!`, "success");
        logKoy(`${p1Ad} ile ${p2Ad} karşılıklı takas edildi.`);
    }
}

function degisimiUygula() {
    saveStateToHistory(); 
    const pKaynakAd = document.getElementById('swapKaynakPersonel').value; 
    const pHedefAd = document.getElementById('swapHedefPersonel').value;   
    if(!pKaynakAd || !pHedefAd) { showToast("Lütfen iki personeli de seçiniz.", "warning"); return; }
    if(pKaynakAd === pHedefAd) { showToast("Aynı personeli seçemezsiniz.", "warning"); return; }

    const checkKaynak = state.personeller.find(p => p.ad === pKaynakAd);
    const checkHedef = state.personeller.find(p => p.ad === pHedefAd);
    if(checkKaynak && checkHedef) {
        const hedefBirim = checkKaynak.birim;
        let reqUzmanlik = null;
        
        if(hedefBirim.includes("PLAYOUT")) reqUzmanlik = "PLAYOUT";
        else if(hedefBirim.includes("KJ")) reqUzmanlik = "KJ";
        else if(hedefBirim.includes("24TV MCR") || hedefBirim.includes("24 TV MCR")) reqUzmanlik = "24 MCR";
        else if(hedefBirim.includes("360TV MCR") || hedefBirim.includes("360 TV MCR")) reqUzmanlik = "360 MCR";

        if(reqUzmanlik && (!checkHedef.uzmanlik || !checkHedef.uzmanlik.includes(reqUzmanlik))) {
            showToast(`⚠️ HATA: ${pHedefAd} personelinin ${reqUzmanlik} uzmanlığı yok! Değişim engellendi.`, "error");
            return;
        }
    }

    const checkboxes = document.querySelectorAll('.swap-day-cb:checked');
    if(checkboxes.length === 0) { showToast("Lütfen en az bir gün seçiniz.", "warning"); return; }
    const selectedDays = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a,b) => a-b);
    const hKey = getDateKey(currentMonday);
    for (let gunIdx of selectedDays) {
        let hedefVardiya = vardiyaBul(pKaynakAd, gunIdx);
        if (hedefVardiya && [SHIFTS.SABAH, SHIFTS.GUNDUZ, SHIFTS.OGLEN].includes(hedefVardiya)) {
            let prevVardiya = null;
            if (gunIdx > 0) {
                 prevVardiya = vardiyaBul(pHedefAd, gunIdx - 1);
            } else {
                 let prevDate = new Date(currentMonday); prevDate.setDate(prevDate.getDate() - 1);
                 let prevHKey = getDateKey(getMonday(prevDate));
                 let prevKey = `${prevHKey}_${pHedefAd}_6`; 
                 prevVardiya = state.manuelAtamalar[prevKey];
            }
            if (prevVardiya && [SHIFTS.AKSAM, SHIFTS.GECE].includes(prevVardiya)) {
                 showToast(`⚠️ KURAL İHLALİ: ${pHedefAd} personeli dün (${prevVardiya}) çalışıyor. İşlem iptal edildi.`, "error");
                 return; 
            }
        }
    }
    selectedDays.forEach(gunIdx => {
         const pKaynak = state.personeller.find(p => p.ad === pKaynakAd);
         const hedefBirim = pKaynak.birim;
         let d = new Date(currentMonday); d.setDate(d.getDate() + gunIdx);
         const dateKey = getDateKey(d);
         const gKey = `${dateKey}_${pHedefAd}`;
         if(!state.geciciGorevler) state.geciciGorevler = {};
         state.geciciGorevler[gKey] = hedefBirim;
         const kLeaving = `${hKey}_${pKaynakAd}_${gunIdx}`;
         const kEntering = `${hKey}_${pHedefAd}_${gunIdx}`;
         let shift = vardiyaBul(pKaynakAd, gunIdx);
         if (shift && shift !== SHIFTS.IZIN && shift !== SHIFTS.BOS && shift !== SHIFTS.RAPOR) { state.manuelAtamalar[kEntering] = shift; }
         state.manuelAtamalar[kLeaving] = SHIFTS.IZIN;
    });
    const lastDayIdx = selectedDays[selectedDays.length - 1];
    let returnDate = new Date(currentMonday); returnDate.setDate(returnDate.getDate() + lastDayIdx + 1); 
    const rHKey = getDateKey(getMonday(returnDate));
    const rDayIdx = (returnDate.getDay() + 6) % 7;
    const returnKey = `${rHKey}_${pHedefAd}_${rDayIdx}`;
    state.manuelAtamalar[returnKey] = SHIFTS.IZIN;
    save();
    showToast("✅ Değişim başarıyla uygulandı.", "success");
    logKoy(`${pKaynakAd} <-> ${pHedefAd} Günlük SWAP işlemi yapıldı.`);
    refreshUI();
    tabloyuOlustur();
    document.querySelectorAll('.swap-day-cb').forEach(cb => cb.checked = false);
    document.getElementById('swapKaynakPersonel').value = "";
    document.getElementById('swapHedefPersonel').value = "";
}

function tumDegisimleriTemizle() {
    if(confirm("Tüm geçici birim değişiklikleri silinecek. Emin misiniz?")) {
        saveStateToHistory(); 
        state.geciciGorevler = {};
        save();
        refreshUI();
        tabloyuOlustur();
        showToast("Geçici görevler temizlendi.", "info");
    }
}

function cikisYap() {
    firebase.auth().signOut().then(() => {
        location.reload(); 
    });
}

function arsivleVeTemizle() {
    if(!isAdmin) return;
    if(!confirm("⚠️ DİKKAT: 30 günden eski tüm vardiya verileri silinecek ve sistem hızlandırılacak.\n\nBu işlem performansı artırır. Önce otomatik yedek alınacak.\n\nDevam edilsin mi?")) return;
    jsonYedekAl();
    const bugun = new Date();
    const sinirTarih = new Date();
    sinirTarih.setDate(bugun.getDate() - 30); 
    let silinenSayisi = 0;
    Object.keys(state.manuelAtamalar).forEach(key => {
        const tarihStr = key.split('_')[0]; 
        const kayitTarihi = new Date(tarihStr);
        if(kayitTarihi < sinirTarih) {
            delete state.manuelAtamalar[key];
            silinenSayisi++;
        }
    });
    if(state.geciciGorevler) {
        Object.keys(state.geciciGorevler).forEach(key => {
             const tarihStr = key.split('_')[0];
             const kayitTarihi = new Date(tarihStr);
             if(kayitTarihi < sinirTarih) {
                 delete state.geciciGorevler[key];
                 silinenSayisi++;
             }
        });
    }
    save();
    bulutaKaydet(); 
    logKoy(`Sistem temizliği yapıldı. ${silinenSayisi} kayıt silindi.`);
    alert(`✅ TEMİZLİK VE ARŞİVLEME TAMAMLANDI.\n\nToplam ${silinenSayisi} eski kayıt sistemden silindi.\nUygulama artık daha hızlı çalışacak.`);
    tabloyuOlustur();
}

function mcrOfsetGuncelle(ad, val) { if(!state.mcrAyarlari.ofsetler) state.mcrAyarlari.ofsetler = {}; state.mcrAyarlari.ofsetler[ad] = parseInt(val); save(); showToast("Döngü güncellendi.", "info"); }
function yuzdeGuncelle(idx, val) { state.personeller[idx].yuzde = val; save(); showToast("Puan güncellendi.", "info"); } 
function whatsappGonder() { const hKey = getDateKey(currentMonday); let m = `*📅 ${currentMonday.toLocaleDateString('tr-TR')} VARDİYASI*\n\n`; GUNLER.forEach((g, i) => { m += `*${g.toUpperCase()}*\n`; state.saatler.forEach(s => { let pList = state.personeller.filter(p => state.manuelAtamalar[`${hKey}_${p.ad}_${i}`] === s).map(p => p.ad).join(", "); if (pList) m += `• ${s}: ${pList}\n`; }); m += `\n`; }); window.open(`https://wa.me/?text=${encodeURIComponent(m)}`, '_blank'); }
function capUp(k, g, v) { if(!state.kapasite[k]) state.kapasite[k] = [0,0,0,0,0,0,0]; state.kapasite[k][g] = parseInt(v) || 0; save(); }
function izinGunuTetikle(pi, gi) { if(!state.personeller[pi].izinGunleri) state.personeller[pi].izinGunleri = []; const idx = state.personeller[pi].izinGunleri.indexOf(gi); if(idx > -1) state.personeller[pi].izinGunleri.splice(idx, 1); else state.personeller[pi].izinGunleri.push(gi); save(); refreshUI(); }
function haftaDegistir(v) { currentMonday.setDate(currentMonday.getDate() + v); tabloyuOlustur(); }
function personelEkle() { const ad = document.getElementById("yeniPersInp").value.toUpperCase(); const b = document.getElementById("yeniPersBirimSec").value; if(ad){ state.personeller.push({ad, birim:b, izinGunleri:[], yuzde:0}); save(); refreshUI(); document.getElementById("yeniPersInp").value=""; showToast("Personel eklendi.", "success"); } }

function birimEkle() {
    const val = document.getElementById("yeniBirimInp").value.toUpperCase().trim();
    const renk = document.getElementById("yeniBirimRenk").value;
    const tip = document.getElementById("yeniBirimTipi").value;
    
    if(val && !state.birimler.includes(val)) {
        state.birimler.push(val);
        if(!state.birimAyarlari) state.birimAyarlari = {};
        state.birimAyarlari[val] = { tip: tip, renk: renk };
        
        save(); refreshUI(); tabloyuOlustur();
        showToast("Birim eklendi.", "success");
    } else if (state.birimler.includes(val)) {
        showToast("Bu birim zaten mevcut.", "warning");
    }
}
function birimSil(index) {
    if(confirm(state.birimler[index] + " birimini silmek istediğinize emin misiniz?")) {
        const silinen = state.birimler[index];
        state.birimler.splice(index, 1);
        if(state.birimAyarlari && state.birimAyarlari[silinen]) delete state.birimAyarlari[silinen];
        save(); refreshUI(); tabloyuOlustur();
        showToast("Birim silindi.", "info");
    }
}

function saatEkle() {
    const val = document.getElementById("yeniSaatInp").value.trim();
    if(val && !state.saatler.includes(val)) {
        state.saatler.push(val);
        save(); refreshUI(); tabloyuOlustur();
        showToast("Saat eklendi.", "success");
    } else if (state.saatler.includes(val)) {
        showToast("Bu saat zaten mevcut.", "warning");
    }
}
function saatSil(index) {
     if(confirm(state.saatler[index] + " saatini silmek istediğinize emin misiniz?")) {
        state.saatler.splice(index, 1);
        save(); refreshUI(); tabloyuOlustur();
        showToast("Saat silindi.", "info");
    }
}

function drag(e, p, g, s) { 
    if(!isAdmin) return;
    e.dataTransfer.setData("p", p); e.dataTransfer.setData("oldG", g); 
}

function drop(e, ns, ng) { 
    if(!isAdmin) return;
    e.preventDefault(); 
    const p = e.dataTransfer.getData("p"); 
    const hKey = getDateKey(currentMonday);
    saveStateToHistory(); 
    cakismaKontrol(p, ng, ns);
    state.manuelAtamalar[`${hKey}_${p}_${ng}`] = ns === SHIFTS.BOS ? null : ns; 
    save(); 
    logKoy(`${p} için ${GUNLER[ng]} vardiyası değiştirildi: ${ns}`);
    tabloyuOlustur(); 
}

function vardiyaSecimiAc(pAd, gIdx) {
    if(!isAdmin) return;
    let d = new Date(currentMonday);
    d.setDate(d.getDate() + gIdx);
    document.getElementById('modalPersAd').innerText = pAd;
    document.getElementById('modalGunTarih').innerText = `${GUNLER[gIdx]} - ${d.toLocaleDateString('tr-TR')}`;
    
    let curGecici = state.geciciGorevler[`${getDateKey(d)}_${pAd}`] || "";
    
    const btnContainer = document.getElementById('modalVardiyaButonlari');
    let html = "";
    
    state.saatler.forEach(saat => {
        let ikon = "🕒";
        if(saat.includes("06") || saat.includes("07")) ikon = "🌅";
        if(saat.includes("09") || saat.includes("10")) ikon = "☀️";
        if(saat.includes("12") || saat.includes("13")) ikon = "🌞";
        if(saat.includes("16") || saat.includes("15")) ikon = "🌇";
        if(saat.includes("00") || saat.includes("24")) ikon = "🌙";
        
        html += `<button class="modal-btn" onclick="vardiyaAta('${pAd}', ${gIdx}, '${saat}')">
                    <span>${ikon} ${saat}</span>
                 </button>`;
    });
    
    html += `<button class="modal-btn btn-izin" onclick="vardiyaAta('${pAd}', ${gIdx}, '${SHIFTS.IZIN}')">
                <span>🏖️ İZİNLİ (Listeden Çıkar)</span>
             </button>
             <button class="modal-btn btn-izin" style="background:var(--rapor-bg); color:white; border-color:var(--rapor-bg);" onclick="vardiyaAta('${pAd}', ${gIdx}, '${SHIFTS.RAPOR}')">
                <span>🩺 RAPORLU (Listeden Çıkar)</span>
             </button>`;

    html += `<div style="margin-top:15px; border-top:1px solid var(--border); padding-top:10px;">
                <label style="font-size:10px; font-weight:bold; color:var(--text);">🔄 Bu Gün İçin Masayı Değiştir (Geçici):</label>
                <select id="geciciBirimSelect" onchange="geciciBirimAta('${pAd}', ${gIdx}, this.value)" style="width:100%; padding:8px; margin-top:5px; background:var(--card-bg); color:var(--text); border-radius:4px; border:1px solid var(--border);">
                    <option value="">Kendi Masası</option>
                    ${state.birimler.map(b => `<option value="${b}" ${b === curGecici ? 'selected' : ''}>${b}</option>`).join('')}
                </select>
             </div>`;
             
    btnContainer.innerHTML = html;
    
    const modal = document.getElementById('vardiyaDegistirModal');
    modal.style.display = 'flex'; 
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeModal() {
    const modal = document.getElementById('vardiyaDegistirModal');
    if(modal) {
        modal.classList.remove('show'); 
        setTimeout(() => modal.style.display = 'none', 300); 
    }
    const gorunum = document.getElementById('gorunumModal');
    if(gorunum) gorunum.style.display = 'none';
}

function vardiyaAta(pAd, gIdx, vardiya) {
    closeModal(); 
    saveStateToHistory(); 
    cakismaKontrol(pAd, gIdx, vardiya);
    state.manuelAtamalar[`${getDateKey(currentMonday)}_${pAd}_${gIdx}`] = vardiya; 
    save(); 
    logKoy(`${pAd} için ${GUNLER[gIdx]} günü manuel değiştirildi: ${vardiya}`);
    tabloyuOlustur(); 
    showToast(`${pAd} vardiyası güncellendi.`, "success");
}

function toggleTheme() { const t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", t); localStorage.setItem(PREFIX + "theme", t); gorunumAyarlariYukle(); }
function vardiyaSifirla() { if(confirm("Haftayı temizle?")) { saveStateToHistory(); const hKey = getDateKey(currentMonday); Object.keys(state.manuelAtamalar).forEach(k => { if(k.startsWith(hKey)) delete state.manuelAtamalar[k]; }); save(); tabloyuOlustur(); logKoy("Bu haftanın vardiyası sıfırlandı."); showToast("Hafta temizlendi.", "info"); } }
function tamSifirla() { if(confirm("Sıfırla?")) { localStorage.clear(); location.reload(); } }
function jsonYedekAl() { const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state)); const dl = document.createElement('a'); dl.setAttribute("href", dataStr); dl.setAttribute("download", "Yedek.json"); dl.click(); showToast("Yedek indirildi.", "success"); }
async function githubdanYedekYukle() {
const url = "https://raw.githubusercontent.com/ugurbakirtas/vardiya-sistemi/main/ilk_kurulum.json?t=" + new Date().getTime();
if (confirm("Sistem verileri GitHub üzerindeki yedekle değiştirilecek. Onaylıyor musunuz?")) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("GitHub'daki dosya bulunamadı veya erişim engellendi.");
        const data = await response.json();
        state = data;
        save();
        alert("GitHub yedeği başarıyla yüklendi!");
        location.reload();
    } catch (error) {
        console.error(error);
        alert("Hata: " + error.message);
    }
}
}
function sabitTetikle(ad) {
    if(state.haftaIciSabitler[ad]) {
        delete state.haftaIciSabitler[ad];
        if(state.haftaSonuYedekler) delete state.haftaSonuYedekler[ad];
    } else {
        state.haftaIciSabitler[ad] = state.saatler[0];
    }
    save(); refreshUI(); showToast("Sabit değiştirildi.", "info");
}
function sabitSaatGuncelle(ad, saat) { state.haftaIciSabitler[ad] = saat; save(); }
function haftaSonuYedekTetikle(ad, aktif) {
    if(!state.haftaSonuYedekler) state.haftaSonuYedekler = {};
    if(!state.haftaIciSabitler[ad]) { delete state.haftaSonuYedekler[ad]; refreshUI(); return; }
    if(aktif) state.haftaSonuYedekler[ad] = true; else delete state.haftaSonuYedekler[ad];
    save(); refreshUI(); showToast(aktif ? "Hafta sonu kapasite yedeği açıldı." : "Hafta sonu kapasite yedeği kapatıldı.", "info");
}

function anlikSenkronizasyonBaslat() {
    database.ref('vardiya_data').on('value', (snap) => {
        try {
            if (snap.exists()) {
                state = snap.val();
            }
            verileriGuvenliHaleGetir();
            if (window.SchedulerV2 && typeof window.SchedulerV2.applyExternalAnnualLocks === 'function') {
                window.SchedulerV2.applyExternalAnnualLocks(hariciIzinler, {reoptimize:false});
            }
            tumArayuzuCiz();
            save();
            console.log("Sistem: Veriler eşitlendi.");
        } catch (e) {
            console.error("Veri yükleme hatası:", e);
            showToast("Veri yükleme hatası: " + (e.message || e), "error");
        } finally {
            hideLoading();
        }
    });
}

function mobilListeyiGuncelle() {
    const select = document.getElementById('mobilPersonelSecim');
    let mevcutSecim = select.value;
    
    if(!mevcutSecim) {
        mevcutSecim = localStorage.getItem(PREFIX + 'mobilSecim') || "";
    }
    
    if(state.personeller) {
        const siraliPersonel = [...state.personeller].sort((a,b) => a.ad.localeCompare(b.ad));
        let html = '<option value="">Personel Seçiniz...</option>';
        siraliPersonel.forEach(p => {
            html += `<option value="${p.ad}" ${p.ad === mevcutSecim ? 'selected' : ''}>${p.ad}</option>`;
        });
        select.innerHTML = html;
    }
    
    if(mevcutSecim) kisiselProgramiGoster();
}

async function mobilVerileriYenile() {
    const btn = document.querySelector('#mobilPersonelPanel button');
    const oldText = btn.innerHTML;
    btn.innerHTML = "⏳";
    try {
        const snap = await database.ref('vardiya_data').once('value');
        if (snap.exists()) {
            state = snap.val();
            verileriGuvenliHaleGetir(); 
            save();
            tabloyuOlustur(); 
            showToast("Liste güncellendi.", "success");
        }
    } catch(e) { showToast("Veri çekilemedi: " + e.message, "error"); }
    btn.innerHTML = oldText;
}

function kisiselProgramiGoster() {
    const isim = document.getElementById('mobilPersonelSecim').value;
    const alan = document.getElementById('kisiselListeSonuc');
    
    if(!isim) {
        alan.innerHTML = "<div style='text-align:center; padding:30px; color:var(--text); opacity:0.6;'>Lütfen isminizi seçiniz.</div>";
        localStorage.removeItem(PREFIX + 'mobilSecim'); 
        return;
    }

    localStorage.setItem(PREFIX + 'mobilSecim', isim);

    let html = `<div style="text-align:center; margin-bottom:15px;"><span style="font-size:24px;">👋</span><br><strong style="color:var(--primary); font-size:14px;">Hoş geldin, ${isim}</strong></div>`;

    GUNLER.forEach((gunAdi, index) => {
        let d = new Date(currentMonday);
        d.setDate(d.getDate() + index);
        let tarihStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

        let vardiya = vardiyaBul(isim, index);
        
        if(!vardiya || vardiya === "BOŞ") vardiya = "İZİNLİ";

        let renk = "#eee"; let yaziRengi = "#333"; let ikon = "⚪";
        
        if(vardiya.includes("06:30")) { renk = "#e0f2fe"; yaziRengi = "#0c4a6e"; ikon = "🌅"; }
        else if(vardiya.includes("09:00")) { renk = "#f0fdf4"; yaziRengi = "#064e3b"; ikon = "☀️"; }
        else if(vardiya.includes("12:00")) { renk = "#fef3c7"; yaziRengi = "#b45309"; ikon = "🌞"; }
        else if(vardiya.includes("16:00")) { renk = "#faf5ff"; yaziRengi = "#581c87"; ikon = "🌇"; }
        else if(vardiya.includes("00:00")) { renk = "#fff7ed"; yaziRengi = "#7c2d12"; ikon = "🌙"; }
        else if(vardiya === "İZİNLİ") { renk = "#fef2f2"; yaziRengi = "#ef4444"; ikon = "🏖️"; }
        else if(vardiya === "YILLIK İZİN") { renk = "#9333ea"; yaziRengi = "#ffffff"; ikon = "✈️"; }
        else if(vardiya === "RAPORLU") { renk = "#be123c"; yaziRengi = "#ffffff"; ikon = "🩺"; }

        html += `
        <div class="modern-shift-card">
            <div class="m-date-group">
                <span class="m-day-name">${gunAdi}</span>
                <span class="m-date-text">${tarihStr}</span>
            </div>
            <div class="m-shift-badge" style="background:${renk}; color:${yaziRengi};">
                <span style="font-size:16px;">${ikon}</span>
                <span>${vardiya}</span>
            </div>
        </div>`;
    });

    alan.innerHTML = html;
}

// ============================================================
// V63 SAFE EXCEL IMPORT FIX1
// - Tam haftalık kurum Excel'i ve tek-birim Excel'leri destekler.
// - SİSTEM SORUMLULARI / UPLINK / RESİM SEÇİCİ / TV ARŞİV bölümlerini de tanır.
// - Excel bölüm başlığı o günün GERÇEK görev birimidir.
// - Personelin ana birimini değiştirmez; state.geciciGorevler kullanır.
// - Excel ile içe alınan birimleri yalnız ilgili hafta V62/FIX10 otomasyonundan korur.
// ============================================================
function v63ExcelNormalizeText(value) {
    return String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/[‐‑‒–—―]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function v63ExcelKey(value) {
    return v63ExcelNormalizeText(value)
        .toLocaleUpperCase('tr-TR')
        .replace(/[^0-9A-ZÇĞİÖŞÜ]/g, '');
}

function v63ExcelUnitFromText(value) {
    const raw = v63ExcelNormalizeText(value);
    const k = v63ExcelKey(raw);
    if (!k) return null;

    // Önce state'teki gerçek birim adlarını birebir/karşılıklı kapsama ile eşleştir.
    const known = Array.isArray(state.birimler) ? state.birimler : [];
    const direct = known.find(b => {
        const bk = v63ExcelKey(b);
        return bk && (k === bk || k.includes(bk) || bk.includes(k));
    });
    if (direct) return direct;

    // Kurumsal Excel başlıkları için toleranslı alias'lar.
    if (k.includes('TEKNIKYONETMEN')) return UNITS.YONETMEN;
    if (k.includes('SESOPERATOR')) return UNITS.SES;
    if (k.includes('PLAYOUT') && !k.includes('KJ')) return UNITS.PLAYOUT;
    if (k.includes('KJ') && !k.includes('PLAYOUT')) return UNITS.KJ;
    if (k.includes('INGEST')) return UNITS.INGEST;
    if (k.includes('MCR') && k.includes('360')) return UNITS.MCR360;
    if (k.includes('MCR') && (k.includes('24TV') || k.startsWith('24'))) return UNITS.MCR24;
    if (k.includes('BILGIISLEM')) return UNITS.BILGI_ISLEM;
    if (k.includes('YAYINSISTEM')) return UNITS.YAYIN_SISTEMLERI;
    if (k.includes('ISIK')) return UNITS.ISIK;
    if (k.includes('DEKOR')) return UNITS.DEKOR;
    if (k.includes('KAMERAMAN')) return UNITS.KAMERAMANLAR;
    if (k.includes('REKLAMAKIS')) return UNITS.REKLAM;
    if (k.includes('YAYINYONETMEN')) return UNITS.YAYIN_YONETMENI;
    if (k.includes('GAZETEARSIV')) return UNITS.GAZETE_ARSIV;
    if (k.includes('RENKAYRIM')) return UNITS.RENK_AYRIMI;
    if (k.includes('REJIOPERATOR')) return UNITS.REJI;
    if (k.includes('SISTEMSORUMLU')) return UNITS.SISTEM_SORUMLULARI;
    if (k.includes('UPLINK')) return UNITS.UPLINK;
    if (k.includes('RESIMSECICI')) return UNITS.RESIM_SECICI;
    if (k.includes('TVARSIV')) return UNITS.TV_ARSIV;

    // PLAYOUT + KJ ortak başlığı tek bir fiziksel bölüm değildir; kişi bazında ana birime düşeceğiz.
    if (k.includes('PLAYOUT') && k.includes('KJ')) return '__MIXED_PLAYOUT_KJ__';
    return null;
}

function v63ExcelLooksLikeSectionHeader(row) {
    if (!row || !row.length) return false;
    const a = v63ExcelNormalizeText(row[0]);
    if (!a) return false;
    if (v63ExcelShiftFromText(a)) return false;
    // Bölüm satırlarında B:H genellikle boştur. Bu sayede UPLINK / TV ARŞİV gibi
    // programda tanımlı olmayan başlıklarda önceki bölümün yanlış taşınmasını önleriz.
    const rest = row.slice(1, 8).filter(v => v !== null && v !== undefined && v63ExcelNormalizeText(v) !== '');
    if (rest.length) return false;
    return /[A-ZÇĞİÖŞÜa-zçğıöşü]/.test(a);
}

function v63ExcelShiftFromText(value) {
    const raw = v63ExcelNormalizeText(value);
    if (!raw) return null;
    const tr = raw.toLocaleUpperCase('tr-TR');
    const compact = tr.replace(/\s+/g, '');
    const en = raw.toUpperCase().replace(/\s+/g, '');

    if (compact.includes('YILLIK')) return SHIFTS.YILLIK;
    if (compact.includes('RAPOR')) return SHIFTS.RAPOR;
    if (compact.includes('İZİN') || en.includes('IZIN') || en.includes('OFF')) return SHIFTS.IZIN;

    const canon = raw.replace(/[‐‑‒–—―]/g, '-').replace(/\s+/g, '');
    const exact = (state.saatler || []).find(s => String(s).replace(/[‐‑‒–—―]/g, '-').replace(/\s+/g, '') === canon);
    if (exact) return exact;

    const m = canon.match(/(\d{1,2})[:.](\d{2})-(\d{1,2})[:.](\d{2})/);
    if (!m) return null;
    const sh = Number(m[1]), eh = Number(m[3]);

    // Gece: 00:00 başlangıç veya akşam başlayıp ertesi sabah biten vardiya.
    if (sh === 0 || (sh >= 18 && eh <= 8)) return SHIFTS.GECE;
    if (sh >= 6 && sh <= 8) return SHIFTS.SABAH;
    if (sh >= 9 && sh <= 11) return SHIFTS.GUNDUZ;
    if (sh >= 12 && sh <= 14) return SHIFTS.OGLEN;
    if (sh >= 15 && sh <= 23) return SHIFTS.AKSAM;
    return null;
}

function v63ExcelCleanPersonName(value) {
    let s = v63ExcelNormalizeText(value).toLocaleUpperCase('tr-TR');
    if (!s) return '';
    s = s
        .replace(/\(?\s*\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}\s*\)?/g, ' ')
        .replace(/Y\s*I\s*L\s*L\s*I\s*K\s*İ?\s*Z\s*İ\s*N/gi, ' ')
        .replace(/İ\s*Z\s*İ\s*N\s*L\s*İ/gi, ' ')
        .replace(/İ\s*Z\s*İ\s*N/gi, ' ')
        .replace(/I\s*Z\s*I\s*N/gi, ' ')
        .replace(/R\s*A\s*P\s*O\s*R\s*L\s*U/gi, ' ')
        .replace(/R\s*A\s*P\s*O\s*R/gi, ' ')
        .replace(/\*+/g, ' ')
        .replace(/-{2,}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return s;
}

function v63ExcelFindPerson(value) {
    const cleaned = v63ExcelCleanPersonName(value);
    if (!cleaned) return null;
    const ck = v63ExcelKey(cleaned);
    let p = (state.personeller || []).find(x => v63ExcelKey(x.ad) === ck);
    if (p) return p;

    // Kontrollü tolerans: yalnız tek bir aday kapsama eşleşiyorsa kabul edilir.
    const candidates = (state.personeller || []).filter(x => {
        const pk = v63ExcelKey(x.ad);
        return pk.length >= 5 && ck.length >= 5 && (pk.includes(ck) || ck.includes(pk));
    });
    return candidates.length === 1 ? candidates[0] : null;
}

function v63ExcelDateFromCell(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
    }
    if (typeof value === 'number' && Number.isFinite(value) && window.XLSX && XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
        const p = XLSX.SSF.parse_date_code(value);
        if (p && p.y && p.m && p.d) return new Date(p.y, p.m - 1, p.d, 12, 0, 0, 0);
    }
    if (typeof value === 'string') {
        const s = value.trim();
        let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
        if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0, 0);
        m = s.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
    }
    return null;
}

function v63ExcelDetectDateColumns(rows) {
    let best = null;
    const limit = Math.min(rows.length, 30);
    for (let r = 0; r < limit; r++) {
        const dates = [];
        for (let c = 1; c <= 7; c++) dates.push(v63ExcelDateFromCell((rows[r] || [])[c]));
        const valid = dates.filter(Boolean).length;
        if (valid >= 5 && (!best || valid > best.valid)) best = { rowIndex: r, dates, valid };
    }
    return best;
}

function v63ExcelSheetScore(sheetName, rows, fileName) {
    const nameKey = v63ExcelKey(sheetName);
    let score = 0;
    if (nameKey.includes('HAFTASI') || nameKey.includes('HAFTA')) score += 30;
    if (nameKey.includes('ULASTIRMA')) score -= 40;
    if (nameKey === 'DATA') score -= 60;
    if (v63ExcelDetectDateColumns(rows)) score += 40;
    let headers = 0;
    rows.forEach(row => {
        const u = v63ExcelUnitFromText((row || [])[0]);
        if (u) headers++;
    });
    score += headers * 12;
    if (rows.length > 30) score += 8;
    if (v63ExcelUnitFromText(fileName)) score += 5;
    return score;
}

function v63ExcelMarkExternalUnitWeek(unit, hKey) {
    if (!unit || unit === '__MIXED_PLAYOUT_KJ__') return;
    if (window.SchedulerV2 && typeof window.SchedulerV2.markExternalUnitWeek === 'function') {
        window.SchedulerV2.markExternalUnitWeek(unit, hKey);
        return;
    }
    if (!state.schedulerV2) state.schedulerV2 = {};
    if (!state.schedulerV2.externalUnitWeeks) state.schedulerV2.externalUnitWeeks = {};
    if (!state.schedulerV2.externalUnitWeeks[hKey]) state.schedulerV2.externalUnitWeeks[hKey] = {};
    state.schedulerV2.externalUnitWeeks[hKey][unit] = true;
}

function exceldenVardiyaYukle() {
    const fileInput = document.getElementById('excelUploadInput');
    if (!fileInput || !fileInput.files.length) {
        showToast('Lütfen bir Excel dosyası seçin!', 'warning');
        return;
    }

    if (typeof window.v63Snapshot === 'function') window.v63Snapshot('Excel içe aktarma öncesi');
    else if (typeof saveStateToHistory === 'function') saveStateToHistory();

    const file = fileInput.files[0];
    const fileUnit = v63ExcelUnitFromText(file.name);
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: false });
            if (!workbook.SheetNames || !workbook.SheetNames.length) throw new Error('Excel içinde çalışma sayfası bulunamadı.');

            const candidates = workbook.SheetNames.map(name => {
                const ws = workbook.Sheets[name];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
                return { name, ws, rows, score: v63ExcelSheetScore(name, rows, file.name) };
            }).sort((a,b) => b.score - a.score);

            const chosen = candidates[0];
            const jsonData = chosen.rows;
            const dateInfo = v63ExcelDetectDateColumns(jsonData);
            const dateByCol = {};
            if (dateInfo) {
                for (let c = 1; c <= 7; c++) if (dateInfo.dates[c-1]) dateByCol[c] = dateInfo.dates[c-1];
            }

            let currentUnit = fileUnit || null;
            let currentSection = fileUnit || null;
            let islenenSayisi = 0;
            const excelBirimleri = new Set();
            const importedWeeks = new Set();
            const unmatched = new Set();
            const skippedSections = new Set();
            const ignoredRows = new Set();

            jsonData.forEach((row, rowIndex) => {
                if (!row || !row.length) return;
                const first = v63ExcelNormalizeText(row[0]);
                if (!first) return;

                const detectedUnit = v63ExcelUnitFromText(first);
                if (detectedUnit) {
                    currentUnit = detectedUnit;
                    currentSection = first;
                    return;
                }

                if (v63ExcelLooksLikeSectionHeader(row)) {
                    // Tanımsız bölüm başladıysa önceki bölümün yanlış taşınmasına izin verme.
                    currentUnit = null;
                    currentSection = first;
                    skippedSections.add(first);
                    return;
                }

                const rowShift = v63ExcelShiftFromText(first);
                if (!rowShift) {
                    // DIŞ YAYIN vb. programda karşılığı olmayan satırlar bilinçli olarak atlanır.
                    if (row.slice(1,8).some(v => v63ExcelNormalizeText(v))) ignoredRows.add(first);
                    return;
                }

                for (let c = 1; c <= 7; c++) {
                    const cell = row[c];
                    if (cell === null || cell === undefined || v63ExcelNormalizeText(cell) === '') continue;
                    const personel = v63ExcelFindPerson(cell);
                    if (!personel) {
                        const cleaned = v63ExcelCleanPersonName(cell);
                        if (cleaned) unmatched.add(cleaned);
                        continue;
                    }

                    let cellShift = rowShift;
                    const cellText = v63ExcelNormalizeText(cell);
                    const cellShiftOverride = v63ExcelShiftFromText(cellText);
                    if (cellShiftOverride && /YILLIK|RAPOR|İ\s*Z\s*İ\s*N|IZIN|OFF/i.test(cellText)) cellShift = cellShiftOverride;

                    let dateObj = dateByCol[c] ? new Date(dateByCol[c]) : new Date(currentMonday);
                    if (!dateByCol[c]) dateObj.setDate(dateObj.getDate() + (c - 1));
                    dateObj.setHours(12,0,0,0);
                    const monday = getMonday(dateObj);
                    monday.setHours(12,0,0,0);
                    const hKey = getDateKey(monday);
                    const gunIdx = (dateObj.getDay() + 6) % 7;
                    const dateKey = getDateKey(dateObj);

                    let assignmentUnit = currentUnit;
                    if (assignmentUnit === '__MIXED_PLAYOUT_KJ__') {
                        assignmentUnit = (personel.birim === UNITS.PLAYOUT || personel.birim === UNITS.KJ) ? personel.birim : null;
                    }
                    if (!assignmentUnit) assignmentUnit = fileUnit || null;
                    if (!assignmentUnit && !currentSection) assignmentUnit = personel.birim;
                    if (!assignmentUnit) continue; // Tanımsız bölümde güvenli şekilde atla.

                    const mKey = `${hKey}_${personel.ad}_${gunIdx}`;
                    state.manuelAtamalar[mKey] = cellShift;

                    // KRİTİK: Excel'deki bölüm o tarihteki görev birimidir. Ana birim DEĞİŞMEZ.
                    if (!state.geciciGorevler) state.geciciGorevler = {};
                    state.geciciGorevler[`${dateKey}_${personel.ad}`] = assignmentUnit;

                    v63ExcelMarkExternalUnitWeek(assignmentUnit, hKey);
                    excelBirimleri.add(assignmentUnit);
                    importedWeeks.add(hKey);
                    islenenSayisi++;
                }
            });

            if (!islenenSayisi) {
                showToast('⚠️ Excel okundu ancak eşleşen vardiya bulunamadı. Dosya formatını / personel adlarını kontrol edin.', 'warning');
                return;
            }

            // Excel tarih satırı varsa ekranda dosyanın haftasını aç.
            if (importedWeeks.size) {
                const firstWeek = Array.from(importedWeeks).sort()[0];
                currentMonday = new Date(`${firstWeek}T12:00:00`);
            }

            save();
            tabloyuOlustur();
            if (isAdmin) refreshUI();

            const unitLines = Array.from(excelBirimleri).sort((a,b)=>a.localeCompare(b,'tr'));
            const unmatchedList = Array.from(unmatched).slice(0,12);
            const skippedList = Array.from(skippedSections).slice(0,8);
            const ignoredList = Array.from(ignoredRows).slice(0,8);
            const summary = [
                '✅ Excel başarıyla işlendi.',
                '',
                `Sayfa: ${chosen.name}`,
                `Aktarılan hücre: ${islenenSayisi}`,
                `Hafta: ${Array.from(importedWeeks).sort().join(', ')}`,
                '',
                'Excel görev birimleri:',
                ...unitLines.map(x => `• ${x}`),
                '',
                'Not: Personelin ana birimi değiştirilmedi; Excel bölümüne göre günlük görev birimi işlendi.'
            ];
            if (unmatchedList.length) summary.push('', `Eşleşmeyen personel (${unmatched.size}):`, ...unmatchedList.map(x=>`• ${x}`));
            if (skippedList.length) summary.push('', `Programda tanımlı olmadığı için atlanan bölüm (${skippedSections.size}):`, ...skippedList.map(x=>`• ${x}`));
            if (ignoredList.length) summary.push('', `Karşılığı olmayan satır (${ignoredRows.size}):`, ...ignoredList.map(x=>`• ${x}`));

            alert(summary.join('\n'));
            logKoy(`V63 Excel içe aktarma: ${islenenSayisi} atama / ${unitLines.join(', ')} / sayfa=${chosen.name}`);
            if (typeof window.v63Audit === 'function') window.v63Audit(`Excel işlendi: ${file.name} / ${islenenSayisi} atama`, 'EXCEL');
        } catch (err) {
            console.error('V63 Excel import error:', err);
            showToast('Dosya okuma hatası: ' + (err.message || err), 'error');
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
            // Sayfa açıldığında otomatik 1 kez çekiyoruz
            izinleriGuncelleVeCek();
        } else {
            hideLoading(); 
        }
    });

    anlikSenkronizasyonBaslat();
    talepleriYukle(); 
};

// ============================================================
// V63 SAFE UPGRADE LAYER
// Tek dosyalık, geriye uyumlu yönetim katmanı.
// FIX10/FIX11 scheduler-v2.js DEĞİŞMEZ.
// ============================================================
(function V63SafeUpgrade(global){
    'use strict';

    const V63_VERSION = 'V63-SAFE-UPGRADE-EXCEL1';
    const BACKUP_KEY = 'V63_SAFE_BACKUPS';
    const MAX_BACKUPS = 6;

    global.V63 = global.V63 || {};
    global.V63.version = V63_VERSION;

    function clone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function safeParse(raw, fallback) {
        try { return JSON.parse(raw); } catch(e) { return fallback; }
    }

    function getBackups() {
        return safeParse(localStorage.getItem(BACKUP_KEY) || '[]', []);
    }

    function setBackups(list) {
        try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, MAX_BACKUPS))); } catch(e) { console.warn('V63 backup save:', e); }
    }

    function snapshot(reason) {
        try {
            if (typeof state === 'undefined' || !state) return false;
            const backups = getBackups();
            backups.unshift({
                ts: new Date().toISOString(),
                reason: reason || 'Manuel yedek',
                week: (typeof currentMonday !== 'undefined' && typeof getDateKey === 'function') ? getDateKey(currentMonday) : '',
                state: clone(state)
            });
            setBackups(backups);
            return true;
        } catch(e) {
            console.warn('V63 snapshot error:', e);
            return false;
        }
    }
    global.v63Snapshot = snapshot;

    function audit(message, type='INFO') {
        try {
            if (typeof logKoy === 'function') logKoy(`[${V63_VERSION}/${type}] ${message}`);
        } catch(e) { console.warn(e); }
    }
    global.v63Audit = audit;

    global.v63SonYedegiGeriAl = function() {
        const backups = getBackups();
        if (!backups.length) {
            if (typeof showToast === 'function') showToast('Geri alınacak V63 yedeği yok.', 'warning');
            return false;
        }
        const last = backups[0];
        if (!confirm(`Son yedeğe dönülsün mü?\n\n${last.reason}\n${new Date(last.ts).toLocaleString('tr-TR')}\n\nMevcut yerel durum değişecektir.`)) return false;
        try {
            state = clone(last.state);
            if (typeof verileriGuvenliHaleGetir === 'function') verileriGuvenliHaleGetir();
            if (typeof save === 'function') save();
            if (typeof tumArayuzuCiz === 'function') tumArayuzuCiz();
            audit(`Yerel durum geri alındı: ${last.reason}`, 'ROLLBACK');
            if (typeof showToast === 'function') showToast('✅ Son V63 yedeği geri yüklendi. Canlıya yazmak için ayrıca Buluta Kaydet gerekir.', 'success');
            return true;
        } catch(e) {
            console.error(e);
            if (typeof showToast === 'function') showToast('Yedek geri yüklenemedi: ' + e.message, 'error');
            return false;
        }
    };

    function workShift(v) {
        return !!v && ![SHIFTS.IZIN, SHIFTS.BOS, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(v);
    }

    function currentWeekRows() {
        const hKey = getDateKey(currentMonday);
        const rows = [];
        (state.personeller || []).forEach(p => {
            let workDays = 0;
            for (let g=0; g<7; g++) {
                const shift = (state.manuelAtamalar || {})[`${hKey}_${p.ad}_${g}`] || null;
                if (workShift(shift)) workDays++;
            }
            rows.push({p, workDays});
        });
        return rows;
    }

    function smartWarnings() {
        const out = [];
        const hKey = getDateKey(currentMonday);
        currentWeekRows().forEach(({p,workDays}) => {
            if (workDays >= 6) out.push(`${p.ad}: ${workDays} gün çalışma`);
            for (let g=0; g<7; g++) {
                const shift = (state.manuelAtamalar || {})[`${hKey}_${p.ad}_${g}`] || null;
                if (workShift(shift) && typeof checkVisualConflict === 'function' && checkVisualConflict(p.ad,g,shift)) {
                    out.push(`${p.ad} / ${GUNLER[g]}: dinlenme uyarısı (${shift})`);
                }
            }
        });
        return Array.from(new Set(out));
    }

    async function healthData() {
        const data = {
            online: navigator.onLine,
            firebase: false,
            annual: false,
            annualCount: Array.isArray(global.hariciIzinler) ? global.hariciIzinler.length : (typeof hariciIzinler !== 'undefined' && Array.isArray(hariciIzinler) ? hariciIzinler.length : 0),
            scheduler: global.SchedulerV2 ? global.SchedulerV2.version : 'YÜKLENMEDİ',
            week: getDateKey(currentMonday),
            excelUnits: [],
            warnings: smartWarnings()
        };
        try {
            const snap = await database.ref('.info/connected').once('value');
            data.firebase = snap.val() === true || navigator.onLine;
        } catch(e) { data.firebase = false; }
        try {
            if (typeof dbIzin !== 'undefined' && dbIzin) {
                await dbIzin.collection('izinler').limit(1).get();
                data.annual = true;
            }
        } catch(e) { data.annual = false; }
        try {
            const ext = state.schedulerV2 && state.schedulerV2.externalUnitWeeks && state.schedulerV2.externalUnitWeeks[data.week];
            data.excelUnits = ext ? Object.keys(ext).filter(k => ext[k]) : [];
        } catch(e) {}
        return data;
    }

    global.v63SistemSagligi = async function() {
        const box = document.getElementById('v63HealthOutput');
        if (box) box.innerHTML = '<div style="padding:8px;">Kontrol ediliyor...</div>';
        const h = await healthData();
        const lines = [
            `İnternet: ${h.online ? '✅' : '❌'}`,
            `Firebase RTDB: ${h.firebase ? '✅' : '❌'}`,
            `Yıllık izin kaynağı: ${h.annual ? '✅' : '❌'} (${h.annualCount} kayıt bellekte)`,
            `Scheduler: ${h.scheduler ? '✅ ' + h.scheduler : '❌'}`,
            `Hafta: ${h.week}`,
            `Excel korumalı birimler: ${h.excelUnits.length ? h.excelUnits.join(', ') : 'Yok'}`,
            `Akıllı uyarı: ${h.warnings.length ? h.warnings.length : '0'}`
        ];
        if (box) {
            box.innerHTML = `<pre style="white-space:pre-wrap; margin:0; font-family:inherit; font-size:10px; line-height:1.55;">${lines.join('\n')}</pre>` +
                (h.warnings.length ? `<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border); font-size:10px;">${h.warnings.slice(0,12).map(x=>'⚠️ '+x).join('<br>')}</div>` : '');
        }
        return h;
    };

    global.v63HaftaRaporuIndir = function() {
        if (!global.XLSX) {
            showToast('Excel kütüphanesi yüklenmedi.', 'error');
            return;
        }
        const hKey = getDateKey(currentMonday);
        const rows = [['PERSONEL','ANA BİRİM',...GUNLER.map((g,i)=>{
            const d = new Date(currentMonday); d.setDate(d.getDate()+i); return `${g} ${getDateKey(d)}`;
        })]];
        [...(state.personeller || [])].sort((a,b)=>a.ad.localeCompare(b.ad,'tr')).forEach(p => {
            const r = [p.ad,p.birim];
            for (let g=0;g<7;g++) {
                const d = new Date(currentMonday); d.setDate(d.getDate()+g);
                const shift = (state.manuelAtamalar || {})[`${hKey}_${p.ad}_${g}`] || '';
                const unit = (state.geciciGorevler || {})[`${getDateKey(d)}_${p.ad}`] || p.birim;
                r.push(shift ? `${shift} | ${unit}` : '');
            }
            rows.push(r);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb,ws,'Hafta Raporu');
        XLSX.writeFile(wb,`TURKMEDYA-${hKey}-V63-RAPOR.xlsx`);
        audit(`Hafta raporu indirildi: ${hKey}`, 'RAPOR');
    };

    // Talep Merkezi V2: bekleyenlerin yanında geçmiş durumları da gösterir.
    global.talepleriYukle = function() {
        database.ref('talepler').on('value', snap => {
            const liste = document.getElementById('gelenTaleplerListesi');
            if (!liste) return;
            const items = [];
            if (snap.exists()) snap.forEach(item => items.push(item.val()));
            items.sort((a,b) => String(b.id || '').localeCompare(String(a.id || '')));
            const counts = {bekliyor:0,isleniyor:0,onaylandi:0,reddedildi:0,hata:0};
            items.forEach(t => { const s=String(t.durum||'bekliyor').toLocaleLowerCase('tr-TR'); counts[s]=(counts[s]||0)+1; });
            let html = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:10px;font-size:9px;text-align:center;">
                <div style="padding:6px;border:1px solid var(--border);border-radius:6px;">⏳ ${counts.bekliyor||0}<br>Bekliyor</div>
                <div style="padding:6px;border:1px solid var(--border);border-radius:6px;">⚙️ ${counts.isleniyor||0}<br>İşleniyor</div>
                <div style="padding:6px;border:1px solid var(--border);border-radius:6px;">✅ ${counts.onaylandi||0}<br>Onay</div>
                <div style="padding:6px;border:1px solid var(--border);border-radius:6px;">❌ ${counts.reddedildi||0}<br>Red</div>
                <div style="padding:6px;border:1px solid var(--border);border-radius:6px;">⚠️ ${counts.hata||0}<br>Hata</div>
            </div>`;
            if (!items.length) {
                liste.innerHTML = html + `<p style="text-align:center;padding:20px;opacity:.5;color:var(--text);">Talep bulunmuyor.</p>`;
                return;
            }
            const statusColor = s => s==='onaylandi'?'var(--success)':s==='reddedildi'?'var(--danger)':s==='hata'?'var(--danger)':s==='isleniyor'?'var(--blue)':'var(--warning)';
            items.slice(0,100).forEach(t => {
                const s = String(t.durum || 'bekliyor').toLocaleLowerCase('tr-TR');
                html += `<div style="background:var(--card-bg);border:1px solid var(--border);border-left:5px solid ${statusColor(s)};padding:10px;border-radius:8px;margin-bottom:8px;">
                    <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
                        <div style="font-weight:800;color:var(--primary);font-size:11px;">${t.ad || '-'}</div>
                        <span style="font-size:8px;font-weight:900;padding:3px 6px;border-radius:10px;background:${statusColor(s)};color:white;">${String(t.durum||'bekliyor').toUpperCase()}</span>
                    </div>
                    <div style="font-size:10px;color:var(--text);margin-top:5px;">📅 ${t.tarih || '-'} · 📝 <b>${t.tur || '-'}</b></div>
                    ${t.error ? `<div style="font-size:9px;color:var(--danger);margin-top:4px;">${t.error}</div>` : ''}
                    ${s==='bekliyor' ? `<div style="display:flex;gap:6px;margin-top:8px;"><button onclick="talepIslem('${t.id}','onay')" style="flex:1;background:var(--success);color:#fff;border:none;border-radius:6px;padding:7px;cursor:pointer;font-weight:700;font-size:9px;">ONAYLA</button><button onclick="talepIslem('${t.id}','red')" style="flex:1;background:var(--danger);color:#fff;border:none;border-radius:6px;padding:7px;cursor:pointer;font-weight:700;font-size:9px;">REDDET</button></div>` : ''}
                </div>`;
            });
            liste.innerHTML = html;
        });
    };

    function injectUI() {
        try {
            const sys = document.getElementById('tab-sistem');
            if (sys && !document.getElementById('v63SafePanel')) {
                const div = document.createElement('div');
                div.id = 'v63SafePanel';
                div.style.cssText = 'margin-bottom:15px;border:1px solid var(--blue);padding:10px;border-radius:8px;background:var(--card-bg);';
                div.innerHTML = `<strong style="color:var(--text);">🛡️ ${V63_VERSION}</strong>
                    <div style="font-size:9px;color:var(--text);opacity:.75;margin:5px 0 8px 0;">FIX10/FIX11 scheduler çekirdeğine dokunmadan Excel, yedek, sağlık ve raporlama katmanı.</div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;">
                        <button onclick="v63SistemSagligi()" class="btn-main-action" style="background:var(--blue);font-size:9px;">SİSTEM SAĞLIĞI</button>
                        <button onclick="v63HaftaRaporuIndir()" class="btn-main-action" style="background:var(--success);font-size:9px;">HAFTA RAPORU</button>
                        <button onclick="v63SonYedegiGeriAl()" class="btn-main-action" style="background:var(--warning);color:#111;font-size:9px;">SON YEDEĞE DÖN</button>
                    </div>
                    <div id="v63HealthOutput" style="margin-top:8px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:10px;">Sağlık kontrolü için butona basın.</div>`;
                sys.prepend(div);
            }

            const inp = document.getElementById('excelUploadInput');
            if (inp && !document.getElementById('v63ExcelHint')) {
                const hint = document.createElement('div');
                hint.id = 'v63ExcelHint';
                hint.style.cssText='font-size:9px;color:var(--text);opacity:.8;margin:4px 0 7px 0;line-height:1.4;';
                hint.innerHTML='✅ <b>V63 Excel:</b> Komple haftalık kurum dosyası veya PLAYOUT.xlsx / KJ.xlsx gibi tek-birim dosyası kabul edilir. Excel bölüm başlığı günlük görev birimidir; personelin ana birimi değişmez.';
                inp.parentNode.insertBefore(hint, inp);
            }
        } catch(e) { console.warn('V63 UI inject:',e); }
    }

    function installLateWrappers() {
        if (global.__V63_LATE_WRAPPED) return;
        global.__V63_LATE_WRAPPED = true;

        // V62 üretiminden önce kullanıcı geri dönüş noktası.
        if (typeof global.vardiyaUretVeKaydet === 'function') {
            const oldGenerate = global.vardiyaUretVeKaydet;
            global.vardiyaUretVeKaydet = function() {
                snapshot('Otomatik vardiya üretimi öncesi');
                audit('Otomatik vardiya üretimi başlatıldı', 'SCHEDULER');
                return oldGenerate.apply(this, arguments);
            };
        }

        // Canlı Firebase yazımından önce otomatik yedek. Var olan yayın mantığını değiştirmez.
        if (typeof global.bulutaKaydet === 'function') {
            const oldCloudSave = global.bulutaKaydet;
            global.bulutaKaydet = function() {
                snapshot('Canlı Firebase yayını öncesi');
                audit('Canlı vardiya_data yayını başlatıldı', 'PUBLISH');
                return oldCloudSave.apply(this, arguments);
            };
        }
    }

    global.V63.snapshot = snapshot;
    global.V63.health = healthData;
    global.V63.warnings = smartWarnings;

    setTimeout(injectUI, 50);
    setTimeout(installLateWrappers, 1600); // scheduler-v2.js override'ları tamamlandıktan sonra
    window.addEventListener('load', () => {
        setTimeout(injectUI, 250);
        setTimeout(installLateWrappers, 1800);
    });

    console.log(`[V63] ${V63_VERSION} loaded. FIX10/FIX11 scheduler untouched.`);
})(window);
