/*
 * TURKMEDYA V62 - FIX2.9 REAL XLSX EXPORT
 * Hosting-only override. app.js / scheduler-v2.js are untouched.
 *
 * Goals:
 * 1) Normal EXCEL button keeps the existing visual layout, but writes a real .xlsx file.
 * 2) ULAŞTIRMA button writes a real .xlsx using the supplied corporate transport template look:
 *    dark-red date/time bands, blue personnel cells, merged time blocks, 24 + 360 logos.
 * 3) No Firebase / scheduler / personnel-auth behavior is changed.
 */
(function (global) {
  'use strict';

  const VERSION = 'V62-EXCEL-COMBINED-WORKBOOK-FIX2.12-EFFECTIVE-UNIT-PLAIN-HEADERS-COMPACT-GRID-20261004';
  const EXCELJS_URL = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // FIX2.12 - Ana Excel sekmesi kullanicinin referans olculerine sabitlenir.
  const MAIN_SHEET_ROW_HEIGHT = 14;
  const MAIN_SHEET_COLUMN_WIDTH = 24.86;
  const MAIN_UNIT_HEADER_COLOR = '#403152';

  const LOGO_24_BASE64 = 'data:image/png;base64,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';
  const LOGO_360_BASE64 = 'data:image/png;base64,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';

  let excelJsPromise = null;

  function toast(message, type) {
    try {
      if (typeof showToast === 'function') showToast(message, type || 'info');
      else console.log('[FIX2.9]', message);
    } catch (_) {
      console.log('[FIX2.9]', message);
    }
  }

  function ensureExcelJS() {
    if (global.ExcelJS && global.ExcelJS.Workbook) return Promise.resolve(global.ExcelJS);
    if (excelJsPromise) return excelJsPromise;

    excelJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-tm-exceljs="fix2-9"]');
      if (existing) {
        existing.addEventListener('load', () => {
          if (global.ExcelJS && global.ExcelJS.Workbook) resolve(global.ExcelJS);
          else reject(new Error('ExcelJS yüklendi ancak Workbook bulunamadı.'));
        }, { once: true });
        existing.addEventListener('error', () => reject(new Error('ExcelJS indirilemedi.')), { once: true });
        return;
      }

      const s = document.createElement('script');
      s.src = EXCELJS_URL;
      s.async = true;
      s.dataset.tmExceljs = 'fix2-9';
      s.onload = () => {
        if (global.ExcelJS && global.ExcelJS.Workbook) resolve(global.ExcelJS);
        else reject(new Error('ExcelJS yüklendi ancak Workbook bulunamadı.'));
      };
      s.onerror = () => reject(new Error('ExcelJS indirilemedi. İnternet/CDN erişimini kontrol edin.'));
      document.head.appendChild(s);
    }).catch((err) => {
      excelJsPromise = null;
      throw err;
    });

    return excelJsPromise;
  }

  function rgb(hex, fallback) {
    const v = String(hex || fallback || '#FFFFFF').trim().replace('#', '');
    const six = /^[0-9a-fA-F]{6}$/.test(v) ? v : String(fallback || '#FFFFFF').replace('#', '');
    return ('FF' + six).toUpperCase();
  }

  function fill(hex) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb: rgb(hex) } };
  }

  function border(style) {
    const side = { style: style || 'thin', color: { argb: 'FF000000' } };
    return { top: side, left: side, bottom: side, right: side };
  }

  function setCellStyle(cell, opt) {
    const o = opt || {};
    if (o.fill) cell.fill = fill(o.fill);
    if (o.font) cell.font = o.font;
    if (o.alignment) cell.alignment = o.alignment;
    if (o.border) cell.border = o.border;
    if (o.numFmt) cell.numFmt = o.numFmt;
  }

  function downloadBuffer(buffer, fileName) {
    const blob = new Blob([buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function safeMondayKey() {
    return getDateKey(currentMonday);
  }

  const TR_MONTHS = [
    'OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN',
    'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'
  ];

  function weekWorkbookNames() {
    const start = new Date(currentMonday);
    const end = new Date(currentMonday);
    end.setDate(end.getDate() + 6);

    const day = (d) => String(d.getDate()).padStart(2, '0');
    const month = (d) => TR_MONTHS[d.getMonth()];
    const range = `${day(start)} ${month(start)} - ${day(end)} ${month(end)}`;

    return {
      range,
      fileName: `${range} HAFTASI TEKNİK EKİP CALIŞMA LİSTESİ.xlsx`,
      scheduleSheet: `${range} HAFTASI`,
      // Reference workbook uses two spaces before ULAŞTIRMA; preserve it.
      transportSheet: `${range}  ULAŞTIRMA`
    };
  }


  // FIX2.11 - supplied weekly workbook is the visual source of truth for
  // unit ordering and person background colors. Transport layout is unchanged.
  const UNIT_EXPORT_ORDER = [
    { aliases: ['SİSTEM SORUMLULARI'], label: 'SİSTEM SORUMLULARI' },
    { aliases: ['TEKNİK YÖNETMEN', 'TEKNİK YÖNETMENLER', '24TV - 360TV TEKNİK YÖNETMENLER'], label: '24TV - 360TV TEKNİK YÖNETMENLER' },
    { aliases: ['SES', 'SES OPERATÖRÜ', '24TV - 360TV SES OPERATÖRÜ'], label: '24TV - 360TV SES OPERATÖRÜ' },
    { aliases: ['PLAYOUT', 'PLAYOUT OPERATÖRÜ', '24 PLAYOUT OPERATÖRÜ', '360TV PLAYOUT'], label: '24 PLAYOUT OPERATÖRÜ' },
    { aliases: ['KJ', 'KJ OPERATÖRÜ', '24 KJ OPERATÖRÜ', '360TV KJ'], label: '24 KJ OPERATÖRÜ' },
    { aliases: ['INGEST', 'INGEST OPERATÖRÜ', '24TV - 360TV INGEST OPERATÖRÜ'], label: '24TV - 360TV INGEST OPERATÖRÜ' },
    { aliases: ['UPLİNK', 'UPLINK', '24TV - 360TV UPLINK'], label: '24TV - 360TV UPLINK' },
    { aliases: ['24TV - 360TV BİLGİ İŞLEM', 'BİLGİ İŞLEM'], label: '24TV - 360TV BİLGİ İŞLEM' },
    { aliases: ['24TV - 360TV YAYIN SİSTEMLERİ', 'YAYIN SİSTEMLERİ'], label: '24TV - 360TV YAYIN SİSTEMLERİ' },
    { aliases: ['24TV - 360TV IŞIK', 'IŞIK'], label: '24TV - 360TV IŞIK' },
    { aliases: ['24TV - 360TV DEKOR', 'DEKOR'], label: '24TV - 360TV DEKOR' },
    { aliases: ['24 TV - 360 TV KAMERAMANLAR', 'KAMERAMAN', 'KAMERAMANLAR'], label: '24 TV - 360 TV KAMERAMANLAR' },
    { aliases: ['24 TV REKLAM AKIŞ', 'REKLAM AKIŞ'], label: '24 TV REKLAM AKIŞ' },
    { aliases: ['24TV YAYIN YÖNETMENİ', 'YAYIN YÖNETMENİ'], label: '24TV YAYIN YÖNETMENİ' },
    { aliases: ['24TV MCR OPERATÖRÜ', '24 MCR', '24TV MCR'], label: '24TV MCR OPERATÖRÜ' },
    { aliases: ['360TV MCR OPERATÖRÜ', '360 MCR', '360TV MCR'], label: '360TV MCR OPERATÖRÜ' },
    { aliases: ['RESİM SEÇİCİ', '360TV RESİM SEÇİCİ'], label: '360TV RESİM SEÇİCİ' },
    { aliases: ['GAZETE ARŞİV', 'GAZETE ARŞİVİ'], label: 'GAZETE ARŞİV' },
    { aliases: ['RENK AYRIMI'], label: 'RENK AYRIMI' },
    { aliases: ['TV ARŞİV', 'TV ARŞİVİ'], label: 'TV ARŞİV' },
    { aliases: ['360TV PLAYOUT VE KJ OPERATÖRÜ', '360TV PLAYOUT  VE KJ OPERATÖRÜ'], label: '360TV PLAYOUT  VE KJ OPERATÖRÜ' }
  ];

  const PERSON_COLOR_ENTRIES = [
    ["ABDULLAH BABUN", '#F4B183'],
    ["AHMET ORKUN GÜMÜŞ", '#92D050'],
    ["AHMET ORKUN GÜMÜŞ  ***", '#92D050'],
    ["AKİF KOÇ", '#4472C4'],
    ["ALTUN BAYRAM", '#4472C4'],
    ["ANIL RİŞVAN", '#8FAADC'],
    ["APTULLAH ÖZÇİVİT", '#C9C9C9'],
    ["AYŞE HALAK", '#4AFCCD'],
    ["BARIŞ İNCE", '#A6A6A6'],
    ["BEKİR KAYALI", '#70AD47'],
    ["BERKE GÜROL", '#F8CBAD'],
    ["BEYHAN KARAKAŞ", '#92D050'],
    ["BEYHAN KARAKAŞ- AKİF KOÇ", '#92D050'],
    ["BURAK BAYAR", '#333F50'],
    ["BUSE KURT", '#92D050'],
    ["CAN ŞENTUNALI", '#93C47D'],
    ["CEMREHAN SUBAŞI", '#FFE699'],
    ["CEREN GÖRAL", '#FFFF00'],
    ["DEMET CENGİZ", '#70AD47'],
    ["DİLEK AYDINDAĞ", '#00B0F0'],
    ["DİLEK AYDINDAĞ (09:00-18:00)", '#00B0F0'],
    ["DOĞUŞ MALGIL", '#FFC000'],
    ["DUYGU YUCA", '#FFC7CE'],
    ["EKREM FİDAN", '#4F81BD'],
    ["EMRAH ŞEKER", '#FFC000'],
    ["EMRE TAKMAZ", '#BDD7EE'],
    ["EMRULLAH AHLATÇI", '#009110'],
    ["ENDER GİRGİÇ", '#F4B183'],
    ["ENES KALE", '#FFFF00'],
    ["ENGİN DEMİR", '#E2EFDA'],
    ["ERCAN AYBASTI", '#FF0000'],
    ["ERCAN PALABIYIK", '#8FAADC'],
    ["ERCÜMENT SAMİ YAĞCI", '#FFFF00'],
    ["ERDOĞAN KÜÇÜKKAYA", '#0070C0'],
    ["EREN KAZAN", '#B9CDE5'],
    ["EREN ÇAKAN", '#A5A5A5'],
    ["EREN ÇAKAN  ***", '#A5A5A5'],
    ["ERSAN TİLBE", '#FF0000'],
    ["ESRA AYDIN", '#FFCCFF'],
    ["FARUK YILMAZ", '#F4B183'],
    ["FATİH AYBEK", '#FFFF00'],
    ["FATİH KOÇOĞLU", '#A9CE91'],
    ["FATİH UĞUR YÜKSEL", '#F4B183'],
    ["FATMANUR CANDAN", '#7030A0'],
    ["FERDİ TOPUZ", '#FD6DF3'],
    ["FERDİ TOPUZ - AKİF KOÇ", '#FD6DF3'],
    ["GÖKHAN BAĞIŞ", '#FFD966'],
    ["GÖKHAN HACIOSMANOĞLU", '#773F19'],
    ["HAKAN ELİPEK", '#C4BD97'],
    ["HAMİ ÖZCAN", '#F4B183'],
    ["HASAN CAN SAĞLAM", '#000000'],
    ["HAYRUNNİSA UYAR", '#FFE9A3'],
    ["İBRAHİM SERİNSÖZ", '#DAE3F3'],
    ["İLKNUR DEĞİRMENCİ", '#FF66CC'],
    ["KAAN KÖPÜR", '#F4B183'],
    ["KADİR YILMAZ", '#FFC000'],
    ["KADİR ÇAÇAN", '#FFC000'],
    ["KIYMET KAYA", '#FF6699'],
    ["KİRALIK", '#FF0000'],
    ["MEHMET BERKMAN", '#FFFF00'],
    ["MEHMET BORA AKCA", '#63069C'],
    ["MEHMET GÜR", '#8FAADC'],
    ["MEHMET TURGUT YERLİ", '#FFFF00'],
    ["MUHARREM ULU", '#3D4C5F'],
    ["MUSAB YAKUB DEMİRBAŞ", '#00B0F0'],
    ["MUSTAFA ERCÜMENT KILIÇ", '#00B0F0'],
    ["NAZIM TÜNEY", '#DEEBF7'],
    ["NECDET DEMİRÖNAL", '#A9CE91'],
    ["NECDET DEMİRÖNAL ***", '#A9CE91'],
    ["NEHİR KAYGUSUZ", '#FFD966'],
    ["OKAN ÖZDEMİR", '#FFFF00'],
    ["OSMAN DİNÇER", '#92D050'],
    ["OĞUZHAN YALAZAN", '#FFC000'],
    ["PINAR ÖZENÇ", '#F8CBAD'],
    ["RABİA NUR DEMİRCi", '#FFFF00'],
    ["RAMAZAN KOÇAK", '#FFFF00'],
    ["RECEP KAZAK", '#009999'],
    ["RECEP KAZAK ***", '#009999'],
    ["RECEP KAZAK ---", '#009999'],
    ["SEDA KAYA", '#558ED5'],
    ["SENA BAYDAR", '#D99694'],
    ["SENA MİNARECİ", '#F9BDF6'],
    ["SERKAN DURSUN", '#C6DEB5'],
    ["SERKAN TOZLU", '#F1F0F0'],
    ["SERVET BULUT", '#FFC000'],
    ["SEYYİD YUSUF ALPKILIÇ", '#C6DEB5'],
    ["SİNAN GENCAL", '#941BB5'],
    ["ULVİ MUTLUBAŞ", '#ED7D31'],
    ["UĞUR AKBABA", '#FFC000'],
    ["UĞUR BAKIRTAŞ", '#92D050'],
    ["VOLKAN DEMİRBAŞ", '#0070C0'],
    ["YAŞAR BAYNAL", '#F5F5F5'],
    ["YAŞAR DEMİRCİ", '#000066'],
    ["YEŞİM KİREÇ", '#B25E25'],
    ["YİĞİT TOLGA DAYI", '#F4B183'],
    ["YUNUS EMRE YAYLA", '#C5D9F1'],
    ["YUSUF ALPKILIÇ", '#C6DEB5'],
    ["YUSUF HENEK", '#B9CDE5'],
    ["YUSUF İSLAM TORUN", '#A5A5A5'],
    ["ZAFER AKAR", '#E46C0A'],
    ["ÖMER FARUK SEÇİLMİŞ", '#00B0F0'],
    ["ÖMER FARUK SEÇİLMİŞ***", '#00B0F0'],
    ["ÖMER FARUK ÖZBEY", '#FFFF00'],
    ["ÖZKAN KAYA", '#92D050'],
  ];

  const PERSON_FALLBACK_PALETTE = [
    '#92D050', '#FFFF00', '#FFC000', '#93C47D', '#C5D9F1', '#A6A6A6',
    '#4F81BD', '#FF0000', '#8FAADC', '#E46C0A', '#0070C0', '#F9BDF6',
    '#FFD966', '#F8CBAD', '#70AD47', '#DAE3F3', '#C6DEB5', '#A5A5A5',
    '#F4B183', '#B9CDE5', '#FFE699', '#D99694', '#00B0F0', '#BDD7EE'
  ];

  function normalizeExportText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
  }

  function exportUnitFamily(value) {
    const key = normalizeExportText(value);
    if (!key) return '';
    for (const spec of UNIT_EXPORT_ORDER) {
      const names = [...spec.aliases, spec.label].map(normalizeExportText);
      if (names.includes(key)) return normalizeExportText(spec.label);
    }
    return key;
  }

  function sameExportUnit(a, b) {
    return exportUnitFamily(a) === exportUnitFamily(b);
  }

  function effectiveUnitForExport(person, dayIndex, shiftValue) {
    if (!person) return '';
    const offValues = [
      SHIFTS.IZIN, SHIFTS.BOS, SHIFTS.YILLIK, SHIFTS.RAPOR,
      'İZİNLİ', 'YILLIK İZİN', 'RAPORLU', null, undefined, ''
    ];

    // Izin/rapor gunleri personelin ana biriminde gosterilir.
    // Sadece fiilen calistigi gunlerde gecici/gunluk atama hedef birime tasinir.
    if (offValues.includes(shiftValue)) return person.birim;

    try {
      if (typeof getGecerliBirim === 'function') {
        const unit = getGecerliBirim(person, dayIndex);
        if (unit) return unit;
      }
    } catch (_) {}

    // getGecerliBirim erişilemezse ayni state verisinden guvenli fallback.
    try {
      const date = new Date(currentMonday);
      date.setDate(date.getDate() + dayIndex);
      const dateKey = (typeof getDateKey === 'function')
        ? getDateKey(date)
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const temp = state.geciciGorevler && state.geciciGorevler[`${dateKey}_${person.ad}`];
      if (temp) return temp;
    } catch (_) {}

    return person.birim;
  }

  function isTrainingAssignmentForExport(person, dayIndex) {
    try {
      if (!person || !state.schedulerV2 || !state.schedulerV2.assignmentSource) return false;
      const hKey = (typeof getDateKey === 'function') ? getDateKey(currentMonday) : '';
      const key = `${hKey}_${person.ad}_${dayIndex}`;
      return state.schedulerV2.assignmentSource[key] === 'AUTO_V62_TRAINING';
    } catch (_) { return false; }
  }

  function trainingHomeUnitLabelForExport(person) {
    if (!person) return '-';
    try {
      if (typeof gorevYeriBirimEtiketi === 'function') return gorevYeriBirimEtiketi(person.birim) || person.birim || '-';
    } catch (_) {}
    return String(person.birim || '-').replace(/\s+OPERATÖRÜ$/u, '').trim();
  }

  const PERSON_COLOR_MAP = new Map(
    PERSON_COLOR_ENTRIES.map(([name, color]) => [normalizeExportText(name), color])
  );

  function personColor(name) {
    const key = normalizeExportText(name);
    if (!key) return null;
    if (PERSON_COLOR_MAP.has(key)) return PERSON_COLOR_MAP.get(key);

    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    return PERSON_FALLBACK_PALETTE[Math.abs(hash) % PERSON_FALLBACK_PALETTE.length];
  }

  function contrastFontColor(hex) {
    const v = String(hex || '#FFFFFF').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(v)) return 'FF000000';
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return ((0.299 * r) + (0.587 * g) + (0.114 * b)) < 115 ? 'FFFFFFFF' : 'FF000000';
  }

  function orderedUnitSpecs() {
    const actual = Array.isArray(state.birimler) ? [...state.birimler] : [];
    const used = new Set();
    const out = [];

    for (const spec of UNIT_EXPORT_ORDER) {
      const aliases = spec.aliases.map(normalizeExportText);
      const match = actual.find((unit) => !used.has(unit) && aliases.includes(normalizeExportText(unit)));
      if (match) {
        used.add(match);
        out.push({ key: match, label: spec.label });
      }
    }

    for (const unit of actual) {
      if (!used.has(unit)) out.push({ key: unit, label: unit });
    }
    return out;
  }

  function scheduleHeaderDateText(date) {
    return `${String(date.getDate()).padStart(2, '0')} ${TR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }

  function workingShifts() {
    const off = new Set([
      SHIFTS.IZIN, SHIFTS.BOS, SHIFTS.YILLIK, SHIFTS.RAPOR,
      'İZİNLİ', 'YILLIK İZİN', 'RAPORLU', null, undefined, ''
    ]);
    return (state.saatler || []).filter((s) => !off.has(s));
  }

  function personsForShiftDay(hKey, shift, dayIndex) {
    const rows = (state.personeller || []).filter((p) => {
      return state.manuelAtamalar[`${hKey}_${p.ad}_${dayIndex}`] === shift;
    });

    rows.sort((a, b) => {
      let aUnit = a.birim;
      let bUnit = b.birim;
      try {
        if (typeof getGecerliBirim === 'function') {
          aUnit = getGecerliBirim(a, dayIndex);
          bUnit = getGecerliBirim(b, dayIndex);
        }
      } catch (_) {}
      const ai = Math.max(-1, (state.birimler || []).indexOf(aUnit));
      const bi = Math.max(-1, (state.birimler || []).indexOf(bUnit));
      if (ai !== bi) return ai - bi;
      return String(a.ad || '').localeCompare(String(b.ad || ''), 'tr-TR');
    });

    return rows;
  }

  function shiftStartLabel(shift) {
    const s = String(shift || '').trim();
    const m = s.match(/(\d{1,2}:\d{2})/);
    return m ? m[1] : s.split(/[–—-]/)[0].trim();
  }

  async function buildCurrentLayoutWorkbook(ExcelJS, existingWorkbook, sheetName) {
    const wb = existingWorkbook || new ExcelJS.Workbook();
    if (!existingWorkbook) {
      wb.creator = 'TURKMEDYA Teknik Vardiya';
      wb.lastModifiedBy = 'TURKMEDYA V62';
      wb.created = new Date();
      wb.modified = new Date();
    }

    const ws = wb.addWorksheet(sheetName || 'Vardiya', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // Keep the accepted FIX2.9/FIX2.10 schedule footprint.
    for (let c = 1; c <= 8; c++) ws.getColumn(c).width = MAIN_SHEET_COLUMN_WIDTH;

    const thin = border('thin');
    const medium = border('medium');
    const baseAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Row 1: accepted title layout remains.
    ws.mergeCells(1, 1, 1, 8);
    const title = ws.getCell(1, 1);
    title.value = 'TEKNİK PERSONEL ÇALIŞMA LİSTESİ';
    setCellStyle(title, {
      fill: '#1e293b',
      font: { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } },
      alignment: baseAlign,
      border: medium
    });
    ws.getRow(1).height = MAIN_SHEET_ROW_HEIGHT;
    for (let c = 1; c <= 8; c++) setCellStyle(ws.getCell(1, c), { fill: '#1e293b', border: medium });

    // Dates + full day names, following the supplied weekly workbook.
    ws.mergeCells('A2:A3');
    const timeHeader = ws.getCell('A2');
    timeHeader.value = 'SAAT';
    setCellStyle(timeHeader, {
      fill: '#403152',
      font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
      alignment: baseAlign,
      border: medium
    });

    const fullDays = ['PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'];
    for (let d = 0; d < 7; d++) {
      const date = new Date(currentMonday);
      date.setDate(date.getDate() + d);

      const dateCell = ws.getCell(2, d + 2);
      dateCell.value = scheduleHeaderDateText(date);
      setCellStyle(dateCell, {
        fill: '#403152',
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: baseAlign,
        border: medium
      });

      const dayCell = ws.getCell(3, d + 2);
      dayCell.value = fullDays[d];
      setCellStyle(dayCell, {
        fill: '#403152',
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: baseAlign,
        border: medium
      });
    }
    ws.getRow(2).height = MAIN_SHEET_ROW_HEIGHT;
    ws.getRow(3).height = MAIN_SHEET_ROW_HEIGHT;

    let rowNo = 4;
    const hKey = safeMondayKey();

    // Reference order: Sistem -> Teknik Yönetmen -> Ses -> Playout -> KJ -> Ingest -> Uplink -> ...
    orderedUnitSpecs().forEach(({ key: birim, label: displayLabel }) => {
      ws.mergeCells(rowNo, 1, rowNo, 8);
      const unitColor = MAIN_UNIT_HEADER_COLOR;
      const u = ws.getCell(rowNo, 1);
      u.value = displayLabel;
      setCellStyle(u, {
        fill: unitColor,
        font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
        alignment: baseAlign,
        border: medium
      });
      for (let c = 1; c <= 8; c++) setCellStyle(ws.getCell(rowNo, c), { fill: unitColor, border: medium });
      ws.getRow(rowNo).height = MAIN_SHEET_ROW_HEIGHT;
      rowNo++;

      [...(state.saatler || []), 'İZİN'].forEach((shift, index) => {
        const dayLists = [];
        let maxRows = 1;

        for (let d = 0; d < 7; d++) {
          const list = (state.personeller || []).filter((p) => {
            const v = state.manuelAtamalar[`${hKey}_${p.ad}_${d}`];
            if (shift === 'İZİN') {
              return sameExportUnit(p.birim, birim) &&
                [SHIFTS.IZIN, SHIFTS.BOS, null, SHIFTS.YILLIK, SHIFTS.RAPOR].includes(v);
            }

            // FIX2.12: Gunluk/gecici atama varsa Excel personeli ANA biriminde degil,
            // o gun fiilen calisacagi HEDEF birimde gosterir. Boylece kisi kaynak
            // birimden otomatik cikar ve hedef birimde ayni vardiya satirina girer.
            const effectiveUnit = effectiveUnitForExport(p, d, v);
            return sameExportUnit(effectiveUnit, birim) && v === shift;
          });
          dayLists[d] = list;
          if (list.length > maxRows) maxRows = list.length;
        }

        let rowColor = (state.saatAyarlari && state.saatAyarlari[shift])
          ? state.saatAyarlari[shift].renk
          : (DEFAULT_SHIFT_COLORS[index] || '#ffffff');
        if (shift === 'İZİN') rowColor = '#fef2f2';

        const startRow = rowNo;
        const endRow = rowNo + maxRows - 1;
        if (maxRows > 1) ws.mergeCells(startRow, 1, endRow, 1);

        for (let r = 0; r < maxRows; r++, rowNo++) {
          ws.getRow(rowNo).height = MAIN_SHEET_ROW_HEIGHT;
          for (let c = 1; c <= 8; c++) {
            const cell = ws.getCell(rowNo, c);
            setCellStyle(cell, {
              fill: rowColor,
              font: { name: 'Arial', size: 7, bold: true, color: { argb: 'FF000000' } },
              alignment: baseAlign,
              border: thin
            });
          }

          if (r === 0) ws.getCell(rowNo, 1).value = shift;

          for (let d = 0; d < 7; d++) {
            const person = dayLists[d][r];
            const cell = ws.getCell(rowNo, d + 2);
            cell.value = person ? (isTrainingAssignmentForExport(person, d) ? `${person.ad} • ÖĞRENME [ANA: ${trainingHomeUnitLabelForExport(person)}]` : person.ad) : '';

            // Person color follows the supplied reference workbook.
            // Empty cells keep their shift-row color.
            if (person && person.ad) {
              const pColor = personColor(person.ad);
              if (pColor) {
                cell.fill = fill(pColor);
                cell.font = {
                  name: 'Arial',
                  size: 7,
                  bold: true,
                  color: { argb: contrastFontColor(pColor) }
                };
              }
            }
          }
        }
      });
    });

    ws.views = [{ state: 'frozen', ySplit: 3 }];
    return wb;
  }

  function styleTransportHeaderCell(cell) {
    setCellStyle(cell, {
      fill: '#800002',
      font: { name: 'Arial', size: 12, bold: true, italic: true, color: { argb: 'FFFFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: border('medium')
    });
  }

  async function buildTransportTemplateWorkbook(ExcelJS, existingWorkbook, sheetName) {
    const wb = existingWorkbook || new ExcelJS.Workbook();
    if (!existingWorkbook) {
      wb.creator = 'TURKMEDYA Teknik Vardiya';
      wb.lastModifiedBy = 'TURKMEDYA V62';
      wb.created = new Date();
      wb.modified = new Date();
    }

    const ws = wb.addWorksheet(sheetName || 'ULAŞTIRMA', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    // Exact column widths sampled from the supplied ULAŞTIRMA workbook.
    const widths = [32, 53.33203125, 47.6640625, 47.6640625, 54.88671875, 54.88671875, 47.6640625, 46.88671875];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    ws.mergeCells('A1:A2');
    for (let r = 1; r <= 2; r++) {
      const a = ws.getCell(r, 1);
      setCellStyle(a, { fill: '#800002', border: border('medium') });
    }
    ws.getRow(1).height = 25.5;
    ws.getRow(2).height = 36.75;

    const fullDays = ['PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'];
    for (let d = 0; d < 7; d++) {
      const date = new Date(currentMonday);
      date.setDate(date.getDate() + d);

      const dc = ws.getCell(1, d + 2);
      dc.value = date;
      dc.numFmt = 'dd/mm/yyyy';
      styleTransportHeaderCell(dc);

      const dayCell = ws.getCell(2, d + 2);
      dayCell.value = fullDays[d];
      styleTransportHeaderCell(dayCell);
    }

    // Supplied reference: 24 and 360 logos inside the red left header area.
    try {
      const id24 = wb.addImage({ base64: LOGO_24_BASE64, extension: 'png' });
      const id360 = wb.addImage({ base64: LOGO_360_BASE64, extension: 'png' });
      ws.addImage(id24, { tl: { col: 0.10, row: 0.12 }, ext: { width: 58, height: 42 } });
      ws.addImage(id360, { tl: { col: 0.58, row: 0.08 }, ext: { width: 62, height: 62 } });
    } catch (e) {
      console.warn('[FIX2.9] Ulaştırma logoları eklenemedi:', e);
    }

    const hKey = safeMondayKey();
    let rowNo = 3;
    const mediumSide = { style: 'medium', color: { argb: 'FF000000' } };

    for (const shift of workingShifts()) {
      const lists = [];
      let maxRows = 1;
      for (let d = 0; d < 7; d++) {
        lists[d] = personsForShiftDay(hKey, shift, d);
        if (lists[d].length > maxRows) maxRows = lists[d].length;
      }

      const startRow = rowNo;
      const endRow = rowNo + maxRows - 1;
      if (maxRows > 1) ws.mergeCells(startRow, 1, endRow, 1);

      for (let r = 0; r < maxRows; r++, rowNo++) {
        ws.getRow(rowNo).height = 15.6;

        const timeCell = ws.getCell(rowNo, 1);
        setCellStyle(timeCell, {
          fill: '#800002',
          font: { name: 'Geneva', size: 16, bold: true, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'middle', wrapText: false },
          border: {
            left: mediumSide,
            right: mediumSide,
            top: r === 0 ? mediumSide : undefined,
            bottom: r === maxRows - 1 ? mediumSide : undefined
          }
        });
        if (r === 0) timeCell.value = shiftStartLabel(shift);

        for (let d = 0; d < 7; d++) {
          const cell = ws.getCell(rowNo, d + 2);
          cell.value = lists[d][r] ? lists[d][r].ad : '';
          setCellStyle(cell, {
            fill: '#558ED5',
            font: { name: 'Arial', size: 12, bold: true, italic: true, color: { argb: 'FF000000' } },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: false },
            border: {
              left: mediumSide,
              right: mediumSide,
              top: r === 0 ? mediumSide : undefined,
              bottom: r === maxRows - 1 ? mediumSide : undefined
            }
          });
        }
      }
    }

    ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }];
    return wb;
  }

  async function buildCombinedWorkbook(ExcelJS) {
    const names = weekWorkbookNames();
    const wb = await buildCurrentLayoutWorkbook(ExcelJS, null, names.scheduleSheet);
    await buildTransportTemplateWorkbook(ExcelJS, wb, names.transportSheet);

    // Main weekly schedule opens first; ULAŞTIRMA sits immediately beside it as the second tab.
    wb.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
    return wb;
  }

  async function exportWorkbook(builder, fileName, successMessage) {
    try {
      toast('⏳ Gerçek Excel (.xlsx) hazırlanıyor...', 'info');
      const ExcelJS = await ensureExcelJS();
      const wb = await builder(ExcelJS);
      const buffer = await wb.xlsx.writeBuffer();
      downloadBuffer(buffer, fileName);
      toast(successMessage, 'success');
    } catch (error) {
      console.error('[FIX2.9] Excel export error:', error);
      toast('❌ Excel oluşturulamadı: ' + String(error && error.message ? error.message : error), 'error');
    }
  }

  // Only the Excel download functions are overridden. app.js itself stays byte-identical.
  // Both buttons now produce ONE workbook: weekly schedule + ULAŞTIRMA as adjacent tabs.
  global.excelIndir = function () {
    const names = weekWorkbookNames();
    return exportWorkbook(
      buildCombinedWorkbook,
      names.fileName,
      '✅ Tek Excel dosyası hazırlandı: çalışma listesi + ULAŞTIRMA sekmesi.'
    );
  };

  global.ulastirmaExcelIndir = function () {
    const names = weekWorkbookNames();
    return exportWorkbook(
      buildCombinedWorkbook,
      names.fileName,
      '✅ Tek Excel dosyası hazırlandı: çalışma listesi + ULAŞTIRMA sekmesi.'
    );
  };

  global.TMRealExcelExport = {
    version: VERSION,
    weekWorkbookNames,
    buildCurrentLayoutWorkbook,
    buildTransportTemplateWorkbook,
    buildCombinedWorkbook
  };

  console.log(`[TMRealExcelExport] ${VERSION} loaded.`);
})(window);
