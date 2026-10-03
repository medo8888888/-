"""Localize a built language folder (site/en, site/tr).

The page generator already swaps the brochure text (core.set_lang). What is left in
Arabic afterwards is UI chrome (button labels, hints, form text, JS messages); it is
translated here with content/ui.<lang>.json ({arabic: translation}), longest key first.
JS is copied per language (site/<lang>/js) with the same map; CSS, images and the
globe data stay shared (paths rewritten to ../)."""
import json
import re
import shutil

import core

AR_RUN = re.compile(r'[؀-ۿ«][؀-ۿً-ْ«»\s،؛؟\.\-–—:0-9٠-٩()…/!+%"\']*[؀-ۿ»؟)…]|[؀-ۿ]')
KEEP = {'عربي', 'العربية'}  # language switch label stays Arabic everywhere


def ui_map(lang):
    p = core.ROOT / 'content' / f'ui.{lang}.json'
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {}


def _translate(text, m, fname=''):
    """Replace whole Arabic runs only (never substrings of other words). A key may be
    scoped to one file as "<file>::<run>"; a value equal to its key keeps the run."""
    def sub(mo):
        raw = mo.group(0)
        core_ = raw.strip()
        val = m.get(f'{fname}::{core_}', m.get(core_))
        if val is None:
            return raw
        lead = raw[:len(raw) - len(raw.lstrip())]
        trail = raw[len(raw.rstrip()):]
        return lead + val + trail
    return AR_RUN.sub(sub, text)


def leftovers(text):
    """Arabic runs still present (outside the language switch)."""
    text = re.sub(r'<div class="lang-switch[^"]*"[^>]*>.*?</div>', '', text, flags=re.S)
    return [r.strip() for r in AR_RUN.findall(text) if r.strip() not in KEEP]


def localize(lang):
    out, m = core.OUT, ui_map(lang)
    dirn = 'rtl' if lang == 'ar' else 'ltr'
    # JS: per-language copies
    (out / 'js').mkdir(exist_ok=True)
    for f in (core.SITE / 'js').glob('*.js'):
        t = f.read_text(encoding='utf-8')
        # files marked @i18n-self carry their own ar/en/tr strings and are copied unchanged
        (out / 'js' / f.name).write_text(t if '@i18n-self' in t[:200] else _translate(t, m, f.name), encoding='utf-8')
    w = core.SITE / 'data' / 'world.js'
    (out / 'data' / 'world.js').write_text(_translate(w.read_text(encoding='utf-8'), m, 'world.js'), encoding='utf-8')
    kb = out / 'data' / 'kb.js'
    kb.write_text(_translate(kb.read_text(encoding='utf-8'), m, 'kb.js'), encoding='utf-8')
    for f in out.glob('*.html'):
        h = f.read_text(encoding='utf-8')
        h = h.replace('<html lang="ar" dir="rtl">', f'<html lang="{lang}" dir="{dirn}">')
        h = h.replace('content="ar_AR"', f'content="{ {"en": "en_US", "tr": "tr_TR"}[lang] }"')
        h = re.sub(r'(href|src)="(css|assets|manifest\.webmanifest)', r'\1="../\2', h)
        h = h.replace('<base href="/">', f'<base href="/{lang}/">')
        h = h.replace('url(../assets/', 'url(../assets/')  # (inline --img vars resolve against the stylesheet)
        # keep the language switch untouched by the chrome map
        sw = re.findall(r'<div class="lang-switch[^"]*"[^>]*>.*?</div>', h, flags=re.S)
        for i, s in enumerate(sw):
            h = h.replace(s, f'\x00SW{i}\x00', 1)
        h = _translate(h, m, f.name)
        for i, s in enumerate(sw):
            h = h.replace(f'\x00SW{i}\x00', s)
        f.write_text(h, encoding='utf-8')


def report(lang):
    """Untranslated Arabic runs: {run: {files, ctx}} (runs mapped to themselves are intentional)."""
    out, seen, m = core.OUT, {}, ui_map(lang)
    for f in list(out.glob('*.html')) + list((out / 'js').glob('*.js')) + [out / 'data' / 'kb.js', out / 'data' / 'world.js']:
        t = f.read_text(encoding='utf-8')
        if f.suffix == '.js' and '@i18n-self' in t[:200]:
            continue
        for mo in AR_RUN.finditer(re.sub(r'<div class="lang-switch[^"]*"[^>]*>.*?</div>', '', t, flags=re.S)):
            r = mo.group(0).strip()
            if r in KEEP or m.get(f'{f.name}::{r}', m.get(r)) == r:
                continue
            e = seen.setdefault(r, {'files': [], 'ctx': ''})
            if f.name not in e['files']:
                e['files'].append(f.name)
            if not e['ctx']:
                e['ctx'] = t[max(0, mo.start() - 80):mo.end() + 80]
    return seen
