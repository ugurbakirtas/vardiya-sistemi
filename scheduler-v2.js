/*
 * TURKMEDYA TEKNIK VARDIYA - V62 DETERMINISTIC SCHEDULER
 * -------------------------------------------------------
 * Amaç:
 *  - HAVUZ birimlerinde kapasiteyi ASGARİ personel sayısı olarak uygular; altına düşmez.
 *    MIN5 için gerektiğinde en az sayıda kontrollü ek atama yapabilir.
 *  - MCR kapasite tablosundan bağımsız 2+2+2+2 sabit döngü olarak kilitlenir.
 *  - INGEST 3-personel haftalık rotasyonuyla çalışır: hafta sonu izin -> Pzt sabah; Pazar sabah -> Pzt akşam; Pazar akşam -> Pzt izin.
 *  - Aynı girişlerle her çalıştırmada aynı sonucu üretir (random yok).
 *  - Uzmanlık dışı birime otomatik personel yazmaz.
 *  - 16:00–00:00 / gece vardiyası sonrası ertesi gün 16:00'dan önce vardiya vermez.
 *  - Mümkünse 2 ardışık izin; kapasite gerektirirse en fazla 6 gün çalışma (1 izin) uygular.
 *  - MCR/INGEST izinlerinde mümkün olduğunda aynı uzman yedek, kişi dönene kadar devam eder.
 *  - INGEST'te yedek yoksa eksik günlerde iki çekirdek personel kontrollü acil moda geçer; hafta sonu tek sabahçı + tek izinli olur.
 *  - Manuel değişiklikten sonra yalnız ilgili birimi yeniden dengeler.
 *  - Çözüm yoksa kural ezmez; mevcut listeyi değiştirmeden nedenini raporlar.
 *
 * Bu dosya app.js'ten SONRA yüklenmelidir.
 */
(function (global) {
    'use strict';

    const SCHEDULER_VERSION = 'V62-INGEST-CARRY-FORWARD-FIX10-20260918';
    const OFF_VALUES = new Set([null, undefined, '', SHIFTS.IZIN, SHIFTS.BOS, SHIFTS.YILLIK, SHIFTS.RAPOR]);
    const AUTO_SOURCE = 'AUTO_V62';
    const AUTO_MCR_SOURCE = 'AUTO_V62_MCR_YEDEK';
    const AUTO_CYCLE_SOURCE = 'AUTO_V62_CYCLE_LOCK';
    const AUTO_MIN5_EXTRA_SOURCE = 'AUTO_V62_MIN5_EXTRA';
    const AUTO_INGEST_EMERGENCY_SOURCE = 'AUTO_V62_INGEST_ACIL';
    const MANUAL_SOURCE = 'MANUAL_V62';
    const REQUEST_SOURCE = 'REQUEST_V62';
    const ANNUAL_SOURCE = 'ANNUAL_LEAVE';
    const REPORT_SOURCE = 'REPORT';
    const FIXED_OFF_SOURCE = 'FIXED_OFF';
    const FIXED_SHIFT_SOURCE = 'FIXED_SHIFT';
    const FIXED_WEEKEND_OFF_SOURCE = 'FIXED_WEEKEND_OFF';
    const ANNUAL_LOCAL_SOURCE = 'ANNUAL_LOCAL';
    const ANNUAL_EXTERNAL_SOURCE = 'ANNUAL_EXTERNAL';
    const FROZEN_SOURCE = 'FROZEN_OTHER_UNIT';
    const LEGACY_EXTERNAL_SOURCE = 'LEGACY_EXCEL_PRESERVE';
    // Excel ile dışarıdan yönetilen birimler V62 otomatik optimizasyonunun dışında tutulur.
    // Şimdilik kullanıcı talebi gereği yalnız KAMERAMAN birimleri korunur.
    const LEGACY_EXTERNAL_UNIT_PATTERNS = ['KAMERAMAN'];

    // app.js'in eski sürümünde tanımlanmamış iki globali güvenli hale getir.
    if (typeof global.undoStack === 'undefined') global.undoStack = [];
    if (typeof global.saveTimeout === 'undefined') global.saveTimeout = null;

    function deepClone(obj) {
        return obj == null ? obj : JSON.parse(JSON.stringify(obj));
    }

    function ensureSchedulerState() {
        if (!state.schedulerV2 || typeof state.schedulerV2 !== 'object') state.schedulerV2 = {};
        const s = state.schedulerV2;
        s.version = SCHEDULER_VERSION;
        if (!s.manualLocks) s.manualLocks = {};
        if (!s.assignmentSource) s.assignmentSource = {};
        if (!s.manualUnitLocks) s.manualUnitLocks = {};
        if (!s.tempUnitSource) s.tempUnitSource = {};
        if (!s.mcrReplacements) s.mcrReplacements = {};
        if (!s.externalAnnualLocks) s.externalAnnualLocks = {};
        if (!s.externalUnitWeeks) s.externalUnitWeeks = {};
        if (!state.haftaSonuYedekler) state.haftaSonuYedekler = {};
        if (!s.config) s.config = {};
        if (typeof s.config.preferredWorkDays !== 'number') s.config.preferredWorkDays = 5;
        if (typeof s.config.maxWorkDays !== 'number') s.config.maxWorkDays = 6;
        if (typeof s.config.minWorkDays !== 'number') s.config.minWorkDays = 5;
        s.config.exactCapacity = false;
        s.config.capacityMode = 'MINIMUM_FLOOR_FOR_POOL';
        s.config.cycleExactCapacity = false;
        s.config.cycleSequenceHardLock = true;
        s.config.allowMin5Extras = true;
        s.config.deterministic = true;
        s.config.preferConsecutiveTwoDaysOff = true;
        s.config.rotateFromPreviousWeek = true;
        s.config.preferWeekendMorningTopUp = true;
        s.config.strictMinimumFive = true;
        s.config.fixedWeekdayWeekendOff = true;
        s.config.preserveExcelCameraUnits = true;
        s.config.preserveExcelImportedUnitsByWeek = true;
        s.config.preserveUnitsWithoutCapacity = true;
        s.config.cycleIgnoresCapacityTable = true;
        s.config.showCycleOffInFooter = true;
        s.config.showReplacementIdentity = true;
        s.config.ingestWeeklyRotation = true;
        s.config.ingestEmergencySixOne = true;
        s.lastReport = s.lastReport || null;
        return s;
    }

    function hKeyNow() { return getDateKey(currentMonday); }
    function weekDate(day) {
        const d = new Date(currentMonday);
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() + day);
        return d;
    }
    function dateKeyForDay(day) { return getDateKey(weekDate(day)); }
    function assignmentKey(name, day, hKey = hKeyNow()) { return `${hKey}_${name}_${day}`; }
    function tempKey(name, day) { return `${dateKeyForDay(day)}_${name}`; }

    function isAnnualHardLocked(name, day, hKey = hKeyNow()) {
        const key = assignmentKey(name,day,hKey);
        const scheduler = ensureSchedulerState();
        const src = scheduler.assignmentSource && scheduler.assignmentSource[key];
        const v = state.manuelAtamalar && state.manuelAtamalar[key];
        if (v === SHIFTS.YILLIK && (src === ANNUAL_LOCAL_SOURCE || src === ANNUAL_EXTERNAL_SOURCE || src === ANNUAL_SOURCE)) return true;
        if (hKey === hKeyNow() && isPersonOnAnnualLeaveV2(name,dateKeyForDay(day))) return true;
        return false;
    }

    function isWorkShift(v) { return !!v && !OFF_VALUES.has(v); }
    function isOffValue(v) { return !isWorkShift(v); }

    function normalizeName(v) {
        return String(v || '').trim().toLocaleUpperCase('tr-TR');
    }

    function isLegacyExternalUnit(unit, hKey = hKeyNow()) {
        if (!unit) return false;
        // MCR / INGEST her zaman kendi tarih+ofset döngüsünden üretilir.
        // Excel işareti bu döngüyü devre dışı bırakamaz.
        if (isCycleUnit(unit)) return false;
        const u = normalizeName(unit);
        if (LEGACY_EXTERNAL_UNIT_PATTERNS.some(x => u.includes(normalizeName(x)))) return true;
        const scheduler = ensureSchedulerState();
        const weekMap = scheduler.externalUnitWeeks && scheduler.externalUnitWeeks[hKey];
        return !!(weekMap && weekMap[unit]);
    }

    function markExternalUnitWeek(unit, hKey = hKeyNow()) {
        if (!unit) return false;
        const scheduler = ensureSchedulerState();
        if (!scheduler.externalUnitWeeks[hKey]) scheduler.externalUnitWeeks[hKey] = {};
        scheduler.externalUnitWeeks[hKey][unit] = true;
        return true;
    }

    function releaseExternalUnitWeek(unit, hKey = hKeyNow()) {
        const scheduler = ensureSchedulerState();
        if (scheduler.externalUnitWeeks[hKey]) {
            delete scheduler.externalUnitWeeks[hKey][unit];
            if (!Object.keys(scheduler.externalUnitWeeks[hKey]).length) delete scheduler.externalUnitWeeks[hKey];
        }
        return true;
    }

    // Kapasitesi hiç tanımlanmamış birim için V62 vardiya icat etmez.
    // Mevcut/Excel/sabit listeyi korur. Birim otomasyona alınacaksa önce en az bir vardiya kapasitesi tanımlanır.
    function isNoCapacityPreservedUnit(unit) {
        // MCR / INGEST kapasite tablosundan değil sabit döngüden doğar.
        if (!unit || isCycleUnit(unit)) return false;
        return weeklyCapacity(unit) <= 0;
    }

    function isPreservedUnit(unit) {
        if (isCycleUnit(unit)) return false;
        return isLegacyExternalUnit(unit) || isNoCapacityPreservedUnit(unit);
    }

    function autoManagedUnits(units) {
        return (units || []).filter(u => u && !isPreservedUnit(u));
    }

    function isHardAbsenceValue(v) {
        return v === SHIFTS.IZIN || v === SHIFTS.YILLIK || v === SHIFTS.RAPOR;
    }

    function parseTimePart(s) {
        const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
        if (!m) return null;
        return (parseInt(m[1], 10) % 24) * 60 + parseInt(m[2], 10);
    }

    function shiftTimes(shift) {
        const parts = String(shift || '').split(/[–-]/).map(x => x.trim());
        if (parts.length < 2) return { start: null, end: null };
        return { start: parseTimePart(parts[0]), end: parseTimePart(parts[1]) };
    }

    function isNightShift(shift) {
        const t = shiftTimes(shift);
        return t.start === 0 && t.end !== null && t.end <= 9 * 60;
    }

    function isEveningToMidnight(shift) {
        const t = shiftTimes(shift);
        return t.start !== null && t.start >= 15 * 60 && t.end === 0;
    }

    // Kullanıcının kuralı: önceki gün 00:00'da çıkan (16-00) veya gece çalışan
    // personel ertesi gün 06:30 / 07:00 / 09:00 / 12:00 gibi erken vardiyaya yazılmaz.
    // En erken 16:00 vardiyası kabul edilir. Gece vardiyası kendi kategori mantığı nedeniyle
    // "erken vardiya" sayılmaz (MCR'da ardışık iki gece mümkündür).
    function isEarlyDayShift(shift) {
        if (!isWorkShift(shift) || isNightShift(shift)) return false;
        const t = shiftTimes(shift);
        return t.start !== null && t.start < 16 * 60;
    }

    function previousShiftBlocksEarly(shift) {
        return isEveningToMidnight(shift) || isNightShift(shift);
    }

    function requiredSpecialty(unit) {
        const u = normalizeName(unit);
        if (u.includes('PLAYOUT')) return 'PLAYOUT';
        if (u.includes('KJ')) return 'KJ';
        if (u.includes('24TV MCR') || u.includes('24 TV MCR')) return '24 MCR';
        if (u.includes('360TV MCR') || u.includes('360 TV MCR')) return '360 MCR';
        if (u.includes('INGEST')) return 'INGEST';
        return null;
    }

    function hasSpecialty(person, spec) {
        if (!spec) return false;
        const arr = Array.isArray(person.uzmanlik) ? person.uzmanlik : [];
        return arr.some(x => normalizeName(x) === normalizeName(spec));
    }

    function isQualifiedForUnit(person, unit) {
        if (!person || !unit) return false;
        if (person.birim === unit) return true; // Birimin kendi personeli doğal olarak yetkilidir.
        const spec = requiredSpecialty(unit);
        return !!spec && hasSpecialty(person, spec);
    }

    function isWeekdayFixedPerson(person) {
        return !!(person && state.haftaIciSabitler && state.haftaIciSabitler[person.ad]);
    }

    function isWeekendReservePerson(person) {
        return !!(person && isWeekdayFixedPerson(person) && state.haftaSonuYedekler && state.haftaSonuYedekler[person.ad]);
    }

    function personByName(name) { return state.personeller.find(p => p.ad === name); }

    function capacity(unit, shift, day) {
        const arr = state.kapasite && state.kapasite[`${unit}_${shift}`];
        const n = arr && arr[day] != null ? parseInt(arr[day], 10) : 0;
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function totalDailyCapacity(unit, day) {
        return (state.saatler || []).reduce((sum, shift) => sum + capacity(unit, shift, day), 0);
    }

    function weeklyCapacity(unit) {
        let n = 0;
        for (let d = 0; d < 7; d++) n += totalDailyCapacity(unit, d);
        return n;
    }

    function normalizedAnnualRecord(rec) {
        if (global.normalizeExternalLeaveRecord) return global.normalizeExternalLeaveRecord(rec || {});
        return rec || {};
    }

    function isApprovedAnnualLeaveRecord(rec) {
        const n = normalizedAnnualRecord(rec);
        if (typeof n.__approved === 'boolean') return n.__approved;
        if (global.izinDurumOnayli) return global.izinDurumOnayli(n.durum);
        const durum = normalizeName(n && n.durum).replace(/[İI]/g,'I').replace(/[^A-ZÇĞÖŞÜ0-9]+/g,'');
        return ['ONAYLANDI','ONAYLI','ONAY','APPROVED','ACCEPTED'].includes(durum);
    }

    // app.js V61'de çağrılıp tanımı bulunmayan yardımcıyı tamamlar.
    function isPersonOnAnnualLeaveV2(name, dateStr) {
        const wanted = normalizeName(name);
        if (!wanted || !dateStr) return false;
        return (hariciIzinler || []).some(rawRec => {
            const rec = normalizedAnnualRecord(rawRec);
            if (!isApprovedAnnualLeaveRecord(rec)) return false;
            if (normalizeName(rec.personel_adi) !== wanted) return false;
            const start = formatTarih(rec.baslangic_tarihi);
            const end = formatTarih(rec.bitis_tarihi);
            return !!start && !!end && dateStr >= start && dateStr <= end;
        });
    }
    global.isPersonOnAnnualLeave = isPersonOnAnnualLeaveV2;

    function stableHash(str) {
        let h = 2166136261 >>> 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function compareName(a, b) {
        return String(a.ad || a).localeCompare(String(b.ad || b), 'tr', { sensitivity: 'base' });
    }

    function unitType(unit) {
        const ayar = state.birimAyarlari && state.birimAyarlari[unit];
        if (ayar && ayar.tip) return ayar.tip;
        const u = normalizeName(unit);
        if (u.includes('MCR')) return 'DONGU8';
        if (u.includes('INGEST')) return 'DONGU6';
        return 'HAVUZ';
    }

    function isCycleUnit(unit) {
        const t = unitType(unit);
        return t === 'DONGU8' || t === 'DONGU6';
    }

    // Kullanıcı kuralı: normal/havuz birimlerinde kapasite minimum personel ihtiyacıdır.
    // MIN5 hedefini sağlayabilmek için kapasitenin üstüne kontrollü ek personel yazılabilir.
    // MCR/INGEST döngü birimlerinde ise operasyonel slotlar exact kalır.
    function isExactCapacityUnit(unit) {
        return isCycleUnit(unit);
    }

    function activeShiftCandidates(unit) {
        const shifts = (state.saatler || []).filter(isWorkShift);
        return shifts.map(s => ({ shift: s, total: [0,1,2,3,4,5,6].reduce((a,d) => a + capacity(unit,s,d), 0), t: shiftTimes(s) }));
    }

    function cycleShiftProfile(unit) {
        // Döngü vardiyasını kapasite sayısından TÜRETME.
        // Sıralama sabittir; yalnız sistemdeki gerçek saat metinlerine eşlenir.
        const shifts = (state.saatler || []).filter(isWorkShift);
        const rows = shifts.map(shift => ({shift, t:shiftTimes(shift)}));

        const exactMorning = shifts.includes(SHIFTS.SABAH) ? SHIFTS.SABAH : null;
        const exactEvening = shifts.includes(SHIFTS.AKSAM) ? SHIFTS.AKSAM : null;
        const exactNight = shifts.includes(SHIFTS.GECE) ? SHIFTS.GECE : null;

        const morning = exactMorning || (rows
            .filter(x => !isNightShift(x.shift) && x.t.start !== null && x.t.start < 12*60)
            .sort((a,b)=>a.t.start-b.t.start || a.shift.localeCompare(b.shift,'tr'))[0] || {}).shift || SHIFTS.SABAH;
        const evening = exactEvening || (rows
            .filter(x => isEveningToMidnight(x.shift) || (x.t.start !== null && x.t.start >= 15*60))
            .sort((a,b)=>a.t.start-b.t.start || a.shift.localeCompare(b.shift,'tr'))[0] || {}).shift || SHIFTS.AKSAM;
        const night = exactNight || (rows
            .filter(x => isNightShift(x.shift))
            .sort((a,b)=>a.t.start-b.t.start || a.shift.localeCompare(b.shift,'tr'))[0] || {}).shift || SHIFTS.GECE;
        return { morning, evening, night };
    }

    function ingestWeeklyRole(person, unit) {
        if (!person || person.birim !== unit || unitType(unit) !== 'DONGU6') return null;
        const baseStr = state.mcrAyarlari && state.mcrAyarlari.baslangicTarihi;
        let baseDate = baseStr ? new Date(`${baseStr}T12:00:00`) : new Date(currentMonday);
        if (isNaN(baseDate.getTime())) baseDate = new Date(currentMonday);
        baseDate = getMonday(baseDate);
        baseDate.setHours(12,0,0,0);

        const cur = getMonday(new Date(currentMonday));
        cur.setHours(12,0,0,0);
        const weekDiff = Math.round((cur - baseDate) / (7 * 86400000));

        // Eski 6'lı ofsetler korunur ve ilk haftadaki rolü belirlemek için kullanılır.
        // Bir önceki Pazar OFF ise bu hafta Pzt SABAH; Pazar SABAH ise Pzt AKŞAM;
        // Pazar AKŞAM ise Pzt İZİN rolüne girer.
        const offset = parseInt((state.mcrAyarlari && state.mcrAyarlari.ofsetler && state.mcrAyarlari.ofsetler[person.ad]) || 0, 10) || 0;
        const prevSundayIdx = ((-1 + offset) % 6 + 6) % 6;
        let baseRole = 0; // A: önceki hafta sonu izin -> Pzt sabah
        if (prevSundayIdx <= 1) baseRole = 1;      // B: önceki Pazar sabah -> Pzt akşam
        else if (prevSundayIdx <= 3) baseRole = 2; // C: önceki Pazar akşam -> Pzt izin
        else baseRole = 0;                         // A: önceki Pazar izin

        return ((baseRole + weekDiff) % 3 + 3) % 3;
    }

    function ingestWeeklyTemplate(person, unit) {
        const profile = cycleShiftProfile(unit);
        const role = ingestWeeklyRole(person, unit);
        if (role === null) return null;

        // A: Cmt/Paz izin yapan -> Pzt sabah; Sal-Çar akşam; Per-Cum izin; Cmt-Paz sabah
        // B: Pazar sabahçı -> Pzt akşam; Sal-Çar izin; Per-Cum sabah; Cmt-Paz akşam
        // C: Pazar akşamcı -> Pzt izin; Sal-Çar sabah; Per-Cum akşam; Cmt-Paz izin
        const templates = [
            [profile.morning, profile.evening, profile.evening, SHIFTS.IZIN, SHIFTS.IZIN, profile.morning, profile.morning],
            [profile.evening, SHIFTS.IZIN, SHIFTS.IZIN, profile.morning, profile.morning, profile.evening, profile.evening],
            [SHIFTS.IZIN, profile.morning, profile.morning, profile.evening, profile.evening, SHIFTS.IZIN, SHIFTS.IZIN]
        ];
        return { role, shifts: templates[role] };
    }

    function cycleExpectedShift(person, unit, day) {
        const type = unitType(unit);
        if (type !== 'DONGU8' && type !== 'DONGU6') return null;
        if (!person || person.birim !== unit) return null;

        if (type === 'DONGU6') {
            const t = ingestWeeklyTemplate(person, unit);
            return t ? t.shifts[day] : null;
        }

        const profile = cycleShiftProfile(unit);
        const loop = [profile.morning, profile.morning, profile.evening, profile.evening, profile.night, profile.night, SHIFTS.IZIN, SHIFTS.IZIN];

        const baseStr = state.mcrAyarlari && state.mcrAyarlari.baslangicTarihi;
        let baseDate = baseStr ? new Date(`${baseStr}T12:00:00`) : new Date(currentMonday);
        if (isNaN(baseDate.getTime())) baseDate = new Date(currentMonday);
        baseDate.setHours(12,0,0,0);
        const d = weekDate(day);
        const diffDays = Math.round((d - baseDate) / 86400000);
        const offset = parseInt((state.mcrAyarlari && state.mcrAyarlari.ofsetler && state.mcrAyarlari.ofsetler[person.ad]) || 0, 10) || 0;
        const idx = ((diffDays + offset) % loop.length + loop.length) % loop.length;
        return loop[idx];
    }

    function effectiveUnit(work, person, day) {
        return work.tempUnits[tempKey(person.ad, day)] || person.birim;
    }

    function countWorkDays(work, name) {
        let n = 0;
        const arr = work.matrix[name] || [];
        for (let d=0; d<7; d++) if (isWorkShift(arr[d])) n++;
        return n;
    }

    function previousWeekHKey() {
        const prev = new Date(currentMonday);
        prev.setDate(prev.getDate() - 7);
        return getDateKey(prev);
    }

    function previousWeekAssignment(name, day) {
        const map = state.manuelAtamalar || {};
        const key = `${previousWeekHKey()}_${name}_${day}`;
        return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
    }

    function previousWeekSundayShift(name) {
        return previousWeekAssignment(name, 6);
    }

    function previousWeekKnownOff(name, day) {
        const v = previousWeekAssignment(name, day);
        return v !== undefined && v !== null && isOffValue(v);
    }

    function previousWeekKnownWork(name, day) {
        const v = previousWeekAssignment(name, day);
        return v !== undefined && v !== null && isWorkShift(v);
    }

    function shiftBucket(shift) {
        if (!isWorkShift(shift)) return 'OFF';
        if (isNightShift(shift)) return 'NIGHT';
        const t = shiftTimes(shift);
        if (t.start === null) return 'OTHER';
        if (t.start < 12 * 60) return 'MORNING';
        if (t.start < 16 * 60) return 'MID';
        return 'EVENING';
    }

    function previousWeekRotationPenalty(name, day, shift) {
        const cfg = ensureSchedulerState().config;
        if (!cfg.rotateFromPreviousWeek) return 0;
        const prev = previousWeekAssignment(name, day);
        if (prev === undefined || prev === null) return 0;
        let penalty = 0;
        if (prev === shift) penalty += 2600;                       // Aynı gün + aynı saat en güçlü tekrar.
        else if (isWorkShift(prev) && isWorkShift(shift)) {
            if (shiftBucket(prev) === shiftBucket(shift)) penalty += 1050; // Aynı vardiya ailesi.
            else penalty += 180;                                  // Aynı gün çalışmak küçük tekrar.
        }
        if (day >= 5 && isWorkShift(prev) && isWorkShift(shift)) penalty += 850; // Hafta sonunu da döndür.
        return penalty;
    }

    function restAllowed(work, name, day, shift) {
        if (!isWorkShift(shift)) return true;
        let prev = null;
        if (day > 0) prev = work.matrix[name][day - 1];
        else prev = previousWeekSundayShift(name);

        if (previousShiftBlocksEarly(prev) && isEarlyDayShift(shift)) return false;

        // Ertesi gün önceden kilitli erken vardiya varsa bugüne geç/gece yazma.
        if (day < 6) {
            const next = work.matrix[name][day + 1];
            if (isWorkShift(next) && previousShiftBlocksEarly(shift) && isEarlyDayShift(next)) return false;
        }
        return true;
    }

    function assignmentSourceFor(key) {
        const s = ensureSchedulerState();
        return s.assignmentSource[key] || null;
    }

    function isManualLocked(key) {
        const s = ensureSchedulerState();
        return !!s.manualLocks[key];
    }

    function isManualUnitLocked(tKey) {
        const s = ensureSchedulerState();
        return !!s.manualUnitLocks[tKey];
    }

    function buildWorkingState(options) {
        ensureSchedulerState();
        const full = !!options.full;
        const targetUnits = new Set(options.units || []);
        const hKey = hKeyNow();
        const work = {
            matrix: {},
            reason: {},
            source: {},
            tempUnits: {},
            tempSource: {},
            touchedKeys: new Set(),
            touchedTempKeys: new Set(),
            replacements: {},
            ingestEmergency: {},
            notes: [],
            full,
            targetUnits,
            originalAssignments: deepClone(state.manuelAtamalar || {}),
            originalTempUnits: deepClone(state.geciciGorevler || {})
        };

        // Manuel geçici birim değişiklikleri her durumda korunur.
        const scheduler = ensureSchedulerState();
        Object.keys(state.geciciGorevler || {}).forEach(k => {
            const src = scheduler.tempUnitSource[k];
            const manual = scheduler.manualUnitLocks[k] || src === MANUAL_SOURCE || src === REQUEST_SOURCE;
            if (manual) {
                work.tempUnits[k] = state.geciciGorevler[k];
                work.tempSource[k] = src || MANUAL_SOURCE;
            } else if (!full) {
                // Yerel optimizasyonda diğer birimlerin otomatik geçici görevleri dondurulur.
                const target = state.geciciGorevler[k];
                if (!targetUnits.has(target)) {
                    work.tempUnits[k] = target;
                    work.tempSource[k] = src || FROZEN_SOURCE;
                } else {
                    work.touchedTempKeys.add(k);
                }
            } else {
                work.touchedTempKeys.add(k);
            }
        });

        state.personeller.forEach(p => {
            work.matrix[p.ad] = Array(7).fill(null);
            work.reason[p.ad] = Array(7).fill(null);
            work.source[p.ad] = Array(7).fill(null);

            for (let day=0; day<7; day++) {
                const key = assignmentKey(p.ad, day, hKey);
                const tKey = tempKey(p.ad, day);
                const existing = (state.manuelAtamalar || {})[key];
                const existingTemp = (state.geciciGorevler || {})[tKey];
                const existingUnit = existingTemp || p.birim;
                const manualLock = isManualLocked(key);
                const source = assignmentSourceFor(key);

                // Full üretimde yalnız V62'nin yönettiği birimler yeniden üretilir.
                // Excel ile yönetilen KAMERAMAN birimleri aynen korunur.
                const legacyExternal = isLegacyExternalUnit(p.birim) || isLegacyExternalUnit(existingUnit);
                if (full) {
                    if (!legacyExternal && (targetUnits.has(existingUnit) || targetUnits.has(p.birim))) work.touchedKeys.add(key);
                } else if (targetUnits.has(existingUnit) || (targetUnits.has(p.birim) && !existingTemp)) {
                    work.touchedKeys.add(key);
                }

                // 1) Mevcut yıllık izin / rapor her şeyden güçlüdür.
                if (existing === SHIFTS.YILLIK || isPersonOnAnnualLeaveV2(p.ad, dateKeyForDay(day))) {
                    work.matrix[p.ad][day] = SHIFTS.YILLIK;
                    work.reason[p.ad][day] = 'YILLIK İZİN';
                    work.source[p.ad][day] = ANNUAL_SOURCE;
                    continue;
                }
                if (existing === SHIFTS.RAPOR) {
                    work.matrix[p.ad][day] = SHIFTS.RAPOR;
                    work.reason[p.ad][day] = 'RAPOR';
                    work.source[p.ad][day] = REPORT_SOURCE;
                    continue;
                }

                // Excel ile dışarıdan yönetilen KAMERAMAN birimleri V62 tarafından yeniden yazılmaz.
                // Excel'de ne varsa (vardiya/izin/boş) aynı şekilde ekranda kalır.
                if (isLegacyExternalUnit(p.birim)) {
                    if (Object.prototype.hasOwnProperty.call(state.manuelAtamalar || {}, key)) {
                        work.matrix[p.ad][day] = existing;
                        work.reason[p.ad][day] = 'EXCEL / LEGACY KORUMA';
                        work.source[p.ad][day] = source || LEGACY_EXTERNAL_SOURCE;
                    }
                    continue;
                }

                // 2) V62 ile elle kilitlenen hücre korunur.
                if (manualLock && existing) {
                    work.matrix[p.ad][day] = existing;
                    work.reason[p.ad][day] = 'MANUEL KİLİT';
                    work.source[p.ad][day] = source || MANUAL_SOURCE;
                    continue;
                }

                // 3) Yönetim panelindeki sabit izin günü.
                if (Array.isArray(p.izinGunleri) && p.izinGunleri.includes(day)) {
                    work.matrix[p.ad][day] = SHIFTS.IZIN;
                    work.reason[p.ad][day] = 'SABİT İZİN GÜNÜ';
                    work.source[p.ad][day] = FIXED_OFF_SOURCE;
                    continue;
                }

                // 4) Hafta içi sabit personel Cmt/Paz varsayılan olarak HARD izinlidir.
                // Yalnız yönetimde ayrıca 'Cmt/Paz kapasite yedeği' seçilmişse bu iki gün boş bırakılır;
                // solver ancak normal personelle exact kapasite çözülemeyince son çare olarak kullanabilir.
                if (!isCycleUnit(p.birim) && day >= 5 && isWeekdayFixedPerson(p) && !isWeekendReservePerson(p)) {
                    work.matrix[p.ad][day] = SHIFTS.IZIN;
                    work.reason[p.ad][day] = 'HAFTA İÇİ SABİT / HAFTA SONU İZİN';
                    work.source[p.ad][day] = FIXED_WEEKEND_OFF_SOURCE;
                    continue;
                }

                // 5) Hafta içi sabit vardiya.
                if (!isCycleUnit(p.birim) && day < 5 && isWeekdayFixedPerson(p)) {
                    work.matrix[p.ad][day] = state.haftaIciSabitler[p.ad];
                    work.reason[p.ad][day] = 'HAFTA İÇİ SABİT';
                    work.source[p.ad][day] = FIXED_SHIFT_SOURCE;
                    continue;
                }

                // 5b) Kapasitesi tanımlanmamış birim V62 otomasyon kapsamı dışındadır.
                // Mevcut hücre varsa dondur; böylece bu personel başka birime yedek seçilirken
                // gerçek mevcut çalışması da müsaitlik hesabında görülür.
                if (isNoCapacityPreservedUnit(p.birim)) {
                    if (Object.prototype.hasOwnProperty.call(state.manuelAtamalar || {}, key)) {
                        work.matrix[p.ad][day] = existing;
                        work.reason[p.ad][day] = 'KAPASİTE TANIMSIZ / MEVCUT LİSTE KORUMA';
                        work.source[p.ad][day] = source || FROZEN_SOURCE;
                    }
                    continue;
                }

                // 6) Yerel optimizasyonda diğer birimdeki çalışma vardiyasına dokunma.
                if (!full && isWorkShift(existing) && !targetUnits.has(existingUnit)) {
                    work.matrix[p.ad][day] = existing;
                    work.reason[p.ad][day] = `DİĞER BİRİM DONDURULDU: ${existingUnit}`;
                    work.source[p.ad][day] = source || FROZEN_SOURCE;
                    continue;
                }

                // Diğer tüm eski otomatik/legacy hücreler bilinçli olarak boş bırakılır.
                // Çözüm bunları yeniden üretecek.
            }
        });

        return work;
    }

    function cloneWork(work) {
        return {
            matrix: deepClone(work.matrix),
            reason: deepClone(work.reason),
            source: deepClone(work.source),
            tempUnits: deepClone(work.tempUnits),
            tempSource: deepClone(work.tempSource),
            touchedKeys: new Set(Array.from(work.touchedKeys || [])),
            touchedTempKeys: new Set(Array.from(work.touchedTempKeys || [])),
            replacements: deepClone(work.replacements),
            ingestEmergency: deepClone(work.ingestEmergency || {}),
            notes: (work.notes || []).slice(),
            full: work.full,
            targetUnits: new Set(Array.from(work.targetUnits || [])),
            originalAssignments: work.originalAssignments,
            originalTempUnits: work.originalTempUnits
        };
    }

    function hardReason(work, name, day) {
        return work.reason[name] && work.reason[name][day];
    }

    function hardWorkCountForUnit(work, unit, day, shift) {
        let n = 0;
        state.personeller.forEach(p => {
            if (work.matrix[p.ad][day] === shift && effectiveUnit(work, p, day) === unit) n++;
        });
        return n;
    }

    function validateHardStateForUnit(work, unit) {
        const errors = [];
        for (let day=0; day<7; day++) {
            (state.saatler || []).forEach(shift => {
                const cnt = hardWorkCountForUnit(work, unit, day, shift);
                const cap = capacity(unit, shift, day);
                if (isExactCapacityUnit(unit) && cnt > cap) {
                    errors.push(`${unit} / ${GUNLER[day]} / ${shift}: kilitli atama ${cnt}, exact kapasite ${cap}.`);
                }
            });
        }

        state.personeller.forEach(p => {
            for (let day=0; day<7; day++) {
                const v = work.matrix[p.ad][day];
                if (!isWorkShift(v)) continue;
                const u = effectiveUnit(work, p, day);
                if (u === unit && !isQualifiedForUnit(p, unit)) {
                    errors.push(`${p.ad}, ${GUNLER[day]} günü ${unit} için gerekli uzmanlığa sahip değil.`);
                }
                if (u === unit && !restAllowed(work, p.ad, day, v)) {
                    errors.push(`${p.ad}, ${GUNLER[day]} ${v}: dinlenme kuralı kilitli atamalar nedeniyle ihlal ediliyor.`);
                }
            }
        });
        return errors;
    }

    function buildPreferredOffPairs(work, unit, variant) {
        const result = {};
        const primary = state.personeller.filter(p => p.birim === unit).slice().sort(compareName);
        const demand = [0,1,2,3,4,5,6].map(d => totalDailyCapacity(unit, d));
        const usage = [0,0,0,0,0,0];
        const pairs = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]];

        primary.forEach((p, idx) => {
            // Önceki haftanın pazarı açıkça izinliyse, bu haftanın pazartesini izin tutmak
            // gerçek takvimde 2 ardışık izin oluşturur. (undefined = bilinmiyor, izin sayılmaz.)
            const prevSun = previousWeekSundayShift(p.ad);
            if (prevSun !== undefined && prevSun !== null && isOffValue(prevSun) && !isWorkShift(work.matrix[p.ad][0])) {
                result[p.ad] = [0]; // sanal çift: önceki Pazar + bu Pazartesi
                return;
            }

            // Zaten hard constraint olarak ardışık iki gün izinliyse onu tercih çifti say.
            for (let i=0; i<6; i++) {
                if (isOffValue(work.matrix[p.ad][i]) && hardReason(work,p.ad,i) &&
                    isOffValue(work.matrix[p.ad][i+1]) && hardReason(work,p.ad,i+1)) {
                    result[p.ad] = [i,i+1];
                    usage[i]++;
                    return;
                }
            }

            const candidates = pairs.filter(pair => pair.every(d => !isWorkShift(work.matrix[p.ad][d])));
            if (!candidates.length) return;
            candidates.sort((a,b) => {
                const ai = a[0], bi = b[0];
                const repeatA = a.reduce((n,d) => n + (previousWeekKnownOff(p.ad,d) ? 1 : 0), 0);
                const repeatB = b.reduce((n,d) => n + (previousWeekKnownOff(p.ad,d) ? 1 : 0), 0);
                const scoreA = (demand[a[0]] + demand[a[1]]) * 100 + usage[ai] * 35 + repeatA * 1800 + ((ai + idx + variant) % 6);
                const scoreB = (demand[b[0]] + demand[b[1]]) * 100 + usage[bi] * 35 + repeatB * 1800 + ((bi + idx + variant) % 6);
                return scoreA - scoreB;
            });
            result[p.ad] = candidates[0];
            usage[candidates[0][0]]++;
        });
        return result;
    }

    function personFutureFlexibility(work, person, day, unit) {
        let free = 0;
        for (let d=day+1; d<7; d++) {
            if (work.matrix[person.ad][d] === null && isQualifiedForUnit(person, unit)) free++;
        }
        return free;
    }

    function historicalNightCount(name) {
        let count = 0;
        for (let w=1; w<=4; w++) {
            const d = new Date(currentMonday); d.setDate(d.getDate() - 7*w);
            const hk = getDateKey(d);
            for (let day=0; day<7; day++) {
                const v = state.manuelAtamalar && state.manuelAtamalar[`${hk}_${name}_${day}`];
                if (isNightShift(v)) count++;
            }
        }
        return count;
    }

    function assignmentCost(work, person, unit, day, shift, phase, offPairs, attempt) {
        let cost = 0;
        const workDays = countWorkDays(work, person.ad);

        // Öncelik her zaman birimin kendi personelinde; uzman yedek yalnız eksikte devreye girer.
        if (person.birim !== unit) cost += 10000;

        // Hafta içi sabit + hafta sonu yedek kişi, normal havuzdan sonra SON ÇARE olsun.
        if (day >= 5 && isWeekendReservePerson(person)) {
            cost += 30000;
            if (isMorningShift(shift)) cost -= 2500; // Kullanılırsa genellikle sabah vardiyası.
        }

        // Haftalık yük dengesi.
        cost += workDays * 450;
        if (workDays >= 5) cost += 3500; // 6. gün ancak kapasite gerektirirse.

        const pair = offPairs && offPairs[person.ad];
        if (pair && pair.includes(day)) cost += 3000;

        // MCR/INGEST döngüsünü güçlü tercih olarak koru, ama kapasiteden üstün tutma.
        if (isCycleUnit(unit) && person.birim === unit) {
            const expected = cycleExpectedShift(person, unit, day);
            if (expected === shift) cost += 0;
            else if (isOffValue(expected)) cost += 2200;
            else cost += 1200;
        }

        // Gece puanlı birimlerde mevcut yüzde alanını koru.
        if (unitType(unit) === 'GECE_ONCELIKLI' && isNightShift(shift)) {
            const yuzde = Math.max(0, Math.min(100, parseInt(person.yuzde || 0, 10) || 0));
            cost += (100 - yuzde) * 8;
        }

        if (isNightShift(shift)) cost += historicalNightCount(person.ad) * 70;

        // Önceki haftanın birebir kopyasını üretme. Kapasite/hard kurallar izin verdiği ölçüde
        // aynı kişiyi aynı gün aynı saate tekrar yazmaktan kaçın.
        cost += previousWeekRotationPenalty(person.ad, day, shift);

        // Gelecekte daha az müsait olan kişiyi bugün kullanmak, ileriki gün kilitlenmeyi azaltır.
        cost += personFutureFlexibility(work, person, day, unit) * 10;

        // Tam deterministik eşitlik bozucu. Math.random kullanılmaz.
        cost += stableHash(`${hKeyNow()}|${attempt}|${unit}|${day}|${shift}|${person.ad}`) % 41;
        return cost;
    }

    function candidateAllowed(work, person, unit, day, shift, phase, offPairs) {
        // Excel ile yönetilen KAMERAMAN personeli otomatik yedek havuzuna alınmaz.
        if (isLegacyExternalUnit(person && person.birim)) return false;
        if (!isQualifiedForUnit(person, unit)) return false;
        if (work.matrix[person.ad][day] !== null) return false;

        // Bu gün için elle başka birime sabitlenmiş personel alınamaz.
        const tKey = tempKey(person.ad, day);
        const forcedUnit = work.tempUnits[tKey];
        if (forcedUnit && isManualUnitLocked(tKey) && forcedUnit !== unit) return false;

        // Hafta içi sabit personelin hafta sonu normal aday olması yasaktır.
        // Seçili kapasite yedeği bile yalnız 6-gün 'kapasite zorunlu' fallback fazında kullanılabilir.
        if (day >= 5 && isWeekdayFixedPerson(person)) {
            if (!isWeekendReservePerson(person)) return false;
            if (phase.name !== 'KAPASITE_ZORUNLU_6_GUN') return false;
        }

        if (countWorkDays(work, person.ad) >= phase.maxWorkDays) return false;
        if (!restAllowed(work, person.ad, day, shift)) return false;

        if (phase.enforceOffPair && person.birim === unit) {
            const pair = offPairs[person.ad];
            if (pair && pair.includes(day)) return false;
        }
        return true;
    }


    // Haftalık adalet ikinci bir HARD hedef olarak ele alınır:
    // Aynı birimin kendi personeli arasında, izin/rapor/sabit kısıtlar izin verdiği sürece
    // çalışma günü farkı 1'den büyük bırakılmaz. Bu fonksiyon kapasiteyi ASLA değiştirmez;
    // yalnız aynı gün + aynı vardiyadaki AUTO atamayı fazla çalışandan az çalışana devreder.
    function hasConsecutiveOff(work, name) {
        const prevSun = previousWeekSundayShift(name);
        if (prevSun !== undefined && prevSun !== null && isOffValue(prevSun) && isOffValue(work.matrix[name][0])) return true;
        for (let d=0; d<6; d++) {
            if (isOffValue(work.matrix[name][d]) && isOffValue(work.matrix[name][d+1])) return true;
        }
        return false;
    }

    function isTransferableAutoAssignment(work, person, unit, day) {
        const v = work.matrix[person.ad][day];
        if (!isWorkShift(v)) return false;
        if (effectiveUnit(work, person, day) !== unit) return false;
        const src = work.source[person.ad] && work.source[person.ad][day];
        // Manuel, sabit vardiya, MCR süreklilik yedeği ve dondurulmuş kayıtlar taşınmaz.
        return src === AUTO_SOURCE || src === AUTO_MIN5_EXTRA_SOURCE;
    }

    function canReceiveTransferredShift(work, person, unit, day, shift, phase) {
        if (!person || person.birim !== unit) return false;
        if (!isQualifiedForUnit(person, unit)) return false;
        if (work.matrix[person.ad][day] !== null) return false;
        const tKey = tempKey(person.ad, day);
        const forcedUnit = work.tempUnits[tKey];
        if (forcedUnit && forcedUnit !== unit) return false;
        if (countWorkDays(work, person.ad) >= phase.maxWorkDays) return false;
        return restAllowed(work, person.ad, day, shift);
    }

    function isHardUnavailableForMinimum(work, person, day) {
        const v = work.matrix[person.ad] && work.matrix[person.ad][day];
        if (!isOffValue(v)) return false;
        const src = work.source[person.ad] && work.source[person.ad][day];
        return src === ANNUAL_SOURCE || src === ANNUAL_LOCAL_SOURCE || src === ANNUAL_EXTERNAL_SOURCE ||
               src === REPORT_SOURCE || src === FIXED_OFF_SOURCE || src === FIXED_WEEKEND_OFF_SOURCE ||
               src === MANUAL_SOURCE || src === REQUEST_SOURCE;
    }

    function minimumTargetDays(work, person, unit) {
        if (!person || person.birim !== unit) return 0;
        if (isLegacyExternalUnit(unit)) return 0;
        const cfg = ensureSchedulerState().config;

        // Hafta içi sabit personel rotasyon havuzunun MIN5 hedefiyle hafta sonuna çekilmez.
        // Normal hedefi, yıllık izin/rapor/sabit izin düşüldükten sonra kalan Pzt-Cum sabit gün sayısıdır.
        // Cmt/Paz yedek kullanımı yalnız exact kapasite başka türlü dolmuyorsa 6-gün fallback fazında olur.
        if (isWeekdayFixedPerson(person)) {
            let fixedAvailable = 0;
            for (let d=0; d<5; d++) if (!isHardUnavailableForMinimum(work,person,d)) fixedAvailable++;
            return fixedAvailable;
        }

        let available = 7;
        for (let d=0; d<7; d++) if (isHardUnavailableForMinimum(work,person,d)) available--;
        return Math.max(0, Math.min(cfg.minWorkDays || 5, available));
    }

    function minWorkCapacityFeasible(work, unit) {
        const own = state.personeller.filter(p => p.birim === unit);
        const required = own.reduce((n,p) => n + minimumTargetDays(work,p,unit), 0);
        // MCR/INGEST sürekli yedeği, manuel cross-unit görev veya dondurulmuş görev gibi
        // devredilemeyen dış-birim atamaları unit kapasitesinden gerçek slot tüketir.
        let reservedCross = 0;
        state.personeller.filter(p => p.birim !== unit).forEach(p => {
            for (let d=0; d<7; d++) {
                if (!isWorkShift(work.matrix[p.ad] && work.matrix[p.ad][d])) continue;
                if (effectiveUnit(work,p,d) !== unit) continue;
                const src = work.source[p.ad] && work.source[p.ad][d];
                if (src !== AUTO_SOURCE && src !== AUTO_MIN5_EXTRA_SOURCE) reservedCross++;
            }
        });
        const baseSlots = Math.max(0, weeklyCapacity(unit) - reservedCross);
        // Döngü birimlerinde kapasite exact olduğu için eski matematik geçerlidir.
        // Havuz birimlerinde kapasite minimumdur; required > baseSlots ise fark MIN5_EXTRA ile
        // kontrollü biçimde kapasite üstüne eklenebilir. Bu yüzden kapasite tek başına infeasible değildir.
        if (isExactCapacityUnit(unit)) {
            return { feasible: baseSlots >= required, required, slots:baseSlots, reservedCross, extraNeeded:0 };
        }
        return { feasible:true, required, slots:baseSlots, reservedCross, extraNeeded:Math.max(0,required-baseSlots) };
    }

    function isMorningShift(shift) {
        if (!isWorkShift(shift) || isNightShift(shift)) return false;
        const t = shiftTimes(shift);
        return t.start !== null && t.start < 12 * 60;
    }

    function donorCanGiveForMinimum(work, donor, unit) {
        if (donor.birim !== unit) return true; // Uzman yedekten kendi birim personeline slotu geri alabiliriz.
        return countWorkDays(work,donor.ad) > minimumTargetDays(work,donor,unit);
    }

    function bestMinimumTopUpTransfer(work, unit, phase) {
        const own = state.personeller.filter(p => p.birim === unit).slice().sort(compareName);
        const receivers = own.filter(p => countWorkDays(work,p.ad) < minimumTargetDays(work,p,unit))
            .sort((a,b) => {
                const da = minimumTargetDays(work,a,unit)-countWorkDays(work,a.ad);
                const db = minimumTargetDays(work,b,unit)-countWorkDays(work,b.ad);
                return db-da || countWorkDays(work,a.ad)-countWorkDays(work,b.ad) || compareName(a,b);
            });
        if (!receivers.length) return null;

        const moves = [];
        for (const receiver of receivers) {
            for (const donor of state.personeller) {
                if (donor.ad === receiver.ad || !donorCanGiveForMinimum(work,donor,unit)) continue;
                for (let day=0; day<7; day++) {
                    if (!isTransferableAutoAssignment(work,donor,unit,day)) continue;
                    const shift = work.matrix[donor.ad][day];
                    if (!canReceiveTransferredShift(work,receiver,unit,day,shift,phase)) continue;

                    const tmp = cloneWork(work);
                    tmp.matrix[donor.ad][day] = null;
                    tmp.reason[donor.ad][day] = null;
                    tmp.source[donor.ad][day] = null;
                    const dtk = tempKey(donor.ad,day);
                    if (tmp.tempUnits[dtk] === unit && tmp.tempSource[dtk] === AUTO_SOURCE) {
                        delete tmp.tempUnits[dtk]; delete tmp.tempSource[dtk];
                    }
                    tmp.matrix[receiver.ad][day] = shift;
                    tmp.reason[receiver.ad][day] = 'AUTO V62 MIN-5 TAMAMLAMA';
                    tmp.source[receiver.ad][day] = AUTO_SOURCE;
                    if (!restAllowed(tmp,receiver.ad,day,shift)) continue;

                    let score = 0;
                    // Kullanıcı tercihi: 4 günlük kişiyi mümkünse hafta sonu ve özellikle sabah tamamla.
                    if (day >= 5 && isMorningShift(shift)) score += 0;
                    else if (day >= 5) score += 650;
                    else if (isMorningShift(shift)) score += 1600;
                    else score += 2400;

                    // Önceki haftanın tekrarını da azaltan transferi tercih et.
                    score += previousWeekRotationPenalty(receiver.ad,day,shift);
                    score -= Math.min(1200, previousWeekRotationPenalty(donor.ad,day,shift));
                    if (!hasConsecutiveOff(tmp,receiver.ad)) score += 350;
                    score += stableHash(`${hKeyNow()}|MIN5|${unit}|${receiver.ad}|${donor.ad}|${day}|${shift}`) % 83;
                    moves.push({receiver,donor,day,shift,score});
                }
            }
        }
        moves.sort((a,b) => a.score-b.score || compareName(a.receiver,b.receiver) || compareName(a.donor,b.donor) || a.day-b.day || String(a.shift).localeCompare(String(b.shift),'tr'));
        return moves[0] || null;
    }


    function min5ExtraShiftScore(work, unit, receiver, day, shift) {
        let score = 0;
        // Kullanıcı tercihi: ekstra 5. gün mümkünse hafta sonu SABAH.
        if (day >= 5 && isMorningShift(shift)) score += 0;
        else if (day >= 5) score += 700;
        else if (isMorningShift(shift)) score += 1800;
        else score += 2600;

        // Aynı slota gereksiz yığılmayı önle. Kapasite tabanının üstündeki her ekstra artan maliyet taşır.
        let actual = 0;
        state.personeller.forEach(p => {
            if (work.matrix[p.ad] && work.matrix[p.ad][day] === shift && effectiveUnit(work,p,day) === unit) actual++;
        });
        const over = Math.max(0, actual - capacity(unit,shift,day));
        score += over * 1600;
        score += previousWeekRotationPenalty(receiver.ad,day,shift);
        score += stableHash(`${hKeyNow()}|MIN5_EXTRA|${unit}|${receiver.ad}|${day}|${shift}`) % 97;
        return score;
    }

    function bestMinimumExtraAssignment(work, unit, phase) {
        if (isExactCapacityUnit(unit)) return null; // MCR/INGEST kapasitesi exact kalır.
        const cfg = ensureSchedulerState().config;
        if (!cfg.allowMin5Extras) return null;
        const receivers = state.personeller
            .filter(p => p.birim === unit && !isWeekdayFixedPerson(p))
            .filter(p => countWorkDays(work,p.ad) < minimumTargetDays(work,p,unit))
            .sort((a,b) => {
                const da=minimumTargetDays(work,a,unit)-countWorkDays(work,a.ad);
                const db=minimumTargetDays(work,b,unit)-countWorkDays(work,b.ad);
                return db-da || countWorkDays(work,a.ad)-countWorkDays(work,b.ad) || compareName(a,b);
            });
        const moves=[];
        for (const receiver of receivers) {
            if (countWorkDays(work,receiver.ad) >= phase.maxWorkDays) continue;
            for (let day=0; day<7; day++) {
                if (work.matrix[receiver.ad][day] !== null) continue;
                if (isHardUnavailableForMinimum(work,receiver,day)) continue;
                const tKey=tempKey(receiver.ad,day);
                const forced=work.tempUnits[tKey];
                if (forced && forced !== unit) continue;
                for (const shift of state.saatler || []) {
                    // Kapasitesi 0 olan bir vardiyayı sırf 5. gün için açma; mevcut operasyonel vardiyalardan birine ekle.
                    if (capacity(unit,shift,day) <= 0) continue;
                    if (!restAllowed(work,receiver.ad,day,shift)) continue;
                    moves.push({receiver,day,shift,score:min5ExtraShiftScore(work,unit,receiver,day,shift)});
                }
            }
        }
        moves.sort((a,b)=>a.score-b.score || compareName(a.receiver,b.receiver) || a.day-b.day || String(a.shift).localeCompare(String(b.shift),'tr'));
        return moves[0] || null;
    }

    function rebalanceMinimumWorkDays(work, unit, phase) {
        const feasibility = minWorkCapacityFeasible(work,unit);
        const changes = [];
        if (!feasibility.feasible) {
            work.notes.push(`${unit}: minimum 5 gün exact döngü kapasitesi nedeniyle mümkün değil (${feasibility.slots} slot / ${feasibility.required} gerekli).`);
            return {changes, feasibility};
        }
        for (let guard=0; guard<180; guard++) {
            // 1) Önce mevcut kapasite slotunu fazla çalışandan eksik çalışana devret: ekstra personel yaratmaz.
            const move = bestMinimumTopUpTransfer(work,unit,phase);
            if (move) {
                const {receiver,donor,day,shift} = move;
                work.matrix[donor.ad][day] = null;
                work.reason[donor.ad][day] = null;
                work.source[donor.ad][day] = null;
                const dtk = tempKey(donor.ad,day);
                if (work.tempUnits[dtk] === unit && work.tempSource[dtk] === AUTO_SOURCE) {
                    delete work.tempUnits[dtk]; delete work.tempSource[dtk];
                    work.touchedTempKeys.add(dtk);
                }
                work.matrix[receiver.ad][day] = shift;
                work.reason[receiver.ad][day] = `AUTO V62 MIN-5 DEVİR: ${donor.ad} -> ${receiver.ad}`;
                work.source[receiver.ad][day] = AUTO_SOURCE;
                work.touchedKeys.add(assignmentKey(donor.ad,day));
                work.touchedKeys.add(assignmentKey(receiver.ad,day));
                changes.push(`${receiver.ad} + ${GUNLER[day]} ${shift} (devir: ${donor.ad})`);
                continue;
            }

            // 2) Kimse slot devredemiyorsa ve kişi hâlâ 4G ise, HAVUZ biriminde kapasiteyi taban kabul edip
            //    kontrollü tek ek atama yap. Bu tam olarak kullanıcının '4G kalmasın, 5. günü hafta sonu sabah ekle' kuralıdır.
            const extra = bestMinimumExtraAssignment(work,unit,phase);
            if (extra) {
                const {receiver,day,shift}=extra;
                work.matrix[receiver.ad][day]=shift;
                work.reason[receiver.ad][day]='AUTO V62 MIN-5 EK PERSONEL';
                work.source[receiver.ad][day]=AUTO_MIN5_EXTRA_SOURCE;
                work.touchedKeys.add(assignmentKey(receiver.ad,day));
                changes.push(`${receiver.ad} + ${GUNLER[day]} ${shift} (MIN5 ek personel)`);
                continue;
            }
            break;
        }
        if (changes.length) work.notes.push(`${unit}: minimum çalışma günü için ${changes.length} düzeltme yapıldı (önce devir, gerekirse Cmt/Paz sabah MIN5 ek personel).`);
        return {changes, feasibility};
    }

    function bestFairnessTransfer(work, unit, phase) {
        const primary = state.personeller.filter(p => p.birim === unit).slice().sort(compareName);
        if (primary.length < 2) return null;
        const counts = Object.fromEntries(primary.map(p => [p.ad, countWorkDays(work,p.ad)]));
        const donors = primary.slice().sort((a,b) => counts[b.ad] - counts[a.ad] || compareName(a,b));
        const receivers = primary.slice().sort((a,b) => counts[a.ad] - counts[b.ad] || compareName(a,b));
        const moves = [];

        for (const donor of donors) {
            for (const receiver of receivers) {
                if (donor.ad === receiver.ad) continue;
                if (counts[donor.ad] - counts[receiver.ad] <= 1) continue;
                for (let day=0; day<7; day++) {
                    if (!isTransferableAutoAssignment(work,donor,unit,day)) continue;
                    const shift = work.matrix[donor.ad][day];
                    if (!canReceiveTransferredShift(work,receiver,unit,day,shift,phase)) continue;

                    // Geçici kopyada devrin iki kişi için izin düzenini nasıl etkilediğini ölç.
                    const tmp = cloneWork(work);
                    tmp.matrix[donor.ad][day] = null;
                    tmp.reason[donor.ad][day] = null;
                    tmp.source[donor.ad][day] = null;
                    tmp.matrix[receiver.ad][day] = shift;
                    tmp.reason[receiver.ad][day] = 'AUTO V62 ADALET DENGESİ';
                    tmp.source[receiver.ad][day] = AUTO_SOURCE;
                    if (!restAllowed(tmp,receiver.ad,day,shift)) continue;

                    let score = 0;
                    // Öncelik: 4/6 -> 5/5 gibi farkı kapat.
                    const newGap = (counts[donor.ad]-1) - (counts[receiver.ad]+1);
                    score += Math.abs(newGap) * 10000;
                    // Mümkünse hem alıcıda hem vericide 2 ardışık izin koru/oluştur.
                    if (!hasConsecutiveOff(tmp, receiver.ad)) score += 1000;
                    if (!hasConsecutiveOff(tmp, donor.ad)) score += 700;
                    // Deterministik bağ kırıcı.
                    score += stableHash(`${hKeyNow()}|FAIR|${unit}|${donor.ad}|${receiver.ad}|${day}|${shift}`) % 97;
                    moves.push({donor,receiver,day,shift,score});
                }
            }
        }
        moves.sort((a,b) => a.score-b.score || compareName(a.donor,b.donor) || compareName(a.receiver,b.receiver) || a.day-b.day || String(a.shift).localeCompare(String(b.shift),'tr'));
        return moves[0] || null;
    }

    function rebalanceWeeklyFairness(work, unit, phase) {
        const changes = [];
        // Her transfer toplam kapasiteyi sabit tuttuğu için güvenle iterasyon yapılabilir.
        for (let guard=0; guard<200; guard++) {
            const move = bestFairnessTransfer(work,unit,phase);
            if (!move) break;
            const {donor,receiver,day,shift} = move;
            work.matrix[donor.ad][day] = null;
            work.reason[donor.ad][day] = null;
            work.source[donor.ad][day] = null;
            work.matrix[receiver.ad][day] = shift;
            work.reason[receiver.ad][day] = `AUTO V62 ADALET: ${donor.ad} -> ${receiver.ad}`;
            work.source[receiver.ad][day] = AUTO_SOURCE;
            work.touchedKeys.add(assignmentKey(donor.ad,day));
            work.touchedKeys.add(assignmentKey(receiver.ad,day));
            changes.push(`${donor.ad} -> ${receiver.ad} / ${GUNLER[day]} / ${shift}`);
        }
        if (changes.length) work.notes.push(`${unit}: haftalık iş yükü dengesi için ${changes.length} vardiya devredildi.`);
        return changes;
    }

    function unitWorkloadSummary(work, unit) {
        return state.personeller.filter(p => p.birim === unit).slice().sort(compareName)
            .map(p => ({name:p.ad, days:countWorkDays(work,p.ad), consecutiveOff:hasConsecutiveOff(work,p.ad)}));
    }

    // Küçük ve bağımsız min-cost max-flow; günlük kapasite atamasını TAM olarak çözer.
    function minCostDailyAssignment(work, unit, day, needs, phase, offPairs, attempt) {
        const shifts = Object.keys(needs).filter(s => needs[s] > 0);
        const totalNeed = shifts.reduce((a,s) => a + needs[s], 0);
        if (totalNeed === 0) return { ok: true, assignments: [] };

        const candidates = state.personeller.filter(p => work.matrix[p.ad][day] === null && isQualifiedForUnit(p, unit));
        if (candidates.length < totalNeed) {
            return { ok:false, reason:`${GUNLER[day]}: ${unit} için ${totalNeed} boş slot var, yalnız ${candidates.length} uygun/boş personel var.` };
        }

        const N = 2 + candidates.length + shifts.length;
        const S = 0, T = N - 1;
        const graph = Array.from({length:N}, () => []);
        const edgeRefs = [];
        function addEdge(u,v,cap,cost,meta) {
            const a = {to:v, rev:graph[v].length, cap, cost, meta, initialCap:cap};
            const b = {to:u, rev:graph[u].length, cap:0, cost:-cost, meta:null, initialCap:0};
            graph[u].push(a); graph[v].push(b);
            return a;
        }
        candidates.forEach((p,i) => addEdge(S, 1+i, 1, 0));
        shifts.forEach((shift,j) => addEdge(1+candidates.length+j, T, needs[shift], 0));

        candidates.forEach((p,i) => {
            shifts.forEach((shift,j) => {
                if (!candidateAllowed(work,p,unit,day,shift,phase,offPairs)) return;
                const cost = assignmentCost(work,p,unit,day,shift,phase,offPairs,attempt);
                const e = addEdge(1+i, 1+candidates.length+j, 1, cost, {person:p.ad, shift});
                edgeRefs.push(e);
            });
        });

        let flow = 0, totalCost = 0;
        while (flow < totalNeed) {
            const dist = Array(N).fill(Infinity);
            const inQ = Array(N).fill(false);
            const pv = Array(N).fill(-1), pe = Array(N).fill(-1);
            dist[S] = 0;
            const q = [S]; inQ[S] = true;
            while (q.length) {
                const u = q.shift(); inQ[u] = false;
                for (let i=0; i<graph[u].length; i++) {
                    const e = graph[u][i];
                    if (e.cap <= 0) continue;
                    const nd = dist[u] + e.cost;
                    if (nd < dist[e.to]) {
                        dist[e.to] = nd; pv[e.to] = u; pe[e.to] = i;
                        if (!inQ[e.to]) { q.push(e.to); inQ[e.to] = true; }
                    }
                }
            }
            if (!Number.isFinite(dist[T])) break;
            let add = totalNeed - flow;
            for (let v=T; v!==S; v=pv[v]) {
                if (v < 0 || pv[v] < 0) { add = 0; break; }
                add = Math.min(add, graph[pv[v]][pe[v]].cap);
            }
            if (!add) break;
            for (let v=T; v!==S; v=pv[v]) {
                const e = graph[pv[v]][pe[v]];
                e.cap -= add;
                graph[v][e.rev].cap += add;
            }
            flow += add; totalCost += add * dist[T];
        }

        if (flow !== totalNeed) {
            const detail = shifts.map(shift => {
                const eligible = candidates.filter(p => candidateAllowed(work,p,unit,day,shift,phase,offPairs)).length;
                return `${shift}: ihtiyaç ${needs[shift]}, aday ${eligible}`;
            }).join(' | ');
            return { ok:false, reason:`${unit} / ${GUNLER[day]} kapasitesi doldurulamıyor. ${detail}` };
        }

        const assignments = edgeRefs.filter(e => e.initialCap === 1 && e.cap === 0 && e.meta).map(e => e.meta);
        return { ok:true, assignments, cost:totalCost };
    }

    function simulateRestSequence(work, name, assignments) {
        const temp = cloneWork(work);
        const sorted = assignments.slice().sort((a,b) => a.day-b.day);
        for (const a of sorted) {
            if (temp.matrix[name][a.day] !== null) return false;
            if (!restAllowed(temp,name,a.day,a.shift)) return false;
            temp.matrix[name][a.day] = a.shift;
        }
        return true;
    }

    function contiguousHardAbsenceBlocks(work, person, unit) {
        const blocks = [];
        let start = null;
        for (let d=0; d<7; d++) {
            const expected = cycleExpectedShift(person,unit,d);
            const src = work.source[person.ad] && work.source[person.ad][d];
            const hardOff = !!hardReason(work,person.ad,d) && isOffValue(work.matrix[person.ad][d]) &&
                src !== AUTO_CYCLE_SOURCE && src !== AUTO_INGEST_EMERGENCY_SOURCE;
            // Blok yalnız gerçek yokluğu kapsar. Döngünün doğal izni ve INGEST acil hafta sonu izni
            // yeni bir 'izinli personel' vakası olarak tekrar işlenmez.
            if (hardOff) {
                if (start === null) start = d;
            } else if (start !== null) {
                blocks.push([start,d-1]); start = null;
            }
        }
        if (start !== null) blocks.push([start,6]);
        return blocks;
    }


    function ingestEmergencyOrientationCost(work, unit, pMorning, pEvening, start, end) {
        const profile = cycleShiftProfile(unit);
        let cost = 0;
        for (let d=start; d<=Math.min(end,4); d++) {
            const cm = cycleExpectedShift(pMorning,unit,d);
            const ce = cycleExpectedShift(pEvening,unit,d);
            if (cm !== profile.morning) cost += (isOffValue(cm) ? 1 : 3);
            if (ce !== profile.evening) cost += (isOffValue(ce) ? 1 : 3);
        }
        return cost;
    }

    function canOverrideNaturalCycleOff(work, person, day) {
        const src = work.source[person.ad] && work.source[person.ad][day];
        const reason = work.reason[person.ad] && work.reason[person.ad][day];
        if (isAnnualHardLocked(person.ad,day) || src === REPORT_SOURCE || src === FIXED_OFF_SOURCE || src === MANUAL_SOURCE || src === REQUEST_SOURCE) return false;
        if (reason && reason !== 'DÖNGÜ İZNİ' && reason !== 'SABİT MCR/INGEST DÖNGÜSÜ') return false;
        return true;
    }

    function applyIngestNoSubstituteFallback(work, unit, absent, start, end) {
        if (unitType(unit) !== 'DONGU6') return {ok:false, reason:'INGEST acil modu yalnız DONGU6 için geçerlidir.'};
        const profile = cycleShiftProfile(unit);
        const remaining = state.personeller.filter(p => p.birim === unit && p.ad !== absent.ad).slice().sort(compareName);
        if (remaining.length !== 2) {
            return {ok:false, reason:`${unit}: ${absent.ad} yok; yedek bulunamadı ve INGEST acil 2-personel modu için kalan çekirdek personel sayısı ${remaining.length}.`};
        }

        // İki kalan personelden biri de aynı blokta hard izin/raporluysa acil mod güvenli değildir.
        for (const p of remaining) {
            for (let d=start; d<=end; d++) {
                const v = work.matrix[p.ad][d];
                const r = hardReason(work,p.ad,d);
                if (r && isOffValue(v) && !canOverrideNaturalCycleOff(work,p,d)) {
                    return {ok:false, reason:`${unit}: ${absent.ad} yokken ${p.ad} da ${GUNLER[d]} hard izin/raporlu. 2-personel acil modu kurulamadı.`};
                }
            }
        }

        // Hafta içi yoklukta iki personel de çalışır: biri sabah, diğeri akşam.
        // FIX10: acil mod başladığında vardiya yönünü önce bir önceki gerçek günden DEVAM ETTİR.
        // Özellikle blok Pazartesi başlıyorsa, önceki Pazar sabahçısı Pazartesi sabaha;
        // önceki Pazar akşamcısı Pazartesi akşama devam eder. Böylece 16:00-00:00 ->
        // ertesi gün 06:30/07:00/09:00 dinlenme ihlali oluşmaz ve liste gereksiz yere reddedilmez.
        const [p1,p2] = remaining;
        const prevShift = (p) => start > 0 ? work.matrix[p.ad][start-1] : previousWeekSundayShift(p.ad);
        const prev1 = prevShift(p1);
        const prev2 = prevShift(p2);

        let morningLead = null, eveningLead = null;
        if (prev1 === profile.morning) morningLead = p1;
        if (prev2 === profile.morning && !morningLead) morningLead = p2;
        if (prev1 === profile.evening) eveningLead = p1;
        if (prev2 === profile.evening && !eveningLead) eveningLead = p2;

        // Tek taraf belirlenebildiyse diğer kalan personel karşı vardiyayı taşır.
        if (morningLead && !eveningLead) eveningLead = morningLead.ad === p1.ad ? p2 : p1;
        if (eveningLead && !morningLead) morningLead = eveningLead.ad === p1.ad ? p2 : p1;

        // Önceki gün bilgisi yok/uygunsuzsa eski deterministik maliyet hesabına dön.
        if (!morningLead || !eveningLead || morningLead.ad === eveningLead.ad) {
            const c12 = ingestEmergencyOrientationCost(work,unit,p1,p2,start,end);
            const c21 = ingestEmergencyOrientationCost(work,unit,p2,p1,start,end);
            morningLead = p1; eveningLead = p2;
            if (c21 < c12 || (c21 === c12 && compareName(p2,p1) < 0)) {
                morningLead = p2; eveningLead = p1;
            }
        }

        work.notes.push(`${unit}: INGEST acil vardiya yönü ${GUNLER[start]} başlangıcında önceki gerçek güne göre korundu: ${morningLead.ad}=SABAH, ${eveningLead.ad}=AKŞAM.`);

        for (let d=start; d<=end; d++) {
            if (d < 5) {
                // Yalnız yokluk bloğundaki günlerde canonical çalışma/izinler acil moda çevrilir.
                work.matrix[morningLead.ad][d] = profile.morning;
                work.reason[morningLead.ad][d] = `INGEST ACİL 6G/1İ — ${absent.ad} YERİNE`;
                work.source[morningLead.ad][d] = AUTO_INGEST_EMERGENCY_SOURCE;
                work.matrix[eveningLead.ad][d] = profile.evening;
                work.reason[eveningLead.ad][d] = `INGEST ACİL 6G/1İ — ${absent.ad} YERİNE`;
                work.source[eveningLead.ad][d] = AUTO_INGEST_EMERGENCY_SOURCE;
                work.touchedKeys.add(assignmentKey(morningLead.ad,d));
                work.touchedKeys.add(assignmentKey(eveningLead.ad,d));
            }
        }

        // Kullanıcı kuralı: yokluk hafta sonuna taşıyorsa Cumartesi tek sabahçı + diğer izin,
        // Pazar roller ters çevrilir. Hafta sonu akşam vardiyası acil modda kaldırılır.
        if (start <= 5 && end >= 5) {
            work.matrix[morningLead.ad][5] = profile.morning;
            work.reason[morningLead.ad][5] = `INGEST ACİL HAFTA SONU — ${absent.ad} YERİNE`;
            work.source[morningLead.ad][5] = AUTO_INGEST_EMERGENCY_SOURCE;
            work.matrix[eveningLead.ad][5] = SHIFTS.IZIN;
            work.reason[eveningLead.ad][5] = 'INGEST ACİL HAFTA SONU İZNİ';
            work.source[eveningLead.ad][5] = AUTO_INGEST_EMERGENCY_SOURCE;
            work.touchedKeys.add(assignmentKey(morningLead.ad,5));
            work.touchedKeys.add(assignmentKey(eveningLead.ad,5));
        }
        if (start <= 6 && end >= 6) {
            work.matrix[eveningLead.ad][6] = profile.morning;
            work.reason[eveningLead.ad][6] = `INGEST ACİL HAFTA SONU — ${absent.ad} YERİNE`;
            work.source[eveningLead.ad][6] = AUTO_INGEST_EMERGENCY_SOURCE;
            work.matrix[morningLead.ad][6] = SHIFTS.IZIN;
            work.reason[morningLead.ad][6] = 'INGEST ACİL HAFTA SONU İZNİ';
            work.source[morningLead.ad][6] = AUTO_INGEST_EMERGENCY_SOURCE;
            work.touchedKeys.add(assignmentKey(eveningLead.ad,6));
            work.touchedKeys.add(assignmentKey(morningLead.ad,6));
        }

        work.ingestEmergency[unit] = work.ingestEmergency[unit] || [];
        work.ingestEmergency[unit].push({
            absent: absent.ad, start, end,
            morningLead: morningLead.ad,
            eveningLead: eveningLead.ad,
            mode: '2_PERSONEL_6G_1I'
        });
        work.notes.push(`${unit}: ${absent.ad} için uzman yedek bulunamadı; ${morningLead.ad}/${eveningLead.ad} yokluk günlerinde 2-personel acil moduna geçti. Hafta sonu tek sabahçı + dönüşümlü izin uygulandı.`);
        return {ok:true};
    }

    function preassignCycleReplacements(work, unit, phase, attempt) {
        if (!isCycleUnit(unit)) return {ok:true};
        const primary = state.personeller.filter(p => p.birim === unit).slice().sort(compareName);

        for (const absent of primary) {
            const blocks = contiguousHardAbsenceBlocks(work, absent, unit);
            for (const [start,end] of blocks) {
                const jobs = [];
                for (let d=start; d<=end; d++) {
                    const expected = cycleExpectedShift(absent,unit,d);
                    if (isWorkShift(expected)) jobs.push({day:d, shift:expected});
                }
                if (!jobs.length) continue;

                // Döngü biriminde kapasite tablosu vardiyayı belirlemez.
                // İzinli kişinin kendi döngü slotu boşaldığı için yedek tam o slotu devralır.

                let candidates = state.personeller.filter(p => p.ad !== absent.ad && !isLegacyExternalUnit(p.birim) && isQualifiedForUnit(p,unit));
                candidates = candidates.filter(p => {
                    const projected = countWorkDays(work,p.ad) + jobs.length;
                    if (projected > phase.maxWorkDays) return false;
                    for (const job of jobs) if (work.matrix[p.ad][job.day] !== null) return false;
                    return simulateRestSequence(work,p.ad,jobs);
                });

                candidates.sort((a,b) => {
                    // MCR/INGEST'in kendi döngüsünü bozmamak için önce dış birimde uzman yedek tercih edilir.
                    const aCross = a.birim === unit ? 1 : 0;
                    const bCross = b.birim === unit ? 1 : 0;
                    if (aCross !== bCross) return aCross - bCross;
                    const wa = countWorkDays(work,a.ad), wb = countWorkDays(work,b.ad);
                    if (wa !== wb) return wa - wb;
                    const ha = stableHash(`${hKeyNow()}|${attempt}|MCR|${unit}|${absent.ad}|${a.ad}`) % 997;
                    const hb = stableHash(`${hKeyNow()}|${attempt}|MCR|${unit}|${absent.ad}|${b.ad}`) % 997;
                    return ha - hb || compareName(a,b);
                });

                if (!candidates.length) {
                    if (unitType(unit) === 'DONGU6') {
                        const emergency = applyIngestNoSubstituteFallback(work,unit,absent,start,end);
                        if (emergency.ok) continue;
                        return emergency;
                    }
                    return {ok:false, reason:`${unit}: ${absent.ad} ${GUNLER[start]}-${GUNLER[end]} yok. Aynı uzman yedeği kişi dönene kadar sürdürecek uygun personel bulunamadı.`};
                }

                const sub = candidates[0];
                const repKey = `${hKeyNow()}|${unit}|${absent.ad}|${start}-${end}`;
                work.replacements[repKey] = { absent:absent.ad, substitute:sub.ad, unit, start, end, jobs:deepClone(jobs) };

                for (const job of jobs) {
                    work.matrix[sub.ad][job.day] = job.shift;
                    work.reason[sub.ad][job.day] = `MCR/INGEST YEDEK: ${absent.ad}`;
                    work.source[sub.ad][job.day] = AUTO_MCR_SOURCE;
                    const tKey = tempKey(sub.ad,job.day);
                    if (sub.birim !== unit) {
                        work.tempUnits[tKey] = unit;
                        work.tempSource[tKey] = AUTO_MCR_SOURCE;
                        work.touchedTempKeys.add(tKey);
                    }
                    work.touchedKeys.add(assignmentKey(sub.ad,job.day));
                }
            }
        }
        return {ok:true};
    }

    function solveCycleUnitStrict(baseWork, unit, attempt) {
        const work = cloneWork(baseWork);
        const primary = state.personeller.filter(p => p.birim === unit).slice().sort(compareName);
        const profile = cycleShiftProfile(unit);

        // 1) Birimin kendi personelini tarih + ofset döngüsüne KİLİTLE.
        //    Generic fairness / rotation / MIN5 bu matrise dokunamaz.
        for (const p of primary) {
            for (let day=0; day<7; day++) {
                const expected = cycleExpectedShift(p,unit,day);
                const current = work.matrix[p.ad][day];
                const reason = hardReason(work,p.ad,day);
                const key = assignmentKey(p.ad,day);

                // Yönetici onaylı yıllık izin, rapor, manuel izin veya sabit izin döngünün üstündedir.
                // Kişi izinli kalır; eksik döngü slotu aşağıda uzman yedekle kapatılır.
                if (reason && isOffValue(current)) {
                    work.touchedKeys.add(key);
                    continue;
                }

                // Döngü personeline elle farklı bir çalışma saati verilmişse sessizce sıralamayı bozma.
                if (isWorkShift(current) && current !== expected) {
                    return {ok:false, reasons:[`${unit}: ${p.ad} / ${GUNLER[day]} döngü saati ${expected}, mevcut kilitli çalışma ${current}. MCR/INGEST sıralaması otomatik değiştirilemez; izin/rapor verilebilir veya döngü ofseti değiştirilmelidir.`]};
                }

                work.matrix[p.ad][day] = expected;
                work.reason[p.ad][day] = isWorkShift(expected) ? 'SABİT MCR/INGEST DÖNGÜSÜ' : 'DÖNGÜ İZNİ';
                work.source[p.ad][day] = AUTO_CYCLE_SOURCE;
                work.touchedKeys.add(key);
            }
        }

        // 2) Hard izin/raporla boşalan döngü vardiyalarını aynı uzman yedekle, kişi dönene kadar kapat.
        const phase = {name:'STRICT_CYCLE_REPLACEMENT', maxWorkDays:ensureSchedulerState().config.maxWorkDays, enforceOffPair:false};
        const rep = preassignCycleReplacements(work,unit,phase,attempt);
        if (!rep.ok) return {ok:false, reasons:[rep.reason]};

        work.notes.push(`${unit}: ${unitType(unit)==='DONGU8'?'2 sabah + 2 akşam + 2 gece + 2 izin MCR döngüsü':'3-personel INGEST haftalık rotasyonu'} kilitli üretildi. Kapasite/fairness/hafta rotasyonu bu sırayı değiştirmedi.`);
        return {ok:true, work, offPairs:{}, phase:'SABIT_DONGU_KILIDI'};
    }

    function solveUnitOnce(baseWork, unit, phase, pairVariant, attempt) {
        const work = cloneWork(baseWork);
        const hardErrors = validateHardStateForUnit(work,unit);
        if (hardErrors.length) return {ok:false, reasons:hardErrors};

        const offPairs = buildPreferredOffPairs(work,unit,pairVariant);
        const rep = preassignCycleReplacements(work,unit,phase,attempt);
        if (!rep.ok) return {ok:false, reasons:[rep.reason]};

        for (let day=0; day<7; day++) {
            const needs = {};
            for (const shift of state.saatler || []) {
                const target = capacity(unit,shift,day);
                let current = 0;
                state.personeller.forEach(p => {
                    if (work.matrix[p.ad][day] === shift && effectiveUnit(work,p,day) === unit) current++;
                });
                if (isExactCapacityUnit(unit) && current > target) {
                    return {ok:false, reasons:[`${unit} / ${GUNLER[day]} / ${shift}: ${current} kilitli/ön atama var, exact kapasite ${target}.`]};
                }
                needs[shift] = Math.max(0, target - current);
            }

            const result = minCostDailyAssignment(work,unit,day,needs,phase,offPairs,attempt);
            if (!result.ok) return {ok:false, reasons:[result.reason]};

            result.assignments.forEach(a => {
                const p = personByName(a.person);
                work.matrix[a.person][day] = a.shift;
                work.reason[a.person][day] = 'AUTO V62';
                work.source[a.person][day] = AUTO_SOURCE;
                const key = assignmentKey(a.person,day);
                work.touchedKeys.add(key);

                if (p && p.birim !== unit) {
                    const tKey = tempKey(p.ad,day);
                    work.tempUnits[tKey] = unit;
                    work.tempSource[tKey] = AUTO_SOURCE;
                    work.touchedTempKeys.add(tKey);
                }
            });
        }

        // Günlük exact kapasite çözüldükten sonra önce mümkün olan herkesi minimum 5 güne tamamla.
        // Kapasite ASLA artırılmaz; 4 günlük kişiye slot gerekiyorsa aynı slot uygun donörden devredilir.
        // Devir tercihi: Cmt/Paz sabah -> Cmt/Paz diğer -> hafta içi sabah -> diğer.
        rebalanceMinimumWorkDays(work, unit, phase);

        // Ardından kapasiteyi hiç değiştirmeden haftalık yükü genel olarak dengele.
        rebalanceWeeklyFairness(work, unit, phase);

        // FIX3: Normal rotasyon personelinde MIN5 artık gerçek kabul kriteridir.
        // Matematiksel kapasite yeterli olduğu halde 4G kalan biri varsa bu çözümü kabul etme;
        // farklı izin çifti / deterministik attempt denenir. Hafta içi sabit personel bu kontrolden muaftır.
        const strictCfg = ensureSchedulerState().config;
        if (strictCfg.strictMinimumFive) {
            const feasibility = minWorkCapacityFeasible(work,unit);
            const short = state.personeller.filter(p => p.birim === unit && !isWeekdayFixedPerson(p))
                .map(p => ({p, days:countWorkDays(work,p.ad), target:minimumTargetDays(work,p,unit)}))
                .filter(x => x.days < x.target);
            if (short.length && feasibility.feasible) {
                return {ok:false, reasons:[`${unit}: MIN5 hard hedefi sağlanamadı: ${short.map(x=>`${x.p.ad}:${x.days}/${x.target}G`).join(', ')}. Kapasite tabanı korunarak MIN5 ek atama da denenmişti; alternatif çözüm aranacak.`]};
            }
        }

        // Bu birimin kendi personelinde hâlâ boş kalan günler izin kabul edilir.
        state.personeller.filter(p => p.birim === unit).forEach(p => {
            for (let day=0; day<7; day++) {
                if (work.matrix[p.ad][day] !== null) continue;
                const tUnit = work.tempUnits[tempKey(p.ad,day)];
                if (tUnit && tUnit !== unit) continue; // başka birimde geçici çalışacak, o birim çözecek / dondurulmuş olabilir
                work.matrix[p.ad][day] = SHIFTS.IZIN;
                work.reason[p.ad][day] = 'AUTO İZİN';
                work.source[p.ad][day] = AUTO_SOURCE;
                work.touchedKeys.add(assignmentKey(p.ad,day));
            }
        });

        return {ok:true, work, offPairs};
    }

    function solveUnitWithRelaxation(baseWork, unit, attempt) {
        const config = ensureSchedulerState().config;
        const failures = [];

        // Önce 2 ardışık izin çiftini hard tercih olarak 6 farklı deterministik dağılımla dene.
        for (let pairVariant=0; pairVariant<6; pairVariant++) {
            const phase = {name:'2_ARDISIK_IZIN', maxWorkDays:Math.min(5,config.maxWorkDays), enforceOffPair:true};
            const r = solveUnitOnce(baseWork,unit,phase,(pairVariant+attempt)%6,attempt);
            if (r.ok) return {...r, phase:phase.name};
            failures.push(...(r.reasons || []));
        }

        // Kapasite nedeniyle belirli iki gün seçimi mümkün değilse yine 5 gün çalışma sınırında çöz.
        {
            const phase = {name:'5_GUN_CALISMA', maxWorkDays:Math.min(5,config.maxWorkDays), enforceOffPair:false};
            const r = solveUnitOnce(baseWork,unit,phase,0,attempt);
            if (r.ok) return {...r, phase:phase.name};
            failures.push(...(r.reasons || []));
        }

        // Son çare: kapasite gerekiyorsa bazı personel 6 gün çalışır / 1 gün izin yapar.
        {
            const phase = {name:'KAPASITE_ZORUNLU_6_GUN', maxWorkDays:config.maxWorkDays, enforceOffPair:false};
            const r = solveUnitOnce(baseWork,unit,phase,0,attempt);
            if (r.ok) return {...r, phase:phase.name};
            failures.push(...(r.reasons || []));
        }

        return {ok:false, reasons:Array.from(new Set(failures)).slice(-12)};
    }

    function unitSolveOrder(units) {
        return units.slice().sort((a,b) => {
            const ta = unitType(a), tb = unitType(b);
            const pa = (ta === 'DONGU8' || ta === 'DONGU6') ? 0 : 1;
            const pb = (tb === 'DONGU8' || tb === 'DONGU6') ? 0 : 1;
            if (pa !== pb) return pa - pb;
            const wa = weeklyCapacity(a), wb = weeklyCapacity(b);
            return wb - wa || a.localeCompare(b,'tr');
        });
    }

    function finalizeWork(work, options) {
        if (options.full) {
            state.personeller.forEach(p => {
                // Excel ile yönetilen KAMERAMAN birimlerini finalize aşaması da değiştirmez.
                if (!work.targetUnits.has(p.birim)) return;
                for (let d=0; d<7; d++) {
                    if (work.matrix[p.ad][d] === null) {
                        work.matrix[p.ad][d] = SHIFTS.IZIN;
                        work.reason[p.ad][d] = 'AUTO İZİN';
                        work.source[p.ad][d] = AUTO_SOURCE;
                    }
                    work.touchedKeys.add(assignmentKey(p.ad,d));
                }
            });
        } else {
            // Yerel optimizasyonda hedef birimin temizlenen eski yedekleri boşta kaldıysa İZİNLİ yap.
            Array.from(work.touchedKeys).forEach(key => {
                const m = key.match(/^(.+)_([^_]+)_(\d)$/); // adlarda '_' beklenmiyor; legacy formatla uyumlu
                if (!m) return;
            });
            state.personeller.forEach(p => {
                for (let d=0; d<7; d++) {
                    const key = assignmentKey(p.ad,d);
                    if (!work.touchedKeys.has(key)) continue;
                    if (work.matrix[p.ad][d] === null) {
                        work.matrix[p.ad][d] = SHIFTS.IZIN;
                        work.reason[p.ad][d] = 'AUTO İZİN';
                        work.source[p.ad][d] = AUTO_SOURCE;
                    }
                }
            });
        }
    }

    function validateFinal(work, units) {
        const errors = [];
        const warnings = [];
        const unitSet = new Set(units);

        // MCR / INGEST kapasite optimizasyonu değildir: kendi sabit döngüsü doğrulanır.
        for (const unit of units.filter(isCycleUnit)) {
            const primary = state.personeller.filter(p=>p.birim===unit);
            const emergencyBlocks = (work.ingestEmergency && work.ingestEmergency[unit]) || [];
            const emergencyAt = (day) => emergencyBlocks.find(x => day >= x.start && day <= x.end) || null;

            for (const p of primary) {
                for (let day=0; day<7; day++) {
                    const expected = cycleExpectedShift(p,unit,day);
                    const actual = work.matrix[p.ad][day];
                    const hardOff = !!hardReason(work,p.ad,day) && isOffValue(actual);
                    const emergency = unitType(unit)==='DONGU6' ? emergencyAt(day) : null;
                    const emergencyOverride = !!emergency && work.source[p.ad][day] === AUTO_INGEST_EMERGENCY_SOURCE;

                    if (!hardOff && actual !== expected && !emergencyOverride) {
                        errors.push(`${unit}: ${p.ad} / ${GUNLER[day]} döngü bozuldu. Beklenen ${expected}, oluşan ${actual}.`);
                    }
                    if (hardOff && isWorkShift(expected) && !emergency) {
                        const covered = state.personeller.some(q => q.ad!==p.ad && work.matrix[q.ad][day]===expected && effectiveUnit(work,q,day)===unit && work.source[q.ad][day]===AUTO_MCR_SOURCE);
                        if (!covered) errors.push(`${unit}: ${p.ad} / ${GUNLER[day]} ${expected} izin nedeniyle boşaldı fakat uzman yedekle kapatılmadı.`);
                    }
                }
            }

            // INGEST uzman yedeği yoksa operasyonel acil mod:
            // hafta içi 1 sabah + 1 akşam, hafta sonu yalnız 1 sabah; kalan kişi izinli.
            if (unitType(unit)==='DONGU6' && emergencyBlocks.length) {
                const profile = cycleShiftProfile(unit);
                for (const block of emergencyBlocks) {
                    for (let day=block.start; day<=block.end; day++) {
                        const remaining = primary.filter(p=>p.ad!==block.absent);
                        const morningCount = remaining.filter(p=>work.matrix[p.ad][day]===profile.morning).length;
                        const eveningCount = remaining.filter(p=>work.matrix[p.ad][day]===profile.evening).length;
                        if (day < 5) {
                            if (morningCount !== 1 || eveningCount !== 1) errors.push(`${unit}: ${GUNLER[day]} INGEST acil modunda 1 sabah + 1 akşam olmalı; oluşan ${morningCount}/${eveningCount}.`);
                        } else {
                            if (morningCount !== 1 || eveningCount !== 0) errors.push(`${unit}: ${GUNLER[day]} INGEST acil hafta sonu 1 sabah + 0 akşam olmalı; oluşan ${morningCount}/${eveningCount}.`);
                        }
                    }
                }
            }
        }

        for (const unit of units) {
            if (isCycleUnit(unit)) continue;
            for (let day=0; day<7; day++) {
                for (const shift of state.saatler || []) {
                    const target = capacity(unit,shift,day);
                    let actual = 0;
                    state.personeller.forEach(p => {
                        if (work.matrix[p.ad][day] === shift && effectiveUnit(work,p,day) === unit) actual++;
                    });
                    if (actual < target) errors.push(`${unit} / ${GUNLER[day]} / ${shift}: minimum kapasite ${target}, atama ${actual}.`);
                }
            }
        }

        const oneDayOff = [];
        const noConsecutiveOff = [];
        state.personeller.forEach(p => {
            const touched = work.full || unitSet.has(p.birim) || [0,1,2,3,4,5,6].some(d => unitSet.has(effectiveUnit(work,p,d)));
            if (!touched) return;

            let works = 0;
            const prevSun = previousWeekSundayShift(p.ad);
            let hasPair = (prevSun !== undefined && prevSun !== null && isOffValue(prevSun) && isOffValue(work.matrix[p.ad][0]));
            for (let d=0; d<7; d++) {
                const v = work.matrix[p.ad][d];
                if (isWorkShift(v)) {
                    works++;
                    const u = effectiveUnit(work,p,d);
                    if (unitSet.has(u) && !isQualifiedForUnit(p,u)) errors.push(`${p.ad} / ${GUNLER[d]}: ${u} uzmanlığı yok.`);
                    const canonicalCycle = isCycleUnit(u) && p.birim === u && v === cycleExpectedShift(p,u,d);
                    if (!canonicalCycle && !restAllowed(work,p.ad,d,v)) errors.push(`${p.ad} / ${GUNLER[d]}: ${v} dinlenme kuralını ihlal ediyor.`);
                }
                if (d < 6 && isOffValue(work.matrix[p.ad][d]) && isOffValue(work.matrix[p.ad][d+1])) hasPair = true;
            }
            if (works > ensureSchedulerState().config.maxWorkDays) errors.push(`${p.ad}: ${works} gün çalışma (üst sınır ${ensureSchedulerState().config.maxWorkDays}).`);
            const offCount = 7 - works;
            if (!isCycleUnit(p.birim)) {
                if (offCount === 1) oneDayOff.push(p.ad);
                if (offCount >= 2 && !hasPair) noConsecutiveOff.push(p.ad);
            }

            for (let d=0; d<7; d++) {
                if (isPersonOnAnnualLeaveV2(p.ad,dateKeyForDay(d)) && work.matrix[p.ad][d] !== SHIFTS.YILLIK) {
                    errors.push(`${p.ad} / ${GUNLER[d]}: onaylı yıllık izin korunmadı.`);
                }
            }
        });

        if (oneDayOff.length) warnings.push(`Kapasite nedeniyle yalnız 1 gün izin yapanlar: ${oneDayOff.join(', ')}`);
        if (noConsecutiveOff.length) warnings.push(`2 izin günü var fakat ardışık olmayanlar: ${noConsecutiveOff.join(', ')}`);


        // Minimum 5 gün: yalnız matematiksel olarak kapasite elveriyorsa hard kuraldır.
        // Yıllık izin/rapor/sabit izin gibi hard yokluklar kişinin hedefini doğal olarak düşürür.
        for (const unit of unitSet) {
            if (isCycleUnit(unit)) continue;
            const feasibility = minWorkCapacityFeasible(work,unit);
            const short = state.personeller.filter(p => p.birim === unit && !isWeekdayFixedPerson(p))
                .map(p => ({p, days:countWorkDays(work,p.ad), target:minimumTargetDays(work,p,unit)}))
                .filter(x => x.days < x.target);
            if (short.length) {
                const detail = short.map(x => `${x.p.ad}:${x.days}/${x.target}G`).join(', ');
                if (feasibility.feasible) errors.push(`${unit}: minimum çalışma günü sağlanamadı (${detail}). Havuz biriminde kapasite tabanının üstüne MIN5 ek personel izni olmasına rağmen hedef çözülemedi.`);
                else warnings.push(`${unit}: minimum 5 gün exact döngü kapasitesi nedeniyle mümkün değil (${feasibility.slots} slot / ${feasibility.required} gerekli). ${detail}`);
            }
        }

        // Önceki haftanın kopyasını üretme durumunu ölç. Bu hard kural değildir; kapasite ve izinler
        // zorunlu kılabiliyorsa tekrar olabilir, fakat mümkün olan alternatifler cost ile öne çıkarılır.
        for (const unit of unitSet) {
            if (isCycleUnit(unit)) continue;
            let known=0, exactRepeat=0;
            state.personeller.filter(p=>p.birim===unit).forEach(p=>{
                for (let d=0; d<7; d++) {
                    const prev = previousWeekAssignment(p.ad,d);
                    if (prev === undefined || prev === null) continue;
                    known++;
                    if (work.matrix[p.ad][d] === prev) exactRepeat++;
                }
            });
            if (known) {
                const pct = Math.round(exactRepeat*100/known);
                if (pct >= 80) warnings.push(`${unit}: önceki haftaya benzerlik yüksek (%${pct}, ${exactRepeat}/${known} hücre birebir aynı).`);
            }
        }

        // Aynı birimde kaçınılabilir 2+ günlük çalışma farkı kabul edilmez.
        for (const unit of unitSet) {
            if (isCycleUnit(unit)) continue;
            const summary = unitWorkloadSummary(work,unit);
            if (summary.length < 2) continue;
            const max = Math.max(...summary.map(x=>x.days));
            const min = Math.min(...summary.map(x=>x.days));
            if (max - min > 1) {
                const phase = {name:'FAIRNESS_VALIDATION', maxWorkDays:ensureSchedulerState().config.maxWorkDays, enforceOffPair:false};
                const possible = bestFairnessTransfer(work,unit,phase);
                const detail = summary.map(x=>`${x.name}:${x.days}G`).join(', ');
                if (possible) errors.push(`${unit}: kaçınılabilir iş yükü adaletsizliği var (${detail}).`);
                else warnings.push(`${unit}: hard izin/dinlenme/kilitler nedeniyle iş yükü farkı 1'den büyük (${detail}).`);
            }
        }
        for (const unit of unitSet) {
            if (isExactCapacityUnit(unit)) continue;
            let extraTotal=0;
            for (let day=0; day<7; day++) for (const shift of state.saatler || []) {
                let actual=0;
                state.personeller.forEach(p=>{ if (work.matrix[p.ad][day]===shift && effectiveUnit(work,p,day)===unit) actual++; });
                extraTotal += Math.max(0,actual-capacity(unit,shift,day));
            }
            if (extraTotal) warnings.push(`${unit}: MIN5 için kapasite tabanının üstünde ${extraTotal} kontrollü ek personel-vardiya kullanıldı.`);
        }

        return {ok:errors.length===0, errors, warnings, oneDayOff, noConsecutiveOff};
    }

    function snapshotStateForRollback() {
        return {
            manuelAtamalar: deepClone(state.manuelAtamalar || {}),
            geciciGorevler: deepClone(state.geciciGorevler || {}),
            schedulerV2: deepClone(state.schedulerV2 || {})
        };
    }

    function restoreSnapshot(snap) {
        state.manuelAtamalar = snap.manuelAtamalar;
        state.geciciGorevler = snap.geciciGorevler;
        state.schedulerV2 = snap.schedulerV2;
    }

    function commitWork(work, options, validation, unitPhases) {
        ensureSchedulerState();
        const scheduler = state.schedulerV2;
        const hKey = hKeyNow();

        if (!state.manuelAtamalar) state.manuelAtamalar = {};
        if (!state.geciciGorevler) state.geciciGorevler = {};

        // Full üretimde dahi yalnız V62'nin gerçekten dokunduğu hücreler commit edilir.
        // Böylece Excel/KAMERAMAN kayıtları aynen korunur.
        const keysToCommit = Array.from(work.touchedKeys);

        keysToCommit.forEach(key => {
            // Anahtarın personel/gün karşılığını güvenli biçimde personel listesi üzerinden çöz.
            let found = null;
            for (const p of state.personeller) {
                for (let d=0; d<7; d++) {
                    if (assignmentKey(p.ad,d,hKey) === key) { found = {p,d}; break; }
                }
                if (found) break;
            }
            if (!found) return;
            const v = work.matrix[found.p.ad][found.d];
            if (v == null) delete state.manuelAtamalar[key];
            else state.manuelAtamalar[key] = v;
            scheduler.assignmentSource[key] = work.source[found.p.ad][found.d] || AUTO_SOURCE;
        });

        // Full üretimde mevcut haftanın otomatik temp kayıtlarını temizle; manuel temp kayıtları korunur.
        if (options.full) {
            for (const p of state.personeller) {
                if (isLegacyExternalUnit(p.birim)) continue;
                for (let d=0; d<7; d++) {
                    const tk = tempKey(p.ad,d);
                    if (!scheduler.manualUnitLocks[tk]) {
                        delete state.geciciGorevler[tk];
                        delete scheduler.tempUnitSource[tk];
                    }
                }
            }
        } else {
            work.touchedTempKeys.forEach(tk => {
                if (!scheduler.manualUnitLocks[tk]) {
                    delete state.geciciGorevler[tk];
                    delete scheduler.tempUnitSource[tk];
                }
            });
        }

        Object.keys(work.tempUnits).forEach(tk => {
            const target = work.tempUnits[tk];
            if (!target) return;
            if (options.full || work.touchedTempKeys.has(tk) || scheduler.manualUnitLocks[tk]) {
                state.geciciGorevler[tk] = target;
                scheduler.tempUnitSource[tk] = work.tempSource[tk] || AUTO_SOURCE;
            }
        });

        scheduler.mcrReplacements[hKey] = work.replacements;
        scheduler.lastReport = {
            version:SCHEDULER_VERSION,
        capacityMode:'MINIMUM_FLOOR_FOR_POOL__STRICT_SEQUENCE_FOR_CYCLE',
            week:hKey,
            timestamp:new Date().toISOString(),
            units:options.units,
            phases:unitPhases,
            warnings:validation.warnings,
            replacements:work.replacements
        };

        save();
    }

    function showSchedulerReport(title, lines, type) {
        let modal = document.getElementById('schedulerV2ReportModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'schedulerV2ReportModal';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:20050;display:none;align-items:center;justify-content:center;padding:20px;';
            modal.innerHTML = `<div style="width:min(760px,96vw);max-height:82vh;overflow:auto;background:var(--card-bg,#fff);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:14px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.35);">
                <h3 id="schedulerV2ReportTitle" style="margin:0 0 12px;color:var(--primary,#2563eb);"></h3>
                <div id="schedulerV2ReportBody" style="font-size:12px;line-height:1.6;white-space:pre-wrap;"></div>
                <button id="schedulerV2ReportClose" style="margin-top:16px;width:100%;padding:10px;border:0;border-radius:8px;background:var(--primary,#2563eb);color:#fff;font-weight:800;cursor:pointer;">KAPAT</button>
            </div>`;
            document.body.appendChild(modal);
            modal.querySelector('#schedulerV2ReportClose').onclick = () => modal.style.display = 'none';
        }
        modal.querySelector('#schedulerV2ReportTitle').textContent = title;
        modal.querySelector('#schedulerV2ReportBody').textContent = (lines || []).join('\n');
        modal.style.display = 'flex';
        if (typeof showToast === 'function') showToast(title, type || 'info');
    }

    function solveSchedule(options) {
        ensureSchedulerState();
        const requestedUnits = (options.units && options.units.length ? options.units : state.birimler).filter(Boolean);
        const units = autoManagedUnits(requestedUnits);
        const full = !!options.full;
        const order = unitSolveOrder(units);
        let bestFailures = [];

        // Bir uzman yedeğin seçimi sonraki birimde darboğaz yaratırsa farklı deterministik tie-break ile tekrar dene.
        for (let attempt=0; attempt<6; attempt++) {
            let work = buildWorkingState({full, units});
            const unitPhases = {};
            let failed = false;
            let failReasons = [];

            for (const unit of order) {
                const result = isCycleUnit(unit)
                    ? solveCycleUnitStrict(work,unit,attempt)
                    : solveUnitWithRelaxation(work,unit,attempt);
                if (!result.ok) {
                    failed = true;
                    failReasons = result.reasons || [`${unit}: çözüm bulunamadı.`];
                    break;
                }
                work = result.work;
                unitPhases[unit] = result.phase;
            }

            if (failed) {
                if (failReasons.length > bestFailures.length) bestFailures = failReasons;
                continue;
            }

            finalizeWork(work,{full,units});
            const validation = validateFinal(work,units);
            if (!validation.ok) {
                bestFailures = validation.errors;
                continue;
            }
            return {ok:true, work, validation, unitPhases, attempt};
        }

        return {ok:false, errors:bestFailures.length ? bestFailures : ['Kapasite ve hard kurallar birlikte sağlanamadı.']};
    }

    function generateAll() {
        if (!isAdmin) return;
        const snap = snapshotStateForRollback();
        try {
            const managedUnits = autoManagedUnits(state.birimler.slice());
            const preservedExcelUnits = state.birimler.filter(u => isLegacyExternalUnit(u));
            const preservedNoCapacityUnits = state.birimler.filter(u => !isLegacyExternalUnit(u) && isNoCapacityPreservedUnit(u));
            const result = solveSchedule({full:true, units:managedUnits});
            if (!result.ok) {
                global.__V62_LAST_REOPT_ERRORS = (result.errors || []).slice();
                restoreSnapshot(snap);
                showSchedulerReport('❌ V62: LİSTE OLUŞTURULAMADI', [
                    'Hiçbir hard kural veya kapasite ezilmedi. Mevcut liste değiştirilmedi.',
                    '',
                    ...result.errors
                ], 'error');
                return false;
            }
            commitWork(result.work,{full:true,units:managedUnits},result.validation,result.unitPhases);
            logKoy(`V62 deterministik vardiya oluşturuldu. Faz: ${JSON.stringify(result.unitPhases)}`);
            tabloyuOlustur();
            if (isAdmin) refreshUI();

            const replacements = Object.values(result.work.replacements || {});
            const lines = [
                `Hafta: ${hKeyNow()}`,
                `Algoritma: ${SCHEDULER_VERSION}`,
                'Kapasite kontrolü: PASS — HAVUZ birimlerinde ASGARİ taban; MCR/INGEST kapasiteden bağımsız SABİT DÖNGÜ',
                'Uzmanlık kontrolü: PASS',
                'Dinlenme kontrolü: PASS',
                'Haftalık iş yükü adaleti: PASS / mümkün olan en dengeli dağılım',
                'Minimum çalışma hedefi: normal rotasyon personeli için 5 gün HARD; yıllık izin/rapor nedeniyle 5 uygun gün yoksa mevcut uygun gün kadar',
                'Hafta içi sabitler: Cmt-Paz HARD İZİN; yalnız seçili kapasite yedekleri son çare olarak kullanılabilir',
                'Yıllık izin: yerel veya harici yönetici onayı HARD LOCK; kapasite için geri alınmaz',
                'Haftalar arası rotasyon: HAVUZ birimlerinde AKTİF; MCR sabit döngü, INGEST özel haftalık rol rotasyonu kullanır',
                '4 günlük personel tamamlama: önce kapasite-içi devir; gerekirse Cmt-Paz sabah MIN5 EK PERSONEL',
                preservedExcelUnits.length ? `Excel/legacy koruma: ${preservedExcelUnits.join(', ')} V62 tarafından değiştirilmedi` : 'Excel/legacy koruma: bu hafta işaretli birim yok',
                preservedNoCapacityUnits.length ? `Kapasite tanımsız koruma: ${preservedNoCapacityUnits.join(', ')} mevcut haliyle bırakıldı` : 'Kapasite tanımsız koruma: yok',
                'Aynı girdide aynı sonuç: AKTİF',
                '',
                ...Object.keys(result.unitPhases).map(u => `${u}: ${result.unitPhases[u]}`)
            ];
            if (replacements.length) {
                lines.push('', 'MCR/INGEST sürekli yedekler:');
                replacements.forEach(r => lines.push(`• ${r.absent} yerine ${r.substitute} (${r.unit}, ${GUNLER[r.start]}-${GUNLER[r.end]})`));
            }
            if (result.validation.warnings.length) lines.push('', 'Uyarılar:', ...result.validation.warnings.map(x => `• ${x}`));
            showSchedulerReport('✅ V62: VARDİYA OLUŞTURULDU', lines, 'success');
            return true;
        } catch (err) {
            console.error('V62 scheduler error:',err);
            restoreSnapshot(snap);
            showSchedulerReport('❌ V62 BEKLENMEYEN HATA', [String(err && err.stack || err)], 'error');
            return false;
        }
    }

    function currentEffectiveUnitForPersonDay(name, day) {
        const p = personByName(name);
        if (!p) return null;
        return (state.geciciGorevler || {})[tempKey(name,day)] || p.birim;
    }

    function reoptimizeUnits(units, reasonText, options={}) {
        if (!isAdmin) return false;
        const requested = Array.from(new Set((units || []).filter(Boolean)));
        const uniq = autoManagedUnits(requested);
        // Excel ile korunmuş, KAMERAMAN veya kapasitesi tanımsız birimde V62 re-optimizasyon yapmaz;
        // manuel izin/yıllık izin hücresi yine kaydedilir ve tabloda alt izin satırına düşer.
        if (!uniq.length) {
            save();
            try { tabloyuOlustur(); } catch(e) {}
            return true;
        }
        const snap = snapshotStateForRollback();
        try {
            const result = solveSchedule({full:false, units:uniq});
            if (!result.ok) {
                restoreSnapshot(snap);
                if (!options.silentFailure) showSchedulerReport('❌ MANUEL DEĞİŞİKLİK UYGULANAMADI', [
                    'Değişiklik mevcut uzmanlık / dinlenme / hard kurallarla çözülemedi.',
                    'Diğer birimlerin listesine dokunulmadı.',
                    '',
                    ...result.errors
                ], 'error');
                tabloyuOlustur();
                if (isAdmin) refreshUI();
                return false;
            }
            commitWork(result.work,{full:false,units:uniq},result.validation,result.unitPhases);
            logKoy(`V62 yerel yeniden dengeleme: ${uniq.join(', ')}${reasonText ? ' / '+reasonText : ''}`);
            tabloyuOlustur();
            if (isAdmin) refreshUI();
            if (result.validation.warnings.length) {
                showSchedulerReport('✅ BİRİM YENİDEN DENGELENDİ', [
                    `Yalnız şu birim(ler) yeniden hesaplandı: ${uniq.join(', ')}`,
                    ...result.validation.warnings.map(x => `• ${x}`)
                ], 'success');
            } else if (typeof showToast === 'function') {
                showToast(`✅ ${uniq.join(', ')} yeniden dengelendi.`, 'success');
            }
            return true;
        } catch (err) {
            restoreSnapshot(snap);
            console.error(err);
            showSchedulerReport('❌ YEREL OPTİMİZASYON HATASI',[String(err && err.stack || err)],'error');
            return false;
        }
    }

    function markManualAssignment(name,day,value,source) {
        const scheduler = ensureSchedulerState();
        const key = assignmentKey(name,day);
        if (!state.manuelAtamalar) state.manuelAtamalar = {};
        state.manuelAtamalar[key] = value;
        scheduler.manualLocks[key] = true;
        scheduler.assignmentSource[key] = source || MANUAL_SOURCE;
    }

    function releaseManualAssignment(name,day) {
        const scheduler = ensureSchedulerState();
        const key = assignmentKey(name,day);
        delete scheduler.manualLocks[key];
        delete scheduler.assignmentSource[key];
        delete state.manuelAtamalar[key];
    }

    // app.js V61'de eksik olan isim için uyumluluk; yeni V62 akışında asıl validasyon solver içindedir.
    global.cakismaKontrol = function(name,day,shift) {
        const p = personByName(name);
        if (!p) return false;
        const unit = currentEffectiveUnitForPersonDay(name,day);
        if (isWorkShift(shift) && !isQualifiedForUnit(p,unit)) {
            throw new Error(`${name}, ${unit} için gerekli uzmanlığa sahip değil.`);
        }
        return true;
    };

    // OTO VARDİYA butonunu tamamen V62 motoruna geçir.
    global.vardiyaUretVeKaydet = generateAll;

    // Manuel hücre değişimi: hücreyi hard lock yap, yalnız ilgili birimi yeniden çöz.
    global.vardiyaAta = function(pAd,gIdx,vardiya) {
        if (!isAdmin) return;
        closeModal();
        const snap = snapshotStateForRollback();
        if (typeof saveStateToHistory === 'function') saveStateToHistory();
        const unit = currentEffectiveUnitForPersonDay(pAd,gIdx);
        try {
            const p = personByName(pAd);
            if (!p) throw new Error('Personel bulunamadı.');
            if (isAnnualHardLocked(pAd,gIdx) && vardiya !== SHIFTS.YILLIK) throw new Error(`${pAd} / ${GUNLER[gIdx]}: yönetici onaylı YILLIK İZİN hard lock; vardiya ile ezilemez.`);
            if (isWorkShift(vardiya) && !isQualifiedForUnit(p,unit)) throw new Error(`${pAd}, ${unit} için uzman değil.`);
            markManualAssignment(pAd,gIdx,vardiya,MANUAL_SOURCE);
            const absence = isHardAbsenceValue(vardiya);
            if (!reoptimizeUnits([unit],`${pAd} ${GUNLER[gIdx]} => ${vardiya}`)) {
                if (!absence) {
                    restoreSnapshot(snap);
                    return;
                }
                // İZİN/RAPOR hard lock kapasite bulunamadığı için geri alınmaz.
                save();
                try { tabloyuOlustur(); if (isAdmin) refreshUI(); } catch(e) {}
                showSchedulerReport('⚠️ İZİN KORUNDU / KAPASİTE EKSİK',[
                    `${pAd} / ${GUNLER[gIdx]}: ${vardiya} olarak alt bölüme taşındı ve hard lock kaldı.`,
                    'Algoritma yalnız ilgili birimi yeniden denedi ancak kapasiteyi uygun personelle kapatamadı.',
                    'İzin geri alınmadı; eksik kapasite yöneticiye bırakıldı.'
                ],'warning');
                return true;
            }
            save();
            logKoy(`${pAd} için ${GUNLER[gIdx]} manuel kilit: ${vardiya}`);
        } catch (err) {
            restoreSnapshot(snap);
            showSchedulerReport('❌ MANUEL ATAMA REDDEDİLDİ',[String(err.message || err)],'error');
        }
    };

    // Modalda "OTOMATİĞE BIRAK" seçeneği eklemek için mevcut fonksiyonu sar.
    const oldVardiyaSecimiAc = global.vardiyaSecimiAc;
    global.vardiyaSecimiAc = function(pAd,gIdx) {
        oldVardiyaSecimiAc(pAd,gIdx);
        setTimeout(() => {
            const c = document.getElementById('modalVardiyaButonlari');
            if (!c || c.querySelector('[data-v62-auto-release]')) return;
            const b = document.createElement('button');
            b.setAttribute('data-v62-auto-release','1');
            b.className = 'modal-btn';
            b.style.cssText = 'background:#334155;color:white;border-color:#334155;';
            b.innerHTML = '<span>🤖 OTOMATİĞE BIRAK (Manuel Kilidi Kaldır)</span>';
            b.onclick = () => {
                closeModal();
                const unit = currentEffectiveUnitForPersonDay(pAd,gIdx);
                const snap = snapshotStateForRollback();
                releaseManualAssignment(pAd,gIdx);
                if (!reoptimizeUnits([unit],`${pAd} manuel kilit kaldırıldı`)) restoreSnapshot(snap);
            };
            c.appendChild(b);
        },0);
    };

    // Drag/drop da manuel kilit + yerel reopt mantığına bağlanır.
    global.drop = function(e,ns,ng) {
        if (!isAdmin) return;
        e.preventDefault();
        const pAd = e.dataTransfer.getData('p');
        if (!pAd) return;
        const unit = currentEffectiveUnitForPersonDay(pAd,ng);
        const snap = snapshotStateForRollback();
        if (typeof saveStateToHistory === 'function') saveStateToHistory();
        const value = ns === SHIFTS.BOS ? SHIFTS.IZIN : ns;
        try {
            const p = personByName(pAd);
            if (isAnnualHardLocked(pAd,ng) && value !== SHIFTS.YILLIK) throw new Error(`${pAd} / ${GUNLER[ng]}: yönetici onaylı YILLIK İZİN hard lock; sürükle-bırak ile ezilemez.`);
            if (isWorkShift(value) && !isQualifiedForUnit(p,unit)) throw new Error(`${pAd}, ${unit} için uzman değil.`);
            markManualAssignment(pAd,ng,value,MANUAL_SOURCE);
            if (!reoptimizeUnits([unit],`drag/drop ${pAd}`)) {
                if (!isHardAbsenceValue(value)) restoreSnapshot(snap);
                else {
                    save();
                    try { tabloyuOlustur(); if (isAdmin) refreshUI(); } catch(e) {}
                    showSchedulerReport('⚠️ İZİN KORUNDU / KAPASİTE EKSİK',[
                        `${pAd} / ${GUNLER[ng]}: ${value} olarak alt bölüme taşındı.`,
                        'Kapasite açığı oluştuysa izin geri alınmadı.'
                    ],'warning');
                }
            }
        } catch(err) {
            restoreSnapshot(snap);
            showSchedulerReport('❌ DEĞİŞİKLİK REDDEDİLDİ',[String(err.message || err)],'error');
        }
    };

    // Geçici birim değişimi: sadece kaynak + hedef birim etkilenir; uzmanlık yoksa engellenir.
    const oldGeciciBirimAta = global.geciciBirimAta;
    global.geciciBirimAta = function(pAd,gIdx,yeniBirim) {
        if (!isAdmin) return;
        const p = personByName(pAd);
        if (!p) return;
        const oldUnit = currentEffectiveUnitForPersonDay(pAd,gIdx);
        const targetUnit = yeniBirim || p.birim;
        if (isAnnualHardLocked(pAd,gIdx)) {
            showSchedulerReport('⛔ YILLIK İZİN HARD LOCK',[`${pAd} / ${GUNLER[gIdx]}: onaylı yıllık izin varken geçici birim ataması yapılamaz.`],'error');
            return;
        }
        if (yeniBirim && !isQualifiedForUnit(p,yeniBirim)) {
            showSchedulerReport('❌ UZMANLIK ENGELİ',[`${pAd}, ${yeniBirim} için tanımlı uzmanlığa sahip değil.`],'error');
            return;
        }
        const snap = snapshotStateForRollback();
        const scheduler = ensureSchedulerState();
        const tk = tempKey(pAd,gIdx);
        if (yeniBirim) {
            state.geciciGorevler[tk] = yeniBirim;
            scheduler.manualUnitLocks[tk] = true;
            scheduler.tempUnitSource[tk] = MANUAL_SOURCE;
        } else {
            delete state.geciciGorevler[tk];
            delete scheduler.manualUnitLocks[tk];
            delete scheduler.tempUnitSource[tk];
        }
        const units = Array.from(new Set([oldUnit,targetUnit].filter(Boolean)));
        if (!reoptimizeUnits(units,`${pAd} geçici birim değişimi`)) restoreSnapshot(snap);
    };

    // Talep onayını da hard manuel lock yap ve yalnız ilgili birimi düzelt.
    global.talepIslem = function(id,tip) {
        database.ref('talepler/' + id).once('value', snap => {
            if (!snap.exists()) return;
            const t = snap.val();
            if (tip !== 'onay') {
                database.ref('talepler/' + id).update({durum:'reddedildi'});
                showToast('Talep reddedildi.','error');
                logKoy(`${t.ad} için talep reddedildi.`);
                return;
            }
            const oldMonday = currentMonday;
            currentMonday = new Date(`${t.hKey}T12:00:00`);
            const rollback = snapshotStateForRollback();
            try {
                const p = personByName(t.ad);
                if (!p) throw new Error('Talep personeli bulunamadı.');
                const unit = currentEffectiveUnitForPersonDay(t.ad,t.gunIdx);
                if (isAnnualHardLocked(t.ad,t.gunIdx) && t.tur !== SHIFTS.YILLIK) throw new Error(`${t.ad}: bu tarihte onaylı yıllık izin var; vardiya talebi uygulanamaz.`);
                if (isWorkShift(t.tur) && !isQualifiedForUnit(p,unit)) throw new Error(`${t.ad}, ${unit} için uzman değil.`);
                markManualAssignment(t.ad,t.gunIdx,t.tur,REQUEST_SOURCE);
                if (!reoptimizeUnits([unit],`Onaylı talep: ${t.ad} ${t.tur}`)) throw new Error('Talep kapasite/kurallarla birlikte çözülemedi.');
                database.ref('talepler/' + id).update({durum:'onaylandi'});
                showToast(`✅ ${t.ad} için talep onaylandı ve ${unit} yeniden dengelendi.`,'success');
                logKoy(`${t.ad} için talep onaylandı: ${t.tur}`);
            } catch(err) {
                restoreSnapshot(rollback);
                showSchedulerReport('❌ TALEP UYGULANAMADI',[String(err.message || err)],'error');
            } finally {
                // Onaylanan haftayı ekranda bırakmak eski davranışla uyumlu.
                tabloyuOlustur();
            }
        });
    };

    function dateRangeInclusive(startStr,endStr) {
        const out = [];
        const start = new Date(`${startStr}T12:00:00`);
        const end = new Date(`${endStr}T12:00:00`);
        if (isNaN(start) || isNaN(end) || start > end) return out;
        const cur = new Date(start);
        let guard = 0;
        while (cur <= end && guard++ < 370) {
            out.push(new Date(cur));
            cur.setDate(cur.getDate()+1);
        }
        return out;
    }

    function actualPersonByExternalName(name) {
        const clean = v => normalizeName(v).replace(/\s+/g,' ');
        const wanted = clean(name);
        return state.personeller.find(p => clean(p.ad) === wanted) || null;
    }

    function unitForAbsoluteDate(person,dateObj) {
        const dateKey = getDateKey(dateObj);
        return (state.geciciGorevler || {})[`${dateKey}_${person.ad}`] || person.birim;
    }

    // Harici yıllık izin uygulamasından gelen yönetici onaylarını kaynak-of-truth kabul eder.
    // İzin eklenirse vardiya asla geri yazılmaz; çözüm bulunamazsa izin korunur ve kapasite açığı raporlanır.
    function applyExternalAnnualLocks(records, options={}) {
        const scheduler = ensureSchedulerState();
        const next = {};
        const affectedCurrentUnits = new Set();
        const currentH = hKeyNow();

        (records || []).forEach(rawRec => {
            const rec = normalizedAnnualRecord(rawRec);
            if (!isApprovedAnnualLeaveRecord(rec)) return;
            const p = actualPersonByExternalName(rec.personel_adi);
            if (!p) return;
            const start = formatTarih(rec.baslangic_tarihi);
            const end = formatTarih(rec.bitis_tarihi);
            dateRangeInclusive(start,end).forEach(dt => {
                const hKey = getDateKey(getMonday(dt));
                const day = (dt.getDay()+6)%7;
                const key = assignmentKey(p.ad,day,hKey);
                next[key] = {person:p.ad,hKey,day,date:getDateKey(dt),unit:unitForAbsoluteDate(p,dt)};
            });
        });

        // Artık onaylı olmayan eski harici kilitleri yalnız kendi kaynağımızsa kaldır.
        Object.keys(scheduler.externalAnnualLocks || {}).forEach(key => {
            if (next[key]) return;
            const old = scheduler.externalAnnualLocks[key];
            if (scheduler.assignmentSource[key] === ANNUAL_EXTERNAL_SOURCE && state.manuelAtamalar[key] === SHIFTS.YILLIK) {
                delete state.manuelAtamalar[key];
                delete scheduler.manualLocks[key];
                delete scheduler.assignmentSource[key];
                if (old && old.hKey === currentH && old.unit) affectedCurrentUnits.add(old.unit);
            }
        });

        Object.keys(next).forEach(key => {
            const meta = next[key];
            state.manuelAtamalar[key] = SHIFTS.YILLIK;
            scheduler.manualLocks[key] = true;
            scheduler.assignmentSource[key] = ANNUAL_EXTERNAL_SOURCE;
            if (meta.hKey === currentH && meta.unit) affectedCurrentUnits.add(meta.unit);
        });
        scheduler.externalAnnualLocks = next;
        save();
        try { tabloyuOlustur(); } catch(e) {}

        if (options.reoptimize !== false && isAdmin && affectedCurrentUnits.size) {
            const units = autoManagedUnits(Array.from(affectedCurrentUnits));
            const ok = units.length ? reoptimizeUnits(units,'Harici yönetici onaylı yıllık izin güncellendi',{silentFailure:true}) : true;
            if (!ok) {
                showSchedulerReport('⚠️ YILLIK İZİN KORUNDU / KAPASİTE ÇÖZÜLEMEDİ',[
                    'Harici uygulamadaki yönetici onayı HARD LOCK olarak uygulandı ve geri alınmadı.',
                    `Etkilenen birim(ler): ${units.join(', ')}`,
                    'Exact kapasite mevcut uygun personelle sağlanamadı. Yönetici müdahalesi gerekiyor.'
                ],'error');
            }
        }
        return {count:Object.keys(next).length,affectedUnits:Array.from(affectedCurrentUnits)};
    }

    function startExternalAnnualRealtimeSync() {
        try {
            if (typeof dbIzin === 'undefined' || !dbIzin || typeof dbIzin.collection !== 'function') return false;
            if (global.__V62_ANNUAL_UNSUB) return true;
            global.__V62_ANNUAL_UNSUB = dbIzin.collection('izinler').onSnapshot(snapshot => {
                const records = [];
                snapshot.forEach(doc => {
                    const raw = doc.data();
                    records.push(normalizedAnnualRecord(raw));
                });
                hariciIzinler = records;
                try { renderLeaveCalendar(); } catch(e) {}
                const r = applyExternalAnnualLocks(records,{reoptimize:true});
                const approved = records.filter(isApprovedAnnualLeaveRecord).length;
                const matched = records.filter(x => isApprovedAnnualLeaveRecord(x) && actualPersonByExternalName(x.personel_adi)).length;
                if (typeof showToast === 'function') showToast(`🏖️ Yıllık izin senkronu: ${records.length} kayıt / ${approved} onaylı / ${matched} personel / ${r.count} gün hard lock.`,'info');
            }, err => console.error('V62 yıllık izin realtime listener:',err));
            return true;
        } catch(err) {
            console.error('V62 yıllık izin realtime başlatılamadı:',err);
            return false;
        }
    }

    function annualCoverageDiagnostic(person) {
        if (!person) return [];
        const unit=person.birim;
        const lines=[];
        if (isCycleUnit(unit)) {
            const external=state.personeller.filter(p=>p.ad!==person.ad && p.birim!==unit && !isLegacyExternalUnit(p.birim) && isQualifiedForUnit(p,unit));
            if (!external.length) {
                const spec=requiredSpecialty(unit) || unit;
                lines.push(`${unit}: başka birimde '${spec}' uzmanlığı işaretlenmiş yedek personel bulunmuyor.`);
                lines.push(`Bu izin süresini otomatik kapatmak için Personel > Uzmanlık Bilgisi bölümünde uygun en az bir yedeğe '${spec}' uzmanlığı verin.`);
            } else {
                lines.push(`${unit} uzman yedek havuzu: ${external.map(p=>p.ad).join(', ')}.`);
                lines.push('Bu kişilerden hiçbiri seçilemediyse kendi vardiyası, dinlenme veya haftalık gün sınırı çakışıyor demektir.');
            }
        }
        const last=(global.__V62_LAST_REOPT_ERRORS || []).slice(0,6);
        if (last.length) lines.push('Çözüm ayrıntısı:', ...last.map(x=>`• ${x}`));
        return lines;
    }

    // Yönetim panelindeki TOPLU YILLIK İZİN butonunun V61'de eksik kalan fonksiyonu.
    // Bu yalnız vardiya uygulamasındaki yerel/admin hard lock'tur; harici sistem onayıyla aynı önceliktedir.
    global.yillikIzinIsle = function() {
        if (!isAdmin) return;
        const name = (document.getElementById('yillikIzinPersonel') || {}).value || '';
        const start = (document.getElementById('yillikBaslangic') || {}).value || '';
        const end = (document.getElementById('yillikBitis') || {}).value || '';
        const p = personByName(name);
        if (!p || !start || !end) {
            showSchedulerReport('❌ YILLIK İZİN',[`Personel, başlangıç ve bitiş tarihini eksiksiz seçin.`],'error');
            return false;
        }
        const dates = dateRangeInclusive(start,end);
        if (!dates.length) {
            showSchedulerReport('❌ YILLIK İZİN',[`Geçersiz tarih aralığı: ${start} - ${end}`],'error');
            return false;
        }
        const scheduler = ensureSchedulerState();
        const affected = new Set();
        dates.forEach(dt => {
            const hKey = getDateKey(getMonday(dt));
            const day = (dt.getDay()+6)%7;
            const key = assignmentKey(p.ad,day,hKey);
            state.manuelAtamalar[key] = SHIFTS.YILLIK;
            scheduler.manualLocks[key] = true;
            scheduler.assignmentSource[key] = ANNUAL_LOCAL_SOURCE;
            if (hKey === hKeyNow()) affected.add(unitForAbsoluteDate(p,dt));
        });
        save();
        try { tabloyuOlustur(); } catch(e) {}
        let ok = true;
        const affectedManaged = autoManagedUnits(Array.from(affected));
        if (affectedManaged.length) ok = reoptimizeUnits(affectedManaged,`${p.ad} yerel yıllık izin ${start}-${end}`,{silentFailure:true});
        if (ok) {
            showSchedulerReport('✅ YILLIK İZİN HARD LOCK',[
                `${p.ad}: ${start} - ${end}`,
                'İzin günleri hard lock olarak işlendi.',
                affected.size ? (affectedManaged.length ? `Yalnız etkilenen birim yeniden dengelendi: ${affectedManaged.join(', ')}` : `Excel/legacy birim olduğu için liste yeniden üretilmedi: ${Array.from(affected).join(', ')}`) : 'İzin farklı bir haftaya işlendi; o haftaya geçildiğinde otomatik uygulanacaktır.'
            ],'success');
        } else {
            // reoptimizeUnits kendi snapshotını izinler eklendikten sonra aldığı için izin hard lock kalır.
            save(); tabloyuOlustur();
            showSchedulerReport('⚠️ YILLIK İZİN KORUNDU / YEDEK EKSİK',[
                `${p.ad}: ${start} - ${end} yıllık izni iptal edilmedi ve HARD LOCK olarak kaldı.`,
                'Algoritma izinli personeli geri çağırmadı. Uygun uzman yedek / dinlenme kombinasyonu bulunamadı.',
                ...annualCoverageDiagnostic(p)
            ],'error');
        }
        return ok;
    };

    // Eski manuel çekme butonu çalıştığında da aynı hard-lock kaynağını uygula.
    const oldIzinleriGuncelleVeCek = global.izinleriGuncelleVeCek;
    if (typeof oldIzinleriGuncelleVeCek === 'function') {
        global.izinleriGuncelleVeCek = async function() {
            const r = await oldIzinleriGuncelleVeCek.apply(this,arguments);
            applyExternalAnnualLocks(hariciIzinler,{reoptimize:true});
            return r;
        };
    }

    // Bulut vardiya_data state'i yeniden yüklendiğinde harici izin hard lock'larını tekrar uygula.
    const oldCloudLoad = global.veriyiBuluttanYukleVeCiz;
    if (typeof oldCloudLoad === 'function') {
        global.veriyiBuluttanYukleVeCiz = function() {
            const r = oldCloudLoad.apply(this,arguments);
            return Promise.resolve(r).then(v => { applyExternalAnnualLocks(hariciIzinler,{reoptimize:false}); return v; });
        };
    }

    // Yönetim paneline INGEST uzmanlığı seçeneğini runtime'da eklemeye gerek kalmasın diye
    // veri katmanı bu uzmanlığı destekler. UI app.js içinde de candidate sürümde eklendi.

    global.SchedulerV2 = {
        version:SCHEDULER_VERSION,
        capacityMode:'MINIMUM_FLOOR_FOR_POOL__STRICT_SEQUENCE_FOR_CYCLE',
        generateAll,
        reoptimizeUnits,
        solveSchedule,
        validateFinal,
        isQualifiedForUnit,
        isPersonOnAnnualLeave:isPersonOnAnnualLeaveV2,
        releaseManualAssignment,
        markManualAssignment,
        requiredSpecialty,
        shiftTimes,
        isEarlyDayShift,
        previousShiftBlocksEarly,
        previousWeekAssignment,
        previousWeekRotationPenalty,
        minimumTargetDays,
        minWorkCapacityFeasible,
        rebalanceMinimumWorkDays,
        isWeekdayFixedPerson,
        isWeekendReservePerson,
        isAnnualHardLocked,
        applyExternalAnnualLocks,
        startExternalAnnualRealtimeSync,
        isLegacyExternalUnit,
        isNoCapacityPreservedUnit,
        isPreservedUnit,
        markExternalUnitWeek,
        releaseExternalUnitWeek,
        autoManagedUnits,
        isCycleUnit,
        cycleExpectedShift,
        cycleShiftProfile,
        solveCycleUnitStrict
    };

    ensureSchedulerState();
    // Listener yalnız okur; vardiya production'a otomatik yazmaz. save() localStorage'dur.
    setTimeout(startExternalAnnualRealtimeSync, 1200);
    console.log(`[SchedulerV2] ${SCHEDULER_VERSION} loaded.`);
})(window);
