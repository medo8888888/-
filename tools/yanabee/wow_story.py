"""Home: the mission as scrollytelling.

The mission paragraph (platform.txt, s1 / mission) is cut VERBATIM into four consecutive fragments. They are
four ordinary text steps in normal flow (real, selectable paragraphs). Beside them (desktop) or above them
(phones) a small sticky companion panel holds a particle canvas; the step nearest the reading line decides
which act it performs (js/story.js, css/story.css): loners -> seven team clusters -> racing streams -> one arch
and the word «ينابيع». The page itself always scrolls 1:1, nothing is pinned or hijacked.

Without JS, with prefers-reduced-motion, in print and on very short screens the same markup is a plain block:
the four fragments as cards with a calm static illustration, and the closing word as text.

The accessible text is the mission once, in order (the four <p class="step-text">); the canvas, team labels and
droplet are decorative (aria-hidden); the only controls are the four step-indicator buttons.
The section deliberately has NO id (fx.js builds its section dots from main > section[id]).
"""
import math
import re

from core import PLATFORM as P, TEAM_IDS, ic, logo, plain, short, t

# Where the paragraph is cut. Each marker is the first words of the NEXT fragment.
_JOINTS = ('إلى مشاركة مجتمعية', 'تتنافس في مجالات', 'تحت مظلة وطنية')

# One short verbatim phrase per act (indicator button labels). Asserted to be inside its fragment.
_TAGS = ('الانعزالية', 'فرق تخصصية تكاملية', 'تتنافس', 'مظلة وطنية موحدة')

# Words that carry the colour of their act (style only; nothing is added or removed).
_EMPHASIS = (
    {'الانعزالية', 'الاستهلاك', 'الرقمي', 'الفردي'},
    {'مشاركة', 'مجتمعية', 'مثمرة', 'فرق', 'تخصصية', 'تكاملية'},
    {'تتنافس'},
    {'مظلة', 'وطنية', 'موحدة'},
)


def fragments():
    """The mission paragraph as four consecutive fragments; their join is asserted to equal it."""
    para = P['s1']['mission'].paras[0]
    cuts = [para.index(j) for j in _JOINTS]
    assert cuts == sorted(cuts) and len(set(cuts)) == 3, 'mission joints out of order'
    bounds = [0] + cuts + [len(para)]
    frags = [para[a:b].strip() for a, b in zip(bounds, bounds[1:])]
    assert ' '.join(frags) == para, 'story fragments drifted from the mission paragraph'
    for tag, frag in zip(_TAGS, frags):
        assert tag in frag, f'act phrase {tag!r} not in its fragment'
    return para, frags


def _text(frag, emph):
    """The fragment word by word (so key words can take their act colour); the join is the fragment again."""
    out = []
    for w in frag.split(' '):
        word = t(w)
        out.append(f'<span class="em">{word}</span>' if re.sub(r'[،.:؛]', '', w) in emph else word)
    return ' '.join(out)


# --- calm static illustrations (only shown in the static block) --------------------------------
def _svg(inner):
    return (f'<svg class="step-art" viewBox="0 0 160 64" width="160" height="64" aria-hidden="true" focusable="false">{inner}</svg>')


def _art_alone():
    dots = [(14, 44, 3), (38, 14, 4), (60, 50, 3), (82, 22, 5), (104, 46, 3), (124, 12, 3), (146, 38, 4), (22, 24, 2), (96, 6, 2), (70, 34, 2)]
    d = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="var(--muted)" opacity=".55"/>' for x, y, r in dots)
    screens = ''.join(f'<rect x="{x}" y="{y}" width="7" height="11" rx="2" fill="none" stroke="var(--sky)" stroke-opacity=".5" stroke-width="1.4"/>'
                      for x, y in ((46, 30), (116, 24), (8, 6)))
    return _svg(d + screens)


def _art_teams():
    pts = []
    for k in range(7):
        a = -math.pi / 2 + 2 * math.pi * k / 7
        pts.append((80 + 46 * math.cos(a), 32 + 22 * math.sin(a)))
    c = ''.join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7.5" fill="var(--t{k + 1})" opacity=".92"/>' for k, (x, y) in enumerate(pts))
    ring = '<ellipse cx="80" cy="32" rx="46" ry="22" fill="none" stroke="var(--line-2)" stroke-dasharray="2 5" stroke-linecap="round"/>'
    return _svg(ring + c)


def _art_lanes():
    hs = (30, 44, 36, 52, 40, 34, 48)
    bars = ''.join(
        f'<rect x="{18 + k * 20}" y="{58 - h}" width="8" height="{h}" rx="4" fill="var(--t{k + 1})" opacity=".9"/>'
        for k, h in enumerate(hs))
    return _svg(bars)


def _art_arch():
    return _svg('<path d="M18 58C18 20 48 6 80 6s62 14 62 52" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" opacity=".85"/>'
                '<path d="M32 58C32 30 54 18 80 18s48 12 48 40" fill="none" stroke="var(--sky)" stroke-width="2" stroke-linecap="round" opacity=".55"/>'
                '<path d="M80 26c0 0-9 10-9 16a9 9 0 0 0 18 0c0-6-9-16-9-16Z" fill="var(--accent)"/>')


# Goes live while the HTML is still parsing, so the companion's reserved height is in place before first paint (no layout
# shift): JS running, not reduced motion, a screen tall enough, canvas available. story.js confirms by setting
# window.__storyReady; if it never does, the section falls back to the static block.
_BOOT = '<script>(function(){try{var s=document.currentScript.previousElementSibling;if(s&&document.documentElement.classList.contains(\'js\')&&!matchMedia(\'(prefers-reduced-motion: reduce)\').matches&&innerHeight>=500&&document.createElement(\'canvas\').getContext){s.classList.add(\'is-live\');setTimeout(function(){if(!window.__storyReady)s.classList.remove(\'is-live\')},4000)}}catch(e){}})();</script>'

_ARTS = (_art_alone, _art_teams, _art_lanes, _art_arch)


def story():
    mission = P['s1']['mission']
    _, frags = fragments()
    word = re.search(r'"([^"]+)"', P.meta['title']).group(1)  # «ينابيع» from the project title

    steps = ''.join(
        f'<div class="step" data-step="{i}">{_ARTS[i]()}<p class="step-text">{_text(f, _EMPHASIS[i])}</p></div>'
        for i, f in enumerate(frags))
    tags = ''.join(
        f'<span class="story-tag" style="--tc:var(--{tid})"><i></i>{t(short(P["s2"][tid].title))}</span>' for tid in TEAM_IDS)
    dots = ''.join(
        f'<button type="button" class="story-dot" data-act="{i}" aria-label="{plain("الانتقال إلى: " + tag)}"><i aria-hidden="true"></i></button>'
        for i, tag in enumerate(_TAGS))

    return f'''
<section class="story" aria-labelledby="story-h" data-story data-word="{plain(word)}">
  <div class="wrap">
    <header class="story-head"><h2 class="kicker" id="story-h">{ic('route')}{t(mission.title)}</h2></header>
    <div class="story-grid">
      <div class="story-steps">
        {steps}
        <p class="story-end" aria-hidden="true">{t(word)}</p>
      </div>
      <div class="story-companion">
        <div class="story-bg" aria-hidden="true"><i class="sb-cold"></i><i class="sb-team"></i><i class="sb-brand"></i></div>
        <canvas class="story-canvas" aria-hidden="true"></canvas>
        <div class="story-tags" aria-hidden="true">{tags}</div>
        <div class="story-core" aria-hidden="true">{logo(96, 'story', 'story-logo')}</div>
        <nav class="story-dots" aria-label="مراحل الرسالة">{dots}</nav>
      </div>
    </div>
  </div>
</section>
{_BOOT}'''
