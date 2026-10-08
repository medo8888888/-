# MANARA — the bundled Qatar dataset (`site/manara/data/`)

User requirement (verbatim): **"I wnat it on the whole of Qatar"**. MANARA is a Qatar-wide platform, so the national layer
(`docs/MANARA-SPEC.md`, "Scope: the whole of Qatar") needs **real Qatar geography**: the real outline and municipalities, real
hospitals / emergency departments, police stations and Civil Defence fire stations, and the real major-road network. Everything that
*moves* (traffic, unit availability and positions, hazard fields) is **simulated (SIM)** by the engine, on top of this static map.

> Contains data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
> Natural Earth (public domain) is used only as an independent cross-check of the outline.

This file is hand-written narrative plus tables between `<!-- BEGIN GENERATED: … -->` markers that the build script rewrites
(`--write-doc`). Do not edit the generated blocks by hand.

## 1. What is in the folder

| File | Global | What |
|---|---|---|
| `data/qatar-geo.js` | `window.MANARA_QATAR_GEO` | outline (mainland + islands), the 8 municipalities as land polygons, places, bbox, **projection helper** |
| `data/qatar-facilities.js` | `window.MANARA_QATAR_FACILITIES` | array of hospitals / EDs, police, Civil Defence fire stations, ambulance points; `.meta` holds counts and the field guide |
| `data/qatar-roads.js` | `window.MANARA_QATAR_ROADS` | compact routable road graph + `decode()` (typed arrays) + `locate()` / `attach()` / `nearestNode()` |
| `data/CREDITS.txt` | — | attribution, licences, snapshot, counts, known gaps |
| `tools/manara/build-qatar-data.py` | — | the build script (Python 3 standard library only) |
| `tools/manara/test-qatar-data.mjs` | — | the test (Node, loads the three scripts with `vm`) |

Classic scripts only (an IIFE that assigns to `globalThis`), no `fetch`, no libraries. They load from `file://` and in Node:

```js
const ctx = vm.createContext({});
for (const f of ['qatar-geo.js', 'qatar-facilities.js', 'qatar-roads.js']) vm.runInContext(fs.readFileSync('site/manara/data/' + f, 'utf8'), ctx);
const GEO = ctx.MANARA_QATAR_GEO, FAC = ctx.MANARA_QATAR_FACILITIES, G = ctx.MANARA_QATAR_ROADS.decode();
```

In a page: `<script src="data/qatar-geo.js" defer></script>` and so on; the three scripts are independent of each other and of `core.js`.

## 2. Counts, sizes, snapshot (generated)

<!-- BEGIN GENERATED: snapshot -->
OSM database timestamp `2026-10-08T13:13:36Z`, built on `2026-10-08`, simplification tolerance 100 m.
<!-- END GENERATED: snapshot -->

<!-- BEGIN GENERATED: counts -->
| Layer | Count | Detail |
|---|---|---|
| Municipalities | 8 | Doha 211 km2; Al Rayyan 2449 km2; Al Wakrah 2545 km2; Al Khor and Al Thakhira 1618 km2; Ash Shamal 868 km2; Umm Salal 319 km2; Al-Daayen 280 km2; Al Shahaniya 3317 km2 |
| Outline polygons | 36 | 1,951 vertices after 100 m simplification, area 11610 km2 (computed) |
| Places | 135 | suburb 66, village 19, town 12, hamlet 10, industrial 7, quarter 5, municipality-centre 4, neighbourhood 4, city 3, airport 2, island 2, locality 1 |
| Facilities | 138 | ambulance 3, clinic-ed 1, fire 21, hospital 72, police 41 |
| Road nodes | 23,135 | junctions and dead ends |
| Road edges / arcs | 32,136 / 33,607 | 6116 km; local 70 km, local_link 0 km, motorway 1069 km, motorway_link 736 km, primary 573 km, primary_link 175 km, secondary 1292 km, secondary_link 183 km, tertiary 1127 km, tertiary_link 93 km, trunk 427 km, trunk_link 242 km, virtual 129 km |
| Virtual connectors | 1259 | 129 km, flag 256 (assumption, see below) |
| Local access edges | 1133 | class "local": real OSM roads that connect 28 far-from-road facilities to the graph |

| File | Bytes | Share of the 4.5 MB budget |
|---|---|---|
| qatar-geo.js | 120,106 | 2.7 % |
| qatar-facilities.js | 59,060 | 1.3 % |
| qatar-roads.js | 513,208 | 11.4 % |
| **total** | **692,374** | **15.4 %** |
<!-- END GENERATED: counts -->

Budget: the four files together stay under **4.5 MB** (gzip is not available at runtime); loading each script in Node `vm` takes a few
milliseconds and `decode()` a few tens of milliseconds (both asserted < 400 ms by the test).

## 3. Sources, licences, honesty

| Source | Licence | Used for |
|---|---|---|
| **OpenStreetMap**, via the `overpass.openstreetmap.fr` mirror (the main Overpass instance and Geofabrik are blocked from the build sandbox) | ODbL 1.0, attribution above | municipality boundaries (OSM relation 305095 and its 8 `admin_level=4` sub-areas), places, facilities, roads |
| **Natural Earth** 10m admin-0 countries (`raw.githubusercontent.com/nvkelso/natural-earth-vector`) | public domain | cross-check of the outline only (`outlineNaturalEarth`) |
| Official lists (names only, no coordinates): Hamad Medical Corporation (`hamad.qa`), a private-hospital directory, press reports on PHCC, police and Civil Defence | quoted with URL and date in §6 | checking **completeness** of the OSM facility layer |

The three data files are a *Derived Database / Produced Work* of OSM: keep the attribution text, and share any further derived database
under ODbL. Every facility keeps its `osm` id, and every road edge stays traceable to OSM through the build script. The extract was taken
on the snapshot date above through requests sent with the User-Agent `manara-student-project/1.0 (competition prototype)`, one at a time,
with pauses; raw responses are cached **outside** the repository.

**What is real and what is simulated.** Real (a snapshot of a public map): outline, municipalities, places, positions of facilities as
mapped by OSM contributors, the road network and its tags. **Simulated (SIM), not in these files:** where any vehicle is, whether a unit is
busy, traffic and congestion, closures, hazard fields, ED capacity. **999 stays the dispatcher in reality; MANARA is not an official
service.** There are no invented coordinates, facilities, capacities or statistics: anything unverifiable is flagged.

## 4. Geography (`qatar-geo.js`)

* **Outline.** The Natural Earth 10m outline of Qatar has only 240 vertices (about 2 km apart) and omits the islands, which is too coarse to
  place coastal facilities (Lusail, The Pearl, Ras Laffan). The shipped outline is therefore built from OSM: the OSM municipality polygons
  share more than 96 % of their nodes with `natural=coastline` and with the Qatar–Saudi land border, so the outline is the set of edges used
  by exactly **one** municipality (shared borders cancel out). The cross-check against Natural Earth:

<!-- BEGIN GENERATED: naturalearth -->
| Check | Value |
|---|---|
| Natural Earth vertices (Qatar) | 240 |
| Natural Earth area | 11174.3 km2 |
| OSM mainland polygon area | 11591.1 km2 (+3.73 % vs Natural Earth) |
| Distance of Natural Earth vertices to the OSM outline | median 443 m, 90th percentile 1222 m, max 9366 m |
<!-- END GENERATED: naturalearth -->

* **Simplification.** Douglas–Peucker at 100 m, applied **once per shared border chain** (a chain is cut where the set of municipalities
  that use an edge changes), so neighbouring municipalities and the outline never gap or overlap. A ring that would cross itself gets the
  worst-offending vertices back until it is simple. Islets smaller than 0.05 km² are not drawn (they stay in the full-resolution land test the
  build uses for facilities and places). Treat the polygons as ±100 m, not as legal boundaries.
* **Hawar.** The Hawar Islands belong to Bahrain (ICJ judgment of 16 March 2001, which also awarded Janan island including Hadd Janan,
  Zubarah and Fasht ad Dibal to Qatar). They are in no Qatari municipality polygon, so they are not in the outline; the test checks that no
  outline vertex lies near the Hawar coast. The small islet near 25.56 °N 50.74 °E that *is* in the outline is Janan / Hadd Janan.
* **Halul** (about 52.4 °E) is Qatari and part of the outline; `bbox` is the mainland box and `bboxAll` includes Halul.
* **Municipalities: 8.** Doha, Al Rayyan, Al Wakrah, Al Khor (OSM: "Al Khor and Al Thakhira"), Ash Shamal, Umm Salal, Al Daayen,
  Al Shahaniya. Al Shahaniya became the eighth by Cabinet decision No. 50 of 2014 (The Peninsula, Sept 2014); the number was checked
  against Wikipedia and The Peninsula on the build date. Names are OSM `name:ar` / `name:en`. `areaKm2` is **computed** from the polygons.
* **Places.** Cities, towns, villages, suburbs, hamlets, neighbourhoods/quarters and islands from OSM `place=*` with `name:ar`/`name:en`,
  plus industrial areas, ports, the education area and civil airports from OSM. `population` appears **only** when an OSM tag has it and is
  labelled "unverified". `anchors` maps the 15 places the platform names (Doha, Lusail, Al Rayyan, Al Wakrah, Al Khor, Umm Salal, Al Daayen,
  Madinat ash Shamal, Dukhan, Mesaieed, Ras Laffan, Al Shahaniya, Industrial Area, Education City, Hamad International Airport) to a place id.
  Al Daayen has no place node in OSM, so its anchor is the position of the `admin_centre` node of its municipality relation
  (`kind: "municipality-centre"`). Military air bases and airstrips are left out.
* **Projection helper** (`GEO.projection`): local equirectangular around lon0 = 51.2, lat0 = 25.3,
  `x = (lon − lon0)·mPerDegLon` (east, metres), `y = (lat − lat0)·mPerDegLat` (north, metres), `mPerDegLat = π·R/180`, `R = 6371008.8 m`,
  `mPerDegLon = mPerDegLat·cos(lat0)`. Over lat 24.4–26.3 the east–west scale error is below 1 %; use `distanceM()` (haversine) for exact
  distances. `toXY`, `toLonLat`, `distanceM`, plus `GEO.inLand(lon, lat)`, `GEO.municipalityAt(lon, lat)`, `GEO.place(id)`.

## 5. Facilities (`qatar-facilities.js`)

Each element: `{id, kind, name:{ar,en}, lon, lat, tags, osm, muni, snap:{edge,frac,d}, …}` (field guide: `FAC.meta.fields`).

* **Selection** (OSM tags, `out center` for ways/relations): `amenity=hospital` or `healthcare=hospital` → `hospital`;
  `amenity=clinic|doctors` or `healthcare=clinic|centre|doctor` **only with `emergency=yes`** → `clinic-ed`; `amenity=police` → `police`;
  `amenity=fire_station` (and `emergency=fire_station|rescue_station`, and a government office named "Civil Defence/الدفاع المدني") → `fire`;
  `emergency=ambulance_station` → `ambulance`.
* **Clipped to Qatar** with the full-resolution union of the municipality polygons (100 m tolerance for piers and marinas): Saudi, Bahraini
  and UAE hits are dropped and listed below. **Node-vs-way duplicates** (same kind, within 150 m, same or contained normalised name) are merged;
  the merged ids are kept in `flags`.
* **Not facilities** (dropped by name, listed below): parking lots, hospital gates, "exchange point", a wholesale market, a residential
  compound, a "(src)" duplicate.
* **`ed` — emergency department: `yes` / `no` / `unknown`.** `yes` only from an OSM `emergency=yes` tag (`edSrc: "osm-tag"`) or from the
  HMC emergency-care page (`"official"`, or `"osm-tag+official"` when both agree); `no` from `emergency=no`; **everything else is `unknown`** —
  never a guess. Where the OSM tag sits on a health centre that the HMC list does not name, the flag
  `ed-tag-on-health-centre-not-confirmed-by-official-list` says so.
* **`caps`** (only for the entries joined by hand to the HMC page https://hamad.qa/EN/Hospitals-and-services/Emergency-Care-Services):
  `ed`, `paedED` (paediatric emergency centre), `trauma1` (Level I, HMC trauma page), `obstetric` (the HMC page says *obstetrics and
  gynaecology emergencies only* for the Women's Wellness and Research Center). `ed24` from `MANARA-QATAR.md §2b` is **not** claimed: the
  pages read do not state opening hours. No bed or ED capacity is shipped (that is a labelled SIM assumption in the engine).
* **`facilityType`** — `hospital | specialist-centre | health-centre | unclear`. OSM contributors tag many clinics as `amenity=hospital`, so
  this is a **name heuristic** (`typeSrc: "name heuristic"`) unless the facility is on an official list (`typeSrc: "official list …"`).
  A dispatcher should pick hospital destinations by `ed` and `caps`, not by `kind`.
* **`role`** — police: `station | traffic | department | training | border | unknown` (name heuristic, unnamed = `unknown`; departments and
  training sites carry the flag *administrative or training site, not a public police post*); fire: `civil-defence-station`,
  `civil-defence-hq` (the directorate office), `fire-station`, `industrial-fire-station` (Ras Laffan operator QE).
* **Names.** `name.ar` / `name.en` come from OSM `name:ar` / `name:en`; a plain `name` is assigned by script. Empty = not named in OSM
  (`flags: ["unnamed"]`). The UI must provide its own fallback label. Names of Qatari bodies and systems must still be copied from the
  official site before anything is printed (see `MANARA-QATAR.md`).
* **`snap`** — the nearest point on the shipped road graph: `edge` (index in `decode()` order), `frac` (0..1 along the stored from→to
  direction), `d` (straight-line metres). Facilities far from the major roads got a **real local-road access path** from OSM (§7);
  `flags` records it. `FAC.meta.roadsBuild` equals `MANARA_QATAR_ROADS.meta.build`: facilities and graph belong together, so rebuild both.

### 5.1 Facility counts by municipality (generated)

<!-- BEGIN GENERATED: bymuni -->
| Municipality | hospital | clinic-ed | fire | police | ambulance |
|---|---|---|---|---|---|
| daayen | 8 | 0 | 1 | 0 | 0 |
| doha | 32 | 0 | 6 | 14 | 1 |
| khor | 4 | 0 | 3 | 2 | 1 |
| rayyan | 18 | 0 | 3 | 16 | 0 |
| shahaniya | 3 | 1 | 1 | 1 | 0 |
| umm-salal | 2 | 0 | 3 | 3 | 0 |
| wakrah | 5 | 0 | 3 | 4 | 1 |
| shamal | 0 | 0 | 1 | 1 | 0 |
<!-- END GENERATED: bymuni -->

### 5.2 Entries with an emergency department (generated)

<!-- BEGIN GENERATED: edlist -->
| Name (OSM) | Dataset id | Municipality | Type (name heuristic) | ED | Source | Official capabilities |
|---|---|---|---|---|---|---|
| Aisha Bint Hamad Al Attiyah | hospital-w1041351209 | daayen | hospital | yes | official | ed,paedED |
| Al Ahli Hospital | hospital-w247909086 | doha | hospital | yes | osm-tag |  |
| Hamad Medical City | hospital-w238026555 | doha | hospital | yes | osm-tag |  |
| Hamad Women's Hospital | hospital-r14012759 | doha | hospital | yes | official | ed,obstetric |
| Hazm Mebaireek General Hospital | hospital-w994862150 | doha | hospital | yes | official | ed |
| Pediatric Emergency Centre | hospital-w137927281 | doha | hospital | yes | osm-tag+official | paedED |
| Rumailah Hospital | hospital-r13367284 | doha | hospital | yes | osm-tag |  |
| The Pearl International Hospital | hospital-n12872919314 | doha | hospital | yes | osm-tag |  |
| Trauma & Emergency | hospital-w1049648363 | doha | hospital | yes | osm-tag+official | ed,trauma1 |
| Al Khor Hamad Hospital | hospital-w156179245 | khor | hospital | yes | osm-tag+official |  |
| Pediatric Sections - Al Khor Hospital | hospital-w364291093 | khor | hospital | yes | osm-tag+official | paedED |
| Mesaimeer Health Center | hospital-w213202202 | rayyan | health-centre | yes | osm-tag |  |
| Workers Health Center | hospital-n1969601368 | rayyan | health-centre | yes | osm-tag |  |
| Cuban Hospital | hospital-w1066574917 | shahaniya | hospital | yes | osm-tag+official | ed |
| مركز كلية أحمد بن محمد العسكرية الطبي | hospital-n6817581316 | shahaniya | hospital | yes | osm-tag |  |
| Al Wakra Healthcare Center, Wakra | hospital-w251740061 | wakrah | health-centre | yes | osm-tag |  |
| Al Wakrah Hospital | hospital-w152600871 | wakrah | hospital | yes | osm-tag+official | ed,paedED |
| Workers Health Center | clinic-ed-w1066574988 | shahaniya | health-centre | yes | osm-tag |  |
<!-- END GENERATED: edlist -->

### 5.3 OSM elements that were found but left out (generated)

<!-- BEGIN GENERATED: excluded -->
| OSM element | Name | Reason |
|---|---|---|
| node/1237331723 | Markaz as Sikak | outside the Qatari municipality polygons, 1380 m from the nearest boundary (50.86389,24.63556) |
| node/1237331845 | Markaz al `Udayd | outside the Qatari municipality polygons, 2660 m from the nearest boundary (51.41083,24.61417) |
| node/1237332041 | Markaz al `Udayd | outside the Qatari municipality polygons, 6798 m from the nearest boundary (51.31694,24.44583) |
| node/1474234874 | Saudi Border Police | outside the Qatari municipality polygons, 444 m from the nearest boundary (51.39874,24.63159) |
| node/4207088117 | Hamad Hospital gate 9 | not a facility (name says parking / gate / market / compound / exchange point / src) |
| node/4230893592 | Naufar (src) | not a facility (name says parking / gate / market / compound / exchange point / src) |
| node/4328322689 | Salwa General Hospital | outside the Qatari municipality polygons, 6117 m from the nearest boundary (50.75250,24.75715) |
| node/4374203289 | Al Ahli Hospital Parking | not a facility (name says parking / gate / market / compound / exchange point / src) |
| node/4788910223 | Residential compound | not a facility (name says parking / gate / market / compound / exchange point / src) |
| node/6033738890 | Ambulance Exchange Point | not a facility (name says parking / gate / market / compound / exchange point / src) |
| node/8116943817 | Hospital abdurkadir wholesale market | not a facility (name says parking / gate / market / compound / exchange point / src) |
| node/10232610411 | (unnamed) | outside the Qatari municipality polygons, 9475 m from the nearest boundary (50.78857,25.72079) |
| way/1262299265 | (unnamed) | outside the Qatari municipality polygons, 9486 m from the nearest boundary (51.46627,24.55947) |
| way/1262299307 | (unnamed) | outside the Qatari municipality polygons, 250 m from the nearest boundary (51.04098,24.48505) |
| way/1262299324 | (unnamed) | outside the Qatari municipality polygons, 1399 m from the nearest boundary (50.86349,24.63588) |
<!-- END GENERATED: excluded -->

## 6. Completeness check: official lists versus OSM (generated)

Method: each official name is joined to OSM features by (a) a hand-checked OSM id (name **and** position looked at) or (b) a name search over
every OSM feature that carries a health / emergency tag, taken from the facility query and two extra selective lookup queries (`lookup_health`,
`lookup_police_fire`; names are matched locally, because a name regex over the whole country makes the mirror time out and answer HTTP 200 with
an empty result, which the fetcher now rejects). Statuses:
**MATCHED** (in the dataset), **MATCHED, NAME DIFFERS** (same facility, OSM uses another name, say so), **IN OSM, NOT IN DATASET** (mapped
with other tags, e.g. only `building=hospital` or `healthcare=rehabilitation`, so it fails the facility rule), **MISSING** (no OSM feature
with that name in the snapshot). **MISSING does not mean the facility does not exist** — only that OSM has no such feature, so MANARA has
no verified position for it and does **not** invent one. Official sources: the HMC listing
https://hamad.qa/EN/Hospitals-and-services/Pages/default.aspx (19 hospitals and key facilities) and the HMC emergency page
https://hamad.qa/EN/Hospitals-and-services/Emergency-Care-Services (6 emergency departments, 6 paediatric emergency centres); a
private-hospital directory (https://www.dohaguides.com/hospitals-in-qatar, secondary); PHCC press reports (27 of 31 centres named);
Civil Defence: "23 centres — Doha 11, South 6, North 6" (The Peninsula, 28 Feb 2021) and "from the current 20" (Qatar Tribune, 21 Dec 2017);
police: no official station list could be found, only press mentions (Qatar Tribune, 13 Dec 2016). The checks were made on the build date.

<!-- BEGIN GENERATED: matrixsummary -->
| Group | Official entries | Matched | Matched, name differs | In OSM, not in dataset | MISSING |
|---|---|---|---|---|---|
| HMC hospitals and key facilities | 19 | 9 | 3 | 2 | 5 |
| HMC Paediatric Emergency Centers | 6 | 4 | 0 | 0 | 2 |
| Private hospitals (directory, secondary) | 10 | 6 | 0 | 1 | 3 |
| Police (MoI): no official station list found | 5 | 4 | 0 | 0 | 1 |
| Civil Defence (MoI): count 23, no official list of names found | 6 | 5 | 0 | 0 | 1 |
| PHCC health centres (informational, not EDs) | 27 | 8 | 2 | 6 | 11 |
| **all** | 73 | 36 | 5 | 9 | 23 |
<!-- END GENERATED: matrixsummary -->

<!-- BEGIN GENERATED: matrix -->
#### HMC hospitals and key facilities

Source: https://hamad.qa/EN/Hospitals-and-services/Pages/default.aspx

| Official name | Status | OSM feature(s) | Dataset id | Note |
|---|---|---|---|---|
| Ambulatory Care Center | MISSING | - | - |  |
| Bone and Joint Center | MATCHED | way/322817060 (Bone & Joint Centre) | hospital-w322817060 | OSM "Bone & Joint Centre", position not verified against HMC |
| Communicable Disease Center | IN OSM, NOT IN DATASET | way/489619793 (Communicable Disease Center, building=yes;office=government) | - |  |
| Enaya and Daam | MISSING | - | - |  |
| Hamad Dental Center | MISSING | - | - |  |
| Hamad General Hospital | MATCHED, NAME DIFFERS | way/1049648363 (Trauma & Emergency), way/238026555 (Hamad Medical City) | hospital-w1049648363, hospital-w238026555 | NAME DIFFERS: OSM maps the "Trauma & Emergency" centre and the "Hamad Medical City" campus, there is no feature called Hamad General Hospital |
| Hazm Mebaireek General Hospital | MATCHED | way/994862150 (Hazm Mebaireek General Hospital) | hospital-w994862150 |  |
| Heart Hospital | MATCHED | relation/13341823 (HMC Heart Hospital) | hospital-r13341823 | OSM "HMC Heart Hospital" |
| Medical Care and Research Center | MISSING | - | - |  |
| National Center for Cancer Care and Research | MATCHED, NAME DIFFERS | relation/13338453 (NCCCR (Al Amal Hospital)) | hospital-r13338453 | NAME DIFFERS: OSM "NCCCR (Al Amal Hospital)" |
| Qatar Rehabilitation Institute | IN OSM, NOT IN DATASET | way/155156322 (Qatar Rehabilitation Institute, healthcare=rehabilitation) | - | in OSM as healthcare=rehabilitation (no amenity=hospital): not a dispatch candidate, so not in the dataset |
| Rumailah Hospital | MATCHED | relation/13367284 (Rumailah Hospital) | hospital-r13367284 |  |
| Women's Wellness and Research Center | MATCHED, NAME DIFFERS | relation/14012759 (Hamad Women's Hospital) | hospital-r14012759 | NAME DIFFERS: OSM still says "Hamad Women's Hospital"; HMC lists the Women's Wellness and Research Center |
| Al Wakra Hospital | MATCHED | way/152600871 (Al Wakrah Hospital) | hospital-w152600871 |  |
| Al Maha Specialized Care Center | MISSING | - | - |  |
| Mesaieed General Hospital | MATCHED | way/1153638783 (Mesaieed Hospital) | hospital-w1153638783 | OSM "Mesaieed Hospital" |
| Al Khor Hospital | MATCHED | way/156179245 (Al Khor Hamad Hospital) | hospital-w156179245 | OSM "Al Khor Hamad Hospital" |
| Aisha Bint Hamad Al Attiyah Hospital | MATCHED | way/1041351209 (Aisha Bint Hamad Al Attiyah) | hospital-w1041351209 |  |
| The Cuban Hospital | MATCHED | way/1066574917 (Cuban Hospital) | hospital-w1066574917 |  |

#### HMC Paediatric Emergency Centers

Source: https://hamad.qa/EN/Hospitals-and-services/Emergency-Care-Services

| Official name | Status | OSM feature(s) | Dataset id | Note |
|---|---|---|---|---|
| Al Sadd | MATCHED | way/137927281 (Pediatric Emergency Centre) | hospital-w137927281 | OSM "Pediatric Emergency Centre"; position matches Al Sadd |
| Airport | MISSING | - | - |  |
| Al Rayyan | MISSING | - | - |  |
| Al Khor | MATCHED | way/364291093 (Pediatric Sections - Al Khor Hospital) | hospital-w364291093 | OSM "Pediatric Sections - Al Khor Hospital" |
| Aisha Bint Hamad Al Attiyah Hospital | MATCHED | way/1041351209 (Aisha Bint Hamad Al Attiyah) | hospital-w1041351209 | inside the hospital feature (no separate OSM feature) |
| Al Wakra Hospital | MATCHED | way/152600871 (Al Wakrah Hospital) | hospital-w152600871 | inside the hospital feature (no separate OSM feature) |

#### Private hospitals (directory, secondary)

Source: https://www.dohaguides.com/hospitals-in-qatar

| Official name | Status | OSM feature(s) | Dataset id | Note |
|---|---|---|---|---|
| Al-Ahli Hospital | MATCHED | way/247909086 (Al Ahli Hospital) | hospital-w247909086 |  |
| Al Emadi Hospital | MATCHED | relation/13341978 (Al Emadi Hospital) | hospital-r13341978 |  |
| Alfardan Medical with Northwestern Medicine | MATCHED | way/684481192 (Alfardan Medical with Northwestern Medical) | hospital-w684481192 |  |
| Aman Hospital | MISSING | - | - |  |
| Aster Hospital | MISSING | - | - | OSM has only "Aster Medical Centre" (a different, smaller facility) |
| Doha Clinic Hospital | MATCHED | relation/13344807 (Doha Clinic Hospital) | hospital-r13344807 |  |
| Turkish Hospital | IN OSM, NOT IN DATASET | way/490182098 (Turkish Hospital, building=hospital) | - |  |
| The View Hospital | MATCHED | node/11886181269 (The View Hospital) | hospital-n11879133669 | two OSM nodes at the same spot (merged) |
| Aspetar | MISSING | - | - |  |
| Sidra Medicine | MATCHED | relation/10720904 (Sidra Medicine) | hospital-r10720904 |  |

#### Police (MoI): no official station list found

Source: Qatar Tribune 13 Dec 2016 (Onaiza was the fifth station under the Capital Police Department: Capital, Madina Khalifa, Messaimer, Al Sadd, Onaiza)

| Official name | Status | OSM feature(s) | Dataset id | Note |
|---|---|---|---|---|
| Capital Police Station | MATCHED | way/485014418 (Capital Police Station) | police-w485014418 |  |
| Madinat Khalifa Police Station | MATCHED | node/4305565689 (Madinat Khalifa Police Station) | police-n4305565689 |  |
| Mesaimeer Police Station | MATCHED | way/489633408 (Mesaimeer Police Station) | police-w489633408 |  |
| Al Sadd Police Station | MATCHED | node/8880619819 (Al sadd police station) | police-n8880619819 |  |
| Onaiza Police Station | MISSING | - | - | a police-tagged feature must carry the name |

#### Civil Defence (MoI): count 23, no official list of names found

Source: see the Source column

| Official name | Status | OSM feature(s) | Dataset id | Note | Source |
|---|---|---|---|---|---|
| Wadi Al Sail (headquarters complex incl. a fire station) | MATCHED | way/221983389 (Wadi Al- Sali Civil Defense) | fire-w221983389 | OSM "Wadi Al- Sali Civil Defense"; the directorate office is way/490727316 | Gulf Times 2012 (new Civil Defence HQ) |
| The Pearl-Qatar | MATCHED | way/489605874 (Pearl Civil Defence) | fire-w489605874 |  | Gulf Times (new GDCD branch at The Pearl) |
| Al Khor | MATCHED | way/224760573 (Al Khor Fire Station) | fire-w224760573 |  | The Peninsula 22 Sep 2014 (mock drills) |
| Mesaieed | MATCHED | way/1153634454 (مركز الدفاع المدني) | fire-w1153634454 |  | The Peninsula 22 Sep 2014 (mock drills) |
| Al Wakra | MATCHED | way/492127496 (unnamed) | fire-w492127496 | UNNAMED in OSM: an unnamed fire_station on the same compound as the Al Wakra Police Station; identified by position only, not verified | The Peninsula 22 Sep 2014 (mock drills) |
| Al Thumama | MISSING | - | - |  | Gulf Times (new centre at Al Thumama) |

#### PHCC health centres (informational, not EDs)

Source: The Peninsula 17 Feb 2026 / marhaba.qa / QNA 4 Mar 2026 (27 of the 31 PHCC centres are named)

| Official name | Status | OSM feature(s) | Dataset id | Note |
|---|---|---|---|---|
| Al Wakra | MATCHED | node/2567672824 (Al Wakra Healthcare Center), way/251740061 (Al Wakra Healthcare Center, Wakra) | hospital-w251740061 |  |
| South Wakra | MISSING | - | - |  |
| Al Mashaf | MISSING | - | - |  |
| Al Thumama | MISSING | - | - |  |
| Airport | IN OSM, NOT IN DATASET | node/4749627622 (Airport road health center, amenity=clinic) | - | POSSIBLE match only (OSM "Airport road health center", amenity=clinic): not verified |
| Umm Ghuwailina | MISSING | - | - |  |
| Omar Bin Al Khattab | MISSING | - | - |  |
| Rawdat Al Khail | MISSING | - | - |  |
| Al Sadd | MISSING | - | - |  |
| West Bay | MATCHED | way/491148741 (West Bay Health Center) | hospital-w491148741 |  |
| Al Sheehaniya | MISSING | - | - |  |
| Al Wajbah | MATCHED, NAME DIFFERS | node/7706804985 (Wajba hospital) | hospital-n7706804985 | NAME DIFFERS: OSM "Wajba hospital" |
| Muaither | IN OSM, NOT IN DATASET | way/729406121 (Muaither HC, healthcare=clinic;building=yes) | - |  |
| Al Khor | MATCHED | node/2323452366 (Al Khor Primary Health Clinic) | hospital-n2323452366 | OSM "Al Khor Primary Health Clinic" (emergency=no) |
| Abu Nakhla | IN OSM, NOT IN DATASET | node/4232215097 (Abu Nakhla Health Center, healthcare=clinic) | - |  |
| Mesaimeer | MATCHED | way/213202202 (Mesaimeer Health Center) | hospital-w213202202 |  |
| Al Waab | IN OSM, NOT IN DATASET | node/8635856726 (Alwaab Clinic, amenity=clinic) | - |  |
| Abu Baker Al Siddiq | MATCHED, NAME DIFFERS | node/8401380019 (Abu bakar siddiq hospital bu sidra) | hospital-n8401380019 | NAME DIFFERS: OSM "Abu bakar siddiq hospital bu sidra" |
| Al Rayyan | MISSING | - | - |  |
| Umm Al Seneem | MISSING | - | - |  |
| Al Ruwais | MISSING | - | - |  |
| Leabaib | MATCHED | node/4723981793 (Leabaib health center), way/1432623477 (Leabaib Health Center) | hospital-n4723981793 |  |
| Al Daayen | MATCHED | node/3538299723 (Al Daayen Health Center) | hospital-n3538299723 |  |
| Umm Slal | MATCHED | node/4762200222 (مركز صحي أم صلال محمد الجديد), node/5220332221 (Um Slal), node/4612221889 (مركز أم صلال الصحي) | hospital-n4762200222, hospital-n5220332221 |  |
| Madinat Khalifa | MATCHED | way/379040876 (Madinat Khalifa Health Center) | hospital-w379040876 |  |
| Qatar University | IN OSM, NOT IN DATASET | way/1036009053 (Qatar University Health Centre, amenity=clinic;healthcare=clinic;building=yes) | - |  |
| Gharrafat Al Rayyan | IN OSM, NOT IN DATASET | way/248764901 (unnamed, amenity=clinic) | - |  |
<!-- END GENERATED: matrix -->

**Reading the gaps**

* **Hospitals and EDs.** The six HMC emergency departments are all in OSM and all in the dataset (Hamad General under the name of its
  "Trauma & Emergency" centre; the Women's Wellness and Research Center under its old OSM name "Hamad Women's Hospital"). Two of the six
  paediatric emergency centres (Airport, Al Rayyan) have no OSM feature. Private hospitals that OSM lacks or maps differently are listed above.
* **Civil Defence.** OSM has fewer Civil Defence stations than the official count (23 in 2021), and several of its fire-station features are
  unnamed or are industrial (Ras Laffan) rather than Civil Defence: **do not read the number of OSM `fire` entries as the number of stations.**
* **Police.** There is no official list to compare with; OSM mixes public stations, departments, a police college and a shooting range. The
  `role` field separates them by name; unnamed police features are `unknown`.
* **Ambulance.** OSM has only a handful of `emergency=ambulance_station` features; the HMC Ambulance Service's real station network is not
  mapped. Unit positions are SIM in the engine; nothing here claims where ambulances wait.

## 7. Roads (`qatar-roads.js`)

* **Scope.** OSM `highway=motorway | trunk | primary | secondary` and their `_link` ramps for the whole of Qatar (nodes inside the OSM
  territorial boundary, so bridges over water — The Pearl, Lusail — stay in), plus `highway=tertiary(_link)` **only inside the Greater Doha /
  Al Rayyan box** (lon 51.30–51.65, lat 25.10–25.50). Nothing else — no residential or service roads — except the two additions below.
* **Graph.** Nodes are junctions and dead ends (a node used by two or more ways, or the end of a way). Ways are split at junction nodes; an
  edge is one junction-to-junction piece with a polyline simplified to 15 m. One-way (`oneway=yes|-1`, motorways and roundabouts by OSM default)
  gives one arc, a two-way road two arcs. Self-loops are dropped.
* **Edge fields** (`decode()`): length (m, from the full-resolution geometry), class, flags, free-flow speed (kph), name index, direction.
  Class: 0 motorway, 1 trunk, 2 primary, 3 secondary, 4 tertiary, 5 local. Flags (bit field): 1 tunnel/underpass (`tunnel=*`, `covered=yes` or
  `layer<0`), 2 bridge, 4 toll, 8 roundabout, 16 one-way, 32 `_link` ramp, 64 speed is the **OSM numeric maxspeed**, 128 access restricted
  (private/permit/…), 256 **virtual connector**. Tunnels and underpasses are what the flood layer needs.
* **Speeds.** Where OSM has a numeric `maxspeed` (flag 64) it is used (`80;60` → the lowest); everywhere else a **class default that is an
  ASSUMPTION, not Qatari law**: motorway 100, trunk 80, primary 70, secondary 60, tertiary 50, local 40 kph; ramps 60/50/50/40/40/30;
  roundabouts 40. `meta.speedAssumptions` carries them. Travel time is `length / speed`; congestion is applied by the consumer (SIM).
* **Virtual connectors (assumption, flag 256, class local).** The extract holds only the major roads, so a one-way road often ends where
  it continues as a minor road outside the extract (a dead end) and another starts where a minor road feeds it. Joining each dead end to the
  nearest entry-less start within 300 m (and, in a second pass, each leftover pocket to the nearest node of the main component within
  500 m) with a one-way connector of length 1.3 × straight line at 25 kph keeps the directed graph routable **without** inventing a
  two-way road or breaking a real one-way rule. They are a small, flagged minority (counts above): draw them dashed, never as real roads.
* **Connectivity.** Only the largest **strongly** connected component ships, so every node can reach every other node and every route
  question has an answer. Shares before pruning are in the table; the test recomputes strong and weak connectivity from the decoded arrays.
* **Local access paths (real OSM roads).** Facilities that were farther than 250 m from the major graph got the shortest legal path
  (facility → graph and graph → facility, respecting one-way) over **real** OSM local roads (`unclassified`, `residential`, `service`,
  `living_street`, `road`, `tertiary` outside the box), fetched with one `around` query per far facility. Only the roads on those paths are
  added, as class `local`. If no legal path was found the facility is flagged `no-local-road-access-found-within-400m`.

<!-- BEGIN GENERATED: roads -->
| Measure | Value |
|---|---|
| Junction nodes before the connectivity step | 23,137 |
| Virtual connectors added (one-way dead end to nearby one-way start / pocket to main) | 1259 (129 km) |
| Share of nodes in the largest strongly connected component | 99.991 % |
| Share of nodes in the largest weakly connected component | 100.000 % |
| Nodes / edges dropped (outside the main component) | 2 / 2 |
| Edges with a numeric OSM maxspeed | 36.4 % |
| Facilities given a real local-road access path | 28 (failed: none) |
<!-- END GENERATED: roads -->

<!-- BEGIN GENERATED: snap -->
Distance from every facility to the nearest point of the shipped road graph: median **66 m**, 90th percentile **178 m**, maximum **249 m**.
<!-- END GENERATED: snap -->

* **Limits (state them on the site).** No turn restrictions or U-turn bans, no traffic signals, no lane data, no live traffic, no
  road closures; OSM can be wrong or out of date; Qatar-wide OSM completeness for minor roads is not claimed. `maxspeed` is tagged on only a
  minority of edges. A route is a **simulation input**, never a navigation instruction.

### 7.1 Using the graph

```js
const G = MANARA_QATAR_ROADS.decode();            // typed arrays, cached
const loc = G.locate(lon, lat);                   // nearest road point: {edge, frac, dist, lon, lat, dFrom, dTo, from, to, twoWay}
const seed = G.attach(loc);                       // {out: [[node, metres], ...], in: [[node, metres], ...], access: metres}
// Dijkstra over arcs: for (k = G.outStart[u]; k < G.outStart[u + 1]; k++) { a = G.outArc[k]; v = G.aTo[a];
//   seconds = G.aLen[a] / (G.aSpeed[a] / 3.6) / congestion(G.aEdge[a], t); }
// start from seed.out (cost = metres to each node), finish at seed.in; add the straight-line `access` leg at an assumed slow speed.
// A facility's stored snap is {edge, frac, d}: dFrom = frac * G.eLen[edge], dTo = (1 - frac) * G.eLen[edge].
// G.polyline(e) -> [lon, lat, ...] from the 'from' node to the 'to' node (draw it); G.eFlags[e] & 256 -> virtual connector.
```

`tools/manara/test-qatar-data.mjs` contains a complete multi-seed Dijkstra over these arrays (used for the Doha ↔ Dukhan ↔ Al Khor ↔
Al Wakrah ↔ Al Shamal ↔ Mesaieed ↔ Hamad International Airport routes) that can be copied.

## 8. Known gaps and flags (summary)

1. **A snapshot, not a feed.** OSM changes daily; rebuild to refresh. Nothing live: positions, availability, traffic, hazards are SIM.
2. **OSM coverage is incomplete** (see §6): missing hospitals/EDs, Civil Defence stations and police posts are **not invented**; an official
   name without an OSM feature is `MISSING`, with no coordinates.
3. **Positions are mapper positions**, ways/relations use the centre OSM reports; none was surveyed.
4. **`ed` is `unknown` for most health facilities**; `yes` is verified only from an OSM tag or the HMC page; `facilityType` and police `role`
   are name heuristics unless an official list is cited; some OSM names are transliterations.
5. **Road speeds are assumptions where `maxspeed` is missing; virtual connectors are assumptions** (flag 256); no turn restrictions.
6. **Municipality polygons are simplified (±100 m)**; areas are computed from OSM, not official statistics.
7. **A facility with no road within 250 m** would be flagged; the largest snap distance is in the generated table above.
8. **Not shipped on purpose:** bed counts, ED capacity, ambulance positions, any national statistic.

## 9. Rebuild and test

```bash
# network: only overpass.openstreetmap.fr and raw.githubusercontent.com are reachable from the build sandbox; Overpass is polite (sequential, paused)
python3 tools/manara/build-qatar-data.py --cache /tmp/manara-osm-cache --write-doc     # fetch what is missing, build, write data/ and this doc's tables
python3 tools/manara/build-qatar-data.py --cache /tmp/manara-osm-cache --no-fetch      # offline rebuild from the cache
python3 tools/manara/build-qatar-data.py --cache /tmp/manara-osm-cache --refresh       # download everything again
node tools/manara/test-qatar-data.mjs                                                  # ~90 checks, exit code 1 on failure
```

Keep the cache **outside** the repository (it holds ~55 MB of raw JSON). A first run with an empty cache takes about ten minutes (the two
lookup queries and the access-path query are slow on the mirror; an Overpass answer that carries an error `remark` is retried and never cached).
The script needs only the Python standard library (no shapely, no numpy). The exact queries:

<!-- BEGIN GENERATED: queries -->
**rel_qa_geom**

```
[out:json][timeout:180];
rel(305095);
out geom;
```

**rel_qa_subs**

```
[out:json][timeout:240];
rel(305095);
rel(r);
out geom;
```

**facilities**

```
[out:json][timeout:240];
(
  nwr["amenity"="hospital"](24.4,50.7,26.3,51.7);
  nwr["healthcare"="hospital"](24.4,50.7,26.3,51.7);
  nwr["amenity"~"^(clinic|doctors)$"]["emergency"="yes"](24.4,50.7,26.3,51.7);
  nwr["healthcare"~"^(clinic|centre|doctor)$"]["emergency"="yes"](24.4,50.7,26.3,51.7);
  nwr["amenity"="police"](24.4,50.7,26.3,51.7);
  nwr["amenity"="fire_station"](24.4,50.7,26.3,51.7);
  nwr["emergency"="ambulance_station"](24.4,50.7,26.3,51.7);
  nwr["emergency"~"^(fire_station|rescue_station|ambulance_station|lifeguard)$"](24.4,50.7,26.3,51.7);
  nwr["office"="government"]["name"~"Civil Defen|الدفاع المدني"](24.4,50.7,26.3,51.7);
  nwr["name"~"Civil Defen|الدفاع المدني"](24.4,50.7,26.3,51.7);
  nwr["name:en"~"Civil Defen"](24.4,50.7,26.3,51.7);
);
out center tags;
```

**places**

```
[out:json][timeout:240];
(
  node["place"~"^(city|town|village|suburb|hamlet|neighbourhood|quarter|locality|island|islet|isolated_dwelling|farm)$"](24.4,50.5,26.3,52.8);
  nwr["aeroway"="aerodrome"](24.4,50.5,26.3,52.8);
  nwr["landuse"="industrial"]["name"](24.4,50.5,26.3,52.8);
  nwr["industrial"]["name"](24.4,50.5,26.3,52.8);
  nwr["harbour"="yes"]["name"](24.4,50.5,26.3,52.8);
  nwr["amenity"="university"]["name"~"Education City"](24.4,50.5,26.3,52.8);
  nwr["name:en"~"Education City|Industrial Area|Ras Laffan|Mesaieed|Mesaieed|Lusail|Hamad International|Hamad Port|Dukhan"](24.4,50.5,26.3,52.8);
);
out center tags;
```

**roads_major**

```
[out:json][timeout:300];
way["highway"~"^(motorway|trunk|primary|secondary)(_link)?$"](24.4,50.6,26.3,51.8);
out body;
>;
out skel qt;
```

**roads_tertiary**

```
[out:json][timeout:300];
way["highway"~"^tertiary(_link)?$"](24.4,50.6,26.3,51.8);
out body;
>;
out skel qt;
```

**lookup_health**

```
[out:json][timeout:240];
(
  nwr["amenity"~"^(hospital|clinic|doctors|social_facility)$"](24.4,50.7,26.3,51.7);
  nwr["healthcare"~"^(hospital|clinic|centre|doctor|rehabilitation)$"](24.4,50.7,26.3,51.7);
  nwr["emergency"~"^(ambulance_station|fire_station|rescue_station|first_aid)$"](24.4,50.7,26.3,51.7);
  nwr["building"~"^(hospital|clinic)$"](24.4,50.7,26.3,51.7);
  nwr["office"="government"]["name"~"Communicable|Civil Defen|الدفاع المدني",i](24.4,50.7,26.3,51.7);
);
out center tags;
```

**lookup_police_fire**

```
[out:json][timeout:240];
(
  nwr["amenity"~"^(police|fire_station)$"](24.4,50.7,26.3,51.7);
  nwr["office"~"^(government|police)$"]["name"~"police|شرطة|civil defen|دفاع|fire|traffic|مرور",i](24.4,50.7,26.3,51.7);
);
out center tags;
```
<!-- END GENERATED: queries -->

In addition, one `around` query per far facility fetches the local roads for the access paths; its text is built by `access_query()` in the script
and its cache file name carries a hash of the facility positions.
