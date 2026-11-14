// js/xlsx-lite.js: the Excel workbook the admin and leaders download (SPEC 4.10.8).
//   node tools/yanabee/test-xlsx.mjs
// Builds workbooks in Node and opens them with Python: openpyxl when it is installed (a real reader of .xlsx),
// otherwise zipfile + ElementTree (the zip and every XML part).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'site/yanabee/js/xlsx-lite.js'), 'utf8'));
const X = globalThis.YBXlsx;
let pass = 0; const fails = [];
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ok  ' + n); } else { fails.push(n + (d ? ' — ' + d : '')); console.log('  FAIL ' + n + (d ? ' — ' + d : '')); } };

const PY = (() => {
  for (const py of ['python3.13', 'python3']) {
    try { execFileSync(py, ['-c', 'import openpyxl'], { stdio: 'pipe' }); return { py, openpyxl: true }; } catch (e) { /* next */ }
  }
  return { py: 'python3', openpyxl: false };
})();
const READER = `
import json, sys, zipfile, xml.etree.ElementTree as ET
f = sys.argv[1]
z = zipfile.ZipFile(f)
out = {"bad": z.testzip(), "parts": [i.filename for i in z.infolist()]}
for n in out["parts"]:
    if n.endswith(".xml") or n.endswith(".rels"): ET.fromstring(z.read(n))
try:
    import openpyxl
    wb = openpyxl.load_workbook(f)
    out["sheets"] = {}
    for ws in wb.worksheets:
        out["sheets"][ws.title] = {"rtl": bool(ws.sheet_view.rightToLeft), "freeze": ws.freeze_panes, "filter": ws.auto_filter.ref,
            "bold": bool(ws["A1"].font.b) if ws.max_row else False,
            "rows": [[c.value for c in r] for r in ws.iter_rows()], "types": [[c.data_type for c in r] for r in ws.iter_rows()]}
    out["reader"] = "openpyxl"
except ImportError:
    out["reader"] = "xml"
print(json.dumps(out, ensure_ascii=False, default=str))
`;
const readXlsx = file => JSON.parse(execFileSync(PY.py, ['-c', READER, file], { encoding: 'utf8' }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ybx-'));
const save = (name, bytes) => { const f = path.join(tmp, name); fs.writeFileSync(f, bytes); return f; };
try {
  console.log('\nbasics');
  check('CRC32 of "123456789" is CBF43926 (the zip checksum)', X.crc32(new TextEncoder().encode('123456789')) === 0xcbf43926);
  check('column letters: A, Z, AA, AZ, BA', [0, 25, 26, 51, 52].map(X.col).join() === 'A,Z,AA,AZ,BA');
  let threw = false; try { X.workbook([]); } catch (e) { threw = e.message === 'no_sheets'; }
  check('no sheets: refused', threw);

  console.log('\na workbook opened by ' + (PY.openpyxl ? 'openpyxl' : 'zipfile + ElementTree'));
  const bytes = X.workbook([
    { name: 'الفرق', rows: [['الاسم', 'العدد', 'معتمد', 'ملاحظة', 'تاريخ'], ['النجوم', 5, true, '=HYPERLINK("http://x","y")', new Date(2026, 10, 14, 17, 5)],
      ['الفجر <&> "أ"', 7.5, false, ' مسافة\nسطر\u0007', null], ['+966 53', -2, '', '@SUM(A1)', '']] },
    { name: 'a/b:c*d?[e]', rows: [['x']] },
    { name: 'الفرق', rows: [] },
    { name: 'اسم طويل جدًا لورقة في ملف إكسل يتجاوز الحد', rows: [['y'], [1]] }]);
  const f = save('a.xlsx', bytes);
  const r = readXlsx(f);
  check('the zip is sound (every checksum right)', r.bad === null);
  check('every XML part parses', r.parts.includes('xl/workbook.xml') && r.parts.includes('[Content_Types].xml') && r.parts.filter(p => /worksheets\/sheet\d+\.xml$/.test(p)).length === 4);
  if (r.reader === 'openpyxl') {
    const names = Object.keys(r.sheets);
    check('sheet names: forbidden characters replaced, duplicates numbered, 31 characters at most', names[0] === 'الفرق' && names[1] === 'a b c d  e' && names[2] === 'الفرق (2)' && names[3].length <= 31, names.join(' | '));
    const s = r.sheets['الفرق'];
    check('right to left, header frozen, filter on the header', s.rtl && s.freeze === 'A2' && s.filter === 'A1:E4');
    check('the header is bold', s.bold);
    check('numbers stay numbers (5, 7.5, -2)', s.rows[1][1] === 5 && s.rows[2][1] === 7.5 && s.rows[3][1] === -2 && s.types[1][1] === 'n');
    check('booleans read نعم / لا', s.rows[1][2] === 'نعم' && s.rows[2][2] === 'لا');
    check('text that looks like a formula stays text (=, @, +)', s.rows[1][3] === '=HYPERLINK("http://x","y")' && s.types[1][3] === 's' && s.rows[3][3] === '@SUM(A1)' && s.rows[3][0] === '+966 53');
    check('special characters and line breaks survive; control characters are dropped', s.rows[2][0] === 'الفجر <&> "أ"' && s.rows[2][3] === ' مسافة\nسطر');
    check('a date is written as local text', s.rows[1][4] === '2026-11-14 17:05');
    check('an empty sheet still opens', Array.isArray(r.sheets['الفرق (2)'].rows));
  } else console.log('  (openpyxl is not installed: the reader checks are skipped)');
  const again = X.workbook([{ name: 'x', rows: [['a', 1]] }]);
  check('the same data gives the same bytes (no clock inside)', Buffer.from(again).equals(Buffer.from(X.workbook([{ name: 'x', rows: [['a', 1]] }]))));
  const big = X.workbook([{ name: 'كبير', rows: [['م', 'الاسم']].concat(Array.from({ length: 3000 }, (_, i) => [i + 1, 'عضو رقم ' + (i + 1)])) }]);
  const rb = readXlsx(save('big.xlsx', big));
  check('3000 rows: sound and complete', rb.bad === null && (rb.reader !== 'openpyxl' || rb.sheets['كبير'].rows.length === 3001));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
