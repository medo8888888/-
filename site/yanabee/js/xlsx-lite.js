/* xlsx-lite: a real Excel workbook (.xlsx) built in the browser, with no library and no network.
   SpreadsheetML inside a stored zip (CRC32). Every sheet reads right to left, the first row is a bold, frozen header
   with a filter, and text is written as text: a cell that starts with "=" stays the words someone typed, never a
   formula. Used by account.js («تصدير»).
     YBXlsx.workbook([{ name: 'الفرق', rows: [[header…], [cell…], …], widths: [24, 12, …] }, …]) -> Uint8Array
     YBXlsx.download(filename, bytes)
   A cell is a string, a number (kept as a number), a boolean (نعم / لا), a Date (written as text, local), or empty. */
(function () {
  'use strict';
  var enc = new TextEncoder();

  /* ---------------------------------------------------------------- zip (stored) */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {                                   // files: [[name, Uint8Array]]
    var parts = [], central = [], offset = 0;
    var DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;   // fixed stamp: the same data gives the same file
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = f[1], crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, DOS_TIME, true); lh.setUint16(12, DOS_DATE, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, DOS_TIME, true); ch.setUint16(14, DOS_DATE, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]);
    var out = new Uint8Array(all.reduce(function (s, p) { return s + p.length; }, 0)), at = 0;
    all.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  /* ---------------------------------------------------------------- SpreadsheetML */
  // XML 1.0 forbids most control characters: drop them; escape the five specials
  function esc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function col(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function cellXml(v, ref, header) {
    var st = header ? ' s="1"' : '';
    if (v === null || v === undefined || v === '') return header ? '<c r="' + ref + '"' + st + '/>' : '';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
    if (typeof v === 'boolean') v = v ? 'نعم' : 'لا';
    if (v instanceof Date) v = isNaN(v) ? '' : v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate()) + ' ' + pad(v.getHours()) + ':' + pad(v.getMinutes());
    var s = String(v).slice(0, 32000);                   // Excel's limit is 32767 characters a cell
    var keep = /^\s|\s$|\n/.test(s) ? ' xml:space="preserve"' : '';
    return '<c r="' + ref + '" t="inlineStr"' + st + '><is><t' + keep + '>' + esc(s) + '</t></is></c>';
  }
  function sheetXml(sh) {
    var rows = sh.rows || [], ncol = rows.reduce(function (m, r) { return Math.max(m, (r || []).length); }, 1);
    var widths = (sh.widths || []).slice(0, ncol);
    var cols = '';
    for (var i = 0; i < ncol; i++) {
      var w = widths[i] || Math.min(60, Math.max(8, rows.slice(0, 200).reduce(function (m, r) { var c = r && r[i]; return Math.max(m, c === null || c === undefined ? 0 : String(c).length); }, 0) + 2));
      cols += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    }
    var data = rows.map(function (r, ri) {
      var cells = (r || []).map(function (v, ci) { return cellXml(v, col(ci) + (ri + 1), ri === 0); }).join('');
      return '<row r="' + (ri + 1) + '">' + cells + '</row>';
    }).join('');
    var last = col(ncol - 1) + Math.max(1, rows.length);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<dimension ref="A1:' + last + '"/>' +
      '<sheetViews><sheetView rightToLeft="1" workbookViewId="0">' +
      (rows.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : '') +
      '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>' +
      '<cols>' + cols + '</cols><sheetData>' + data + '</sheetData>' +
      (rows.length > 1 ? '<autoFilter ref="A1:' + last + '"/>' : '') +
      '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape"/></worksheet>';
  }
  // sheet names: at most 31 characters, none of []:*?/\ , not empty, unique
  function sheetNames(list) {
    var used = {};
    return list.map(function (s, i) {
      var n = String(s.name || ('ورقة ' + (i + 1))).replace(/[\[\]:*?\/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || ('ورقة ' + (i + 1));
      var base = n, k = 2;
      while (used[n.toLowerCase()]) { var suf = ' (' + k++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
      used[n.toLowerCase()] = 1;
      return n;
    });
  }

  function workbook(sheets, meta) {
    if (!Array.isArray(sheets) || !sheets.length) throw new Error('no_sheets');
    var names = sheetNames(sheets);
    var files = [];
    var add = function (n, s) { files.push([n, enc.encode(s)]); };
    var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    add('[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      names.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '</Types>');
    add('_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
    add('docProps/core.xml', X + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc((meta && meta.title) || 'مشروع ينابيع') + '</dc:title><dc:creator>ينابيع</dc:creator><dc:language>ar</dc:language></cp:coreProperties>');
    add('docProps/app.xml', X + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ينابيع</Application></Properties>');
    var filters = names.map(function (n, i) {
      var r = sheets[i].rows || [];
      if (r.length < 2) return '';
      var nc = r.reduce(function (m, x) { return Math.max(m, (x || []).length); }, 1);
      return '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + esc(n.replace(/'/g, "''")) + '\'!$A$1:$' + col(nc - 1) + '$' + r.length + '</definedName>';
    }).join('');
    add('xl/workbook.xml', X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      names.map(function (n, i) { return '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
      '</sheets>' + (filters ? '<definedNames>' + filters + '</definedNames>' : '') + '</workbook>');
    add('xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      names.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    add('xl/styles.xml', X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A7680"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1" readingOrder="2"/></xf>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1" readingOrder="2"/></xf></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    sheets.forEach(function (s, i) { add('xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)); });
    return zip(files);
  }

  function download(name, bytes) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    var a = document.createElement('a');
    a.href = url; a.download = name; a.hidden = true;
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  var api = { workbook: workbook, download: download, crc32: crc32, col: col };
  if (typeof globalThis !== 'undefined') globalThis.YBXlsx = api;
})();
