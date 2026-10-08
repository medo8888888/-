#!/usr/bin/env python3
"""MANARA («منارة») - build the bundled Qatar dataset (pure Python 3 standard library).

User requirement (verbatim): "I wnat it on the whole of Qatar".

What it builds (all classic scripts that set globals, they load from file:// and in Node via `vm`):
    site/manara/data/qatar-geo.js         window.MANARA_QATAR_GEO         outline, municipalities, places, projection helper
    site/manara/data/qatar-facilities.js  window.MANARA_QATAR_FACILITIES  hospitals / EDs, police, Civil Defence fire stations, ambulance points
    site/manara/data/qatar-roads.js       window.MANARA_QATAR_ROADS       compact routable road graph (+ decode())
    site/manara/data/CREDITS.txt          attribution, licences, snapshot, counts
and (with --write-doc) the generated tables inside docs/MANARA-DATA.md.

Sources
    OpenStreetMap (c) OpenStreetMap contributors, ODbL 1.0, through the overpass.openstreetmap.fr mirror:
        municipality boundaries (the 8 admin_level=4 sub-areas of relation 305095, which share their nodes with the coastline),
        places, facilities, roads.
    Natural Earth 10m admin-0 countries (public domain) - kept as an independent cross-check of the outline.
Everything here is a SNAPSHOT taken on the build date. Nothing is invented: a name, tag or position comes from the source or is
flagged. Unit positions/availability, traffic and hazard fields are SIMULATED elsewhere (the data is a map, not a live feed).

Usage
    python3 tools/manara/build-qatar-data.py --cache /path/to/cache          # fetch what is missing, build, write
    python3 tools/manara/build-qatar-data.py --cache DIR --no-fetch          # offline: cache only
    python3 tools/manara/build-qatar-data.py --cache DIR --refresh           # re-download everything
    python3 tools/manara/build-qatar-data.py --cache DIR --write-doc         # also refresh the generated part of docs/MANARA-DATA.md
    python3 tools/manara/build-qatar-data.py --cache DIR --no-access         # skip the real local-road access paths of far-from-road facilities
Pipeline: municipalities -> outline (topology-safe simplification) -> places -> facilities -> major roads (pass 1) -> access paths for the
facilities that are > 250 m from them (one Overpass `around` query, real OSM local roads, shortest legal path) -> roads (pass 2, one-way dead
ends joined by flagged VIRTUAL connectors, largest strongly connected component only) -> snaps -> official-list matrix -> files.
Be polite to the Overpass mirror: requests are sequential with a pause. Never put an e-mail address in a request.
"""
import argparse
import collections
import datetime
import hashlib
import heapq
import json
import math
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT_DIR = os.path.join(ROOT, 'site', 'manara', 'data')
DOC_PATH = os.path.join(ROOT, 'docs', 'MANARA-DATA.md')

UA = 'manara-student-project/1.0 (competition prototype)'
OVERPASS = 'https://overpass.openstreetmap.fr/api/interpreter'
NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson'
ATTRIBUTION = 'Contains data \u00a9 OpenStreetMap contributors, ODbL 1.0 \u2014 https://www.openstreetmap.org/copyright'
GENERATOR = 'tools/manara/build-qatar-data.py'

# --------------------------------------------------------------------------------------------------------------------------
# Overpass queries (verbatim copies of what was sent; the text is part of the documentation)
# --------------------------------------------------------------------------------------------------------------------------
BB_FAC = '(24.4,50.7,26.3,51.7)'
BB_ROAD = '(24.4,50.6,26.3,51.8)'
BB_WIDE = '(24.4,50.5,26.3,52.8)'
QUERIES = collections.OrderedDict()
QUERIES['rel_qa_geom'] = '[out:json][timeout:180];\nrel(305095);\nout geom;\n'
QUERIES['rel_qa_subs'] = '[out:json][timeout:240];\nrel(305095);\nrel(r);\nout geom;\n'
QUERIES['facilities'] = '''[out:json][timeout:240];
(
  nwr["amenity"="hospital"]%(b)s;
  nwr["healthcare"="hospital"]%(b)s;
  nwr["amenity"~"^(clinic|doctors)$"]["emergency"="yes"]%(b)s;
  nwr["healthcare"~"^(clinic|centre|doctor)$"]["emergency"="yes"]%(b)s;
  nwr["amenity"="police"]%(b)s;
  nwr["amenity"="fire_station"]%(b)s;
  nwr["emergency"="ambulance_station"]%(b)s;
  nwr["emergency"~"^(fire_station|rescue_station|ambulance_station|lifeguard)$"]%(b)s;
  nwr["office"="government"]["name"~"Civil Defen|\u0627\u0644\u062f\u0641\u0627\u0639 \u0627\u0644\u0645\u062f\u0646\u064a"]%(b)s;
  nwr["name"~"Civil Defen|\u0627\u0644\u062f\u0641\u0627\u0639 \u0627\u0644\u0645\u062f\u0646\u064a"]%(b)s;
  nwr["name:en"~"Civil Defen"]%(b)s;
);
out center tags;
''' % {'b': BB_FAC}
QUERIES['places'] = '''[out:json][timeout:240];
(
  node["place"~"^(city|town|village|suburb|hamlet|neighbourhood|quarter|locality|island|islet|isolated_dwelling|farm)$"]%(b)s;
  nwr["aeroway"="aerodrome"]%(b)s;
  nwr["landuse"="industrial"]["name"]%(b)s;
  nwr["industrial"]["name"]%(b)s;
  nwr["harbour"="yes"]["name"]%(b)s;
  nwr["amenity"="university"]["name"~"Education City"]%(b)s;
  nwr["name:en"~"Education City|Industrial Area|Ras Laffan|Mesaieed|Mesaieed|Lusail|Hamad International|Hamad Port|Dukhan"]%(b)s;
);
out center tags;
''' % {'b': BB_WIDE}
QUERIES['roads_major'] = '[out:json][timeout:300];\nway["highway"~"^(motorway|trunk|primary|secondary)(_link)?$"]%s;\nout body;\n>;\nout skel qt;\n' % BB_ROAD
QUERIES['roads_tertiary'] = '[out:json][timeout:300];\nway["highway"~"^tertiary(_link)?$"]%s;\nout body;\n>;\nout skel qt;\n' % BB_ROAD
# completeness lookups for the official-list matrix. They are SELECTIVE on purpose (tag filters first, names matched locally): a name regex over every
# feature of the country makes the Overpass mirror time out (the first version did, and the mirror answered HTTP 200 with an empty result).
QUERIES['lookup_health'] = '''[out:json][timeout:240];
(
  nwr["amenity"~"^(hospital|clinic|doctors|social_facility)$"]%(b)s;
  nwr["healthcare"~"^(hospital|clinic|centre|doctor|rehabilitation)$"]%(b)s;
  nwr["emergency"~"^(ambulance_station|fire_station|rescue_station|first_aid)$"]%(b)s;
  nwr["building"~"^(hospital|clinic)$"]%(b)s;
  nwr["office"="government"]["name"~"Communicable|Civil Defen|\u0627\u0644\u062f\u0641\u0627\u0639 \u0627\u0644\u0645\u062f\u0646\u064a",i]%(b)s;
);
out center tags;
''' % {'b': BB_FAC}
QUERIES['lookup_police_fire'] = '''[out:json][timeout:240];
(
  nwr["amenity"~"^(police|fire_station)$"]%(b)s;
  nwr["office"~"^(government|police)$"]["name"~"police|\u0634\u0631\u0637\u0629|civil defen|\u062f\u0641\u0627\u0639|fire|traffic|\u0645\u0631\u0648\u0631",i]%(b)s;
);
out center tags;
''' % {'b': BB_FAC}

# --------------------------------------------------------------------------------------------------------------------------
# Network
# --------------------------------------------------------------------------------------------------------------------------
class Fetcher:
    def __init__(self, cache, fetch=True, refresh=False):
        self.cache, self.fetch, self.refresh = cache, fetch, refresh
        os.makedirs(cache, exist_ok=True)
        self.stamps = {}
        self.last = 0.0

    def _path(self, name):
        return os.path.join(self.cache, name)

    def _http(self, req, tries=4):
        delay = 10
        for k in range(tries):
            try:
                with urllib.request.urlopen(req, timeout=330) as r:
                    return r.read()
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ConnectionError) as e:
                print('   fetch failed (%s), retry %d/%d in %ds' % (e, k + 1, tries, delay), file=sys.stderr)
                time.sleep(delay)
                delay *= 2
        raise RuntimeError('network: giving up on %s' % getattr(req, 'full_url', req))

    @staticmethod
    def _bad(data):
        """The mirror answers HTTP 200 with an EMPTY result and a `remark` when a query times out or runs out of memory: never accept that."""
        remark = data.get('remark', '') if isinstance(data, dict) else 'not a JSON object'
        return remark if ('error' in remark.lower() or 'timed out' in remark.lower() or 'out of memory' in remark.lower() or not isinstance(data, dict) or 'elements' not in data) else ''

    def overpass(self, key):
        path = self._path(key + '.json')
        data = None
        if os.path.exists(path) and not self.refresh:
            data = json.load(open(path, encoding='utf-8'))
            if self._bad(data):
                print('  cached %s holds an Overpass error (%s): ignoring it' % (key, self._bad(data)), file=sys.stderr)
                data = None
        if data is None:
            if not self.fetch:
                raise RuntimeError('missing or invalid cache file %s (run without --no-fetch)' % path)
            for attempt in range(3):
                wait = 6 - (time.time() - self.last)
                if wait > 0:
                    time.sleep(wait)
                print('  overpass: %s ...' % key, file=sys.stderr)
                body = urllib.parse.urlencode({'data': QUERIES[key]}).encode()
                req = urllib.request.Request(OVERPASS, data=body, headers={'User-Agent': UA})
                raw = self._http(req)
                self.last = time.time()
                try:
                    data = json.loads(raw.decode('utf-8'))
                except ValueError:
                    data = {'remark': 'runtime error: the answer was not JSON'}
                bad = self._bad(data)
                if not bad:
                    break
                print('   overpass error for %s (%s), retry %d/3 in 60 s' % (key, bad, attempt + 1), file=sys.stderr)
                data = None
                time.sleep(60)
            if data is None:
                raise RuntimeError('overpass: %s kept failing; make the query more selective or try again later' % key)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(raw.decode('utf-8'))
        self.stamps[key] = data.get('osm3s', {}).get('timestamp_osm_base', '')
        return data

    def natural_earth(self):
        path = self._path('ne_10m_admin_0_countries.geojson')
        if not os.path.exists(path) or self.refresh:
            if not self.fetch:
                raise RuntimeError('missing cache file %s' % path)
            print('  natural earth ...', file=sys.stderr)
            raw = self._http(urllib.request.Request(NE_URL, headers={'User-Agent': UA}))
            with open(path, 'wb') as f:
                f.write(raw)
        return json.load(open(path, encoding='utf-8'))


# --------------------------------------------------------------------------------------------------------------------------
# Geometry helpers (lon/lat degrees; metres through a local equirectangular projection)
# --------------------------------------------------------------------------------------------------------------------------
R_EARTH = 6371008.8
LON0, LAT0 = 51.2, 25.3
M_LAT = math.pi * R_EARTH / 180.0
M_LON = M_LAT * math.cos(math.radians(LAT0))


def hav(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_EARTH * math.asin(min(1.0, math.sqrt(a)))


def xy(lon, lat):
    return ((lon - LON0) * M_LON, (lat - LAT0) * M_LAT)


def seg_dist2(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    if L == 0:
        return (px - ax) ** 2 + (py - ay) ** 2
    t = ((px - ax) * dx + (py - ay) * dy) / L
    t = 0 if t < 0 else 1 if t > 1 else t
    qx, qy = ax + t * dx, ay + t * dy
    return (px - qx) ** 2 + (py - qy) ** 2


def dp_indices(pts, eps_m, forced=()):
    """Iterative Douglas-Peucker in projected metres. First/last point and every `forced` index are kept. Returns kept indices."""
    n = len(pts)
    if n <= 2:
        return list(range(n))
    P = [xy(*p) for p in pts]
    keep = [False] * n
    keep[0] = keep[-1] = True
    for i in forced:
        keep[i] = True
    anchors = [i for i in range(n) if keep[i]]
    stack = list(zip(anchors, anchors[1:]))
    e2 = eps_m * eps_m
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = P[a]
        bx, by = P[b]
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            d = seg_dist2(P[i][0], P[i][1], ax, ay, bx, by)
            if d > best:
                best, bi = d, i
        if best > e2:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [i for i in range(n) if keep[i]]


def douglas_peucker(pts, eps_m):
    """pts: list of (lon,lat) -> simplified list (first and last point are kept)."""
    return [pts[i] for i in dp_indices(pts, eps_m)]


def ring_area_m2(ring):
    """Signed area (m2) of a ring of (lon,lat): positive = counter-clockwise."""
    s = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = xy(*ring[i])
        x1, y1 = xy(*ring[(i + 1) % n])
        s += x0 * y1 - x1 * y0
    return s / 2.0


def pip(lon, lat, ring):
    """Even-odd point in ring (ring: list of (lon,lat), implicitly closed)."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def bbox_of(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def seg_intersect(a, b, c, d):
    d1x, d1y = b[0] - a[0], b[1] - a[1]
    d2x, d2y = d[0] - c[0], d[1] - c[1]
    den = d1x * d2y - d1y * d2x
    if den == 0:
        return False
    t = ((c[0] - a[0]) * d2y - (c[1] - a[1]) * d2x) / den
    u = ((c[0] - a[0]) * d1y - (c[1] - a[1]) * d1x) / den
    return 1e-12 < t < 1 - 1e-12 and 1e-12 < u < 1 - 1e-12


MIN_RING_M2 = 50_000   # 0.05 km2


def ring_is_simple(ring):
    return not find_crossings(ring, first_only=True)


def find_crossings(ring, first_only=False):
    """Pairs (i, j) of non-adjacent edges of the closed ring that cross each other (grid-accelerated)."""
    n = len(ring)
    if n < 4:
        return []
    found = []
    cell = 0.02
    grid = collections.defaultdict(list)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        for cx in range(int(math.floor(min(a[0], b[0]) / cell)), int(math.floor(max(a[0], b[0]) / cell)) + 1):
            for cy in range(int(math.floor(min(a[1], b[1]) / cell)), int(math.floor(max(a[1], b[1]) / cell)) + 1):
                grid[(cx, cy)].append(i)
    seen = set()
    for lst in grid.values():
        for ii in range(len(lst)):
            i = lst[ii]
            for jj in range(ii + 1, len(lst)):
                j = lst[jj]
                if (i, j) in seen:
                    continue
                seen.add((i, j))
                if abs(i - j) <= 1 or abs(i - j) == n - 1:
                    continue
                if seg_intersect(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]):
                    found.append((min(i, j), max(i, j)))
                    if first_only:
                        return found
    return found


class Region:
    """Union of polygons-with-holes with a fast contains(). A polygon is (outer_ring, [hole_rings]).
    Cells of 0.01 deg that no ring edge touches are classified once; boundary cells use the exact test."""

    def __init__(self, polys, cell=0.01):
        self.polys = polys
        self.cell = cell
        self.boundary = set()
        self.cache = {}
        self.bbs = []
        for outer, holes in polys:
            self.bbs.append(bbox_of(outer))
            for r in [outer] + list(holes):
                self._mark(r)

    def _mark(self, ring):
        c = self.cell
        n = len(ring)
        for i in range(n):
            a, b = ring[i], ring[(i + 1) % n]
            steps = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / (c / 2)) + 1
            for k in range(steps + 1):
                x = a[0] + (b[0] - a[0]) * k / steps
                y = a[1] + (b[1] - a[1]) * k / steps
                cx, cy = int(math.floor(x / c)), int(math.floor(y / c))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        self.boundary.add((cx + dx, cy + dy))

    def exact(self, lon, lat):
        for (outer, holes), bb in zip(self.polys, self.bbs):
            if lon < bb[0] or lon > bb[2] or lat < bb[1] or lat > bb[3]:
                continue
            if pip(lon, lat, outer) and not any(pip(lon, lat, h) for h in holes):
                return True
        return False

    def contains(self, lon, lat):
        c = self.cell
        key = (int(math.floor(lon / c)), int(math.floor(lat / c)))
        if key in self.boundary:
            return self.exact(lon, lat)
        v = self.cache.get(key)
        if v is None:
            v = self.exact((key[0] + 0.5) * c, (key[1] + 0.5) * c)
            self.cache[key] = v
        return v

    def dist_m(self, lon, lat):
        """Distance in metres from the point to the nearest ring edge (outer or hole)."""
        px, py = xy(lon, lat)
        best = 1e18
        for outer, holes in self.polys:
            for r in [outer] + list(holes):
                n = len(r)
                prev = xy(*r[-1])
                for i in range(n):
                    cur = xy(*r[i])
                    d = seg_dist2(px, py, prev[0], prev[1], cur[0], cur[1])
                    if d < best:
                        best = d
                    prev = cur
        return math.sqrt(best)


def assemble_rings(ways):
    """Join polylines (lists of (lon,lat)) that share end points into closed rings; returns (rings, leftovers)."""
    key = lambda p: (round(p[0], 7), round(p[1], 7))
    ends = collections.defaultdict(list)
    for i, w in enumerate(ways):
        ends[key(w[0])].append(i)
        ends[key(w[-1])].append(i)
    used = [False] * len(ways)
    rings, left = [], []
    for s in range(len(ways)):
        if used[s]:
            continue
        used[s] = True
        cur = list(ways[s])
        while key(cur[0]) != key(cur[-1]):
            nxt = None
            for j in ends[key(cur[-1])]:
                if not used[j]:
                    nxt = j
                    break
            if nxt is None:
                break
            used[nxt] = True
            w = ways[nxt]
            if key(w[0]) == key(cur[-1]):
                cur.extend(w[1:])
            else:
                cur.extend(w[::-1][1:])
        if key(cur[0]) == key(cur[-1]) and len(cur) > 3:
            rings.append(cur[:-1])
        else:
            left.append(cur)
    return rings, left


# --------------------------------------------------------------------------------------------------------------------------
# Names
# --------------------------------------------------------------------------------------------------------------------------
AR_RE = re.compile('[\u0600-\u06FF\u0750-\u077F]')


def names_of(tags):
    """{'ar','en'} from OSM tags; a plain `name` is assigned by script. Missing -> ''."""
    ar = tags.get('name:ar', '')
    en = tags.get('name:en', '')
    nm = tags.get('name', '')
    if nm:
        if AR_RE.search(nm):
            ar = ar or nm
        else:
            en = en or nm
    if not ar and tags.get('alt_name:ar'):
        ar = tags['alt_name:ar']
    return {'ar': ar.strip(), 'en': en.strip()}


# --------------------------------------------------------------------------------------------------------------------------
# GEO: municipalities, outline, places
# --------------------------------------------------------------------------------------------------------------------------
MUNI_KEYS = {27328: 'umm-salal', 27329: 'khor', 27330: 'shahaniya', 27331: 'rayyan', 27332: 'doha', 27335: 'shamal', 27337: 'wakrah',
             11146904: 'daayen'}


def build_munis(subs, eps_list=(100, 80, 60, 45, 30)):
    rels = [r for r in subs['elements'] if r['type'] == 'relation']
    munis = {}
    for r in rels:
        if r['id'] not in MUNI_KEYS:
            raise RuntimeError('unexpected municipality relation %s %s' % (r['id'], r['tags'].get('name:en')))
        outer = [[(p['lon'], p['lat']) for p in m['geometry']] for m in r['members'] if m['type'] == 'way' and m['role'] == 'outer']
        inner = [[(p['lon'], p['lat']) for p in m['geometry']] for m in r['members'] if m['type'] == 'way' and m['role'] == 'inner']
        o_rings, o_left = assemble_rings(outer)
        i_rings, i_left = assemble_rings(inner)
        if o_left or i_left:
            raise RuntimeError('municipality %s has unclosed rings' % r['tags'].get('name:en'))
        o_rings = [x if ring_area_m2(x) > 0 else x[::-1] for x in o_rings]
        i_rings = [x if ring_area_m2(x) < 0 else x[::-1] for x in i_rings]
        centre = label = None
        for m in r['members']:
            if m['type'] == 'node' and m.get('role') == 'admin_centre':
                centre = (m['lon'], m['lat'])
            if m['type'] == 'node' and m.get('role') == 'label':
                label = (m['lon'], m['lat'])
        munis[MUNI_KEYS[r['id']]] = {'rel': r['id'], 'tags': r['tags'], 'outer': o_rings, 'inner': i_rings, 'centre': centre, 'label': label}
    # polygons with holes assigned by containment
    for k, m in munis.items():
        polys = []
        for o in m['outer']:
            hs = [h for h in m['inner'] if pip(h[0][0], h[0][1], o)]
            polys.append((o, hs))
        m['polys_full'] = polys
    # ---- topology-preserving simplification: cut every ring at the vertices where the set of municipalities using the edge changes
    usage = collections.defaultdict(set)
    for k, m in munis.items():
        for r in m['outer'] + m['inner']:
            for i in range(len(r)):
                a, b = r[i], r[(i + 1) % len(r)]
                usage[frozenset((a, b))].add(k)

    def chains_of(ring):
        n = len(ring)
        pat = [frozenset(usage[frozenset((ring[i], ring[(i + 1) % n]))]) for i in range(n)]
        fixed = [i for i in range(n) if pat[i - 1] != pat[i]]
        if len(fixed) < 2:
            # a ring wholly on one pattern (island / the outline): anchor at vertex 0 and the farthest vertex
            x0, y0 = xy(*ring[0])
            far = max(range(n), key=lambda i: (xy(*ring[i])[0] - x0) ** 2 + (xy(*ring[i])[1] - y0) ** 2)
            fixed = sorted({0, far})
        out = []
        for a in range(len(fixed)):
            s, e = fixed[a], fixed[(a + 1) % len(fixed)]
            seq = [ring[s]]
            i = s
            while i != e:
                i = (i + 1) % n
                seq.append(ring[i])
            # a chain is SHARED when more than one municipality uses its first edge (a border between municipalities)
            out.append((seq, len(pat[s]) > 1))
        return out

    for k, m in munis.items():
        m['chains'] = [[chains_of(r) for r in m['outer']], [chains_of(r) for r in m['inner']]]

    class Chain:
        """A run of ring vertices between two 'fixed' vertices. Shared chains are simplified once in a canonical
        direction (so both neighbours get identical vertices); coast-only chains are simplified independently."""
        counter = 0

        def __init__(self, seq, shared):
            self.seq, self.shared = seq, shared
            if shared:
                rev = tuple(seq[::-1])
                self.rev = rev < tuple(seq)
                self.canon = list(rev) if self.rev else seq
                self.key = tuple(self.canon)
            else:
                self.rev = False
                self.canon = seq
                Chain.counter += 1
                self.key = ('u', Chain.counter)

        def kept(self, eps, forced):
            n = len(self.seq)
            idx = dp_indices(self.canon, eps, forced.get(self.key, ()))
            return sorted(n - 1 - i for i in idx) if self.rev else idx

        def force_worst(self, a, c, forced):
            """force the vertex between chain positions a<c that deviates most from the chord (positions in this chain's own direction)"""
            P = [xy(*q) for q in self.seq[a:c + 1]]
            ax, ay = P[0]
            bx, by = P[-1]
            best, bi = -1.0, None
            for i in range(1, len(P) - 1):
                d = seg_dist2(P[i][0], P[i][1], ax, ay, bx, by)
                if d > best:
                    best, bi = d, i
            if bi is None:
                return False
            pos = a + bi
            forced.setdefault(self.key, set()).add(len(self.seq) - 1 - pos if self.rev else pos)
            return True

    for m in munis.values():
        m['chain_objs'] = [[[Chain(seq, sh) for seq, sh in chains] for chains in group] for group in m['chains']]

    def ring_of(chains, eps, forced):
        pts, segs = [], []
        for ci, ch in enumerate(chains):
            kept = ch.kept(eps, forced)
            for a, c in zip(kept, kept[1:]):
                segs.append((ci, a, c))
            pts.extend(ch.seq[i] for i in kept[:-1])
        return pts, segs

    used_eps = None
    for eps in eps_list:
        forced = {}
        ok = False
        for it in range(200):
            changed = False
            bad = 0
            for m in munis.values():
                m['outer_s'], m['inner_s'] = [], []
                for gi, group in enumerate(m['chain_objs']):
                    for chains in group:
                        pts, segs = ring_of(chains, eps, forced)
                        bad_pairs = find_crossings(pts) if len(pts) >= 4 else []
                        if len(pts) < 3:
                            bad_pairs = [(0, 0)]
                        for i, j in bad_pairs:
                            for kk in (i, j):
                                ci, a, c = segs[kk]
                                if c - a > 1 and chains[ci].force_worst(a, c, forced):
                                    changed = True
                        bad += len(bad_pairs)
                        (m['outer_s'] if gi == 0 else m['inner_s']).append(pts)
            if bad == 0:
                ok = True
                break
            if not changed:
                break
        if ok:
            used_eps = eps
            m0 = next(iter(munis.values()))
            for m in munis.values():
                m['forced_vertices'] = sum(len(v) for v in forced.values())
            break
    if used_eps is None:
        raise RuntimeError('simplified municipality rings are not simple for any eps')
    # drop tiny coast-only islets (< 0.05 km2) from the DRAWN geometry (they stay in the full-resolution land region used for tests)
    for m in munis.values():
        for key, gi in (('outer_s', 0), ('inner_s', 1)):
            keepr = []
            for pts, chains in zip(m[key], m['chain_objs'][gi]):
                small = abs(ring_area_m2(pts)) < MIN_RING_M2
                if small and not any(ch.shared for ch in chains):
                    continue
                keepr.append(pts)
            m[key] = keepr
    return munis, used_eps


def outline_from_munis(munis):
    """Country outline = simplified edges used by exactly one municipality (edges used by two cancel)."""
    edges = collections.Counter()
    for m in munis.values():
        for r in m['outer_s'] + m['inner_s']:
            for i in range(len(r)):
                edges[(r[i], r[(i + 1) % len(r)])] += 1
    boundary = {}
    for (a, b), c in edges.items():
        if (b, a) in edges:
            continue
        if a in boundary:
            raise RuntimeError('outline vertex with two outgoing edges at %r' % (a,))
        boundary[a] = b
    rings = []
    seen = set()
    for a in list(boundary):
        if a in seen:
            continue
        ring, cur = [], a
        while cur not in seen:
            seen.add(cur)
            ring.append(cur)
            cur = boundary[cur]
        rings.append(ring)
    return rings


def place_kind(tags):
    if tags.get('place'):
        return tags['place']
    if tags.get('aeroway') == 'aerodrome':
        return 'airport'
    if tags.get('harbour') == 'yes':
        return 'port'
    if tags.get('landuse') == 'industrial' or tags.get('industrial'):
        return 'industrial'
    if tags.get('amenity') == 'university':
        return 'education'
    return None


def center_of(e):
    if e['type'] == 'node':
        return e['lon'], e['lat']
    c = e.get('center')
    return (c['lon'], c['lat']) if c else None


# --------------------------------------------------------------------------------------------------------------------------
# Compact varint stream (6-bit symbols: 5 payload bits + 1 continuation bit) - decoded by qatar-roads.js
# --------------------------------------------------------------------------------------------------------------------------
ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'


def zz(v):
    return v * 2 if v >= 0 else -v * 2 - 1


class Stream:
    def __init__(self):
        self.c = []

    def u(self, v):
        assert v >= 0
        while True:
            d = v & 31
            v >>= 5
            if v:
                self.c.append(ALPHA[d | 32])
            else:
                self.c.append(ALPHA[d])
                return

    def i(self, v):
        self.u(zz(v))

    def text(self, width=200):
        s = ''.join(self.c)
        return '\n'.join(s[k:k + width] for k in range(0, len(s), width))

    def __len__(self):
        return len(self.c)


def morton(x, y):
    r = 0
    for b in range(21):
        r |= ((x >> b) & 1) << (2 * b) | ((y >> b) & 1) << (2 * b + 1)
    return r


# --------------------------------------------------------------------------------------------------------------------------
# ROADS
# --------------------------------------------------------------------------------------------------------------------------
CLASS_NAMES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'local']   # 'local' = access paths added for far-from-road facilities only
CLASS_NO = {n: i for i, n in enumerate(CLASS_NAMES)}
# free-flow speed ASSUMPTIONS used only where OSM has no numeric maxspeed (flag bit F_SPEED_TAGGED tells which edges are tagged)
DEFAULT_SPEED = {0: 100, 1: 80, 2: 70, 3: 60, 4: 50, 5: 40}
DEFAULT_SPEED_LINK = {0: 60, 1: 50, 2: 50, 3: 40, 4: 40, 5: 30}
DEFAULT_SPEED_ROUNDABOUT = 40
F_TUNNEL, F_BRIDGE, F_TOLL, F_ROUNDABOUT, F_ONEWAY, F_LINK, F_SPEED_TAGGED, F_RESTRICTED, F_VIRTUAL = 1, 2, 4, 8, 16, 32, 64, 128, 256
MAX_CONNECT_M = 300.0     # virtual connector: longest straight distance joining a dead end to an entry-less start
VIRTUAL_DETOUR = 1.3      # ASSUMPTION: unseen local road is 30 % longer than the straight line
VIRTUAL_KPH = 25          # ASSUMPTION: slow local road / turn-around
URBAN_BOX = (51.30, 25.10, 51.65, 25.50)   # Greater Doha / Al Rayyan: the only place tertiary roads are included


def parse_speed(s):
    if not s:
        return None
    nums = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', s)]
    if not nums:
        return None
    v = min(nums)
    if 'mph' in s:
        v *= 1.609344
    return int(round(v)) if 5 <= v <= 140 else None


def scc_largest(n, arcs_out):
    """Iterative Tarjan; arcs_out[u] = list of v. Returns (component id list, size of every component)."""
    index = [-1] * n
    low = [0] * n
    onstack = [False] * n
    comp = [-1] * n
    stack = []
    idx = 0
    ncomp = 0
    sizes = []
    for root in range(n):
        if index[root] != -1:
            continue
        work = [(root, 0)]
        while work:
            u, pi = work.pop()
            if pi == 0:
                index[u] = low[u] = idx
                idx += 1
                stack.append(u)
                onstack[u] = True
            adj = arcs_out[u]
            recursed = False
            while pi < len(adj):
                v = adj[pi]
                pi += 1
                if index[v] == -1:
                    work.append((u, pi))
                    work.append((v, 0))
                    recursed = True
                    break
                elif onstack[v]:
                    low[u] = min(low[u], index[v])
            if recursed:
                continue
            if low[u] == index[u]:
                size = 0
                while True:
                    w = stack.pop()
                    onstack[w] = False
                    comp[w] = ncomp
                    size += 1
                    if w == u:
                        break
                sizes.append(size)
                ncomp += 1
            if work:
                p = work[-1][0]
                low[p] = min(low[p], low[u])
    return comp, sizes


def oneway_dir(t):
    """1 = one-way along the way, -1 = against it, 0 = two-way (OSM defaults: motorways and roundabouts are one-way)."""
    ow = t.get('oneway', '')
    if ow in ('yes', 'true', '1'):
        return 1
    if ow == '-1':
        return -1
    if ow in ('no', 'false', '0'):
        return 0
    if t.get('highway', '') in ('motorway', 'motorway_link') or t.get('junction', '') == 'roundabout':
        return 1
    return 0


ACCESS_MIN_M = 250.0     # facilities farther than this from the major graph get a real-road access path (OSM local roads)
ACCESS_START_M = 400.0   # the local road node used as the start must be this close to the facility
ACCESS_TAGS = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|road)(_link)?$'


def access_query(specs):
    parts = ['  way(around:%d,%.5f,%.5f)["highway"~"%s"]["access"!="no"];' % (r, lat, lon, ACCESS_TAGS) for lat, lon, r in specs]
    return '[out:json][timeout:300];\n(\n%s\n);\nout body;\n>;\nout skel qt;\n' % '\n'.join(parts)


def dijkstra_to_main(adj, start, main_nodes, limit=15000.0):
    dist = {start: 0.0}
    prev = {}
    heap = [(0.0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist.get(u, 1e18):
            continue
        if u in main_nodes:
            path = []
            while u != start:
                pu, wi = prev[u]
                path.append((pu, u, wi))
                u = pu
            return path[::-1], d
        if d > limit:
            break
        for v, l, wi in adj.get(u, ()):
            nd = d + l
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                prev[v] = (u, wi)
                heapq.heappush(heap, (nd, v))
    return None, None


def compute_access(raw, far, main_nodes):
    """Real OSM local roads around the far facilities -> the shortest legal path facility -> main graph and main graph -> facility.
    far: [(fid, lon, lat)]. Returns ({'nodes':..., 'ways': [...]}, per-facility report)."""
    nodes, ways = {}, []
    for e in raw['elements']:
        if e['type'] == 'node':
            nodes[e['id']] = (e['lon'], e['lat'])
        elif e['type'] == 'way':
            ways.append(e)
    adj_f, adj_r = collections.defaultdict(list), collections.defaultdict(list)
    for wi, w in enumerate(ways):
        d = oneway_dir(w['tags'])
        ids = [n for n in w['nodes'] if n in nodes]
        for a, b in zip(ids, ids[1:]):
            l = hav(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1])
            if d >= 0:
                adj_f[a].append((b, l, wi))
                adj_r[b].append((a, l, wi))
            if d <= 0:
                adj_f[b].append((a, l, wi))
                adj_r[a].append((b, l, wi))
    cand_nodes = [n for n in adj_f if n in nodes]
    extra_nodes, extra_ways, seen_keys = {}, [], set()
    report = []

    def add_run(wi, ids):
        key = (wi, tuple(ids))
        if key in seen_keys or len(ids) < 2:
            return
        seen_keys.add(key)
        t = dict(ways[wi]['tags'])
        t['oneway'] = 'yes' if oneway_dir(t) != 0 else 'no'
        for n in ids:
            extra_nodes[n] = nodes[n]
        extra_ways.append({'id': 9_000_000_000 + len(extra_ways), 'tags': t, 'nodes': list(ids), '_access': True})

    def add_arcs(arcs):
        cur = None
        for a, b, wi in arcs:
            if cur and cur[0] == wi and cur[1][-1] == a:
                cur[1].append(b)
            else:
                if cur:
                    add_run(*cur)
                cur = (wi, [a, b])
        if cur:
            add_run(*cur)

    for fid, lon, lat in far:
        cands = sorted(cand_nodes, key=lambda n: hav(lon, lat, nodes[n][0], nodes[n][1]))[:3]
        done = None
        for st in cands:
            dd = hav(lon, lat, nodes[st][0], nodes[st][1])
            if dd > ACCESS_START_M:
                break
            out_path, out_len = dijkstra_to_main(adj_f, st, main_nodes)
            in_rev, in_len = dijkstra_to_main(adj_r, st, main_nodes)
            if out_path is not None and in_rev is not None:
                add_arcs(out_path)
                add_arcs([(b, a, wi) for a, b, wi in reversed(in_rev)])
                done = {'id': fid, 'startM': round(dd), 'outM': round(out_len), 'inM': round(in_len)}
                break
        report.append(done or {'id': fid, 'failed': 'no local road node within %d m with a legal path to the main graph' % ACCESS_START_M})
    return {'nodes': extra_nodes, 'ways': extra_ways}, report


def node_xy_of(edges):
    q = lambda v: int(round(v * 1e5))
    node_xy = {}
    for e in edges:
        node_xy[e['u']] = (q(e['poly'][0][0]), q(e['poly'][0][1]))
        node_xy[e['v']] = (q(e['poly'][-1][0]), q(e['poly'][-1][1]))
    return node_xy


def add_connectors(edges):
    """The extract holds only the major roads, so a one-way road often ends where it continues as a minor road (a SINK) and
    another starts where a minor road feeds it (a SOURCE). Joining each sink to the nearest source within MAX_CONNECT_M with a
    flagged VIRTUAL one-way connector keeps the directed graph routable without inventing a bidirectional road."""
    outd, ind, pos = collections.Counter(), collections.Counter(), {}
    for e in edges:
        outd[e['u']] += 1
        ind[e['v']] += 1
        pos[e['u']] = e['poly'][0]
        pos[e['v']] = e['poly'][-1]
        if not e['ow']:
            outd[e['v']] += 1
            ind[e['u']] += 1
    sinks = [n for n in pos if outd[n] == 0]
    sources = [n for n in pos if ind[n] == 0]
    cell = 0.004
    def grid_of(nodes):
        g = collections.defaultdict(list)
        for n in nodes:
            g[(int(math.floor(pos[n][0] / cell)), int(math.floor(pos[n][1] / cell)))].append(n)
        return g
    def nearest(n, g):
        p = pos[n]
        cx, cy = int(math.floor(p[0] / cell)), int(math.floor(p[1] / cell))
        best, bn = MAX_CONNECT_M, None
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                for c in g.get((cx + dx, cy + dy), ()):
                    if c == n:
                        continue
                    d = hav(p[0], p[1], pos[c][0], pos[c][1])
                    if d < best:
                        best, bn = d, c
        return bn, best
    out = []
    def mk(u, v, d):
        out.append({'u': u, 'v': v, 'poly': [pos[u], pos[v]], 'len': max(1.0, d * VIRTUAL_DETOUR), 'cls': 5, 'flags': F_VIRTUAL | F_ONEWAY,
                    'speed': VIRTUAL_KPH, 'name': 0, 'ow': 1, 'way': 0})
    src_grid, sink_grid = grid_of(sources), grid_of(sinks)
    fed = set()
    for s in sinks:
        t, d = nearest(s, src_grid)
        if t is not None:
            mk(s, t, d)
            fed.add(t)
    for t in sources:
        if t in fed:
            continue
        s, d = nearest(t, sink_grid)
        if s is not None:
            mk(s, t, d)
    return out


def repair_components(edges, max_m=500.0):
    """Second pass after add_connectors: a few pockets still cannot reach the main component, or cannot be reached from it.
    Join each such pocket to the nearest main-component node within max_m by flagged VIRTUAL one-way connectors (same assumption)."""
    pos = {}
    for e in edges:
        pos[e['u']] = e['poly'][0]
        pos[e['v']] = e['poly'][-1]
    ids = sorted(pos)
    ix = {n: i for i, n in enumerate(ids)}
    out = [[] for _ in ids]
    inn = [[] for _ in ids]

    def arc(a, b):
        out[a].append(b)
        inn[b].append(a)
    for e in edges:
        a, b = ix[e['u']], ix[e['v']]
        arc(a, b)
        if not e['ow']:
            arc(b, a)
    comp, sizes = scc_largest(len(ids), out)
    main = max(range(len(sizes)), key=lambda c: sizes[c])
    members = collections.defaultdict(list)
    for i, c in enumerate(comp):
        members[c].append(i)
    main_nodes = members[main]

    def reach(adj, seeds, seen):
        st = [x for x in seeds if x not in seen]
        seen.update(st)
        while st:
            u = st.pop()
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    st.append(v)
    fwd, back = set(), set()
    reach(out, main_nodes, fwd)
    reach(inn, main_nodes, back)
    cell = 0.004
    grid = collections.defaultdict(list)
    for i in main_nodes:
        p = pos[ids[i]]
        grid[(int(math.floor(p[0] / cell)), int(math.floor(p[1] / cell)))].append(i)
    added = []

    def mk(u, v, d):
        added.append({'u': ids[u], 'v': ids[v], 'poly': [pos[ids[u]], pos[ids[v]]], 'len': max(1.0, d * VIRTUAL_DETOUR), 'cls': 5,
                      'flags': F_VIRTUAL | F_ONEWAY, 'speed': VIRTUAL_KPH, 'name': 0, 'ow': 1, 'way': 0})
    for c in sorted((c for c in members if c != main), key=lambda c: -sizes[c]):
        nodes = members[c]
        need_out = nodes[0] not in back     # cannot reach the main component
        need_in = nodes[0] not in fwd       # not reachable from the main component
        if not (need_out or need_in):
            continue
        best = (max_m, None, None)
        for n in nodes:
            p = pos[ids[n]]
            cx, cy = int(math.floor(p[0] / cell)), int(math.floor(p[1] / cell))
            for dx in range(-2, 3):
                for dy in range(-2, 3):
                    for m in grid.get((cx + dx, cy + dy), ()):
                        d = hav(p[0], p[1], pos[ids[m]][0], pos[ids[m]][1])
                        if d < best[0]:
                            best = (d, n, m)
        d, n, m = best
        if n is None:
            continue
        if need_out:
            mk(n, m, d)
            arc(n, m)
            reach(inn, [n], back)
        if need_in:
            mk(m, n, d)
            arc(m, n)
            reach(out, [n], fwd)
    return added


def build_roads(major, tert, maritime, extra=None):
    nodes = {}
    ways = []
    for src, tag in ((major, 'major'), (tert, 'tertiary')):
        for e in src['elements']:
            if e['type'] == 'node':
                nodes[e['id']] = (e['lon'], e['lat'])
            elif e['type'] == 'way':
                ways.append(e)
    if extra:
        nodes.update(extra['nodes'])
        ways.extend(extra['ways'])
    stats = collections.Counter()
    runs = []
    for w in ways:
        t = w['tags']
        hw = t.get('highway', '')
        base = hw.replace('_link', '')
        access = bool(w.get('_access'))
        if base in CLASS_NO and base != 'tertiary':
            cls = CLASS_NO[base]
        elif base == 'tertiary' and not access:
            cls = 4
        elif access:
            cls = 5                                    # access paths outside the major classes (tertiary, residential, service ...) are 'local'
        else:
            continue
        ids = [n for n in w['nodes'] if n in nodes]
        flags_in = []
        for n in ids:
            lon, lat = nodes[n]
            ok = maritime.contains(lon, lat)
            if ok and cls == 4 and not access:
                ok = URBAN_BOX[0] <= lon <= URBAN_BOX[2] and URBAN_BOX[1] <= lat <= URBAN_BOX[3]
            flags_in.append(ok)
        cur = []
        for n, ok in zip(ids, flags_in):
            if ok:
                cur.append(n)
            else:
                if len(cur) >= 2:
                    runs.append((w, cur, cls))
                cur = []
        if len(cur) >= 2:
            runs.append((w, cur, cls))
        stats['ways_' + hw] += 1
    use = collections.Counter()
    for w, ids, _cls in runs:
        for i, n in enumerate(ids):
            use[n] += 1
            if i == 0 or i == len(ids) - 1:
                use[n] += 1
    names = [['', '', '']]
    name_ix = {('', '', ''): 0}
    edges = []
    for w, ids, cls in runs:
        t = w['tags']
        hw = t['highway']
        link = hw.endswith('_link')
        junction = t.get('junction', '')
        roundabout = junction in ('roundabout', 'circular')
        oneway = oneway_dir(t)
        flags = 0
        layer = 0
        try:
            layer = int(float(t.get('layer', '0')))
        except ValueError:
            pass
        if t.get('tunnel') not in (None, 'no') or (layer < 0 and t.get('bridge') in (None, 'no')) or t.get('covered') == 'yes':
            flags |= F_TUNNEL
        if t.get('bridge') not in (None, 'no'):
            flags |= F_BRIDGE
        if t.get('toll') == 'yes':
            flags |= F_TOLL
        if roundabout:
            flags |= F_ROUNDABOUT
        if link:
            flags |= F_LINK
        if t.get('access') in ('private', 'no', 'permit', 'customers', 'delivery'):
            flags |= F_RESTRICTED
        sp = parse_speed(t.get('maxspeed', ''))
        if sp is not None:
            flags |= F_SPEED_TAGGED
        else:
            sp = DEFAULT_SPEED_ROUNDABOUT if roundabout else (DEFAULT_SPEED_LINK[cls] if link else DEFAULT_SPEED[cls])
        if oneway:
            flags |= F_ONEWAY
        nm = names_of(t)
        nkey = (nm['ar'], nm['en'], t.get('ref', ''))
        if nkey not in name_ix:
            name_ix[nkey] = len(names)
            names.append(list(nkey))
        ni = name_ix[nkey]
        cut = [0] + [i for i in range(1, len(ids) - 1) if use[ids[i]] >= 2] + [len(ids) - 1]
        for a, b in zip(cut, cut[1:]):
            seg = ids[a:b + 1]
            u, v = seg[0], seg[-1]
            poly = [nodes[x] for x in seg]
            if oneway == -1:
                u, v = v, u
                poly = poly[::-1]
            if u == v:
                stats['dropped_self_loop'] += 1
                continue
            length = sum(hav(poly[k][0], poly[k][1], poly[k + 1][0], poly[k + 1][1]) for k in range(len(poly) - 1))
            if length < 0.5:
                stats['dropped_zero_length'] += 1
                continue
            edges.append({'u': u, 'v': v, 'poly': poly, 'len': length, 'cls': cls, 'flags': flags, 'speed': sp, 'name': ni,
                          'ow': 1 if oneway else 0, 'way': w['id'], 'ids': seg})
    # ---- virtual connectors, then connectivity
    virtual = add_connectors(edges)
    edges.extend(virtual)
    virtual2 = repair_components(edges)
    edges.extend(virtual2)
    virtual = virtual + virtual2
    ids = sorted({e['u'] for e in edges} | {e['v'] for e in edges})
    ix = {n: i for i, n in enumerate(ids)}
    out = [[] for _ in ids]
    und = [[] for _ in ids]
    for e in edges:
        a, b = ix[e['u']], ix[e['v']]
        out[a].append(b)
        und[a].append(b)
        und[b].append(a)
        if not e['ow']:
            out[b].append(a)
    # weakly connected components
    wcomp = [-1] * len(ids)
    wsizes = []
    for s in range(len(ids)):
        if wcomp[s] != -1:
            continue
        wcomp[s] = len(wsizes)
        st, c = [s], 1
        while st:
            u = st.pop()
            for v in und[u]:
                if wcomp[v] == -1:
                    wcomp[v] = len(wsizes)
                    c += 1
                    st.append(v)
        wsizes.append(c)
    comp, sizes = scc_largest(len(ids), out)
    main = max(range(len(sizes)), key=lambda c: sizes[c])
    keep = {ids[i] for i in range(len(ids)) if comp[i] == main}
    kept = [e for e in edges if e['u'] in keep and e['v'] in keep]
    dropped = [e for e in edges if not (e['u'] in keep and e['v'] in keep)]
    info = {
        '_dropped': dropped,
        'wayRunsKept': len(runs),
        'junctionNodesBefore': len(ids),
        'edgesBefore': len(edges),
        'weakComponents': len(wsizes),
        'weakMainShare': max(wsizes) / len(ids),
        'strongComponents': len(sizes),
        'strongMainNodes': sizes[main],
        'strongMainShare': sizes[main] / len(ids),
        'droppedNodes': len(ids) - sizes[main],
        'droppedEdges': len(edges) - len(kept),
        'droppedSelfLoops': stats['dropped_self_loop'],
        'droppedZeroLength': stats['dropped_zero_length'],
        'virtualConnectors': len(virtual),
        'virtualConnectorsKept': sum(1 for e in kept if e['flags'] & F_VIRTUAL),
    }
    return kept, names, info


def encode_roads(edges, names):
    """Renumber nodes along a Morton order of the edges and write the column streams."""
    q = lambda v: int(round(v * 1e5))
    node_xy = node_xy_of(edges)
    order = sorted(edges, key=lambda e: (morton(node_xy[e['u']][0] - 4_500_000, node_xy[e['u']][1] - 2_400_000), e['way'], e['v']))
    new = {}
    node_list = []
    for e in order:
        for n in (e['u'], e['v']):
            if n not in new:
                new[n] = len(node_list)
                node_list.append(n)
    S = {k: Stream() for k in ('nodes', 'from', 'to', 'len', 'meta', 'speed', 'name', 'nshape', 'shape')}
    pl = pa = 0
    for n in node_list:
        x, y = node_xy[n]
        S['nodes'].i(x - pl)
        S['nodes'].i(y - pa)
        pl, pa = x, y
    seen = 0
    prev_from = 0
    shape_pts = 0
    for e in order:
        a, b = new[e['u']], new[e['v']]
        S['from'].i(a - seen)
        seen = max(seen, a + 1)
        S['to'].i(b - seen)
        seen = max(seen, b + 1)
        S['len'].u(int(round(e['len'] * 10)))
        S['meta'].u(e['cls'] | (e['flags'] << 3) | ((0 if e['ow'] else 1) << 13))   # bit 13 set = two-way
        S['speed'].u(e['speed'])
        S['name'].u(e['name'])
        # geometry: interior points of the polyline simplified to ~15 m, each as int delta from the previous point (starting at the from node)
        interior = e['poly'][1:-1]
        simp = douglas_peucker(e['poly'], 15.0)[1:-1] if len(e['poly']) > 2 else []
        pts = []
        px, py = node_xy[e['u']]
        ex, ey = node_xy[e['v']]
        for lon, lat in simp:
            x, y = q(lon), q(lat)
            if (x, y) != (px, py) and (x, y) != (ex, ey):
                pts.append((x, y))
                px, py = x, y
        S['nshape'].u(len(pts))
        px, py = node_xy[e['u']]
        for x, y in pts:
            S['shape'].i(x - px)
            S['shape'].i(y - py)
            px, py = x, y
        shape_pts += len(pts)
    streams = {k: v.text() for k, v in S.items()}
    build_id = hashlib.sha1(''.join(streams[k] for k in sorted(streams)).encode()).hexdigest()[:10]
    lens = {k: len(v) for k, v in S.items()}
    return streams, build_id, new, order, node_xy, lens, shape_pts


class Locator:
    """Nearest point on the (simplified) road polylines. Mirrors `locate()` in qatar-roads.js."""

    def __init__(self, edges, node_xy):
        self.cell = 0.01
        self.grid = collections.defaultdict(list)
        self.edges = edges
        self.segs = []
        q = lambda v: int(round(v * 1e5))
        for ei, e in enumerate(edges):
            pts = [node_xy[e['u']]] + [(q(x), q(y)) for x, y in douglas_peucker(e['poly'], 15.0)[1:-1]] + [node_xy[e['v']]]
            e['_pts'] = [(x / 1e5, y / 1e5) for x, y in pts]
            ps = e['_pts']
            total = 0.0
            cum = [0.0]
            for k in range(len(ps) - 1):
                total += hav(ps[k][0], ps[k][1], ps[k + 1][0], ps[k + 1][1])
                cum.append(total)
            e['_cum'] = cum
            for k in range(len(ps) - 1):
                si = len(self.segs)
                self.segs.append((ei, k))
                x0, y0, x1, y1 = ps[k][0], ps[k][1], ps[k + 1][0], ps[k + 1][1]
                for cx in range(int(math.floor(min(x0, x1) / self.cell)), int(math.floor(max(x0, x1) / self.cell)) + 1):
                    for cy in range(int(math.floor(min(y0, y1) / self.cell)), int(math.floor(max(y0, y1) / self.cell)) + 1):
                        self.grid[(cx, cy)].append(si)

    def locate(self, lon, lat, max_m=5000.0):
        ck = math.cos(math.radians(lat))
        best = None
        c0x, c0y = int(math.floor(lon / self.cell)), int(math.floor(lat / self.cell))
        for ring in range(0, int(max_m / 950) + 2):
            cand = []
            for cx in range(c0x - ring, c0x + ring + 1):
                for cy in range(c0y - ring, c0y + ring + 1):
                    if max(abs(cx - c0x), abs(cy - c0y)) != ring:
                        continue
                    cand.extend(self.grid.get((cx, cy), ()))
            for si in set(cand):
                ei, k = self.segs[si]
                ps = self.edges[ei]['_pts']
                ax, ay = (ps[k][0] - lon) * M_LAT * ck, (ps[k][1] - lat) * M_LAT
                bx, by = (ps[k + 1][0] - lon) * M_LAT * ck, (ps[k + 1][1] - lat) * M_LAT
                dx, dy = bx - ax, by - ay
                L = dx * dx + dy * dy
                t = 0.0 if L == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / L))
                d = math.hypot(ax + t * dx, ay + t * dy)
                if best is None or d < best[0]:
                    best = (d, ei, k, t)
            if best is not None and best[0] <= ring * 950.0:
                break
        if best is None:
            return None
        d, ei, k, t = best
        e = self.edges[ei]
        seglen = e['_cum'][k + 1] - e['_cum'][k]
        along = e['_cum'][k] + t * seglen
        return {'edge': ei, 'dist': d, 'frac': along / e['_cum'][-1] if e['_cum'][-1] else 0.0}


# --------------------------------------------------------------------------------------------------------------------------
# FACILITIES
# --------------------------------------------------------------------------------------------------------------------------
KEEP_TAGS = ('amenity', 'healthcare', 'emergency', 'operator', 'operator:type', 'beds', 'healthcare:speciality', 'opening_hours', 'phone',
             'website', 'wikidata', 'brand', 'short_name', 'ref', 'office', 'building', 'military', 'access', 'description')
CLINICISH = re.compile(r'health ?(care )?cent|medical cent|clinic|dental|polyclinic|medical$|\u0645\u0631\u0643\u0632 \u0635\u062d\u064a|\u0639\u064a\u0627\u062f\u0629|\u0645\u0631\u0643\u0632 \u0637\u0628\u064a|'
                       r'health center|center$|centre$|rehabilitation|therapy|naufar|bone & joint|housing complex', re.I)
HOSPITALISH = re.compile(r'hospital|\u0645\u0633\u062a\u0634\u0641\u0649|medical city|trauma|emergency|\u0645\u062f\u064a\u0646\u0629 \u062d\u0645\u062f \u0627\u0644\u0637\u0628\u064a\u0629', re.I)
JUNK = re.compile(r'parking|gate \d|wholesale|residential compound|exchange point|\(src\)', re.I)
POLICE_ROLE = [   # first match wins; the role is a NAME heuristic (see the field guide); an unnamed feature stays 'unknown'
    ('training', re.compile(r'college|shooting|range|academy|\u0643\u0644\u064a\u0629|\u0645\u064a\u062f\u0627\u0646 \u0627\u0644\u0631\u0645\u0627\u064a', re.I)),
    ('station', re.compile(r'police (station|section|division)|\u0642\u0633\u0645 \u0634\u0631\u0637\u0629|\u0645\u0631\u0643\u0632 \u0634\u0631\u0637\u0629', re.I)),
    ('traffic', re.compile(r'traffic|\u0645\u0631\u0648\u0631', re.I)),
    ('border', re.compile(r'border', re.I)),
    ('department', re.compile(r'department|directorate|management|laboratory|press|evidence|tracing|authorities|execution|research|security section|preventitive|juvenile|recruit|'
                              r'\u0625\u062f\u0627\u0631\u0629|\u0627\u062f\u0627\u0631\u0629|\u0645\u0637\u0627\u0628\u0639|\u0645\u062e\u062a\u0628\u0631|\u0627\u0644\u062e\u062f\u0645\u0647 \u0627\u0644\u0648\u0637\u0646\u064a\u0647|accident vehicle', re.I)),
]
RESTRICTED_NAME = re.compile(r'military|armed force|\u0639\u0633\u0643\u0631|police|\u0634\u0631\u0637\u0629|Airways|^QP |Qatar Petroleum|workers|housing complex|naufar|medical commission|recruit', re.I)
CIVIL_DEFENCE_NAME = re.compile(r'civil defen|\u062f\u0641\u0627\u0639 \u0645\u062f\u0646\u064a', re.I)


def norm_name(s):
    s = re.sub(r'\([^)]*\)', ' ', s.lower())
    s = re.sub(r'[^a-z0-9\u0600-\u06ff ]+', ' ', s)
    s = re.sub(r'\b(the|al|el|hospital|health|center|centre|healthcare|police|station|civil|defence|defense)\b', ' ', s)
    return ' '.join(s.split())


def facility_kind(tags):
    am, hc, em, off = tags.get('amenity'), tags.get('healthcare'), tags.get('emergency'), tags.get('office')
    if am == 'hospital' or hc == 'hospital':
        return 'hospital'
    if am in ('clinic', 'doctors') or hc in ('clinic', 'centre', 'doctor'):
        return 'clinic-ed' if em == 'yes' else None
    if am == 'police':
        return 'police'
    if am == 'fire_station' or em in ('fire_station', 'rescue_station'):
        return 'fire'
    if em == 'ambulance_station':
        return 'ambulance'
    nm = ' '.join(tags.get(k, '') for k in ('name', 'name:en'))
    if off == 'government' and re.search('civil defen|\u0627\u0644\u062f\u0641\u0627\u0639 \u0627\u0644\u0645\u062f\u0646\u064a', nm, re.I):
        return 'fire'
    return None


def build_facilities(raw, land, munis_region, official_ed):   # official_ed: {osm element: {...}} from OFFICIAL_ED
    items, excluded = [], []
    for e in raw['elements']:
        tags = e.get('tags', {})
        kind = facility_kind(tags)
        c = center_of(e)
        if not kind or not c:
            continue
        nm = names_of(tags)
        label = (nm['en'] or nm['ar'])
        osm = '%s/%d' % (e['type'], e['id'])
        if kind in ('hospital', 'clinic-ed') and JUNK.search(label):
            excluded.append((osm, label, 'not a facility (name says parking / gate / market / compound / exchange point / src)'))
            continue
        lon, lat = c
        if not land.contains(lon, lat):
            dist = land.dist_m(lon, lat)
            if dist > 100:
                excluded.append((osm, label, 'outside the Qatari municipality polygons, %.0f m from the nearest boundary (%.5f,%.5f)' % (dist, lon, lat)))
                continue
        items.append({'kind': kind, 'tags': tags, 'osm': osm, 'lon': lon, 'lat': lat, 'name': nm, 'otype': e['type'], 'oid': e['id']})
    # ---- merge node/way/relation duplicates: same kind, close, same normalised name (or one name contains the other)
    items.sort(key=lambda it: ({'relation': 0, 'way': 1, 'node': 2}[it['otype']], it['oid']))
    merged = []
    for it in items:
        label = it['name']['en'] or it['name']['ar']
        hit = None
        for m in merged:
            if m['kind'] != it['kind']:
                continue
            if hav(m['lon'], m['lat'], it['lon'], it['lat']) > 150:
                continue
            a, b = norm_name(m['name']['en'] or m['name']['ar']), norm_name(label)
            if a and b and (a == b or a in b or b in a):
                hit = m
                break
            if not a and not b and hav(m['lon'], m['lat'], it['lon'], it['lat']) < 40:
                hit = m
                break
        if hit is None:
            it['also'] = []
            merged.append(it)
        else:
            hit['also'].append(it['osm'])
            for k, v in it['tags'].items():
                hit['tags'].setdefault(k, v)
            for lang in ('ar', 'en'):
                if not hit['name'][lang] and it['name'][lang]:
                    hit['name'][lang] = it['name'][lang]
    out = []
    for it in merged:
        t = it['tags']
        label = it['name']['en'] or it['name']['ar']
        flags = []
        if not label:
            flags.append('unnamed')
        if it['also']:
            flags.append('merged-duplicates:' + ','.join(it['also']))
        rec = {'id': '%s-%s%d' % (it['kind'], it['otype'][0], it['oid']), 'kind': it['kind'], 'name': it['name'],
               'lon': round(it['lon'], 6), 'lat': round(it['lat'], 6),
               'tags': {k: t[k] for k in KEEP_TAGS if k in t}, 'osm': it['osm']}
        if it['otype'] != 'node':
            rec['geom'] = 'centre of ' + it['otype']
        if it['kind'] in ('hospital', 'clinic-ed'):
            if CLINICISH.search(label) and not HOSPITALISH.search(label):
                ft = 'health-centre'
            elif HOSPITALISH.search(label) or t.get('healthcare') == 'hospital':
                ft = 'hospital'
            else:
                ft = 'unclear'
            if it['kind'] == 'clinic-ed':
                ft = 'health-centre'
            rec['facilityType'] = ft
            for oi in [it['osm']] + list(it['also']):
                if oi in OFFICIAL_HOSPITAL_TYPE:
                    rec['facilityType'] = OFFICIAL_HOSPITAL_TYPE[oi]
                    rec['typeSrc'] = 'official list (hamad.qa or the private-hospital directory), joined by hand'
                    break
            else:
                rec['typeSrc'] = 'name heuristic'
            em = t.get('emergency')
            off = official_ed.get(it['osm'])
            for a in it['also']:
                off = off or official_ed.get(a)
            if off:
                rec['official'] = off['official']
                rec['caps'] = list(off['caps'])
                rec['capsSrc'] = 'hamad.qa Emergency Care Services page (HMC), joined by hand'
                if off['note']:
                    flags.append('official-match: ' + off['note'])
                rec['ed'], rec['edSrc'] = 'yes', ('osm-tag+official' if em == 'yes' else 'official')
            elif em == 'yes':
                rec['ed'], rec['edSrc'] = 'yes', 'osm-tag'
                if ft == 'health-centre':
                    flags.append('ed-tag-on-health-centre-not-confirmed-by-official-list')
            elif em == 'no':
                rec['ed'], rec['edSrc'] = 'no', 'osm-tag'
            else:
                rec['ed'], rec['edSrc'] = 'unknown', None
        if it['kind'] == 'police':
            role = 'unknown'
            for r, rx in POLICE_ROLE:
                if label and rx.search(label):
                    role = r
                    break
            rec['role'] = role
            if role in ('training', 'department'):
                flags.append('administrative or training site, not a public police post')
        if it['kind'] == 'fire':
            op = t.get('operator', '')
            if t.get('office') == 'government':
                rec['role'] = 'civil-defence-hq'
                flags.append('directorate office tagged office=government, not an operational station')
            elif CIVIL_DEFENCE_NAME.search(label + ' ' + op):
                rec['role'] = 'civil-defence-station'
            elif re.search(r'^RLIC|QE$', label) or op == 'QE':
                rec['role'] = 'industrial-fire-station'
            else:
                rec['role'] = 'fire-station'
        if it['kind'] in ('hospital', 'clinic-ed') and RESTRICTED_NAME.search(label):
            flags.append('name suggests restricted access (employer / military / police / workers): may not take the public')
        if flags:
            rec['flags'] = flags
        out.append(rec)
    return out, excluded


# --------------------------------------------------------------------------------------------------------------------------
# writers
# --------------------------------------------------------------------------------------------------------------------------
def js_json(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    return s.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


GLOBAL_EXPR = "typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this"


def file_header(title, lines):
    out = ['/* ' + title, ' * ' + '=' * 108]
    out += [' * ' + l for l in lines]
    out.append(' */')
    return '\n'.join(out) + '\n'


def r5(v):
    return round(v, 5)


def ring_out(ring):
    return [[r5(x), r5(y)] for x, y in ring]


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    return len(text.encode('utf-8'))


# --------------------------------------------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--cache', default=os.path.join(tempfile.gettempdir(), 'manara-osm-cache'), help='directory for raw Overpass/Natural Earth responses (keep it OUT of the repo)')
    ap.add_argument('--no-fetch', action='store_true', help='never touch the network; use the cache only')
    ap.add_argument('--refresh', action='store_true', help='re-download everything')
    ap.add_argument('--out', default=OUT_DIR)
    ap.add_argument('--write-doc', action='store_true', help='refresh the generated tables in docs/MANARA-DATA.md')
    ap.add_argument('--report', default=None, help='write the build report (JSON) here')
    ap.add_argument('--no-access', action='store_true', help='skip the local-road access paths for facilities far from the major graph')
    args = ap.parse_args()
    t0 = time.time()
    fx = Fetcher(args.cache, fetch=not args.no_fetch, refresh=args.refresh)
    print('fetching / loading raw data ...', file=sys.stderr)
    ne = fx.natural_earth()
    rel_geom = fx.overpass('rel_qa_geom')
    subs = fx.overpass('rel_qa_subs')
    fac_raw = fx.overpass('facilities')
    places_raw = fx.overpass('places')
    roads_major = fx.overpass('roads_major')
    roads_tert = fx.overpass('roads_tertiary')
    lookup_health = fx.overpass('lookup_health')
    lookup_pf = fx.overpass('lookup_police_fire')
    stamps = fx.stamps
    snapshot_ts = max(stamps.values())
    snapshot_date = snapshot_ts[:10] or datetime.date.today().isoformat()
    build_date = datetime.date.today().isoformat()

    # ------------------------------------------------------------------ GEO
    print('geo ...', file=sys.stderr)
    munis, eps_used = build_munis(subs)
    outline_rings = outline_from_munis(munis)
    outline_polys = []
    holes = []
    for r in outline_rings:
        (outline_polys if ring_area_m2(r) > 0 else holes).append(r)
    outline_polys.sort(key=lambda r: -ring_area_m2(r))
    # full-resolution land region (union of the municipality polygons) for point-in-land tests
    land_polys = []
    for m in munis.values():
        land_polys.extend(m['polys_full'])
    land = Region(land_polys)
    # maritime Qatar (territorial boundary relation) is only used to decide which road nodes belong to Qatar (bridges over water included)
    rel = rel_geom['elements'][0]
    mar_rings, mar_left = assemble_rings([[(p['lon'], p['lat']) for p in m['geometry']] for m in rel['members'] if m['type'] == 'way' and m['role'] == 'outer'])
    if mar_left:
        raise RuntimeError('maritime boundary has unclosed pieces')
    maritime = Region([(r if ring_area_m2(r) > 0 else r[::-1], []) for r in mar_rings])

    # ---- Natural Earth cross-check
    ne_feat = [f for f in ne['features'] if f['properties'].get('ISO_A2') == 'QA' or f['properties'].get('ADM0_A3') == 'QAT'][0]
    ne_geom = ne_feat['geometry']
    ne_polys = ne_geom['coordinates'] if ne_geom['type'] == 'MultiPolygon' else [ne_geom['coordinates']]
    ne_ring = [(x, y) for x, y in ne_polys[0][0][:-1]]
    ne_area = abs(ring_area_m2(ne_ring)) / 1e6
    peninsula = outline_polys[0]
    pen_area = ring_area_m2(peninsula) / 1e6
    total_area = sum(ring_area_m2(r) for r in outline_polys) / 1e6 - sum(abs(ring_area_m2(r)) for r in holes) / 1e6
    # vertices of NE ring vs our outline distance
    out_region = Region([(r, []) for r in outline_polys])
    ne_d = sorted(out_region.dist_m(x, y) for x, y in ne_ring)
    ne_check = {'neVertices': len(ne_ring), 'neAreaKm2': round(ne_area, 1), 'osmPeninsulaAreaKm2': round(pen_area, 1),
                'areaDiffPct': round((pen_area - ne_area) / ne_area * 100, 2),
                'neVertexToOutlineMedianM': round(ne_d[len(ne_d) // 2]), 'neVertexToOutlineP90M': round(ne_d[int(len(ne_d) * 0.9)]),
                'neVertexToOutlineMaxM': round(ne_d[-1])}
    ne_props = {k: ne_feat['properties'].get(k) for k in ('NAME', 'NAME_AR', 'ISO_A2', 'ADM0_A3', 'POP_EST', 'POP_YEAR')}

    # ---- municipalities output
    muni_out = []
    muni_order = ['doha', 'rayyan', 'wakrah', 'khor', 'shamal', 'umm-salal', 'daayen', 'shahaniya']
    for k in muni_order:
        m = munis[k]
        polys = []
        for o in m['outer_s']:
            hs = [h for h in m['inner_s'] if pip(h[0][0], h[0][1], o)]
            polys.append([ring_out(o)] + [ring_out(h) for h in hs])
        area_full = sum(ring_area_m2(o) for o in m['outer']) / 1e6 - sum(abs(ring_area_m2(h)) for h in m['inner']) / 1e6
        t = m['tags']
        c = m['centre'] or m['label']
        muni_out.append({'id': k, 'name': {'ar': t.get('name:ar', ''), 'en': t.get('name:en', '')}, 'osm': 'relation/%d' % m['rel'],
                         'adminLevel': int(t.get('admin_level', '0')), 'centre': [r5(c[0]), r5(c[1])] if c else None,
                         'centreSrc': 'osm admin_centre' if m['centre'] else ('osm label' if m['label'] else None),
                         'areaKm2': round(area_full, 1), 'polygons': polys})

    def muni_at(lon, lat):
        for k in muni_order:
            if any(pip(lon, lat, o) and not any(pip(lon, lat, h) for h in hs) for o, hs in munis[k]['polys_full']):
                return k
        return None

    # ---- places
    places, dropped_places = [], collections.Counter()
    seen_pl = []
    for e in places_raw['elements']:
        t = e.get('tags', {})
        kind = place_kind(t)
        c = center_of(e)
        if not kind or not c:
            continue
        nm = names_of(t)
        if not (nm['en'] or nm['ar']):
            dropped_places['unnamed'] += 1
            continue
        if kind in ('industrial', 'port', 'education', 'airport') and not re.search(
                r'Industrial (Area|City|Zone)|Hamad (International|Port)|Education City|Doha International|\u0645\u0646\u0637\u0642\u0629 \u0635\u0646\u0627\u0639\u064a\u0629|Ruwais Port|\u0645\u064a\u0646\u0627\u0621 \u0627\u0644\u0631\u0648\u064a\u0633', nm['en'] + ' ' + nm['ar'], re.I):
            dropped_places['other-' + kind] += 1
            continue
        if kind in ('airport',) and not (t.get('iata') or t.get('icao')) :
            dropped_places['airstrip'] += 1
            continue
        if kind == 'airport' and (t.get('military') or re.search('Air Base|Airbase', nm['en'], re.I)):
            dropped_places['military'] += 1
            continue
        if kind == 'locality' and not re.search('Education City', nm['en']):
            dropped_places['locality'] += 1
            continue
        lon, lat = c
        if not land.contains(lon, lat) and land.dist_m(lon, lat) > 800:
            dropped_places['outside-qatar'] += 1
            continue
        dup = [p for p in seen_pl if p['kind'] == kind and norm_name(p['name']['en'] or p['name']['ar']) == norm_name(nm['en'] or nm['ar']) and hav(p['lon'], p['lat'], lon, lat) < 1500]
        if dup:
            dropped_places['duplicate'] += 1
            continue
        rec = {'id': 'P%s%d' % (e['type'][0], e['id']), 'name': nm, 'kind': kind, 'lon': round(lon, 5), 'lat': round(lat, 5),
               'muni': muni_at(lon, lat), 'osm': '%s/%d' % (e['type'], e['id'])}
        if t.get('population') and re.fullmatch(r'[\d,\. ]+', t['population']):
            pop = int(re.sub(r'[^\d]', '', t['population'].split('.')[0]))
            if pop >= 100:      # an OSM value such as 31 for Al Khor is a tagging slip, not a population
                rec['population'] = pop
                rec['populationSrc'] = 'osm population tag (unverified)'
            else:
                dropped_places['implausible-population-tag'] += 1
        if kind == 'airport':
            rec['iata'] = t.get('iata')
            rec['icao'] = t.get('icao')
        places.append(rec)
        seen_pl.append(rec)
    # municipality centres (Al Daayen has no place node in the extract): from the relation's admin_centre / label nodes
    for k in muni_order:
        m = munis[k]
        if m['centre'] or m['label']:
            c = m['centre'] or m['label']
            nn = norm_name(m['tags'].get('name:en', ''))
            if not any(norm_name(p['name']['en']) == nn and hav(p['lon'], p['lat'], c[0], c[1]) < 3000 for p in places if p['kind'] != 'municipality-centre'):
                places.append({'id': 'PM-' + k, 'name': {'ar': m['tags'].get('name:ar', ''), 'en': m['tags'].get('name:en', '')}, 'kind': 'municipality-centre',
                               'lon': round(c[0], 5), 'lat': round(c[1], 5), 'muni': k, 'osm': 'relation/%d' % m['rel'],
                               'note': 'position of the %s node of the OSM municipality relation' % ('admin_centre' if m['centre'] else 'label')})
    kind_rank = {'city': 0, 'town': 1, 'municipality-centre': 2, 'airport': 3, 'port': 4, 'industrial': 5, 'education': 6, 'village': 7, 'suburb': 8,
                 'neighbourhood': 9, 'quarter': 10, 'hamlet': 11, 'locality': 12, 'island': 13}
    places.sort(key=lambda p: (kind_rank.get(p['kind'], 20), p['muni'] or '', p['name']['en'] or p['name']['ar']))

    def find_place(rx, kinds=None):
        for p in places:
            if (kinds is None or p['kind'] in kinds) and (re.search(rx, p['name']['en'], re.I) or re.search(rx, p['name']['ar'], re.I)):
                return p['id']
        return None

    anchors = collections.OrderedDict([
        ('doha', find_place(r'^Doha$', ('city',))), ('lusail', find_place(r'^Lusail$', ('city',))), ('al-rayyan', find_place(r'^Al Rayyan$', ('city',))),
        ('al-wakrah', find_place(r'^Al Wakrah$', ('town',))), ('al-khor', find_place(r'^Al Khor$', ('town',))),
        ('umm-salal', find_place(r'Umm Salal Muhammad', ('town',))), ('al-daayen', find_place(r'Daayen', ('municipality-centre', 'suburb', 'town', 'village'))),
        ('madinat-ash-shamal', find_place(r'Madinat ash Shamal', ('village', 'town'))), ('dukhan', find_place(r'^Dukhan$', ('town',))),
        ('mesaieed', find_place(r'^Mesaieed$', ('town',))), ('ras-laffan', find_place(r'^Ras Laffan$', ('town',))),
        ('al-shahaniya', find_place(r'Shahaniya', ('town', 'municipality-centre'))), ('industrial-area', find_place(r'^Industrial Area$', ('industrial',))),
        ('education-city', find_place(r'^Education City$', ('locality', 'education', 'suburb', 'neighbourhood'))),
        ('hamad-international-airport', find_place(r'Hamad International', ('airport',))),
    ])

    geo = collections.OrderedDict()
    allpts = [p for r in outline_polys for p in r]
    bb_all = bbox_of(allpts)
    main_bb = bbox_of(peninsula)
    geo['meta'] = collections.OrderedDict([
        ('name', {'ar': 'دولة قطر', 'en': 'State of Qatar'}),
        ('attribution', ATTRIBUTION),
        ('licence', 'OpenStreetMap data: ODbL 1.0. Natural Earth: public domain (cross-check only).'),
        ('snapshotDate', snapshot_date), ('osmBaseTimestamp', snapshot_ts), ('builtOn', build_date), ('generator', GENERATOR),
        ('outlineSource', 'OpenStreetMap: outer edges of the union of the 8 municipality relations (admin_level=4, sub-areas of relation 305095); they share their nodes with natural=coastline and the OSM Qatar-Saudi land border'),
        ('simplification', 'Douglas-Peucker, tolerance %d m, applied once per shared border chain so neighbouring municipalities and the outline never gap or overlap' % eps_used),
        ('hawar', 'The Hawar Islands belong to Bahrain (ICJ judgment of 16 March 2001) and are not part of any Qatari municipality polygon or of the outline.'),
        ('naturalEarthCheck', ne_check),
        ('naturalEarthNote', 'Natural Earth 10m admin-0 draws Qatar with only %d vertices (about 2 km apart) and omits the islands, so it cannot place coastal facilities (Lusail, The Pearl, Ras Laffan); it is shipped as `outlineNaturalEarth` for comparison only.' % len(ne_ring)),
        ('areaKm2', round(total_area, 1)), ('areaNote', 'computed from the OSM municipality polygons (land incl. islands, coast at high-water line as mapped)'),
        ('counts', {'municipalities': len(muni_out), 'outlinePolygons': len(outline_polys), 'outlineVertices': sum(len(r) for r in outline_polys),
                    'places': len(places)}),
    ])
    geo['bbox'] = {'lonMin': r5(main_bb[0]), 'latMin': r5(main_bb[1]), 'lonMax': r5(main_bb[2]), 'latMax': r5(main_bb[3]),
                   'note': 'the peninsula (mainland and nearshore islands); Halul island lies further east, see bboxAll'}
    geo['bboxAll'] = {'lonMin': r5(bb_all[0]), 'latMin': r5(bb_all[1]), 'lonMax': r5(bb_all[2]), 'latMax': r5(bb_all[3])}
    geo['outline'] = {'rings': [ring_out(r) for r in outline_polys], 'ringsNote': 'counter-clockwise exterior rings [lon,lat]; ring 0 is the mainland peninsula, the others are islands (Halul, The Pearl, Qetaifan, ...)',
                      'holes': [ring_out(r) for r in holes]}
    geo['outlineNaturalEarth'] = {'ring': ring_out(ne_ring), 'properties': ne_props, 'note': 'Natural Earth 10m, public domain; cross-check only'}
    geo['municipalities'] = muni_out
    geo['places'] = places
    geo['anchors'] = anchors
    geo['kinds'] = {'city': 'city', 'town': 'town', 'village': 'village', 'suburb': 'suburb / district', 'hamlet': 'hamlet', 'neighbourhood': 'neighbourhood',
                    'quarter': 'quarter', 'island': 'island', 'locality': 'locality', 'industrial': 'industrial area', 'airport': 'airport', 'port': 'port',
                    'education': 'education area', 'municipality-centre': 'municipality centre (from the OSM relation)'}

    # ------------------------------------------------------------------ FACILITIES (positions first; snaps once the road graph exists)
    print('facilities ...', file=sys.stderr)
    facs, excluded = build_facilities(fac_raw, land, None, OFFICIAL_ED)
    kind_rank_f = {'hospital': 0, 'clinic-ed': 1, 'fire': 2, 'police': 3, 'ambulance': 4}
    for f in facs:
        f['muni'] = muni_at(f['lon'], f['lat'])

    # ------------------------------------------------------------------ ROADS (pass 1: major roads; pass 2: + real local-road access paths for far facilities)
    print('roads ...', file=sys.stderr)
    edges, names, rinfo = build_roads(roads_major, roads_tert, maritime)
    rinfo.pop('_dropped', None)
    access_report = []
    if not args.no_access:
        loc1 = Locator(edges, node_xy_of(edges))
        far, specs = [], []
        for f in facs:
            s1 = loc1.locate(f['lon'], f['lat'], 9000.0)
            d1 = s1['dist'] if s1 else None
            f['_d1'] = d1
            if d1 is None or d1 > ACCESS_MIN_M:
                far.append((f['id'], f['lon'], f['lat']))
                specs.append((f['lat'], f['lon'], int(min(6500, max(1500, 2 * (d1 if d1 is not None else 3000) + 500)))))
        if far:
            key = 'access_' + hashlib.sha1(repr(specs).encode()).hexdigest()[:10]
            QUERIES[key] = access_query(specs)
            raw_access = fx.overpass(key)
            main_nodes = {n for e in edges for n in e.get('ids', ())}
            extra, access_report = compute_access(raw_access, far, main_nodes)
            edges, names, rinfo = build_roads(roads_major, roads_tert, maritime, extra=extra)
            rinfo.pop('_dropped', None)
    streams, build_id, node_new, order, node_xy, lens, shape_pts = encode_roads(edges, names)
    km = collections.Counter()
    for e in edges:
        km['virtual' if e['flags'] & F_VIRTUAL else CLASS_NAMES[e['cls']] + ('_link' if e['flags'] & F_LINK else '')] += e['len'] / 1000.0
    cls_edges = collections.Counter('virtual' if e['flags'] & F_VIRTUAL else CLASS_NAMES[e['cls']] for e in edges)
    tagged = sum(1 for e in edges if e['flags'] & F_SPEED_TAGGED)
    n_nodes = len(node_new)
    all_pts = [p for e in edges for p in (e['poly'][0], e['poly'][-1])]
    rb = bbox_of(all_pts)
    virt = [e for e in edges if e['flags'] & F_VIRTUAL]
    rinfo.update({'nodes': n_nodes, 'edgesStored': len(edges), 'arcs': sum(1 if e['ow'] else 2 for e in edges), 'shapePoints': shape_pts,
                  'totalKm': round(sum(km.values()), 1), 'kmByClass': {k: round(v, 1) for k, v in sorted(km.items())},
                  'edgesByClass': dict(cls_edges), 'speedTaggedShare': round(tagged / len(edges), 3),
                  'virtualKm': round(sum(e['len'] for e in virt) / 1000.0, 1), 'virtualEdges': len(virt),
                  'accessFacilities': len(access_report), 'accessFailed': [r['id'] for r in access_report if 'failed' in r]})
    loc = Locator(edges, node_xy)
    enc_index = {id(e): i for i, e in enumerate(order)}
    acc_by_id = {r['id']: r for r in access_report}
    for f in facs:
        s = loc.locate(f['lon'], f['lat'], 20000.0)
        f.pop('_d1', None)
        if s:
            f['snap'] = {'edge': enc_index[id(loc.edges[s['edge']])], 'frac': round(s['frac'], 4), 'd': round(s['dist'], 1)}
        r = acc_by_id.get(f['id'])
        if r and 'failed' not in r:
            f.setdefault('flags', []).append('road-access-added-from-osm-local-roads:out%dm,in%dm' % (r['outM'], r['inM']))
        elif r:
            f.setdefault('flags', []).append('no-local-road-access-found-within-%dm' % ACCESS_START_M)
    facs.sort(key=lambda f: (kind_rank_f[f['kind']], f['muni'] or '', f['name']['en'] or f['name']['ar'], f['osm']))
    fcount = collections.Counter(f['kind'] for f in facs)
    snap_d = sorted(f['snap']['d'] for f in facs if 'snap' in f)

    def pct(a, p):
        return a[min(len(a) - 1, int(len(a) * p))] if a else None

    # ------------------------------------------------------------------ official-list matrix
    matrix = build_matrix(facs, [fac_raw, lookup_health, lookup_pf])

    # ------------------------------------------------------------------ write the files
    print('writing ...', file=sys.stderr)
    notice = [ATTRIBUTION, 'Natural Earth (public domain) is used only as a cross-check. Snapshot of %s (OSM database timestamp %s). Built %s by %s.' % (snapshot_date, snapshot_ts, build_date, GENERATOR),
              'HONESTY: this is a MAP SNAPSHOT. Real-time unit positions / availability, traffic and hazard fields are SIMULATED (SIM) elsewhere in MANARA.',
              '999 stays the dispatcher in reality; MANARA is not an official service. Do not edit by hand: rebuild with `python3 %s`.' % GENERATOR]
    proj_js = '''
  // ---- projection helper: local equirectangular around (lat0, lon0), scaled by cos(lat0)  --------------------------------------
  //   x = (lon - lon0) * mPerDegLon   east, metres        y = (lat - lat0) * mPerDegLat   north, metres
  //   mPerDegLat = pi * R / 180 (R = 6371008.8 m), mPerDegLon = mPerDegLat * cos(lat0)
  //   Over Qatar (lat 24.4 .. 26.3) the east-west scale error is below 1 %%, the north-south error is 0; for exact distances use distanceM() (haversine).
  var D2R = Math.PI / 180, R = 6371008.8;
  var P = G.projection = {
    type: 'equirectangular', lon0: %(lon0)s, lat0: %(lat0)s, earthRadiusM: R,
    mPerDegLat: Math.PI * R / 180, mPerDegLon: Math.PI * R / 180 * Math.cos(%(lat0)s * D2R),
    toXY: function (lon, lat) { return [(lon - P.lon0) * P.mPerDegLon, (lat - P.lat0) * P.mPerDegLat]; },
    toLonLat: function (x, y) { return [P.lon0 + x / P.mPerDegLon, P.lat0 + y / P.mPerDegLat]; },
    distanceM: function (lon1, lat1, lon2, lat2) {
      var p1 = lat1 * D2R, p2 = lat2 * D2R, dp = p2 - p1, dl = (lon2 - lon1) * D2R;
      var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    }
  };
  function inRing(lon, lat, ring) {
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // inLand(lon, lat): inside the (simplified, ~%(eps)s m) outline. municipalityAt(lon, lat): municipality id or null (simplified polygons).
  G.inLand = function (lon, lat) {
    var rs = G.outline.rings;
    for (var i = 0; i < rs.length; i++) if (inRing(lon, lat, rs[i])) return true;
    return false;
  };
  G.municipalityAt = function (lon, lat) {
    for (var k = 0; k < G.municipalities.length; k++) {
      var ps = G.municipalities[k].polygons;
      for (var i = 0; i < ps.length; i++) {
        if (!inRing(lon, lat, ps[i][0])) continue;
        var hole = false;
        for (var h = 1; h < ps[i].length; h++) if (inRing(lon, lat, ps[i][h])) { hole = true; break; }
        if (!hole) return G.municipalities[k].id;
      }
    }
    return null;
  };
  G.place = function (id) { for (var i = 0; i < G.places.length; i++) if (G.places[i].id === id) return G.places[i]; return null; };
''' % {'lon0': LON0, 'lat0': LAT0, 'eps': eps_used}
    geo_js = file_header('MANARA - Qatar geography  ->  window.MANARA_QATAR_GEO', notice + [
        'Contents: outline (country + islands), 8 municipalities (land polygons), places, bbox, projection helper.',
        'Coordinates are [lon, lat] in degrees (WGS84), 5 decimals (about 1 m). Classic script, no dependencies; loads from file:// and in Node (vm).']) + \
        '(function (root) {\n  \'use strict\';\n  var G = ' + js_json(geo) + ';\n' + proj_js + '  root.MANARA_QATAR_GEO = G;\n})(' + GLOBAL_EXPR + ');\n'
    n_geo = write_text(os.path.join(args.out, 'qatar-geo.js'), geo_js)

    fmeta = collections.OrderedDict([
        ('attribution', ATTRIBUTION), ('licence', 'ODbL 1.0'), ('snapshotDate', snapshot_date), ('osmBaseTimestamp', snapshot_ts), ('builtOn', build_date), ('generator', GENERATOR),
        ('roadsBuild', build_id),
        ('counts', dict(fcount)), ('total', len(facs)),
        ('hospitalsByEd', dict(collections.Counter(f['ed'] for f in facs if f['kind'] in ('hospital', 'clinic-ed')))),
        ('hospitalsByType', dict(collections.Counter(f.get('facilityType') for f in facs if f['kind'] == 'hospital'))),
        ('policeByRole', dict(collections.Counter(f.get('role') for f in facs if f['kind'] == 'police'))),
        ('snapDistanceM', {'median': pct(snap_d, 0.5), 'p90': pct(snap_d, 0.9), 'max': snap_d[-1] if snap_d else None,
                           'definition': 'straight-line metres from the facility to the nearest point of the shipped road graph; `edge`/`frac` locate that point (edge index of decode(), fraction along from->to)'}),
        ('fields', {'id': 'stable id kind-osmtype+osmid', 'kind': 'hospital | clinic-ed | police | fire | ambulance', 'name': '{ar,en} from OSM tags (empty = not named in OSM)',
                    'lon/lat': 'degrees; ways and relations use the centre OSM reports', 'tags': 'subset of real OSM tag values',
                    'osm': 'OSM element', 'muni': 'municipality id', 'ed': "emergency department: 'yes' | 'no' | 'unknown'", 'edSrc': "'osm-tag' | 'official' | 'osm-tag+official' | null",
                    'facilityType': "hospital | specialist-centre | health-centre | unclear. OSM tags many clinics as amenity=hospital, so this is a NAME heuristic unless typeSrc says the facility is on an official list",
                    'typeSrc': "'name heuristic' | 'official list (...)'",
                    'caps': "capabilities from the HMC emergency-care page only: ed (emergency department), paedED (paediatric emergency centre), trauma1 (Level I trauma centre), obstetric (obstetric/gynaecological emergencies only); never inferred",
                    'role': 'police: station | traffic | department | training | border | unknown (name heuristic); fire: civil-defence-station | civil-defence-hq | fire-station | industrial-fire-station',
                    'snap': '{edge, frac, d} nearest point on the road graph', 'flags': 'data-quality notes'}),
        ('honesty', 'Positions are OSM mapper positions, not surveyed. Unit availability, vehicle positions and ED capacity are NOT in this file (SIM elsewhere). OSM coverage of Qatar is incomplete: see docs/MANARA-DATA.md for the official-list matrix.'),
    ])
    fac_js = file_header('MANARA - Qatar emergency facilities  ->  window.MANARA_QATAR_FACILITIES', notice + [
        'Array of facilities with a .meta property: window.MANARA_QATAR_FACILITIES.meta (counts, snapshot, field guide).',
        'Kinds: hospital, clinic-ed (clinic with emergency=yes), police, fire (Civil Defence / fire stations), ambulance (ambulance points).']) + \
        '(function (root) {\n  \'use strict\';\n  var F = ' + js_json(facs) + ';\n  F.meta = ' + js_json(fmeta) + ';\n  root.MANARA_QATAR_FACILITIES = F;\n})(' + GLOBAL_EXPR + ');\n'
    n_fac = write_text(os.path.join(args.out, 'qatar-facilities.js'), fac_js)

    rmeta = collections.OrderedDict([
        ('attribution', ATTRIBUTION), ('licence', 'ODbL 1.0'), ('snapshotDate', snapshot_date), ('osmBaseTimestamp', snapshot_ts), ('builtOn', build_date), ('generator', GENERATOR),
        ('build', build_id),
        ('scope', 'OSM highway=motorway|trunk|primary|secondary and their _link ramps for the whole of Qatar (inside the territorial boundary, so bridges over water are kept); '
                  'highway=tertiary(_link) only inside the Greater Doha / Al Rayyan box lon %.2f..%.2f, lat %.2f..%.2f. Class "local" holds only (a) the real OSM local roads on the shortest legal access path of each facility that is far from the major graph and (b) flagged VIRTUAL connectors (flag 256, an assumption). No other residential/service roads.' % (URBAN_BOX[0], URBAN_BOX[2], URBAN_BOX[1], URBAN_BOX[3])),
        ('classes', CLASS_NAMES),
        ('flagBits', {'1': 'tunnel / underpass (tunnel=* or covered=yes or layer<0)', '2': 'bridge', '4': 'toll', '8': 'roundabout / circular junction', '16': 'one-way in OSM',
                      '32': '_link ramp', '64': 'speed is the OSM numeric maxspeed (else a class default = ASSUMPTION)', '128': 'access restricted (private/no/permit/customers/delivery)',
                      '256': 'VIRTUAL connector: joins a one-way dead end to a one-way start within 300 m (the real continuation is a minor road outside this extract) - ASSUMPTION, length = 1.3 x straight line, 25 kph'}),
        ('speedAssumptions', {'note': 'free-flow kph used ONLY where OSM has no numeric maxspeed (flag bit 64 unset): ASSUMPTIONS, not Qatari law',
                              'class': DEFAULT_SPEED, 'link': DEFAULT_SPEED_LINK, 'roundabout': DEFAULT_SPEED_ROUNDABOUT}),
        ('connectivity', {'rule': 'only the largest STRONGLY connected component of the directed graph is shipped (every node can reach every other node)',
                          'nodesBefore': rinfo['junctionNodesBefore'], 'nodesKept': rinfo['nodes'], 'strongMainShare': round(rinfo['strongMainShare'], 4),
                          'weakMainShare': round(rinfo['weakMainShare'], 4), 'weakComponents': rinfo['weakComponents'], 'strongComponents': rinfo['strongComponents'],
                          'edgesBefore': rinfo['edgesBefore'], 'edgesKept': rinfo['edgesStored'], 'droppedSelfLoops': rinfo['droppedSelfLoops']}),
        ('counts', {'nodes': rinfo['nodes'], 'edges': rinfo['edgesStored'], 'arcs': rinfo['arcs'], 'shapePoints': rinfo['shapePoints'], 'names': len(names) - 1,
                    'totalKm': rinfo['totalKm'], 'kmByClass': rinfo['kmByClass'], 'edgesByClass': rinfo['edgesByClass'], 'speedTaggedShare': rinfo['speedTaggedShare']}),
        ('bbox', {'lonMin': r5(rb[0]), 'latMin': r5(rb[1]), 'lonMax': r5(rb[2]), 'latMax': r5(rb[3])}),
        ('geometry', 'edge polylines (junction to junction) simplified with Douglas-Peucker to 15 m; node and shape coordinates are integers in 1e-5 degree units (about 1.1 m)'),
        ('limits', 'No turn restrictions, no U-turn bans, no traffic signals, no lane data, no live traffic. Travel time = length / speed (SIM congestion is applied by the consumer).'),
        ('encoding', 'columnar varint streams (symbols A-Za-z0-9-_ : 5 payload bits + 1 continuation bit per symbol, ZigZag for signed values); see decode() in this file'),
    ])
    names_js = js_json(names)
    enc_js = '{\n' + ',\n'.join('    %s: `\n%s\n`' % (k, streams[k]) for k in ('nodes', 'from', 'to', 'len', 'meta', 'speed', 'name', 'nshape', 'shape')) + '\n  }'
    roads_js = file_header('MANARA - Qatar road graph  ->  window.MANARA_QATAR_ROADS', notice + [
        'window.MANARA_QATAR_ROADS = { meta, names, enc, decode() }.  decode() returns the graph as typed arrays (cached after the first call).',
        'Nodes are road junctions / dead ends; edges run junction to junction with a simplified polyline for drawing; one-way roads give one arc, two-way roads two.',
        'Free-flow speeds are OSM maxspeed where tagged, otherwise class defaults marked as ASSUMPTIONS (flag bit 64). Congestion is SIMULATED elsewhere.']) + ROADS_JS % {
        'meta': js_json(rmeta), 'names': names_js, 'enc': enc_js, 'root': GLOBAL_EXPR}
    n_roads = write_text(os.path.join(args.out, 'qatar-roads.js'), roads_js)

    # ------------------------------------------------------------------ credits + report
    report = {
        'snapshotDate': snapshot_date, 'osmBaseTimestamp': snapshot_ts, 'stamps': stamps, 'builtOn': build_date, 'simplifyEpsM': eps_used,
        'files': {'qatar-geo.js': n_geo, 'qatar-facilities.js': n_fac, 'qatar-roads.js': n_roads},
        'geo': {'municipalities': len(muni_out), 'outlinePolygons': len(outline_polys), 'outlineVertices': sum(len(r) for r in outline_polys), 'holes': len(holes),
                'places': len(places), 'placesByKind': dict(collections.Counter(p['kind'] for p in places)), 'droppedPlaces': dict(dropped_places),
                'areaKm2': round(total_area, 1), 'naturalEarthCheck': ne_check, 'anchors': anchors,
                'municipalities_list': [(m['id'], m['name']['en'], m['areaKm2'], sum(len(p[0]) for p in m['polygons'])) for m in muni_out]},
        'roads': rinfo, 'roadsBuild': build_id, 'roadStreamChars': lens,
        'facilities': {'counts': dict(fcount), 'total': len(facs), 'excluded': excluded, 'snap': {'median': pct(snap_d, 0.5), 'p90': pct(snap_d, 0.9), 'max': snap_d[-1] if snap_d else None},
                       'hospitalsByEd': fmeta['hospitalsByEd'], 'hospitalsByType': fmeta['hospitalsByType'], 'policeByRole': fmeta['policeByRole']},
        'matrix': matrix, 'access': access_report, 'queries': collections.OrderedDict((k, v) for k, v in QUERIES.items() if not k.startswith('access_')),
    }
    if args.report:
        with open(args.report, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
    credits = build_credits(report)
    write_text(os.path.join(args.out, 'CREDITS.txt'), credits)
    if args.write_doc:
        write_doc(report, facs)
    total = n_geo + n_fac + n_roads
    print('done in %.1fs: geo %d B, facilities %d B, roads %d B, total %d B' % (time.time() - t0, n_geo, n_fac, n_roads, total), file=sys.stderr)
    print(json.dumps({k: report[k] for k in ('files', 'roads', 'facilities')}, ensure_ascii=False, indent=1, default=str)[:6000])


# placeholders replaced below by the sections that follow
OFFICIAL_ED = {
    # HMC "Emergency Care Services" page (hamad.qa/EN/Hospitals-and-services/Emergency-Care-Services, read on the build date), joined to OSM elements BY HAND
    # after looking at the names and positions. `official` is the name on the HMC page; where the OSM name differs it is said so.
    'way/1049648363': {'official': 'Hamad General Hospital (Trauma and Emergency Center)', 'caps': ['ed', 'trauma1'], 'note': 'OSM names it "Trauma & Emergency"; Level I status from the HMC trauma page'},
    'way/152600871': {'official': 'Al Wakra Hospital', 'caps': ['ed', 'paedED'], 'note': 'ED and Paediatric Emergency Center both on the HMC page'},
    'way/1066574917': {'official': 'The Cuban Hospital', 'caps': ['ed'], 'note': ''},
    'way/994862150': {'official': 'Hazm Mebaireek General Hospital', 'caps': ['ed'], 'note': ''},
    'way/1041351209': {'official': 'Aisha Bint Hamad Al Attiyah Hospital', 'caps': ['ed', 'paedED'], 'note': 'ED and Paediatric Emergency Center both on the HMC page'},
    'relation/14012759': {'official': "Women's Wellness and Research Center", 'caps': ['ed', 'obstetric'], 'note': 'OSM still names it "Hamad Women\'s Hospital"; the HMC page says obstetrics and gynecology emergencies only'},
    'way/137927281': {'official': 'Paediatric Emergency Center - Al Sadd', 'caps': ['paedED'], 'note': 'OSM name "Pediatric Emergency Centre"; position matches the Al Sadd centre'},
    'way/364291093': {'official': 'Paediatric Emergency Center - Al Khor', 'caps': ['paedED'], 'note': 'OSM name "Pediatric Sections - Al Khor Hospital"'},
    'way/156179245': {'official': 'Al Khor Hospital', 'caps': [], 'note': 'listed by HMC as a hospital; only its PAEDIATRIC emergency centre is on the HMC emergency page; the adult ED comes from the OSM tag only'},
}
ROADS_JS = r'''(function (root) {
  'use strict';
  var META = %(meta)s;
  var NAMES = %(names)s;   // [[ar, en, ref], ...]; index 0 = unnamed
  var ENC = %(enc)s;
  var CLASS_NAMES = META.classes;
  var TABLE = (function () {
    var a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', t = new Uint8Array(128), i;
    for (i = 0; i < 64; i++) t[a.charCodeAt(i)] = i;
    return t;
  })();

  // Stream of varints: 6-bit symbols, 5 payload bits (low first) + a continuation bit (32). Signed streams are ZigZag coded.
  function ints(text, signed) {
    var n = text.length, out = new Int32Array(n), k = 0, v = 0, sh = 0, c, i;
    for (i = 0; i < n; i++) {
      c = text.charCodeAt(i);
      if (c < 33) continue;                       // white space between lines
      c = TABLE[c];
      v |= (c & 31) << sh;
      sh += 5;
      if (!(c & 32)) { out[k++] = signed ? ((v >>> 1) ^ -(v & 1)) : v; v = 0; sh = 0; }
    }
    return out.subarray(0, k);
  }

  var D2R = Math.PI / 180, R = 6371008.8, M_LAT = Math.PI * R / 180;
  function distanceM(lon1, lat1, lon2, lat2) {
    var p1 = lat1 * D2R, p2 = lat2 * D2R, dp = p2 - p1, dl = (lon2 - lon1) * D2R;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  var cache = null;

  // decode(): the graph as typed arrays. Cached: the second call is free.
  //   n nodes: lon[], lat[] (Float64Array, degrees)
  //   e stored edges (junction to junction): eFrom[], eTo[], eLen[] (m), eCls[] (index into classNames), eFlags[] (bit field, see meta.flagBits),
  //     eSpeed[] (kph: OSM maxspeed where flag 64 is set, else a class default = ASSUMPTION), eName[] (index into names), eTwoWay[] (0/1),
  //     shapeStart[] + shapeLon[] / shapeLat[] (interior polyline points, ~15 m simplification)
  //   a directed arcs (a forward arc for every edge, plus a reverse arc for every two-way edge):
  //     aEdge[], aFrom[], aTo[], aRev[] (1 = runs against the stored direction), aLen[], aSpeed[], aCls[], aFlags[]
  //     outStart[n+1] + outArc[a]: arcs leaving node u are outArc[outStart[u] .. outStart[u+1])
  function decode() {
    if (cache) return cache;
    var nodes = ints(ENC.nodes, true), n = nodes.length >> 1, i, k;
    var lonI = new Int32Array(n), latI = new Int32Array(n), x = 0, y = 0;
    var lon = new Float64Array(n), lat = new Float64Array(n);
    for (i = 0; i < n; i++) {
      x += nodes[2 * i]; y += nodes[2 * i + 1];
      lonI[i] = x; latI[i] = y; lon[i] = x / 1e5; lat[i] = y / 1e5;
    }
    var from = ints(ENC.from, true), to = ints(ENC.to, true), len = ints(ENC.len, false), meta = ints(ENC.meta, false),
        speed = ints(ENC.speed, false), name = ints(ENC.name, false), nshape = ints(ENC.nshape, false), shape = ints(ENC.shape, true);
    var E = from.length, totalShape = 0;
    for (i = 0; i < E; i++) totalShape += nshape[i];
    var eFrom = new Int32Array(E), eTo = new Int32Array(E), eLen = new Float32Array(E), eCls = new Uint8Array(E), eFlags = new Uint16Array(E),
        eSpeed = new Uint8Array(E), eName = new Uint16Array(E), eTwoWay = new Uint8Array(E), shapeStart = new Int32Array(E + 1),
        shapeLon = new Float64Array(totalShape), shapeLat = new Float64Array(totalShape);
    var seen = 0, a, b, m, sp = 0, sc = 0, px, py, twoWays = 0;
    for (i = 0; i < E; i++) {
      a = seen + from[i]; if (a + 1 > seen) seen = a + 1;
      b = seen + to[i]; if (b + 1 > seen) seen = b + 1;
      m = meta[i];
      eFrom[i] = a; eTo[i] = b; eLen[i] = len[i] / 10;
      eCls[i] = m & 7; eFlags[i] = (m >> 3) & 1023; eTwoWay[i] = (m >> 13) & 1; twoWays += eTwoWay[i];
      eSpeed[i] = speed[i]; eName[i] = name[i];
      shapeStart[i] = sc;
      px = lonI[a]; py = latI[a];
      for (k = 0; k < nshape[i]; k++) {
        px += shape[sp++]; py += shape[sp++];
        shapeLon[sc] = px / 1e5; shapeLat[sc] = py / 1e5; sc++;
      }
    }
    shapeStart[E] = sc;
    var A = E + twoWays;
    var aEdge = new Int32Array(A), aFrom = new Int32Array(A), aTo = new Int32Array(A), aRev = new Uint8Array(A), aLen = new Float32Array(A),
        aSpeed = new Uint8Array(A), aCls = new Uint8Array(A), aFlags = new Uint16Array(A), outStart = new Int32Array(n + 1), outArc = new Int32Array(A);
    var ai = 0, r;
    for (i = 0; i < E; i++) {
      for (r = 0; r < 1 + eTwoWay[i]; r++) {
        aEdge[ai] = i; aRev[ai] = r; aFrom[ai] = r ? eTo[i] : eFrom[i]; aTo[ai] = r ? eFrom[i] : eTo[i];
        aLen[ai] = eLen[i]; aSpeed[ai] = eSpeed[i]; aCls[ai] = eCls[i]; aFlags[ai] = eFlags[i];
        outStart[aFrom[ai] + 1]++;
        ai++;
      }
    }
    for (i = 0; i < n; i++) outStart[i + 1] += outStart[i];
    var fill = outStart.slice(0, n);
    for (i = 0; i < A; i++) outArc[fill[aFrom[i]]++] = i;

    var G = cache = {
      n: n, e: E, a: A, lon: lon, lat: lat,
      eFrom: eFrom, eTo: eTo, eLen: eLen, eCls: eCls, eFlags: eFlags, eSpeed: eSpeed, eName: eName, eTwoWay: eTwoWay,
      shapeStart: shapeStart, shapeLon: shapeLon, shapeLat: shapeLat,
      aEdge: aEdge, aFrom: aFrom, aTo: aTo, aRev: aRev, aLen: aLen, aSpeed: aSpeed, aCls: aCls, aFlags: aFlags, outStart: outStart, outArc: outArc,
      classNames: CLASS_NAMES, names: NAMES, meta: META, distanceM: distanceM
    };

    // polyline(e): [lon0, lat0, lon1, lat1, ...] from the stored 'from' node to the 'to' node, interior points included.
    G.polyline = function (e) {
      var s0 = shapeStart[e], s1 = shapeStart[e + 1], out = new Float64Array(2 * (s1 - s0 + 2)), j = 0, q;
      out[j++] = lon[eFrom[e]]; out[j++] = lat[eFrom[e]];
      for (q = s0; q < s1; q++) { out[j++] = shapeLon[q]; out[j++] = shapeLat[q]; }
      out[j++] = lon[eTo[e]]; out[j++] = lat[eTo[e]];
      return out;
    };

    // ---- spatial index (built on first use): 0.01 degree cells holding edge segments
    var CELL = 0.01, grid = null, segE = null, segK = null;
    function np(e) { return shapeStart[e + 1] - shapeStart[e]; }
    function ptx(e, k) { return k === 0 ? lon[eFrom[e]] : (k === np(e) + 1 ? lon[eTo[e]] : shapeLon[shapeStart[e] + k - 1]); }
    function pty(e, k) { return k === 0 ? lat[eFrom[e]] : (k === np(e) + 1 ? lat[eTo[e]] : shapeLat[shapeStart[e] + k - 1]); }
    function cellKey(cx, cy) { return cx * 65536 + cy; }
    function buildGrid() {
      grid = new Map();
      var se = [], sk = [], e, k, x0, y0, x1, y1, cx, cy, key, arr, id;
      for (e = 0; e < E; e++) {
        for (k = 0; k <= np(e); k++) {
          x0 = ptx(e, k); y0 = pty(e, k); x1 = ptx(e, k + 1); y1 = pty(e, k + 1);
          id = se.length; se.push(e); sk.push(k);
          for (cx = Math.floor(Math.min(x0, x1) / CELL); cx <= Math.floor(Math.max(x0, x1) / CELL); cx++)
            for (cy = Math.floor(Math.min(y0, y1) / CELL); cy <= Math.floor(Math.max(y0, y1) / CELL); cy++) {
              key = cellKey(cx, cy); arr = grid.get(key);
              if (!arr) grid.set(key, arr = []);
              arr.push(id);
            }
        }
      }
      segE = se; segK = sk;
    }

    // locate(lon, lat, maxM): the nearest point on the road network (straight-line distance, local equirectangular metres).
    //   -> { edge, k (segment index inside the edge), dist (m to the road), lon, lat (the point on the road), frac (0..1 along the stored from->to direction),
    //        dFrom, dTo (m along the road to the two end nodes), from, to, twoWay }   or null when nothing is within maxM (default 5000).
    G.locate = function (qlon, qlat, maxM) {
      if (!grid) buildGrid();
      maxM = maxM || 5000;
      var ck = Math.cos(qlat * D2R), best = null, c0x = Math.floor(qlon / CELL), c0y = Math.floor(qlat / CELL), ring, cx, cy, arr, i2, id, e, k,
          ax, ay, bx, by, dx, dy, L, t, d, seenSeg = {}, rings = Math.floor(maxM / 950) + 1;
      for (ring = 0; ring <= rings; ring++) {
        for (cx = c0x - ring; cx <= c0x + ring; cx++) for (cy = c0y - ring; cy <= c0y + ring; cy++) {
          if (Math.max(Math.abs(cx - c0x), Math.abs(cy - c0y)) !== ring) continue;
          arr = grid.get(cellKey(cx, cy));
          if (!arr) continue;
          for (i2 = 0; i2 < arr.length; i2++) {
            id = arr[i2];
            if (seenSeg[id]) continue;
            seenSeg[id] = 1;
            e = segE[id]; k = segK[id];
            ax = (ptx(e, k) - qlon) * M_LAT * ck; ay = (pty(e, k) - qlat) * M_LAT;
            bx = (ptx(e, k + 1) - qlon) * M_LAT * ck; by = (pty(e, k + 1) - qlat) * M_LAT;
            dx = bx - ax; dy = by - ay; L = dx * dx + dy * dy;
            t = L === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L));
            d = Math.sqrt((ax + t * dx) * (ax + t * dx) + (ay + t * dy) * (ay + t * dy));
            if (!best || d < best.dist) best = { edge: e, k: k, t: t, dist: d };
          }
        }
        if (best && best.dist <= ring * 950) break;
      }
      if (!best || best.dist > maxM) return null;
      var e2 = best.edge, cum = 0, along = 0, j, sl;
      for (j = 0; j <= np(e2); j++) {
        sl = distanceM(ptx(e2, j), pty(e2, j), ptx(e2, j + 1), pty(e2, j + 1));
        if (j < best.k) along += sl; else if (j === best.k) along += best.t * sl;
        cum += sl;
      }
      var frac = cum ? along / cum : 0;
      return { edge: e2, k: best.k, dist: best.dist, frac: frac,
               lon: ptx(e2, best.k) + best.t * (ptx(e2, best.k + 1) - ptx(e2, best.k)), lat: pty(e2, best.k) + best.t * (pty(e2, best.k + 1) - pty(e2, best.k)),
               dFrom: frac * eLen[e2], dTo: (1 - frac) * eLen[e2], from: eFrom[e2], to: eTo[e2], twoWay: eTwoWay[e2] === 1 };
    };

    // attach(loc): seed lists for a router. Leaving the located point you can reach the nodes in .out (metres to each);
    // arriving at it you must come from a node in .in. One-way edges give one entry each, two-way edges two.
    G.attach = function (loc) {
      var e = loc.edge, out = [[eTo[e], loc.dTo]], inn = [[eFrom[e], loc.dFrom]];
      if (eTwoWay[e]) { out.push([eFrom[e], loc.dFrom]); inn.push([eTo[e], loc.dTo]); }
      return { out: out, in: inn, access: loc.dist };
    };

    // nearestNode(lon, lat): closest junction node by straight line (grid-free scan over the located edge's end points)
    G.nearestNode = function (qlon, qlat, maxM) {
      var loc = G.locate(qlon, qlat, maxM);
      if (!loc) return null;
      var a2 = distanceM(qlon, qlat, lon[loc.from], lat[loc.from]), b2 = distanceM(qlon, qlat, lon[loc.to], lat[loc.to]);
      return a2 <= b2 ? { node: loc.from, dist: a2 } : { node: loc.to, dist: b2 };
    };
    return G;
  }

  root.MANARA_QATAR_ROADS = { meta: META, names: NAMES, classNames: CLASS_NAMES, enc: ENC, decode: decode };
})(%(root)s);
'''


HMC_PAGE = 'https://hamad.qa/EN/Hospitals-and-services/Pages/default.aspx'
HMC_ED = 'https://hamad.qa/EN/Hospitals-and-services/Emergency-Care-Services'
PRIV = 'https://www.dohaguides.com/hospitals-in-qatar'
PHCC_SRC = 'The Peninsula 17 Feb 2026 / marhaba.qa / QNA 4 Mar 2026 (27 of the 31 PHCC centres are named)'
CD_SRC = 'The Peninsula 28 Feb 2021: "Currently we have 23 centres ... Doha sector 11, South 6, Northern 6"; Qatar Tribune 21 Dec 2017: "from the current 20"'
POLICE_SRC = 'Qatar Tribune 13 Dec 2016 (Onaiza was the fifth station under the Capital Police Department: Capital, Madina Khalifa, Messaimer, Al Sadd, Onaiza)'

# (group, official name, regex over the OSM names (None = none), verified OSM ids (hand-checked name AND position) or [], source, note)
OFFICIAL_ROWS = [
    # --- HMC hospitals and key facilities: the 19 entries of the HMC "Hospitals and Key Facilities" listing
    ('HMC hospitals and key facilities', 'Ambulatory Care Center', r'Ambulatory', [], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'Bone and Joint Center', r'Bone (&|and) Joint', ['way/322817060'], HMC_PAGE, 'OSM "Bone & Joint Centre", position not verified against HMC'),
    ('HMC hospitals and key facilities', 'Communicable Disease Center', r'Communicable', [], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'Enaya and Daam', r'Enaya|Daam', [], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'Hamad Dental Center', r'Hamad.*Dental|Dental.*Hamad', [], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'Hamad General Hospital', None, ['way/1049648363', 'way/238026555'], HMC_PAGE,
     'NAME DIFFERS: OSM maps the "Trauma & Emergency" centre and the "Hamad Medical City" campus, there is no feature called Hamad General Hospital'),
    ('HMC hospitals and key facilities', 'Hazm Mebaireek General Hospital', None, ['way/994862150'], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'Heart Hospital', None, ['relation/13341823'], HMC_PAGE, 'OSM "HMC Heart Hospital"'),
    ('HMC hospitals and key facilities', 'Medical Care and Research Center', r'Medical Care and Research', [], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'National Center for Cancer Care and Research', None, ['relation/13338453'], HMC_PAGE, 'NAME DIFFERS: OSM "NCCCR (Al Amal Hospital)"'),
    ('HMC hospitals and key facilities', 'Qatar Rehabilitation Institute', r'Rehabilitation Institute', ['way/155156322'], HMC_PAGE,
     'in OSM as healthcare=rehabilitation (no amenity=hospital): not a dispatch candidate, so not in the dataset'),
    ('HMC hospitals and key facilities', 'Rumailah Hospital', None, ['relation/13367284'], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', "Women's Wellness and Research Center", None, ['relation/14012759'], HMC_PAGE,
     'NAME DIFFERS: OSM still says "Hamad Women\'s Hospital"; HMC lists the Women\'s Wellness and Research Center'),
    ('HMC hospitals and key facilities', 'Al Wakra Hospital', None, ['way/152600871'], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'Al Maha Specialized Care Center', r'Maha.*(Special|Care Cent)', [], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'Mesaieed General Hospital', None, ['way/1153638783'], HMC_PAGE, 'OSM "Mesaieed Hospital"'),
    ('HMC hospitals and key facilities', 'Al Khor Hospital', None, ['way/156179245'], HMC_PAGE, 'OSM "Al Khor Hamad Hospital"'),
    ('HMC hospitals and key facilities', 'Aisha Bint Hamad Al Attiyah Hospital', None, ['way/1041351209'], HMC_PAGE, ''),
    ('HMC hospitals and key facilities', 'The Cuban Hospital', None, ['way/1066574917'], HMC_PAGE, ''),
    # --- HMC Paediatric Emergency Centers (the six on the HMC emergency page; EDs are rows above)
    ('HMC Paediatric Emergency Centers', 'Al Sadd', None, ['way/137927281'], HMC_ED, 'OSM "Pediatric Emergency Centre"; position matches Al Sadd'),
    ('HMC Paediatric Emergency Centers', 'Airport', r'(Pediatric|Paediatric).*Airport|Airport.*(Pediatric|Paediatric)', [], HMC_ED, ''),
    ('HMC Paediatric Emergency Centers', 'Al Rayyan', r'(Pediatric|Paediatric).*Rayyan|Rayyan.*(Pediatric|Paediatric)', [], HMC_ED, ''),
    ('HMC Paediatric Emergency Centers', 'Al Khor', None, ['way/364291093'], HMC_ED, 'OSM "Pediatric Sections - Al Khor Hospital"'),
    ('HMC Paediatric Emergency Centers', 'Aisha Bint Hamad Al Attiyah Hospital', None, ['way/1041351209'], HMC_ED, 'inside the hospital feature (no separate OSM feature)'),
    ('HMC Paediatric Emergency Centers', 'Al Wakra Hospital', None, ['way/152600871'], HMC_ED, 'inside the hospital feature (no separate OSM feature)'),
    # --- private hospitals (a directory page, secondary source)
    ('Private hospitals (directory, secondary)', 'Al-Ahli Hospital', None, ['way/247909086'], PRIV, ''),
    ('Private hospitals (directory, secondary)', 'Al Emadi Hospital', None, ['relation/13341978'], PRIV, ''),
    ('Private hospitals (directory, secondary)', 'Alfardan Medical with Northwestern Medicine', None, ['way/684481192'], PRIV, ''),
    ('Private hospitals (directory, secondary)', 'Aman Hospital', r'Aman Hospital', [], PRIV, ''),
    ('Private hospitals (directory, secondary)', 'Aster Hospital', r'Aster Hospital', [], PRIV, 'OSM has only "Aster Medical Centre" (a different, smaller facility)'),
    ('Private hospitals (directory, secondary)', 'Doha Clinic Hospital', None, ['relation/13344807'], PRIV, ''),
    ('Private hospitals (directory, secondary)', 'Turkish Hospital', r'Turkish', [], PRIV, ''),
    ('Private hospitals (directory, secondary)', 'The View Hospital', None, ['node/11886181269'], PRIV, 'two OSM nodes at the same spot (merged)'),
    ('Private hospitals (directory, secondary)', 'Aspetar', r'Aspetar', [], PRIV, ''),
    ('Private hospitals (directory, secondary)', 'Sidra Medicine', None, ['relation/10720904'], PRIV, ''),
    # --- Ministry of Interior police
    ('Police (MoI): no official station list found', 'Capital Police Station', None, ['way/485014418'], POLICE_SRC, ''),
    ('Police (MoI): no official station list found', 'Madinat Khalifa Police Station', None, ['node/4305565689'], POLICE_SRC, ''),
    ('Police (MoI): no official station list found', 'Mesaimeer Police Station', None, ['way/489633408'], POLICE_SRC, ''),
    ('Police (MoI): no official station list found', 'Al Sadd Police Station', None, ['node/8880619819'], POLICE_SRC, ''),
    ('Police (MoI): no official station list found', 'Onaiza Police Station', r'Onaiza|Unaiza|عنيزة', [], POLICE_SRC, 'a police-tagged feature must carry the name'),
    # --- Civil Defence: stations named in the press (the official count is 23, no list of names was found)
    ('Civil Defence (MoI): count 23, no official list of names found', 'Wadi Al Sail (headquarters complex incl. a fire station)', None, ['way/221983389'], 'Gulf Times 2012 (new Civil Defence HQ)', 'OSM "Wadi Al- Sali Civil Defense"; the directorate office is way/490727316'),
    ('Civil Defence (MoI): count 23, no official list of names found', 'The Pearl-Qatar', None, ['way/489605874'], 'Gulf Times (new GDCD branch at The Pearl)', ''),
    ('Civil Defence (MoI): count 23, no official list of names found', 'Al Khor', None, ['way/224760573'], 'The Peninsula 22 Sep 2014 (mock drills)', ''),
    ('Civil Defence (MoI): count 23, no official list of names found', 'Mesaieed', None, ['way/1153634454'], 'The Peninsula 22 Sep 2014 (mock drills)', ''),
    ('Civil Defence (MoI): count 23, no official list of names found', 'Al Wakra', None, ['way/492127496'], 'The Peninsula 22 Sep 2014 (mock drills)',
     'UNNAMED in OSM: an unnamed fire_station on the same compound as the Al Wakra Police Station; identified by position only, not verified'),
    ('Civil Defence (MoI): count 23, no official list of names found', 'Al Thumama', r'Thumama|ثمامة', [], 'Gulf Times (new centre at Al Thumama)', ''),
] + [
    ('PHCC health centres (informational, not EDs)', n, rx, ids, PHCC_SRC, note) for n, rx, ids, note in [
        ('Al Wakra', r'Wakra (Health|Healthcare)', [], ''), ('South Wakra', r'South Wakra', [], ''), ('Al Mashaf', r'Mashaf', [], ''), ('Al Thumama', r'Thumama', [], ''),
        ('Airport', r'Airport (road )?(Health|Healthcare)', [], 'POSSIBLE match only (OSM "Airport road health center", amenity=clinic): not verified'), ('Umm Ghuwailina', r'Ghuwailina|Ghuwailina', [], ''), ('Omar Bin Al Khattab', r'Omar Bin Al Khattab|Omar Ibn', [], ''),
        ('Rawdat Al Khail', r'Rawdat Al Khail', [], ''), ('Al Sadd', r'Sadd (Health|Healthcare)', [], ''), ('West Bay', r'West Bay Health', [], ''),
        ('Al Sheehaniya', r'Sheehaniya|Shahaniya (Health|Healthcare)', [], ''), ('Al Wajbah', r'Wajba', ['node/7706804985'], 'NAME DIFFERS: OSM "Wajba hospital"'),
        ('Muaither', r'Muaither|Muaither', [], ''), ('Al Khor', r'Khor (Primary )?Health', ['node/2323452366'], 'OSM "Al Khor Primary Health Clinic" (emergency=no)'),
        ('Abu Nakhla', r'Abu Nakhla', [], ''), ('Mesaimeer', r'Mesaimeer (Health|Healthcare)', [], ''), ('Al Waab', r'Waab', [], ''),
        ('Abu Baker Al Siddiq', r'Abu Bak', ['node/8401380019'], 'NAME DIFFERS: OSM "Abu bakar siddiq hospital bu sidra"'), ('Al Rayyan', r'Rayyan (Health|Healthcare)', [], ''),
        ('Umm Al Seneem', r'Seneem', [], ''), ('Al Ruwais', r'Ruwais (Health|Healthcare)', [], ''), ('Leabaib', r'Leabaib|Lebaib|Lejbailat', [], ''),
        ('Al Daayen', r'Daayen (Health|Healthcare)', ['node/3538299723'], ''), ('Umm Slal', r'Um Slal|Umm Salal.*(Health|Healthcare)|أم صلال', [], ''),
        ('Madinat Khalifa', r'Madinat Khalifa Health', [], ''), ('Qatar University', r'Qatar University.*(Health|Clinic)', [], ''), ('Gharrafat Al Rayyan', r'Gharrafa|\u063a\u0631\u0627\u0641\u0629', [], ''),
    ]]


OFFICIAL_HOSPITAL_TYPE = {}
for _g, _name, _rx, _ids, _src, _note in OFFICIAL_ROWS:
    if _g.startswith(('HMC hospitals', 'Private hospitals')):
        for _i in _ids:
            OFFICIAL_HOSPITAL_TYPE[_i] = 'specialist-centre' if re.search(r'Bone and Joint|Rehabilitation', _name) else 'hospital'


def build_matrix(facs, raws):
    """Official names -> OSM features. status: MATCHED | MATCHED, NAME DIFFERS | IN OSM, NOT IN DATASET | MISSING."""
    U = {}
    for raw in raws:
        for e in raw['elements']:
            U['%s/%d' % (e['type'], e['id'])] = e
    ds = {}
    for f in facs:
        ds[f['osm']] = f['id']
        for fl in f.get('flags', []):
            if fl.startswith('merged-duplicates:'):
                for a in fl.split(':', 1)[1].split(','):
                    ds[a] = f['id']

    def blob(e):
        t = e.get('tags', {})
        return ' | '.join(t.get(k, '') for k in ('name', 'name:en', 'name:ar', 'alt_name', 'official_name', 'short_name', 'old_name'))

    def relevant(e):
        t = e.get('tags', {})
        return (t.get('amenity') in ('hospital', 'clinic', 'doctors', 'police', 'fire_station') or t.get('healthcare') in ('hospital', 'clinic', 'centre', 'doctor', 'rehabilitation')
                or t.get('emergency') in ('ambulance_station', 'fire_station', 'rescue_station') or t.get('office') in ('government', 'police')
                or t.get('building') in ('hospital', 'clinic'))
    rows = []
    for group, official, rx, ids, src, note in OFFICIAL_ROWS:
        osm, dsets = [], []
        if ids:
            for i in ids:
                if i not in U:
                    raise RuntimeError('matrix: hand-verified id %s (%s) is not in the downloaded data' % (i, official))
                osm.append(i)
                if i in ds:
                    dsets.append(ds[i])
        elif rx:
            r = re.compile(rx, re.I)
            for i, e in U.items():
                if relevant(e) and r.search(blob(e)):
                    osm.append(i)
                    if i in ds:
                        dsets.append(ds[i])
            osm = osm[:6]
        if osm and dsets:
            status = 'MATCHED, NAME DIFFERS' if note.startswith('NAME DIFFERS') else 'MATCHED'
        elif osm:
            status = 'IN OSM, NOT IN DATASET'
        else:
            status = 'MISSING'
        names = [(U[i].get('tags', {}).get('name:en') or U[i].get('tags', {}).get('name') or '') for i in osm]
        tagtxt = []
        for i in osm:
            t = U[i].get('tags', {})
            tagtxt.append(';'.join('%s=%s' % (k, t[k]) for k in ('amenity', 'healthcare', 'emergency', 'building', 'office') if k in t))
        rows.append({'group': group, 'official': official, 'source': src, 'status': status, 'osm': osm, 'osmNames': names, 'osmTags': tagtxt,
                     'dataset': sorted(set(dsets)), 'note': note})
    return rows


def fmt_n(n):
    return '{:,}'.format(n)


def md_table(headers, rows):
    out = ['| ' + ' | '.join(headers) + ' |', '|' + '|'.join(['---'] * len(headers)) + '|']
    for r in rows:
        out.append('| ' + ' | '.join(str(c).replace('|', '/').replace('\n', ' ') for c in r) + ' |')
    return '\n'.join(out)


def build_credits(report):
    g, r, f = report['geo'], report['roads'], report['facilities']
    files = report['files']
    total = sum(files.values())
    lines = [
        'MANARA («منارة») - data credits, licences and provenance   (site/manara/data)',
        '=' * 78,
        '',
        ATTRIBUTION,
        '',
        'This folder is a SNAPSHOT of public map data, bundled so the pages work offline.',
        'It is a map, not a live feed: unit positions and availability, traffic and hazard fields are SIMULATED (SIM) elsewhere in MANARA.',
        '999 stays the dispatcher in reality; MANARA is not an official service and does not call or replace 999.',
        '',
        'SOURCES AND LICENCES',
        '  OpenStreetMap (c) OpenStreetMap contributors - Open Database Licence (ODbL) 1.0, https://www.openstreetmap.org/copyright',
        '      municipality boundaries, outline, places, facilities, roads. Extracted through the overpass.openstreetmap.fr mirror.',
        '      The files in this folder are a Derived Database / Produced Work of OSM data: keep the attribution above, and share any',
        '      further derived database under ODbL. Facilities and roads keep their OSM ids so every record can be traced back.',
        '  Natural Earth 10m admin-0 countries - public domain, https://www.naturalearthdata.com  (cross-check of the outline only,',
        '      shipped as outlineNaturalEarth in qatar-geo.js).',
        '  Official lists used to CHECK completeness (names only, no coordinates taken from them): Hamad Medical Corporation',
        '      (hamad.qa), PHCC / Ministry of Interior press reports quoted in docs/MANARA-DATA.md with their URLs and dates.',
        '',
        'SNAPSHOT',
        '  OSM database timestamp: %s    built on: %s' % (report['osmBaseTimestamp'], report['builtOn']),
        '  Rebuild: python3 tools/manara/build-qatar-data.py --cache <dir outside the repo> [--refresh] [--write-doc]',
        '  The exact Overpass queries are in docs/MANARA-DATA.md and in QUERIES in tools/manara/build-qatar-data.py.',
        '',
        'COUNTS',
        '  qatar-geo.js         %d municipalities, %d outline polygons (%d vertices), %d places, area %.0f km2 computed from the OSM polygons'
        % (g['municipalities'], g['outlinePolygons'], g['outlineVertices'], g['places'], g['areaKm2']),
        '  qatar-facilities.js  %d facilities: %s' % (f['total'], ', '.join('%s %d' % (k, v) for k, v in sorted(f['counts'].items()))),
        '  qatar-roads.js       %d nodes, %d edges (%d arcs), %.0f km of road; %d virtual connectors (%.0f km), %d local access edges'
        % (r['nodes'], r['edgesStored'], r['arcs'], r['totalKm'], r['virtualEdges'], r['virtualKm'], r['edgesByClass'].get('local', 0)),
        '',
        'FILE SIZES of the three scripts (budget for all four files, CREDITS.txt included: 4.5 MB)',
        '  qatar-geo.js %s B, qatar-facilities.js %s B, qatar-roads.js %s B, total %s B' % (fmt_n(files['qatar-geo.js']), fmt_n(files['qatar-facilities.js']), fmt_n(files['qatar-roads.js']), fmt_n(total)),
        '',
        'KNOWN GAPS AND FLAGS (details and the official-vs-OSM matrix: docs/MANARA-DATA.md)',
        '  - OSM coverage of Qatar is incomplete; the matrix lists what the official lists name and OSM does not have (MISSING).',
        '  - Many OSM clinics are tagged amenity=hospital: facilityType is a NAME heuristic; ed (emergency department) is yes only from an OSM',
        '    emergency=yes tag or the HMC emergency-care page, otherwise unknown. No bed or ED capacity is shipped.',
        '  - Road speeds are OSM maxspeed where tagged (%.0f %% of edges) and otherwise class defaults that are ASSUMPTIONS.' % (100 * r['speedTaggedShare']),
        '  - %d one-way dead ends were joined to nearby one-way starts by flagged VIRTUAL connectors (assumption); no turn restrictions.' % r['virtualEdges'],
        '  - Facility positions are mapper positions; the road snap distance of every facility is in its .snap.d (metres).',
        '  - Hawar Islands (Bahrain) are not part of the outline.',
        '',
        'OVERPASS QUERIES (verbatim; POST to https://overpass.openstreetmap.fr/api/interpreter as the form field "data";',
        '  User-Agent "manara-student-project/1.0 (competition prototype)"; one request at a time, with pauses)',
        '  Besides these, one "around" query per facility that is far from the major roads fetches the local roads for its access path (access_query()).',
        '',
    ]
    for name, q in report['queries'].items():
        lines.append('--- %s' % name)
        lines.extend('    ' + ln for ln in q.rstrip('\n').split('\n'))
        lines.append('')
    return '\n'.join(lines)


def generated_blocks(report, facs):
    g, r, f = report['geo'], report['roads'], report['facilities']
    files = report['files']
    total = sum(files.values())
    B = collections.OrderedDict()
    B['counts'] = md_table(['Layer', 'Count', 'Detail'], [
        ['Municipalities', g['municipalities'], '; '.join('%s %.0f km2' % (m[1], m[2]) for m in g['municipalities_list'])],
        ['Outline polygons', g['outlinePolygons'], '%s vertices after %d m simplification, area %.0f km2 (computed)' % (fmt_n(g['outlineVertices']), report['simplifyEpsM'], g['areaKm2'])],
        ['Places', g['places'], ', '.join('%s %d' % (k, v) for k, v in sorted(g['placesByKind'].items(), key=lambda kv: -kv[1]))],
        ['Facilities', f['total'], ', '.join('%s %d' % (k, v) for k, v in sorted(f['counts'].items()))],
        ['Road nodes', fmt_n(r['nodes']), 'junctions and dead ends'],
        ['Road edges / arcs', '%s / %s' % (fmt_n(r['edgesStored']), fmt_n(r['arcs'])), '%.0f km; %s' % (r['totalKm'], ', '.join('%s %.0f km' % (k, v) for k, v in sorted(r['kmByClass'].items())))],
        ['Virtual connectors', r['virtualEdges'], '%.0f km, flag 256 (assumption, see below)' % r['virtualKm']],
        ['Local access edges', r['edgesByClass'].get('local', 0), 'class "local": real OSM roads that connect %d far-from-road facilities to the graph' % r['accessFacilities']],
    ]) + '\n\n' + md_table(['File', 'Bytes', 'Share of the 4.5 MB budget'], [
        ['qatar-geo.js', fmt_n(files['qatar-geo.js']), '%.1f %%' % (100 * files['qatar-geo.js'] / 4.5e6)],
        ['qatar-facilities.js', fmt_n(files['qatar-facilities.js']), '%.1f %%' % (100 * files['qatar-facilities.js'] / 4.5e6)],
        ['qatar-roads.js', fmt_n(files['qatar-roads.js']), '%.1f %%' % (100 * files['qatar-roads.js'] / 4.5e6)],
        ['**total**', '**%s**' % fmt_n(total), '**%.1f %%**' % (100 * total / 4.5e6)],
    ])
    B['snapshot'] = 'OSM database timestamp `%s`, built on `%s`, simplification tolerance %d m.' % (report['osmBaseTimestamp'], report['builtOn'], report['simplifyEpsM'])
    ne = g['naturalEarthCheck']
    B['naturalearth'] = md_table(['Check', 'Value'], [
        ['Natural Earth vertices (Qatar)', ne['neVertices']], ['Natural Earth area', '%s km2' % ne['neAreaKm2']],
        ['OSM mainland polygon area', '%s km2 (%+.2f %% vs Natural Earth)' % (ne['osmPeninsulaAreaKm2'], ne['areaDiffPct'])],
        ['Distance of Natural Earth vertices to the OSM outline', 'median %d m, 90th percentile %d m, max %d m' % (ne['neVertexToOutlineMedianM'], ne['neVertexToOutlineP90M'], ne['neVertexToOutlineMaxM'])],
    ])
    B['roads'] = md_table(['Measure', 'Value'], [
        ['Junction nodes before the connectivity step', fmt_n(r['junctionNodesBefore'])],
        ['Virtual connectors added (one-way dead end to nearby one-way start / pocket to main)', '%d (%.0f km)' % (r['virtualEdges'], r['virtualKm'])],
        ['Share of nodes in the largest strongly connected component', '%.3f %%' % (100 * r['strongMainShare'])],
        ['Share of nodes in the largest weakly connected component', '%.3f %%' % (100 * r['weakMainShare'])],
        ['Nodes / edges dropped (outside the main component)', '%d / %d' % (r['droppedNodes'], r['droppedEdges'])],
        ['Edges with a numeric OSM maxspeed', '%.1f %%' % (100 * r['speedTaggedShare'])],
        ['Facilities given a real local-road access path', '%d (failed: %s)' % (r['accessFacilities'] - len(r['accessFailed']), ', '.join(r['accessFailed']) or 'none')],
    ])
    sn = f['snap']
    B['snap'] = 'Distance from every facility to the nearest point of the shipped road graph: median **%.0f m**, 90th percentile **%.0f m**, maximum **%.0f m**.' % (sn['median'], sn['p90'], sn['max'])
    # matrix
    groups = collections.OrderedDict()
    for row in report['matrix']:
        groups.setdefault(row['group'], []).append(row)
    summ = []
    for gname, rows in groups.items():
        c = collections.Counter(x['status'] for x in rows)
        summ.append([gname, len(rows), c['MATCHED'], c['MATCHED, NAME DIFFERS'], c['IN OSM, NOT IN DATASET'], c['MISSING']])
    tot = collections.Counter(x['status'] for x in report['matrix'])
    summ.append(['**all**', len(report['matrix']), tot['MATCHED'], tot['MATCHED, NAME DIFFERS'], tot['IN OSM, NOT IN DATASET'], tot['MISSING']])
    B['matrixsummary'] = md_table(['Group', 'Official entries', 'Matched', 'Matched, name differs', 'In OSM, not in dataset', 'MISSING'], summ)
    parts = []
    for gname, rows in groups.items():
        parts.append('#### %s\n\nSource: %s\n\n' % (gname, rows[0]['source'] if len({x['source'] for x in rows}) == 1 else 'see the Source column') + md_table(
            ['Official name', 'Status', 'OSM feature(s)', 'Dataset id', 'Note'] + ([] if len({x['source'] for x in rows}) == 1 else ['Source']),
            [[x['official'], x['status'], ', '.join('%s (%s%s)' % (o, n or 'unnamed', (', ' + t) if t and x['status'].startswith('IN OSM') else '') for o, n, t in zip(x['osm'], x['osmNames'], x['osmTags'])) or '-',
              ', '.join(x['dataset']) or '-', x['note']] + ([] if len({y['source'] for y in rows}) == 1 else [x['source']]) for x in rows]))
    B['matrix'] = '\n\n'.join(parts)
    # facilities
    muni = collections.OrderedDict()
    for fa in facs:
        muni.setdefault(fa['muni'] or 'outside', collections.Counter())[fa['kind']] += 1
    kinds = ['hospital', 'clinic-ed', 'fire', 'police', 'ambulance']
    B['bymuni'] = md_table(['Municipality'] + kinds, [[k] + [muni[k][x] for x in kinds] for k in muni])
    ed_rows = [[fa['name']['en'] or fa['name']['ar'] or '(unnamed)', fa['id'], fa['muni'] or '', fa.get('facilityType', ''), fa['ed'], fa['edSrc'] or '', ','.join(fa.get('caps', []))]
               for fa in facs if fa['kind'] in ('hospital', 'clinic-ed') and fa['ed'] == 'yes']
    B['edlist'] = md_table(['Name (OSM)', 'Dataset id', 'Municipality', 'Type (name heuristic)', 'ED', 'Source', 'Official capabilities'], ed_rows)
    B['excluded'] = md_table(['OSM element', 'Name', 'Reason'], [[x[0], x[1] or '(unnamed)', x[2]] for x in f['excluded']])
    qs = []
    for k, q in report['queries'].items():
        qs.append('**%s**\n\n```\n%s```' % (k, q))
    B['queries'] = '\n\n'.join(qs)
    return B


def write_doc(report, facs):
    if not os.path.exists(DOC_PATH):
        raise RuntimeError('docs/MANARA-DATA.md must exist (it holds the narrative and the BEGIN/END GENERATED markers)')
    text = open(DOC_PATH, encoding='utf-8').read()
    for name, content in generated_blocks(report, facs).items():
        pat = re.compile(r'<!-- BEGIN GENERATED: %s -->.*?<!-- END GENERATED: %s -->' % (name, name), re.S)
        if not pat.search(text):
            raise RuntimeError('marker block %s missing in docs/MANARA-DATA.md' % name)
        text = pat.sub(lambda m: '<!-- BEGIN GENERATED: %s -->\n%s\n<!-- END GENERATED: %s -->' % (name, content, name), text)
    write_text(DOC_PATH, text)


if __name__ == '__main__':
    main()
