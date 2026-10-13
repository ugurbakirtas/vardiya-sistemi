/* TURKMEDYA V62 FIX2.28 - sadece XLSX ZIP serilestirme. Firebase / scheduler yok. */
/* global importScripts, ExcelJS */
'use strict';
self.onmessage = async function (event) {
  try {
    if (!self.ExcelJS) importScripts('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js');
    if (!self.ExcelJS || !self.ExcelJS.Workbook) throw new Error('ExcelJS arka plan kutuphanesi yuklenemedi.');
    const wb = new self.ExcelJS.Workbook();
    wb.model = event.data.model;
    // FIX2.32: workbook.model round-trip can drop merged cell ranges.
    // Repair the exact original merges before writing, without changing values.
    const expected = event.data.mergeManifest;
    if (!Array.isArray(expected) || expected.length !== wb.worksheets.length) {
      throw new Error('Excel merge manifest eksik veya sayfa sayisi uyusmuyor.');
    }
    for (const spec of expected) {
      const ws = wb.getWorksheet(spec.name);
      if (!ws || !Array.isArray(spec.ranges) || spec.ranges.length === 0) {
        throw new Error('Excel birlestirme manifesti eksik: ' + String(spec.name));
      }
      const actualMerges = () => new Set(Object.values(ws._merges || {}).map(x => String(x && x.range)).filter(Boolean));
      const before = actualMerges();
      for (const address of spec.ranges) {
        if (!before.has(String(address))) ws.mergeCells(address);
      }
      const after = actualMerges();
      for (const address of spec.ranges) {
        if (!after.has(String(address))) {
          throw new Error('Excel birlestirme korumasi basarisiz: ' + spec.name + '/' + address);
        }
      }
    }
    const raw = await wb.xlsx.writeBuffer();
    // Verify the ACTUAL XLSX archive, not only ws.mergeCells in memory.
    // If ExcelJS export strips merges we return an error: caller falls back
    // to serializing the untouched original workbook on the main thread.
    const roundtrip = new self.ExcelJS.Workbook();
    await roundtrip.xlsx.load(raw);
    for (const spec of expected) {
      const ws = roundtrip.getWorksheet(spec.name);
      if (!ws) throw new Error('Excel XLSX dogrulama: sayfa yok: ' + spec.name);
      const written = new Set(((ws.model || {}).merges || []).map(String));
      for (const address of spec.ranges) {
        if (!written.has(String(address))) throw new Error('Excel XLSX dosyasinda birlestirme kayboldu: ' + spec.name + '/' + address);
      }
    }
    const bytes = new Uint8Array(raw);
    self.postMessage({ ok: true, buffer: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, error: String(error && error.message || error) });
  }
};
