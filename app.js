// 🌍 SUNUCU AYARLARI (İleride Render/Vercel'e yükleyince bu adresi değiştireceksin)
const BACKEND_URL = "http://localhost:3000"; 
// 🔒 GÜVENLİK ZIRHI (server.js ile aynı olmak zorunda)
const API_SECRET = "TURKMEDYA_GIZLI_SIFRE_2026"; 

const SHIFTS = {
    SABAH: "06:30–16:00",
    GUNDUZ: "09:00–18:00",
    AKSAM: "16:00–00:00",
    GECE: "00:00–07:00",
    IZIN: "İZİNLİ",
    BOS: "BOŞ",
    YILLIK: "YILLIK İZİN"
};

const UNITS = {
    YONETMEN: "TEKNİK YÖNETMEN",
    SES: "SES OPERATÖRÜ",
    KJ: "KJ OPERATÖRÜ",
    PLAYOUT: "PLAYOUT OPERATÖRÜ",
    REJI: "REJİ",
    MCR24: "24TV MCR OPERATÖRÜ",
    MCR360: "360TV MCR OPERATÖRÜ",
    INGEST: "INGEST OPERATÖRÜ"
};

const DEFAULT_SHIFT_COLORS = [
    "#e0f2fe", 
    "#f0fdf4", 
    "#faf5ff", 
    "#fff7ed"  
];

const firebaseConfig = { apiKey: "AIzaSyBY8dA7IQ0vcdjtG0haRVFuF0vTgZACU0M", authDomain: "teknik-vardiya-listesi.firebaseapp.com", databaseURL: "https://teknik-vardiya-listesi-default-rtdb.europe-west1.firebasedatabase.app", projectId: "teknik-vardiya-listesi", storageBucket: "teknik-vardiya-listesi.firebasestorage.app", messagingSenderId: "900931844150", appId: "1:900931844150:web:41c799492e85d62df8c097" };
firebase.initializeApp(firebaseConfig); const database = firebase.database();
const GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]; const PREFIX = ""; 
const BIRIM_RENKLERI = { [UNITS.YONETMEN]: "#2563eb", [UNITS.SES]: "#7c3aed", [UNITS.KJ]: "#db2777", [UNITS.PLAYOUT]: "#059669", [UNITS.REJI]: "#d97706", [UNITS.MCR24]: "#9333ea", [UNITS.MCR360]: "#9333ea", [UNITS.INGEST]: "#06b6d4" };
let isAdmin = false;

let state = { 
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

let currentMonday = getMonday(new Date());

function verileriGuvenliHaleGetir() {
    if(!state) state = {};
    if(!state.manuelAtamalar) state.manuelAtamalar = {};
    if(!state.geciciGorevler) state.geciciGorevler = {};
    if(!state.personeller) state.personeller = [];
    if(!state.kapasite) state.kapasite = {};
    if(!state.haftaIciSabitler) state.haftaIciSabitler = {};
    if(!state.mcrAyarlari) state.mcrAyarlari = { baslangicTarihi: new Date().toISOString().split('T')[0], ofsetler: {} };
    if(!state.birimler) state.birimler = Object.values(UNITS);
    if(!state.saatler) state.saatler = Object.values(SHIFTS).filter(s => s.includes(":"));
    
    if(!state.birimAyarlari || Object.keys(state.birimAyarlari).length === 0) {
        state.birimAyarlari = {};
        state.birimler.forEach(b => {
            let tip = "HAVUZ";
            let renk = BIRIM_RENKLERI[b] || "#64748b";
            if(b.includes("MCR")) tip = "DONGU8"; 
            if(b.includes("INGEST")) tip = "DONGU6"; 
            if(b === UNITS.PLAYOUT || b === UNITS.SES || b === UNITS.KJ) tip = "GRUP_ABC"; 
            state.birimAyarlari[b] = { tip: tip, renk: renk };
        });
    }
    if(!state.saatAyarlari) state.saatAyarlari = {};
    if(!state.gorunum) state.gorunum = { panelRenk: null, panelYaziRenk: null, isimRenk: null, isimKalinlik: 700 };
}

// 🌟 YENİ: GÜVENLİ GİRİŞ SİSTEMİ 🌟
function enterSystem(role) { 
    if (role === 'admin') { 
        // Artık çirkin "prompt" yok, şık HTML Modal açılacak
        document.getElementById('adminLoginModal').style.display = 'flex';
        setTimeout(() => document.getElementById('adminLoginModal').classList.add('show'), 10);
    } else { 
        isAdmin = false; 
        showLoading(); 
        database.ref('vardiya_data').once('value').then(snap => {
            if(snap.exists()) { 
                 state = snap.val(); 
                 verileriGuvenliHaleGetir(); 
                 save(); 
            }
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none'); 
            document.getElementById('persTalepArea').style.display = 'block'; 
            showToast("Sisteme hoş geldiniz.", "info");
            document.getElementById('loginOverlay').style.opacity = '0'; 
            setTimeout(() => { 
                document.getElementById('loginOverlay').style.display = 'none'; 
                document.getElementById('appMain').style.display = 'block'; 
                tabloyuOlustur(); 
                hideLoading(); 
            }, 500); 
        }).catch(e => {
            hideLoading();
            console.log("Veri çekilemedi: " + e.message); 
        });
    } 
}

// Admin şifre kutusunda "Giriş Yap"a basılınca burası çalışır
async function adminGirisYap() {
    const email = document.getElementById('adminEmail').value;
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
        gorunumAyarlariYukle(); 
        
        // Modalları kapat ve ana sistemi aç
        document.getElementById('adminLoginModal').style.display = 'none';
        document.getElementById('loginOverlay').style.opacity = '0'; 
        setTimeout(() => { 
            document.getElementById('loginOverlay').style.display = 'none'; 
            document.getElementById('appMain').style.display = 'block'; 
            tabloyuOlustur(); 
            hideLoading(); 
            showToast("Yönetici girişi başarılı!", "success"); 
        }, 500); 

    } catch (error) { 
        hideLoading();
        showToast("Hatalı giriş: Şifre veya E-posta yanlış.", "error"); 
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
    const appUrl = window.location.href.split('?')[0]; 
    
    // 🌟 YENİ: TELEGRAM MESAJLARI ARTIK GÜVENLİ SUNUCUYA (server.js) GİDİYOR 🌟
    fetch(`${BACKEND_URL}/send-telegram`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
            secret: API_SECRET, // Güvenlik Şifresi
            text: `🔔 *YENİ VARDİYA TALEBİ*\n\n👤 *Personel:* ${ad}\n📅 *Tarih:* ${tarih}\n📝 *Vardiya:* ${tur}`, 
            reply_markup: { 
                inline_keyboard: [[
                    { text: "✅ SİTEYE GİT VE ONAYLA", url: `${appUrl}?action=onay&id=${talepId}` }, 
                    { text: "❌ SİTEYE GİT VE REDDET", url: `${appUrl}?action=red&id=${talepId}` }
                ]] 
            } 
        }) 
    }).catch(e => console.log("Telegram API Sunucuya Ulaşılamadı."));
    
    showToast("Talebiniz yöneticiye iletildi.", "success"); 
    document.getElementById('talepModal').style.display = 'none'; 
}

function talepleriYukle() { database.ref('talepler').orderByChild('durum').equalTo('bekliyor').on('value', snap => { const liste = document.getElementById('gelenTaleplerListesi'); if(!snap.exists()) { liste.innerHTML = "<p style='text-align:center; padding:20px; opacity:0.5; color:var(--text);'>Bekleyen talep bulunmuyor.</p>"; return; } let html = ""; snap.forEach(item => { const t = item.val(); html += `<div style="background:var(--card-bg); border:1px solid var(--border); border-left:5px solid var(--warning); padding:12px; border-radius:8px; margin-bottom:10px; box-shadow:0 2px 4px rgba(0,0,0,0.05);"><div style="font-weight:800; color:var(--primary); font-size:12px; margin-bottom:4px;">${t.ad}</div><div style="font-size:11px; color:var(--text); margin-bottom:8px;">📅 ${t.tarih} (Hafta: ${t.hKey})<br>📝 İstek: <b>${t.tur}</b></div><div style="display:flex; gap:8px;"><button onclick="talepIslem('${t.id}', 'onay')" style="flex:1; background:var(--success); color:white; border:none; border-radius:6px; padding:8px; cursor:pointer; font-weight:700; font-size:10px;">ONAYLA</button><button onclick="talepIslem('${t.id}', 'red')" style="flex:1; background:var(--danger); color:white; border:none; border-radius:6px; padding:8px; cursor:pointer; font-weight:700; font-size:10px;">REDDET</button></div></div>`; }); liste.innerHTML = html; }); }
function talepIslem(id, tip) { database.ref('talepler/' + id).once('value', snap => { if(!snap.exists()) return; const t = snap.val(); if(tip === 'onay') { saveStateToHistory(); const mKey = `${t.hKey}_${t.ad}_${t.gunIdx}`; state.manuelAtamalar[mKey] = t.tur; save(); currentMonday = new Date(t.hKey); tabloyuOlustur(); database.ref('talepler/' + id).update({ durum: 'onaylandi' }); showToast(`✅ ${t.ad} için talep onaylandı.`, "success"); logKoy(`${t.ad} için talep onaylandı: ${t.tur}`); } else { database.ref('talepler/' + id).update({ durum: 'reddedildi' }); showToast("Talep reddedildi.", "error"); logKoy(`${t.ad} için talep reddedildi.`); } }); }
function getMonday(d) { d = new Date(d); let day = d.getDay(); return new Date(d.setDate(d.getDate() - day + (day == 0 ? -6 : 1))); }

let saveTimeout = null;
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
    refreshUI();
}

function checkVisualConflict(pAd, gIdx, saat) {
    if ([SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK].includes(saat)) return false;
    const hKey = getDateKey(currentMonday);
    
    if (gIdx > 0) {
        let dunKey = `${hKey}_${pAd}_${gIdx - 1}`;
        let dunVardiya = state.manuelAtamalar[dunKey];
        if ([SHIFTS.AKSAM, SHIFTS.GECE].includes(dunVardiya) && [SHIFTS.SABAH, SHIFTS.GUNDUZ].includes(saat)) return true;
    } else {
        let prevDate = new Date(currentMonday); prevDate.setDate(prevDate.getDate() - 1);
        let prevHKey = getDateKey(getMonday(prevDate));
        let dunVardiya = state.manuelAtamalar[`${prevHKey}_${pAd}_6`];
        if ([SHIFTS.AKSAM, SHIFTS.GECE].includes(dunVardiya) && [SHIFTS.SABAH, SHIFTS.GUNDUZ].includes(saat)) return true;
    }

    if (gIdx === 5 && [SHIFTS.SABAH, SHIFTS.GUNDUZ].includes(saat)) {
         let cumaVardiya = state.manuelAtamalar[`${hKey}_${pAd}_4`];
         if ([SHIFTS.AKSAM, SHIFTS.GECE].includes(cumaVardiya)) return true;
    }
    return false;
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

    let prog = {}; let calis = {}; state.personeller.forEach(p => { prog[p.ad] = Array(7).fill(null); calis[p.ad] = 0; for(let i=0; i<7; i++) { let mKey = `${hKey}_${p.ad}_${i}`; if(state.manuelAtamalar[mKey]) prog[p.ad][i] = state.manuelAtamalar[mKey]; if(prog[p.ad][i] && ![SHIFTS.IZIN,SHIFTS.BOS,null,SHIFTS.YILLIK].includes(prog[p.ad][i])) calis[p.ad]++; } });
    
    document.getElementById("tableBody").innerHTML = state.saatler.map((s, sIdx) => { 
        const ozelRenk = (state.saatAyarlari && state.saatAyarlari[s]) ? state.saatAyarlari[s].renk : null;
        const rowStyle = ozelRenk ? `style="background-color:${ozelRenk}"` : ""; 
        
        let rowHtml = `<tr class="row-saat-${sIdx}" ${rowStyle}><td class="saat-col">${s}</td>`; 
        
        for(let g=0; g<7; g++) { 
            let d = new Date(currentMonday); d.setDate(d.getDate() + g); 
            let isToday = (getDateKey(d) === todayKey) ? 'today-col' : '';

            let sortedPers = state.personeller.filter(p => prog[p.ad][g] === s).sort((a, b) => { let birimA = getGecerliBirim(a, g); let birimB = getGecerliBirim(b, g); return state.birimler.indexOf(birimA) - state.birimler.indexOf(birimB); }); 
            let cellContent = ""; let lastBirim = ""; 
            
            sortedPers.forEach((p) => { 
                let gecerliBirim = getGecerliBirim(p, g); 
                let ayiriciClass = (lastBirim !== "" && lastBirim !== gecerliBirim) ? "birim-ayirici" : ""; 
                let clickAttr = isAdmin ? `onclick="vardiyaSecimiAc('${p.ad}',${g})"` : ""; 
                let dragAttr = isAdmin ? `draggable="true" ondragstart="drag(event, '${p.ad}', ${g}, '${s}')"` : ""; 
                
                let isConflict = isAdmin ? checkVisualConflict(p.ad, g, s) : false;
                let conflictHtml = isConflict ? `<span class="conflict-warn" title="Kural İhlali (Dinlenme Yetersiz)">⚠️</span>` : "";

                cellContent += `<div class="birim-card ${ayiriciClass}" style="border-left-color:${getBirimColor(gecerliBirim)}; background-color:${getBirimColor(gecerliBirim)}15;" ${dragAttr} ${clickAttr}><span class="birim-tag" style="background:${getBirimColor(gecerliBirim)}">${gecerliBirim}</span><span class="pers-name">${p.ad} ${conflictHtml}</span></div>`; 
                lastBirim = gecerliBirim; 
            }); 
            rowHtml += `<td class="${g>=5?'weekend-col':''} ${isToday}" data-label="${GUNLER[g]}" ondragover="event.preventDefault()" ondrop="drop(event, '${s}', ${g})">${cellContent}</td>`; 
        } return rowHtml + "</tr>"; 
    }).join('');
    
    document.getElementById("tableFooter").innerHTML = `<tr class="row-izin"><td class="saat-col">İZİN / BOŞ</td>${[0,1,2,3,4,5,6].map(g => { 
        let d = new Date(currentMonday); d.setDate(d.getDate() + g); 
        let isToday = (getDateKey(d) === todayKey) ? 'today-col' : '';

        let sortedPers = state.personeller.filter(p => [SHIFTS.IZIN,SHIFTS.BOS,null,SHIFTS.YILLIK].includes(prog[p.ad][g])).sort((a, b) => { let birimA = getGecerliBirim(a, g); let birimB = getGecerliBirim(b, g); return state.birimler.indexOf(birimA) - state.birimler.indexOf(birimB); }); 
        let cellContent = ""; let lastBirim = ""; 
        sortedPers.forEach(p => { let gecerliBirim = getGecerliBirim(p, g); let ayiriciClass = (lastBirim !== "" && lastBirim !== gecerliBirim) ? "birim-ayirici" : ""; let clickAttr = isAdmin ? `onclick="vardiyaSecimiAc('${p.ad}',${g})"` : ""; let dragAttr = isAdmin ? `draggable="true" ondragstart="drag(event, '${p.ad}', ${g}, 'BOŞ')"` : ""; let isYillik = prog[p.ad][g] === SHIFTS.YILLIK; let bgStyle = isYillik ? 'background:var(--yillik-izin)' : (prog[p.ad][g]===SHIFTS.IZIN?'background:var(--danger)':`background:${getBirimColor(gecerliBirim)}`); let countStyle = calis[p.ad] >= 6 ? 'color:var(--danger); font-weight:bold; font-size:11px;' : 'color:var(--text)'; cellContent += `<div class="birim-card ${ayiriciClass}" style="border-left-color:${getBirimColor(gecerliBirim)};" ${dragAttr} ${clickAttr}><span class="birim-tag" style="${bgStyle}">${prog[p.ad][g] || 'BOŞ'}</span><span class="pers-name">${p.ad} <span style="${countStyle}">(${calis[p.ad]}G)</span></span></div>`; lastBirim = gecerliBirim; }); 
        return `<td class="${g>=5?'weekend-col':''} ${isToday}" data-label="${GUNLER[g]}" ondragover="event.preventDefault()" ondrop="drop(event, 'BOŞ', ${g})">${cellContent}</td>`; 
    }).join('')}</tr>`;
    
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

    istatistikleriHesapla();
    mobilListeyiGuncelle();
    tabloFiltrele();
}

function cakismaKontrol(personelAd, hedefGun, hedefSaat) { const hKey = getDateKey(currentMonday); if ([SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK].includes(hedefSaat)) return; if (hedefGun > 0) { let dunKey = `${hKey}_${personelAd}_${hedefGun - 1}`; let dunVardiya = state.manuelAtamalar[dunKey]; let sabahVardiyalari = [SHIFTS.SABAH, SHIFTS.GUNDUZ]; let aksamVardiyalari = [SHIFTS.AKSAM, SHIFTS.GECE]; if (aksamVardiyalari.includes(dunVardiya) && sabahVardiyalari.includes(hedefSaat)) showToast(`⚠️ DİKKAT: ${personelAd} dün AKŞAM/GECE vardiyasındaydı. Yetersiz dinlenme!`, "warning"); } if (hedefGun < 6) { let yarinKey = `${hKey}_${personelAd}_${hedefGun + 1}`; let yarinVardiya = state.manuelAtamalar[yarinKey]; let sabahVardiyalari = [SHIFTS.SABAH, SHIFTS.GUNDUZ]; let aksamVardiyalari = [SHIFTS.AKSAM, SHIFTS.GECE]; if (aksamVardiyalari.includes(hedefSaat) && sabahVardiyalari.includes(yarinVardiya)) showToast(`⚠️ DİKKAT: ${personelAd} yarın SABAH görünüyor. Yetersiz dinlenme!`, "warning"); } }
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
         const cap = (state.kapasite[`${p.birim}_${shift}`] || [0,0,0,0,0,0,0])[day];
         let currentCount = 0;
         state.personeller.filter(x => x.birim === p.birim).forEach(x => { if(tempProg[x.ad][day] === shift) currentCount++; });
         if (currentCount < cap) tempProg[p.ad][day] = shift;
    };

    const calisGuncelle = () => {
         state.personeller.forEach(p => { 
             calis[p.ad] = 0; 
             for(let g=0; g<7; g++) { 
                 if(tempProg[p.ad][g] && ![SHIFTS.IZIN,SHIFTS.BOS,null,SHIFTS.YILLIK].includes(tempProg[p.ad][g])) calis[p.ad]++; 
             } 
         });
    };

    function adim1_ManuelVeSabitleriYukle() {
        state.personeller.forEach(p => {
             tempProg[p.ad] = Array(7).fill(null);
             for(let g=0; g<7; g++) { 
                 let mKey = `${hKey}_${p.ad}_${g}`; 
                 if(state.manuelAtamalar[mKey]) tempProg[p.ad][g] = state.manuelAtamalar[mKey]; 
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

        state.personeller.forEach(p => { 
            const birimAyar = state.birimAyarlari[p.birim] || { tip: "HAVUZ" };
            
            if (birimAyar.tip === "DONGU8" || birimAyar.tip === "DONGU6") {
                const persOfset = parseInt(state.mcrAyarlari.ofsetler[p.ad] || 0);
                const loopArr = (birimAyar.tip === "DONGU8") ? mcrDongu : ingestDongu;
                const modVal = loopArr.length;

                for(let g=0; g<7; g++) {
                    if(tempProg[p.ad][g] !== null) continue; 
                    
                    let d = new Date(currentMonday); d.setDate(d.getDate() + g);
                    const diffDays = Math.floor((d - baseDate) / (1000 * 60 * 60 * 24));
                    tempProg[p.ad][g] = loopArr[((diffDays + persOfset) % modVal + modVal) % modVal];
                }
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
             personelListesi.forEach((p, index) => {
                let gecenPzt = state.manuelAtamalar[`${prevHKey}_${p.ad}_0`];
                if (gecenPzt === SHIFTS.IZIN || gecenPzt === SHIFTS.BOS || !gecenPzt || gecenPzt === SHIFTS.YILLIK) { grupA.push(p); } 
                else if (gecenPzt === SHIFTS.SABAH || gecenPzt === SHIFTS.GUNDUZ) { grupB.push(p); } 
                else { grupC.push(p); }
            });
            if (grupA.length === 0 && grupB.length === 0 && grupC.length === 0) {
                personelListesi.forEach((p, i) => { if (i % 3 === 0) grupA.push(p); else if (i % 3 === 1) grupB.push(p); else grupC.push(p); });
            }
            
            grupA.forEach(p => { safeAssign(p, 0, SHIFTS.SABAH); safeAssign(p, 1, SHIFTS.AKSAM); safeAssign(p, 2, SHIFTS.AKSAM); safeAssign(p, 3, SHIFTS.IZIN); safeAssign(p, 4, SHIFTS.IZIN); safeAssign(p, 5, SHIFTS.SABAH); safeAssign(p, 6, SHIFTS.SABAH); });
            grupB.forEach(p => { safeAssign(p, 0, SHIFTS.AKSAM); safeAssign(p, 1, SHIFTS.IZIN); safeAssign(p, 2, SHIFTS.IZIN); safeAssign(p, 3, SHIFTS.SABAH); safeAssign(p, 4, SHIFTS.SABAH); safeAssign(p, 5, SHIFTS.AKSAM); safeAssign(p, 6, SHIFTS.AKSAM); });
            
            seededShuffle(grupC, hKey);
            grupC.forEach((p, index) => {
                safeAssign(p, 0, SHIFTS.IZIN); safeAssign(p, 1, SHIFTS.SABAH); safeAssign(p, 2, SHIFTS.SABAH); safeAssign(p, 3, SHIFTS.AKSAM); safeAssign(p, 4, SHIFTS.AKSAM);
                if (index % 2 === 0) {
                    let cmtAksamCap = (state.kapasite[`${birim}_${SHIFTS.AKSAM}`] || [0,0,0,0,0,0,0])[5];
                    if(cmtAksamCap > 0) { safeAssign(p, 5, SHIFTS.AKSAM); } else { safeAssign(p, 5, SHIFTS.IZIN); }
                    safeAssign(p, 6, SHIFTS.IZIN);
                } else {
                    safeAssign(p, 5, SHIFTS.IZIN);
                    let pzSabahCap = (state.kapasite[`${birim}_${SHIFTS.SABAH}`] || [0,0,0,0,0,0,0])[6];
                    if(pzSabahCap > 0) { safeAssign(p, 6, SHIFTS.SABAH); } else { safeAssign(p, 6, SHIFTS.IZIN); }
                }
            });

            let targetSatGunduz = (state.kapasite[`${birim}_${SHIFTS.GUNDUZ}`] || [])[5] || 0;
            let targetSatAksam = (state.kapasite[`${birim}_${SHIFTS.AKSAM}`] || [])[5] || 0;

            let currentSatGunduz = personelListesi.filter(p => tempProg[p.ad][5] === SHIFTS.GUNDUZ).length;
            let currentSatAksam = personelListesi.filter(p => tempProg[p.ad][5] === SHIFTS.AKSAM).length;

            let candidatesSabah = personelListesi.filter(p => { let friShift = tempProg[p.ad][4]; return friShift === SHIFTS.SABAH || friShift === SHIFTS.GUNDUZ; });
            let candidatesAksam = personelListesi.filter(p => tempProg[p.ad][4] === SHIFTS.AKSAM);

            seededShuffle(candidatesSabah, hKey + "S");
            seededShuffle(candidatesAksam, hKey + "A");

            if (currentSatGunduz < targetSatGunduz) {
                for (let p of candidatesSabah) {
                    if (currentSatGunduz >= targetSatGunduz) break;
                    if (!state.manuelAtamalar[`${hKey}_${p.ad}_5`]) { tempProg[p.ad][5] = SHIFTS.GUNDUZ; currentSatGunduz++; }
                }
            }
            if (currentSatAksam < targetSatAksam) {
                for (let p of candidatesAksam) {
                    if (currentSatAksam >= targetSatAksam) break;
                    if (!state.manuelAtamalar[`${hKey}_${p.ad}_5`]) { tempProg[p.ad][5] = SHIFTS.AKSAM; currentSatAksam++; }
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
                            let birimUygun = getGecerliBirim(p, gun) === birim;
                            let bosta = (tempProg[p.ad][gun] === null); 
                            let yorgunDegil = calis[p.ad] < 6;
                            let dunGece = (gun > 0 && tempProg[p.ad][gun-1] === SHIFTS.GECE);
                            let manuelVar = state.manuelAtamalar[`${hKey}_${p.ad}_${gun}`];
                            
                            if (gun > 0) {
                                let dunVardiya = tempProg[p.ad][gun-1];
                                if ((dunVardiya === SHIFTS.AKSAM || dunVardiya === SHIFTS.GECE) && (saat === SHIFTS.SABAH || saat === SHIFTS.GUNDUZ)) {
                                    return false; 
                                }
                            }
                            return birimUygun && bosta && yorgunDegil && !dunGece && !manuelVar;
                        });

                        seededShuffle(yedekAdaylar, hKey + "yedek");

                        for (let p of yedekAdaylar) {
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

    function adim4_AkilliHaftasonuKorumasi() {
        state.birimler.forEach(birim => {
            const ayar = state.birimAyarlari[birim] || { tip: "HAVUZ" };
            if (ayar.tip !== "AKILLI_HAFTASONU") return;
            
            for (let gun = 0; gun < 7; gun++) {
                let siralama = [...state.saatler]; 
                
                if (gun === 5) {
                    siralama = siralama.filter(s => s !== SHIFTS.SABAH && s !== SHIFTS.GUNDUZ);
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

                            if (gun === 5 && (saat === SHIFTS.SABAH || saat === SHIFTS.GUNDUZ)) {
                                let cumaVardiya = tempProg[p.ad][4];
                                if (cumaVardiya === SHIFTS.AKSAM || cumaVardiya === SHIFTS.GECE) return false;
                            }
                            if (gun > 0) {
                                let dun = tempProg[p.ad][gun-1];
                                if ((dun === SHIFTS.AKSAM || dun === SHIFTS.GECE) && (saat === SHIFTS.SABAH || saat === SHIFTS.GUNDUZ)) return false;
                            }
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
                    let adaylar = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === null && (calis[p.ad] < 6));
                    siralamaYap(adaylar, true); 
                    for (let p of adaylar) { if (atananGece < hedefGece) { tempProg[p.ad][gun] = geceSaati; calis[p.ad]++; atananGece++; } }
                }
                if (atananGece < hedefGece) {
                    let adaylar = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === null);
                    siralamaYap(adaylar, true); 
                    for (let p of adaylar) { if (atananGece < hedefGece) { tempProg[p.ad][gun] = geceSaati; calis[p.ad]++; atananGece++; } }
                }
                
                state.saatler.filter(s => s !== SHIFTS.GECE).forEach(saat => {
                    const hdf = (state.kapasite[`${birim}_${saat}`] || [0,0,0,0,0,0,0])[gun];
                    let mvc = state.personeller.filter(p => getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === saat).length;
                    
                    if (mvc < hdf) {
                        let ady = state.personeller.filter(p => {
                            let basic = getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === null;
                            let dunGece = (gun > 0 && tempProg[p.ad][gun-1] === SHIFTS.GECE);
                            return basic && (calis[p.ad] < 6) && !(dunGece && saat === SHIFTS.SABAH);
                        });
                        siralamaYap(ady, false); 
                        for (let p of ady) { if (mvc < hdf) { tempProg[p.ad][gun] = saat; calis[p.ad]++; mvc++; } }
                    }
                    if (mvc < hdf) {
                        let ady = state.personeller.filter(p => {
                            let basic = getGecerliBirim(p, gun) === birim && tempProg[p.ad][gun] === null;
                            let dunGece = (gun > 0 && tempProg[p.ad][gun-1] === SHIFTS.GECE);
                            return basic && !(dunGece && saat === SHIFTS.SABAH);
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
    adim2_McrVeIngestDonguleri();
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
                    if(s === "İZİN") return p.birim === birim && (v === SHIFTS.IZIN || v === SHIFTS.BOS || !v || v === SHIFTS.YILLIK);
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

async function excelMailGonder() {
    if(!isAdmin) return;
    
    const alicilar = prompt("Excel'in gönderileceği mail adreslerini girin:\n(Birden fazla ise araya virgül koyun)", "ornek@sirket.com");
    if(!alicilar) return;

    showLoading();
    try {
        const hKey = getDateKey(currentMonday);
        const htmlData = excelHtmlOlustur(); 
        
        // 🌟 YENİ: ARTIK GÜVENLİK ŞİFRESİ İLE İSTEK ATIYORUZ 🌟
        const response = await fetch(`${BACKEND_URL}/send-excel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                secret: API_SECRET, // Güvenlik Şifresi
                fileName: `Vardiya_${hKey}.xls`,
                fileData: htmlData,
                toEmails: alicilar
            })
        });

        const result = await response.json();
        if(response.ok && result.success) {
            showToast("📧 Excel başarıyla mail atıldı!", "success");
            logKoy(`Vardiya Excel'i mail olarak gönderildi: ${alicilar}`);
        } else {
            showToast("Mail Hatası: " + (result.message || "Bilinmeyen Hata"), "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Sunucuya ulaşılamadı. server.js çalışıyor mu?", "error");
    }
    hideLoading();
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
            .unit-label { font-size: 7pt; opacity: 0.8; display: block; margin-bottom: 2px; font-style: italic; }
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
                if (v === SHIFTS.IZIN || v === SHIFTS.BOS || v === SHIFTS.YILLIK || !v) return false;
                return v === s;
            });

            calisanlar.sort((a, b) => {
                let birimA = getGecerliBirim(a, i);
                let birimB = getGecerliBirim(b, i);
                return state.birimler.indexOf(birimA) - state.birimler.indexOf(birimB);
            });

            let cellContent = calisanlar.map(p => {
                let birim = getGecerliBirim(p, i);
                return `<span class="name-box">${p.ad} <span class="unit-label">(${birim})</span></span>`;
            }).join('<br>');

            html += `<td style="background-color:${bgColor}; color:${textColor};">${cellContent}</td>`;
        }
        html += `</tr>`;
    });

    html += `<tr><td class="time-col" style="background-color:#991b1b;">İZİN</td>`;
    for(let i=0; i<7; i++) {
        let izinliler = state.personeller.filter(p => {
            let v = state.manuelAtamalar[`${hKey}_${p.ad}_${i}`];
            return (v === SHIFTS.IZIN || v === SHIFTS.BOS || !v || v === SHIFTS.YILLIK);
        });
        
        let cellContent = izinliler.map(p => {
            let v = state.manuelAtamalar[`${hKey}_${p.ad}_${i}`];
            let ek = v === SHIFTS.YILLIK ? " (YILLIK)" : "";
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
    
    state.personeller.forEach(p => {
        stats[p.ad] = { toplamGun: 0, gece: 0, haftasonu: 0 };
        for(let i=0; i<7; i++) {
            let mKey = `${hKey}_${p.ad}_${i}`;
            let v = state.manuelAtamalar[mKey];
            if(v && ![SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK].includes(v)) {
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
    document.getElementById("yeniPersBirimSec").innerHTML = state.birimler.map(b => `<option value="${b}">${b}</option>`).join('');
    document.getElementById("persListesiAdmin").innerHTML = state.personeller.map((p, i) => {
        let mcrHtml = "";
        if(p.birim.includes("MCR") || p.birim.includes("INGEST")) {
            mcrHtml = `<div class="mcr-ayarlar" style="background:var(--saat1); border-color:var(--border);">
                <span style="color:var(--text);">${p.birim.includes("INGEST") ? 'INGEST' : 'MCR'} Döngü Ofseti: </span>
                <input type="number" value="${state.mcrAyarlari.ofsetler[p.ad] || 0}" style="width:50px" onchange="mcrOfsetGuncelle('${p.ad}', this.value)">
            </div>`;
        }
        let yuzdeHtml = `<div style="margin-top:5px; font-size:10px;">
            <span style="font-weight:bold; color:var(--text);">Vardiya Öncelik Puanı (%):</span>
            <input type="number" value="${p.yuzde || 0}" style="width:50px; padding:6px; border-radius:4px; border:1px solid var(--border);" onchange="yuzdeGuncelle(${i}, this.value)">
        </div>`;

        return `<div style="background:var(--card-bg); border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:5px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span><strong style="color:var(--text);">${p.ad}</strong> <small style="color:var(--text); opacity:0.6;">(${p.birim})</small></span>
                <button onclick="state.personeller.splice(${i},1); save(); refreshUI(); tabloyuOlustur(); showToast('Personel silindi', 'info');" style="color:var(--danger); border:none; background:none; cursor:pointer;">Sil</button>
            </div>
            <div style="margin-top:5px;">${GUNLER.map((g, gi) => `<span class="izin-gun-pill ${p.izinGunleri?.includes(gi)?'active':''}" onclick="izinGunuTetikle(${i},${gi})">${g}</span>`).join('')}</div>
            ${yuzdeHtml}
            ${mcrHtml}
        </div>`;
    }).join('');
    
    const swapKaynak = document.getElementById('swapKaynakPersonel');
    const swapHedef = document.getElementById('swapHedefPersonel');
    const optionsHtml = "<option value=''>Seçiniz...</option>" + state.personeller.sort((a,b) => a.ad.localeCompare(b.ad)).map(p => `<option value="${p.ad}">${p.ad} (${p.birim})</option>`).join('');
    if(swapKaynak) swapKaynak.innerHTML = optionsHtml;
    if(swapHedef) swapHedef.innerHTML = optionsHtml;
    
    const yillikSel = document.getElementById('yillikIzinPersonel');
    if(yillikSel) yillikSel.innerHTML = optionsHtml;

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
    document.getElementById("aktifDegisimlerListesi").innerHTML = hasDegisim ? degisimHtml : `<div style='font-size:10px; color:var(--text); opacity:0.6;'>Bu hafta için aktif değişim yok.</div>`;

    if(state.logs) {
        document.getElementById('logListesi').innerHTML = state.logs.map(l => 
            `<div class="log-item"><span style="color:var(--text);">${l.mesaj} <br><i style="color:var(--text); opacity:0.6;">(${l.user})</i></span> <span class="log-time">${l.zaman}</span></div>`
        ).join('');
    }

    document.getElementById('adminDuyuruInp').value = state.duyuruMetni || "";

    let capHtml = ""; state.birimler.forEach(b => { 
        capHtml += `<div style="margin-bottom:15px; background:var(--card-bg); padding:10px; border-radius:8px; border:1px solid var(--border);"><strong style="color:var(--text);">${b}</strong>`; 
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
    
    document.getElementById("sabitListeAdmin").innerHTML = mcrSistemHtml + state.personeller.filter(p => !p.birim.includes("MCR") && !p.birim.includes("INGEST")).map(p => `<div style="display:flex; justify-content:space-between; margin-bottom:5px; background:var(--card-bg); padding:8px; border-radius:5px; border:1px solid var(--border);"><label style="color:var(--text);"><input type="checkbox" ${state.haftaIciSabitler[p.ad]?'checked':''} onchange="sabitTetikle('${p.ad}')"> ${p.ad}</label><select onchange="sabitSaatGuncelle('${p.ad}', this.value)" ${!state.haftaIciSabitler[p.ad]?'disabled':''}>${state.saatler.map(s => `<option value="${s}" ${state.haftaIciSabitler[p.ad] === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('');
    
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
                <div>
                    <span style="font-weight:bold; color:var(--text);">${b}</span>
                    <span style="font-size:9px; background:var(--border); color:var(--text); padding:2px 4px; border-radius:3px; margin-left:5px;">${tipYazi}</span>
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

function degisimiUygula() {
    saveStateToHistory(); 
    const pKaynakAd = document.getElementById('swapKaynakPersonel').value; 
    const pHedefAd = document.getElementById('swapHedefPersonel').value;   
    if(!pKaynakAd || !pHedefAd) { showToast("Lütfen iki personeli de seçiniz.", "warning"); return; }
    if(pKaynakAd === pHedefAd) { showToast("Aynı personeli seçemezsiniz.", "warning"); return; }
    const checkboxes = document.querySelectorAll('.swap-day-cb:checked');
    if(checkboxes.length === 0) { showToast("Lütfen en az bir gün seçiniz.", "warning"); return; }
    const selectedDays = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a,b) => a-b);
    const hKey = getDateKey(currentMonday);
    for (let gunIdx of selectedDays) {
        let hedefVardiya = vardiyaBul(pKaynakAd, gunIdx);
        if (hedefVardiya && [SHIFTS.SABAH, SHIFTS.GUNDUZ].includes(hedefVardiya)) {
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
         if (shift && shift !== SHIFTS.IZIN && shift !== SHIFTS.BOS) { state.manuelAtamalar[kEntering] = shift; }
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
    logKoy(`${pKaynakAd} <-> ${pHedefAd} SWAP işlemi yapıldı.`);
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
    
    const btnContainer = document.getElementById('modalVardiyaButonlari');
    let html = "";
    
    state.saatler.forEach(saat => {
        let ikon = "🕒";
        if(saat.includes("06") || saat.includes("07")) ikon = "🌅";
        if(saat.includes("09") || saat.includes("10")) ikon = "☀️";
        if(saat.includes("16") || saat.includes("15")) ikon = "🌇";
        if(saat.includes("00") || saat.includes("24")) ikon = "🌙";
        
        html += `<button class="modal-btn" onclick="vardiyaAta('${pAd}', ${gIdx}, '${saat}')">
                    <span>${ikon} ${saat}</span>
                 </button>`;
    });
    
    html += `<button class="modal-btn btn-izin" onclick="vardiyaAta('${pAd}', ${gIdx}, '${SHIFTS.IZIN}')">
                <span>🏖️ İZİNLİ (Listeden Çıkar)</span>
             </button>`;
             
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
function sabitTetikle(ad) { if(state.haftaIciSabitler[ad]) delete state.haftaIciSabitler[ad]; else state.haftaIciSabitler[ad] = state.saatler[0]; save(); refreshUI(); showToast("Sabit değiştirildi.", "info"); }
function sabitSaatGuncelle(ad, saat) { state.haftaIciSabitler[ad] = saat; save(); }

function anlikSenkronizasyonBaslat() {
    database.ref('vardiya_data').on('value', (snap) => {
        if (snap.exists()) {
            state = snap.val();
            verileriGuvenliHaleGetir(); 
            save(); 
            tabloyuOlustur();
            gorunumAyarlariYukle();
            if(isAdmin) refreshUI();
            console.log("Sistem: Veriler eşitlendi.");
        }
        hideLoading(); 
    });
}

function mobilListeyiGuncelle() {
    const select = document.getElementById('mobilPersonelSecim');
    const mevcutSecim = select.value;
    const siraliPersonel = [...state.personeller].sort((a,b) => a.ad.localeCompare(b.ad));
    let html = '<option value="">Personel Seçiniz...</option>';
    siraliPersonel.forEach(p => {
        html += `<option value="${p.ad}" ${p.ad === mevcutSecim ? 'selected' : ''}>${p.ad}</option>`;
    });
    select.innerHTML = html;
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
        return;
    }

    let html = "";

    GUNLER.forEach((gunAdi, index) => {
        let d = new Date(currentMonday);
        d.setDate(d.getDate() + index);
        let tarihStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

        let vardiya = vardiyaBul(isim, index);
        
        if(!vardiya || vardiya === "BOŞ") vardiya = "İZİNLİ";

        let renk = "#eee"; let yaziRengi = "#333"; let ikon = "⚪";
        
        if(vardiya.includes("06:30")) { renk = "#e0f2fe"; yaziRengi = "#0c4a6e"; ikon = "🌅"; }
        else if(vardiya.includes("09:00")) { renk = "#f0fdf4"; yaziRengi = "#064e3b"; ikon = "☀️"; }
        else if(vardiya.includes("16:00")) { renk = "#faf5ff"; yaziRengi = "#581c87"; ikon = "🌇"; }
        else if(vardiya.includes("00:00")) { renk = "#fff7ed"; yaziRengi = "#7c2d12"; ikon = "🌙"; }
        else if(vardiya === "İZİNLİ") { renk = "#fef2f2"; yaziRengi = "#ef4444"; ikon = "🏖️"; }
        else if(vardiya === "YILLIK İZİN") { renk = "#9333ea"; yaziRengi = "#ffffff"; ikon = "✈️"; }

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
                satirBasligi = satirBasligi.toUpperCase().trim();

                let atanacakVardiya = null;

                if (satirBasligi.includes("İZİN") || satirBasligi.includes("OFF")) {
                    atanacakVardiya = SHIFTS.IZIN;
                } else if (satirBasligi.includes("YILLIK")) {
                    atanacakVardiya = SHIFTS.YILLIK;
                } else {
                    atanacakVardiya = state.saatler.find(s => s.includes(satirBasligi) || s.replace(/[:\-\s]/g, "").includes(satirBasligi.replace(/[:\-\s]/g, "")));
                    
                    if(!atanacakVardiya) {
                        if(satirBasligi.startsWith("00") || satirBasligi.startsWith("24") || satirBasligi.includes("GECE")) {
                            atanacakVardiya = SHIFTS.GECE;
                        }
                        else if(satirBasligi.includes("06") || satirBasligi.includes("07")) {
                            atanacakVardiya = SHIFTS.SABAH;
                        }
                        else if(satirBasligi.includes("09") || satirBasligi.includes("10")) {
                            atanacakVardiya = SHIFTS.GUNDUZ;
                        }
                        else if(satirBasligi.includes("16") || satirBasligi.includes("15") || satirBasligi.includes("14")) {
                            atanacakVardiya = SHIFTS.AKSAM;
                        }
                    }
                }

                if (!atanacakVardiya) return; 

                for (let i = 1; i <= 7; i++) {
                    let hucreVerisi = row[i];
                    if (hucreVerisi && typeof hucreVerisi === 'string') {
                        let temizIsim = hucreVerisi
                            .split('*')[0] 
                            .split('-')[0] 
                            .replace(/[\d\(\)\.]/g, '') 
                            .trim().toUpperCase();

                        let personel = state.personeller.find(p => p.ad === temizIsim);
                        
                        if (personel) {
                            let gunIdx = i - 1;
                            state.manuelAtamalar[`${hKey}_${personel.ad}_${gunIdx}`] = atanacakVardiya;
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
                showToast("⚠️ Excel okundu ancak eşleşen veri bulunamadı.", "warning");
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

    // Artık bu gereksiz (Şifreler server'da saklanıyor)
    // await hassasAyarlariYukle(); 
    
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            console.log("Oturum açık:", user.email);
            isAdmin = true;
            
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'flex');
            document.getElementById('persTalepArea').style.display = 'none';
            
            document.getElementById('loginOverlay').style.display = 'none';
            document.getElementById('appMain').style.display = 'block'; 
            
            checkUrlActions();
            
            verileriGuvenliHaleGetir();
            gorunumAyarlariYukle();
            tabloyuOlustur(); 
            
            const p = document.getElementById("sidePanel");
            if(p.classList.contains("open")) tabDegistir('personel');
        } else {
            hideLoading(); 
        }
    });

    anlikSenkronizasyonBaslat();
    talepleriYukle(); 
};