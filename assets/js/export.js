'use strict';
/* ============================================================
   FILANTROPI MANAGEMENT SYSTEM — MESIN EKSPOR (TAHAP 2)
   X  =  modul ekspor lanjutan:
   - X.xlsx()  : file Excel .xlsx ASLI (Open XML + ZIP store, tanpa dependensi)
   - X.pdf()   : file PDF ASLI (pure-JS PDF writer, tanpa dependensi)
   - X.receiptPDF()      : kuitansi donasi PDF resmi (+ terbilang)
   - X.reportPDF()       : laporan keuangan / tabel multi-halaman PDF
   - X.tableXLSX()       : pengganti langsung U.exportXLS (hasil .xlsx asli)
   - X.tablePDF()        : ekspor tabel apa pun ke PDF
   Berjalan 100% offline — tanpa CDN, tanpa library eksternal.
   ============================================================ */
const X = (() => {

  /* ============================================================
     BAGIAN 1 — ZIP WRITER (metode STORE, tanpa kompresi)
     Diperlukan untuk memaketkan file .xlsx (Open XML = ZIP).
     ============================================================ */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = u8 => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const enc = new TextEncoder();

  /* files: [{name:'xl/worksheets/sheet1.xml', str:'<xml…/>'}] → Blob ZIP */
  function zipStore(files) {
    const chunks = [], central = [];
    let offset = 0;
    const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
    const w16 = v => [v & 255, (v >> 8) & 255];
    const w32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    files.forEach(f => {
      const nameU8 = enc.encode(f.name), dataU8 = enc.encode(f.str);
      const crc = crc32(dataU8);
      const local = new Uint8Array([
        ...w32(0x04034b50), ...w16(20), ...w16(0x0800), ...w16(0), ...w16(DOS_TIME), ...w16(DOS_DATE),
        ...w32(crc), ...w32(dataU8.length), ...w32(dataU8.length), ...w16(nameU8.length), ...w16(0),
        ...nameU8, ...dataU8
      ]);
      chunks.push(local);
      central.push(new Uint8Array([
        ...w32(0x02014b50), ...w16(20), ...w16(20), ...w16(0x0800), ...w16(0), ...w16(DOS_TIME), ...w16(DOS_DATE),
        ...w32(crc), ...w32(dataU8.length), ...w32(dataU8.length), ...w16(nameU8.length),
        ...w16(0), ...w16(0), ...w16(0), ...w16(0), ...w32(0), ...w32(offset), ...nameU8
      ]));
      offset += local.length;
    });
    let centralSize = 0;
    central.forEach(c => centralSize += c.length);
    const eocd = new Uint8Array([
      ...w32(0x06054b50), ...w16(0), ...w16(0), ...w16(files.length), ...w16(files.length),
      ...w32(centralSize), ...w32(offset), ...w16(0)
    ]);
    return new Blob([...chunks, ...central, eocd], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ============================================================
     BAGIAN 2 — XLSX BUILDER (Open XML asli)
     sheets: [{ name, title, headers[], rows[][], widths[]?, numCols?[] }]
     Kolom bernilai number ditulis sebagai angka (bisa dihitung di Excel).
     ============================================================ */
  const xesc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colLetter = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  function sheetXml(sheet) {
    const numCols = new Set(sheet.numCols || []);
    let rowsXml = '', r = 0;
    const cellXml = (cell, ci, s) => {
      if (cell === null || cell === undefined || cell === '') return '';
      const ref = colLetter(ci) + r;
      if (typeof cell === 'number' && isFinite(cell)) return `<c r="${ref}"${s != null ? ` s="${s}"` : ''}><v>${cell}</v></c>`;
      return `<c r="${ref}"${s != null ? ` s="${s}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xesc(cell)}</t></is></c>`;
    };
    const rowXml = (cells, s) => { r++; const c = cells.map((v, ci) => cellXml(v, ci, s)).join(''); if (c) rowsXml += `<row r="${r}">${c}</row>`; };
    if (sheet.title) rowXml([sheet.title], 2);
    rowXml(['Dihasilkan otomatis oleh Filantropi Management System — ' + new Date().toLocaleString('id-ID')], 0);
    if (sheet.headers) rowXml(sheet.headers, 1);
    (sheet.rows || []).forEach(row => rowXml(row, null));
    const cols = (sheet.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml}</sheetData></worksheet>`;
  }

  const sheetXmlFixed = sheetXml;

  /* filename, sheets:[{name,title,headers,rows,widths,numCols}] */
  function xlsx(filename, sheets) {
    try {
      const safeSheets = sheets.map((s, i) => ({
        name: (s.name || 'Sheet' + (i + 1)).replace(/[\\\/\*\[\]:\?]/g, ' ').slice(0, 31),
        title: s.title || '', headers: s.headers || [], rows: s.rows || [],
        widths: s.widths || [], numCols: s.numCols || []
      }));
      const files = [];
      const overrides = safeSheets.map((s, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
      files.push({ name: '[Content_Types].xml', str: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>` });
      files.push({ name: '_rels/.rels', str: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
      files.push({ name: 'xl/workbook.xml', str: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safeSheets.map((s, i) => `<sheet name="${xesc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
      files.push({ name: 'xl/_rels/workbook.xml.rels', str: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeSheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${safeSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
      files.push({ name: 'xl/styles.xml', str: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FF14532D"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF14532D"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/></cellXfs></styleSheet>` });
      safeSheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, str: sheetXmlFixed(s) }));
      U.downloadBlob(filename, zipStore(files));
      U.toast('File Excel (.xlsx) berhasil diunduh: ' + filename);
    } catch (e) {
      console.error(e);
      U.toast('Gagal membuat file Excel: ' + e.message, 'error');
    }
  }

  /* Pengganti langsung U.exportXLS — tanda tangan sama, hasil .xlsx asli */
  function tableXLSX(filename, title, headers, rows, opts = {}) {
    const numCols = opts.numCols || [];
    return xlsx(filename.replace(/\.xls$/, '.xlsx'), [{ name: title.slice(0, 28), title, headers, rows, widths: opts.widths || headers.map(() => 18), numCols }]);
  }

  /* ============================================================
     BAGIAN 3 — PDF WRITER (pure JS, Helvetica WinAnsi)
     API: const d = X.pdfDoc({title, institution:{name,address,phone}, footer})
          d.h1(str) d.h2(str) d.kv(rows) d.table({cols,rows}) d.note(str)
          d.sign(name, title) d.stamp(text) d.save(filename)
     ============================================================ */
  const sanitizeLatin = s => String(s ?? '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/−/g, '-').replace(/\u00A0/g, ' ')
    .split('').map(ch => ch.charCodeAt(0) <= 255 ? ch : '?').join('');
  const pesc = s => sanitizeLatin(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const WIDTHS = { a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 333, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, ' ': 278, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, '.': 278, ',': 278, '-': 333, '(': 333, ')': 333, ':': 278, '/': 278, '%': 889, '•': 350, '=': 584, '+': 584, '&': 667, '@': 1015, '#': 556, '*': 389, "'": 191, '!': 278, '?': 556, ';': 278, '"': 355, '<': 584, '>': 584, '[': 278, ']': 278 };
  const charW = (ch, bold) => { const w = WIDTHS[ch]; if (w) return w; const c = ch.charCodeAt(0); if (c < 32) return 0; if (c < 128) return 556; return 556; };
  const textW = (s, size, bold) => { let w = 0; for (const ch of sanitizeLatin(s)) w += charW(ch, bold); return w * size / 1000; };
  const trunc = (s, maxW, size, bold) => {
    s = sanitizeLatin(s);
    if (textW(s, size, bold) <= maxW) return s;
    let out = s;
    while (out.length > 1 && textW(out + '...', size, bold) > maxW) out = out.slice(0, -1);
    return out.trimEnd() + '...';
  };

  function pdfDoc(opts = {}) {
    const A4 = { w: 595.28, h: 841.89 };
    const PW = opts.landscape ? A4.h : A4.w, PH = opts.landscape ? A4.w : A4.h;
    const M = opts.margin || 42;
    const CW = PW - M * 2;
    const inst = opts.institution || {};
    const docTitle = opts.title || 'Dokumen';
    const pages = [];
    let ops = [], y = M;

    const newPage = () => { pages.push(ops); ops = []; y = M; };
    const ensure = h => { if (y + h > PH - M - 24) newPage(); };
    const T = (x, ty, str, { size = 10, bold = false, color = [0.13, 0.16, 0.19], align } = {}) => {
      let xx = x;
      const w = textW(str, size, bold);
      if (align === 'right') xx = x - w;
      else if (align === 'center') xx = x - w / 2;
      const yy = PH - ty - size * 0.8;
      const [r, g, b] = color;
      ops.push(`${r} ${g} ${b} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${xx.toFixed(2)} ${yy.toFixed(2)} Tm (${pesc(str)}) Tj ET`);
    };
    const line = (x1, y1, x2, y2, gray = 0.82, lw = 0.7) =>
      ops.push(`${gray} G ${lw} w ${x1.toFixed(2)} ${(PH - y1).toFixed(2)} m ${x2.toFixed(2)} ${(PH - y2).toFixed(2)} l S`);
    const rect = (x, ty, w, h, { fill = [0.94, 0.99, 0.95], stroke = [0.75, 0.78, 0.75], fillOp = true, strokeOp = true } = {}) => {
      const yy = PH - ty - h;
      if (fillOp) ops.push(`${fill[0]} ${fill[1]} ${fill[2]} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
      if (strokeOp) ops.push(`${stroke[0]} ${stroke[1]} ${stroke[2]} RG 0.7 w ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    };

    /* ---------- header dokumen (halaman pertama) ---------- */
    function docHeader() {
      T(M, y, trunc(inst.name || 'Lembaga', CW * 0.62, 14, true), { size: 14, bold: true, color: [0.08, 0.33, 0.18] });
      const meta = [];
      if (inst.address) meta.push(trunc(inst.address, CW * 0.36, 8.5));
      if (inst.phone) meta.push(inst.phone + (inst.email ? ' · ' + inst.email : ''));
      meta.forEach((m2, i) => T(PW - M, y + 3 + i * 10.5, m2, { size: 8.5, color: [0.42, 0.45, 0.5], align: 'right' }));
      y += 20;
      T(M, y, docTitle, { size: 15, bold: true });
      if (opts.subtitle) T(PW - M, y + 2, opts.subtitle, { size: 9, color: [0.42, 0.45, 0.5], align: 'right' });
      y += 12;
      line(M, y, PW - M, y, 0.72, 2);
      y += 16;
    }
    docHeader();

    /* ---------- API publik dokumen ---------- */
    const d = {
      h1(str) { ensure(30); T(M, y, str, { size: 12.5, bold: true, color: [0.08, 0.33, 0.18] }); y += 20; },
      h2(str) { ensure(26); T(M, y, str, { size: 10.5, bold: true, color: [0.42, 0.35, 0.1] }); y += 17; },
      note(str) {
        const lines = wrap(str, CW - 20, 8.5, false);
        ensure(lines.length * 11 + 14);
        rect(M, y, CW, lines.length * 11 + 10, { fill: [0.96, 0.99, 0.96] });
        lines.forEach((ln, i) => T(M + 10, y + 13 + i * 11, ln, { size: 8.5, color: [0.2, 0.35, 0.24] }));
        y += lines.length * 11 + 20;
      },
      kv(rows, widths = [0.32, 0.68]) { /* rows: [[label, value]] */
        const h = 18;
        rows.forEach(([k, v]) => {
          ensure(h);
          rect(M, y, CW, h, { fill: false, fillOp: false });
          line(M, y + h, M + CW, y + h, 0.88);
          line(M + CW * widths[0], y, M + CW * widths[0], y + h, 0.88);
          T(M + 8, y + 12.5, trunc(k, CW * widths[0] - 14, 9.5, true), { size: 9.5, bold: true });
          const vs = String(v ?? '');
          T(M + CW * widths[0] + 8, y + 12.5, trunc(vs, CW * (1 - widths[0]) - 14, 9.5), { size: 9.5, bold: /Rp\s/.test(vs) && vs.length < 22 });
          y += h;
        });
        y += 10;
      },
      table({ cols, rows }) {
        /* cols: [{h:'Kolom', w:0.3, align:'left|right|center'}] — w proporsi dari CW
           rows: array of array; cell: string | {t, bold, rp, color:[r,g,b]} */
        const xs = []; let acc = M;
        cols.forEach(c => { xs.push(acc); acc += c.w * CW; });
        const rowH = 17, headH = 20;
        const drawHead = () => {
          rect(M, y, CW, headH, { fill: [0.94, 0.99, 0.95], fillOp: true, strokeOp: false });
          cols.forEach((c, i) => {
            const cx = c.align === 'right' ? xs[i] + c.w * CW - 7 : c.align === 'center' ? xs[i] + c.w * CW / 2 : xs[i] + 7;
            T(cx, y + 13.5, trunc(c.h, c.w * CW - 12, 8.6, true), { size: 8.6, bold: true, color: [0.08, 0.33, 0.18], align: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left' });
          });
          y += headH;
          line(M, y, PW - M, y, 0.75);
        };
        ensure(headH + rowH * 2);
        drawHead();
        rows.forEach((r, ri) => {
          if (y + rowH > PH - M - 24) { newPage(); drawHead(); }
          const isTotal = r.__total;
          if (isTotal) rect(M, y, CW, rowH, { fill: [0.96, 0.99, 0.96], fillOp: true, strokeOp: false });
          line(M, y + rowH, PW - M, y + rowH, 0.9);
          r.forEach((cell, ci) => {
            if (cell === undefined || cell === null) return;
            const c = cols[ci] || {};
            const o = typeof cell === 'object' ? cell : { t: cell };
            const col = o.color || (isTotal ? [0.08, 0.33, 0.18] : [0.13, 0.16, 0.19]);
            const cx = c.align === 'right' ? xs[ci] + c.w * CW - 7 : c.align === 'center' ? xs[ci] + c.w * CW / 2 : xs[ci] + 7;
            T(cx, y + 12, trunc(o.t, c.w * CW - 12, 8.6, o.bold || isTotal), { size: 8.6, bold: o.bold || isTotal, color: col, align: c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : 'left' });
          });
          y += rowH;
        });
        line(M, y, PW - M, y, 0.75);
        y += 16;
      },
      stamp(text) {
        ensure(30);
        const w = textW(text, 10, true) + 26;
        rect(M, y, w, 20, { fill: [0.93, 0.99, 0.94], stroke: [0.09, 0.4, 0.2] });
        T(M + 13, y + 13.5, text, { size: 10, bold: true, color: [0.09, 0.4, 0.2] });
        y += 30;
      },
      sign(name, title) {
        ensure(58);
        const sx = PW - M - 190;
        T(sx, y, (inst.city || 'Jakarta') + ', ' + new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), { size: 9, color: [0.42, 0.45, 0.5] });
        T(sx, y + 34, name, { size: 9.5, bold: true });
        T(sx, y + 44, title, { size: 8.5, color: [0.42, 0.45, 0.5] });
        line(sx, y + 30, sx + 180, y + 30, 0.35, 0.9);
        y += 56;
      },
      demoWatermark() {
        const wx = (PW / 2 - 150).toFixed(2), wy = (PH / 2).toFixed(2);
        pages.forEach(p2 => p2.push(`0.88 0.9 0.88 rg BT /F2 58 Tf 1 0 0 1 ${wx} ${wy} Tm (DEMO) Tj ET`));
      },
      save(filename) {
        pages.push(ops);
        const n = pages.length;
        pages.forEach((p2, i) => {
          p2.push(`0.45 0.47 0.5 rg BT /F1 8 Tf 1 0 0 1 ${M.toFixed(2)} ${(M - 18).toFixed(2)} Tm (${pesc(inst.name || '')} — dicetak ${pesc(new Date().toLocaleString('id-ID'))}) Tj ET`);
          p2.push(`0.45 0.47 0.5 rg BT /F1 8 Tf 1 0 0 1 ${(PW - M - 70).toFixed(2)} ${(M - 18).toFixed(2)} Tm (Halaman ${i + 1} dari ${n}) Tj ET`);
        });
        if ((opts.institution || {}).demo) d.demoWatermark();
        const objs = [];
        const pageObjNums = pages.map((_, i) => 5 + i * 2);
        objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
        objs[2] = `<< /Type /Pages /Kids [${pageObjNums.map(nn => nn + ' 0 R').join(' ')}] /Count ${pages.length} >>`;
        objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
        objs[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
        pages.forEach((p2, i) => {
          const content = p2.join('\n');
          objs[pageObjNums[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObjNums[i] + 1} 0 R >>`;
          objs[pageObjNums[i] + 1] = { stream: content };
        });
        let out = '%PDF-1.4\n';
        const offsets = [];
        for (let i = 1; i < objs.length; i++) {
          const o = objs[i];
          offsets[i] = out.length;
          if (typeof o === 'object' && o.stream) {
            out += `${i} 0 obj\n<< /Length ${o.stream.length} >>\nstream\n${o.stream}\nendstream\nendobj\n`;
          } else {
            out += `${i} 0 obj\n${o}\nendobj\n`;
          }
        }
        const xrefPos = out.length;
        const count = objs.length;
        out += `xref\n0 ${count}\n0000000000 65535 f \n`;
        for (let i = 1; i < count; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
        out += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
        U.downloadBlob(filename, new Blob([bytes], { type: 'application/pdf' }));
        U.toast('File PDF berhasil diunduh: ' + filename);
      }
    };
    function wrap(str, maxW, size, bold) {
      const words = sanitizeLatin(str).split(/\s+/);
      const lines = []; let cur = '';
      words.forEach(w2 => {
        const t = cur ? cur + ' ' + w2 : w2;
        if (textW(t, size, bold) > maxW && cur) { lines.push(cur); cur = w2; } else cur = t;
      });
      if (cur) lines.push(cur);
      return lines;
    }
    d.wrap = wrap; d.T = T; d.line = line; d.rect = rect; d.ensure = ensure; d.textW = textW;
    d.cursor = { get y() { return y; }, set y(v2) { y = v2; }, get CW() { return CW; }, get M() { return M; } };
    return d;
  }

  /* ============================================================
     BAGIAN 4 — TERBILANG (jumlah dalam huruf untuk kuitansi)
     ============================================================ */
  function terbilang(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n === 0) return 'Nol';
    const sat = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
    const f = x => {
      if (x < 12) return sat[x];
      if (x < 20) return f(x - 10) + ' Belas';
      if (x < 100) return f(Math.floor(x / 10)) + ' Puluh ' + f(x % 10);
      if (x < 200) return 'Seratus ' + f(x - 100);
      if (x < 1000) return f(Math.floor(x / 100)) + ' Ratus ' + f(x % 100);
      if (x < 2000) return 'Seribu ' + f(x - 1000);
      if (x < 1000000) return f(Math.floor(x / 1000)) + ' Ribu ' + f(x % 1000);
      if (x < 1000000000) return f(Math.floor(x / 1000000)) + ' Juta ' + f(x % 1000000);
      if (x < 1000000000000) return f(Math.floor(x / 1000000000)) + ' Miliar ' + f(x % 1000000000);
      return f(Math.floor(x / 1000000000000)) + ' Triliun ' + f(x % 1000000000000);
    };
    return f(n).replace(/\s+/g, ' ').trim();
  }

  /* ============================================================
     BAGIAN 5 — KUITANSI DONASI PDF
     ============================================================ */
  function receiptPDF(don, receipt, s, method) {
    const d = pdfDoc({
      title: 'KUITANSI DONASI RESMI',
      subtitle: 'No. ' + receipt.receipt_no,
      institution: { name: s.name, address: s.address, phone: s.phone, email: s.email, demo: s.demo_mode }
    });
    const { M, CW } = d.cursor;
    d.stamp('BERHASIL — TERVERIFIKASI');
    d.cursor.y += 4;
    d.kv([
      ['Diterima dari', don.is_anonymous ? 'Hamba Allah' : don.donor_name],
      ['Tanggal bayar', U.fmtDateTime(don.paid_at)],
      ['Jenis dana', U.fundLabel(don.fund_type)],
      ['Peruntukan', receipt.program_name || 'Dana Umum'],
      ['Metode pembayaran', method ? method.name : don.payment_method_code],
      ['Kode donasi / transaksi', don.donation_code + ' / ' + receipt.trx_code]
    ]);
    const t = d.T, cw = d.cursor.CW;
    t(M + 8, d.cursor.y + 2, 'JUMLAH DITERIMA', { size: 9, bold: true, color: [0.42, 0.45, 0.5] });
    t(M + CW - 8, d.cursor.y + 10, U.fmtRp(receipt.amount), { size: 17, bold: true, color: [0.08, 0.33, 0.18], align: 'right' });
    d.cursor.y += 16;
    t(M + 8, d.cursor.y + 2, 'Terbilang: ' + terbilang(receipt.amount) + ' Rupiah', { size: 9, color: [0.42, 0.45, 0.5] });
    d.cursor.y += 20;
    d.line(M, d.cursor.y, M + cw, d.cursor.y, 0.82);
    d.cursor.y += 14;
    d.note('Kuitansi ini terbit OTOMATIS setelah pembayaran terverifikasi sistem (webhook payment gateway) dan merupakan bukti sah penyaluran dana. ' + (s.receipt.footer_note || ''));
    if (don.message) d.note('Doa / pesan donatur: "' + don.message + '"');
    d.sign(s.receipt.signer_name, s.receipt.signer_title);
    d.save('kuitansi-' + don.donation_code + '.pdf');
  }

  /* ============================================================
     BAGIAN 6 — LAPORAN KEUANGAN PDF (dipakai admin & publik)
     ============================================================ */
  function financeReportPDF({ title, year, periodNote, funds, jurnal, distributions, s, reportMeta }) {
    const d = pdfDoc({
      title,
      subtitle: periodNote || ('Periode ' + year),
      institution: { name: s.name, address: s.address, phone: s.phone, email: s.email, demo: s.demo_mode }
    });
    if (reportMeta) d.kv(reportMeta);
    d.h1('A. Ringkasan per Jenis Dana');
    const totIn = funds.reduce((x, f) => x + f.masuk, 0), totOut = funds.reduce((x, f) => x + f.keluar, 0);
    d.table({
      cols: [{ h: 'Jenis Dana', w: 0.28 }, { h: 'Penerimaan', w: 0.24, align: 'right' }, { h: 'Penyaluran', w: 0.24, align: 'right' }, { h: 'Saldo Berjalan', w: 0.24, align: 'right' }],
      rows: funds.map(f => [U.fundLabel(f.fund), { t: U.fmtRp(f.masuk), color: [0.02, 0.45, 0.25] }, { t: U.fmtRp(f.keluar), color: [0.7, 0.15, 0.15] }, { t: U.fmtRp(f.saldo), bold: true }])
        .concat([[{ t: 'TOTAL', bold: true }, { t: U.fmtRp(totIn), bold: true }, { t: U.fmtRp(totOut), bold: true }, { t: U.fmtRp(funds.reduce((x, f) => x + f.saldo, 0)), bold: true }]])
    });
    if (distributions && distributions.length) {
      d.h1('B. Riwayat Penyaluran Dana');
      d.table({
        cols: [{ h: 'Nomor', w: 0.16 }, { h: 'Tanggal', w: 0.12 }, { h: 'Program', w: 0.24 }, { h: 'Dana', w: 0.12 }, { h: 'Uraian', w: 0.24 }, { h: 'Jumlah', w: 0.12, align: 'right' }],
        rows: distributions.map(x => [x.dist_number, U.fmtShort(x.disbursed_at), x.program_name || '-', U.fundLabel(x.fund_type), x.description || '-', U.fmtRp(x.amount)])
      });
    }
    if (jurnal && jurnal.length) {
      d.h1(distributions && distributions.length ? 'C. Jurnal Transaksi Terverifikasi' : 'B. Jurnal Transaksi Terverifikasi');
      d.table({
        cols: [{ h: 'Tanggal', w: 0.11 }, { h: 'Kategori', w: 0.13 }, { h: 'Uraian', w: 0.44 }, { h: 'Masuk', w: 0.16, align: 'right' }, { h: 'Keluar', w: 0.16, align: 'right' }],
        rows: jurnal.map(t => [U.fmtShort(t.trx_date), t.category_code, t.description || '-', t.direction === 'masuk' ? U.fmtRp(t.amount) : '-', t.direction === 'keluar' ? U.fmtRp(t.amount) : '-'])
      });
    }
    d.note('Dokumen dihasilkan otomatis oleh Filantropi Management System dari transaksi status BERHASIL (terverifikasi webhook). Dana terbatas (zakat, infak, sedekah, wakaf) dicatat dan dipotong terpisah sesuai amanah donatur.');
    d.sign(s.receipt.signer_name, s.receipt.signer_title);
    return d;
  }

  /* Ekspor tabel generik ke PDF (landscape untuk kolom banyak) */
  function tablePDF(filename, title, headers, rows, opts = {}) {
    const landscape = (headers.length >= 6) || opts.landscape;
    const d = pdfDoc({
      title,
      subtitle: opts.subtitle || (rows.length + ' baris'),
      institution: opts.institution || {},
      landscape
    });
    const total = opts.numCols && opts.numCols.length ? headers.map((h, i) => opts.numCols.includes(i) ? rows.reduce((s, r) => s + (Number(r[i]) || 0), 0) : '') : null;
    const widths = opts.widths || headers.map(() => 1 / headers.length);
    d.table({
      cols: headers.map((h, i) => ({ h, w: widths[i], align: (opts.numCols || []).includes(i) ? 'right' : 'left' })),
      rows: rows.map(r => r.map((v, i) => (opts.numCols || []).includes(i) ? (typeof v === 'number' ? U.fmtRp(v) : v) : v))
        .concat(total ? [total.map(v => ({ t: typeof v === 'number' ? U.fmtRp(v) : (v === '' ? '' : 'TOTAL'), bold: true }))] : [])
    });
    if (opts.note) d.note(opts.note);
    d.save(filename);
  }

  return { xlsx, tableXLSX, tablePDF, pdfDoc, receiptPDF, financeReportPDF, terbilang, zipStore };
})();

/* ekspos ke window (konsistensi referensi lintas modul) */
window.X = X;
