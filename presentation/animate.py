"""Add slide transitions + entrance animations to a pptxgenjs deck.

Every slide gets a fade transition. On load (no clicks needed) each slide plays:
  eyebrow + title  → Fade
  cards / photos / table / arrows → Ascend (fade + rise), staggered 0.12 s apart.
Shapes named "bg …" (background photo, scrim, guide line) stay static.
Usage: python3 animate.py in.pptx out.pptx
"""
import re
import shutil
import sys
import tempfile
import zipfile

src, dst = sys.argv[1], sys.argv[2]

SHAPE = re.compile(r'<p:(sp|pic|graphicFrame)>(.*?)</p:\1>', re.S)
CNV = re.compile(r'<p:cNvPr id="(\d+)" name="([^"]*)"')


def shapes(xml):
    tree = xml[xml.index('<p:spTree>'):xml.index('</p:spTree>')]
    out = []
    # only direct children: pptxgenjs writes no groups, so every sp/pic/graphicFrame is top-level
    for m in SHAPE.finditer(tree):
        kind, body = m.group(1), m.group(2)
        c = CNV.search(body)
        sid, name = int(c.group(1)), c.group(2)
        if name.lower().startswith('bg') or 'Slide Number' in name or '<p:ph type="sldNum"' in body:
            continue
        if '<p:ph ' in body or '<p:ph/>' in body:
            name = 'placeholder'
        out.append((kind, sid, name))
    return out


def effect(ids, sid, kind, delay, style):
    a, b, c = next(ids), next(ids), next(ids)
    vis = (f'<p:set><p:cBhvr><p:cTn id="{b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>'
           f'<p:tgtEl><p:spTgt spid="{sid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>'
           f'</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>')
    fade = (f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{c}" dur="{600 if style == "fade" else 500}"/>'
            f'<p:tgtEl><p:spTgt spid="{sid}"/></p:tgtEl></p:cBhvr></p:animEffect>')
    rise = ''
    if style == 'ascend':
        d = next(ids)
        rise = (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{d}" dur="500" decel="100000" fill="hold"/>'
                f'<p:tgtEl><p:spTgt spid="{sid}"/></p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr>'
                f'<p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y+.06"/></p:val></p:tav>'
                f'<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav></p:tavLst></p:anim>')
    preset = '10' if style == 'fade' else '42'
    grp = ' grpId="0"' if kind == 'sp' else ''
    return (f'<p:par><p:cTn id="{a}" presetID="{preset}" presetClass="entr" presetSubtype="0" fill="hold"{grp} nodeType="withEffect">'
            f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst><p:childTnLst>{vis}{fade}{rise}</p:childTnLst></p:cTn></p:par>')


def timing(items):
    def gen():
        n = 5
        while True:
            yield n
            n += 1
    ids = gen()
    effs, t = [], 0
    for kind, sid, name in items:
        style = 'fade' if name == 'placeholder' or name.startswith('Text') else 'ascend'
        effs.append(effect(ids, sid, kind, t, style))
        t += 120
    blds = ''.join(f'<p:bldP spid="{sid}" grpId="0" animBg="1"/>' for kind, sid, _ in items if kind == 'sp')
    return ('<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>'
            '<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>'
            '<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>'
            '<p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>'
            + ''.join(effs) +
            '</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>'
            '</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
            '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            '</p:childTnLst></p:cTn></p:par></p:tnLst>' + (f'<p:bldLst>{blds}</p:bldLst>' if blds else '') + '</p:timing>')


tmp = tempfile.mkdtemp()
with zipfile.ZipFile(src) as z:
    z.extractall(tmp)
    names = z.namelist()
import pathlib
for p in sorted(pathlib.Path(tmp, 'ppt', 'slides').glob('slide*.xml')):
    xml = p.read_text(encoding='utf-8')
    if '<p:timing>' in xml:
        continue
    # Arabic deck: every paragraph right-to-left (pptxgenjs only sets rtl on some)
    xml = re.sub(r'<a:pPr(?![^>]*\brtl=)', '<a:pPr rtl="1"', xml)
    xml = re.sub(r'<a:p>(?!<a:pPr)', '<a:p><a:pPr rtl="1"/>', xml)
    items = shapes(xml)
    # placeholders: pptxgenjs names them after the placeholder ("eyebrow", "title")
    trans = '<p:transition spd="slow"><p:fade/></p:transition>'
    add = trans + (timing(items) if items else '')
    if '<p:extLst>' in xml.split('</p:clrMapOvr>')[-1]:
        xml = xml.replace('</p:clrMapOvr>', '</p:clrMapOvr>' + add, 1)
    else:
        xml = xml.replace('</p:sld>', add + '</p:sld>')
    p.write_text(xml, encoding='utf-8')
    print(p.name, len(items), 'animated:', ', '.join(n for _, _, n in items))
# repack with [Content_Types].xml first
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    order = ['[Content_Types].xml'] + [n for n in names if n != '[Content_Types].xml']
    for n in order:
        fp = pathlib.Path(tmp, n)
        if fp.is_file():
            z.write(fp, n)
shutil.rmtree(tmp)
