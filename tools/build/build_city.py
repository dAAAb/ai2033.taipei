#!/usr/bin/env python3
"""Turn raw Overpass dumps (research/osm/*.json.gz) into a compact scene file for the 3D page.

Output: 3d/data/city.json  — local metric coords (x east, z south; decimetres as ints).
Also derives a schematic 2033 layout of the 300 ha site following the city's 2026-10-08 press release:
  * 110 ha central park on the northern half of the airport ("松機北半側")
  * 100 ha AI industry cluster on the south side (松南營區 / 松機南側)
  *  90 ha international sustainable living cluster
The exact master plan has not been published; this layout is illustrative only.
"""
import gzip, json, math, os, random, re, sys
from shapely.geometry import Polygon, MultiPolygon, LineString, Point, box
from shapely.ops import unary_union, linemerge, polygonize
from shapely import affinity

RAW = os.environ.get("OSM_RAW", "research/osm_pbf")
OUT = os.environ.get("CITY_OUT", "3d/data/city.json")
LAT0, LON0 = 25.0697, 121.5520
SCALE = 2
KX = 111320.0 * math.cos(math.radians(LAT0))
KZ = 110574.0

def P(lat, lon):
    return ((lon - LON0) * KX, (LAT0 - lat) * KZ)

def load(name):
    p = f"{RAW}/{name}.json.gz"
    if not os.path.exists(p): return []
    with gzip.open(p, "rt", encoding="utf-8") as f:
        return json.load(f).get("elements", [])

def way_coords(g):
    return [P(q["lat"], q["lon"]) for q in g if q]

def rings_from_relation(el, role="outer"):
    lines = []
    for m in el.get("members", []):
        if m.get("type") == "way" and m.get("role", "outer") in (role, "") and m.get("geometry"):
            c = way_coords(m["geometry"])
            if len(c) >= 2: lines.append(LineString(c))
    if not lines: return []
    polys = list(polygonize(linemerge(unary_union(lines))))
    return polys

def as_polys(el):
    if el["type"] == "way":
        c = way_coords(el.get("geometry", []))
        if len(c) >= 4 and c[0] == c[-1]:
            pg = Polygon(c)
            if not pg.is_valid: pg = pg.buffer(0)
            return [pg] if not pg.is_empty else []
        return []
    if el["type"] == "relation":
        outers = rings_from_relation(el, "outer")
        inners = rings_from_relation(el, "inner")
        res = []
        for o in outers:
            for i in inners:
                if o.contains(i.representative_point()): o = o.difference(i)
            res += list(o.geoms) if isinstance(o, MultiPolygon) else [o]
        return [r for r in res if not r.is_empty]
    return []

def ring_list(pg, tol=0.8):
    pg = pg.simplify(tol, preserve_topology=True)
    if pg.is_empty: return None
    if isinstance(pg, MultiPolygon): pg = max(pg.geoms, key=lambda g: g.area)
    c = list(pg.exterior.coords)[:-1]
    if len(c) < 3: return None
    return [int(round(v * SCALE)) for xy in c for v in xy]

def line_list(ls, tol=1.0):
    ls = ls.simplify(tol)
    return [int(round(v * SCALE)) for xy in ls.coords for v in xy]

def num(s):
    m = re.match(r"\s*([0-9.]+)", str(s or ""))
    return float(m.group(1)) if m else None

def hrand(i, a, b):
    r = random.Random(i * 7919 + 13)
    return a + (b - a) * r.random()

feats = load("features")
print("features", len(feats))

# ---------- airport ----------
aerodrome = None; runway = None; aero = {"runway": [], "taxiway": [], "apron": [], "terminal": [], "hangar": [], "helipad": [], "stands": []}
for el in feats:
    t = el.get("tags", {})
    a = t.get("aeroway")
    if not a: continue
    if a == "aerodrome" and el["type"] in ("way", "relation"):
        ps = as_polys(el)
        if ps:
            pg = unary_union(ps)
            if aerodrome is None or pg.area > aerodrome.area: aerodrome = pg
    elif a == "runway" and el["type"] == "way":
        c = way_coords(el["geometry"])
        if len(c) >= 2:
            ls = LineString(c)
            if c[0] == c[-1] and len(c) >= 4:   # area runway
                aero["runway"].append({"poly": ring_list(Polygon(c), 0.5)})
                pg = Polygon(c); mrr = pg.minimum_rotated_rectangle
                xs = list(mrr.exterior.coords)
                e = sorted([(LineString([xs[i], xs[i + 1]]).length, i) for i in range(4)])
                i0 = e[-1][1]; i1 = e[-2][1]
                mid = lambda i: ((xs[i][0] + xs[i + 1][0]) / 2, (xs[i][1] + xs[i + 1][1]) / 2)
                # centre line between the two short edges
                s0 = e[0][1]; s1 = e[1][1]
                runway = LineString([mid(s0), mid(s1)]); rw_w = e[0][0]
            else:
                w = num(t.get("width")) or 60
                if runway is None or ls.length > runway.length: runway, rw_w = ls, w
                aero["runway"].append({"line": line_list(ls, 0.5), "w": w})
    elif a == "taxiway" and el["type"] == "way":
        c = way_coords(el["geometry"])
        if len(c) >= 2: aero["taxiway"].append({"line": line_list(LineString(c), 0.8), "w": num(t.get("width")) or 23})
    elif a in ("apron",) :
        for pg in as_polys(el):
            r = ring_list(pg, 1.0)
            if r: aero["apron"].append(r)
    elif a in ("terminal", "hangar"):
        for pg in as_polys(el):
            r = ring_list(pg, 0.8)
            if r: aero[a].append(r)
    elif a == "helipad" and el["type"] == "node":
        x, z = P(el["lat"], el["lon"]); aero["helipad"].append([round(x), round(z)])
    elif a == "parking_position" and el["type"] == "node":
        x, z = P(el["lat"], el["lon"]); aero["stands"].append([round(x), round(z)])
    elif a == "parking_position" and el["type"] == "way" and el.get("geometry"):
        c = way_coords(el["geometry"]); (ax, az), (bx, bz) = c[0], c[-1]
        aero["stands"].append([round((ax + bx) / 2), round((az + bz) / 2), round(math.atan2(bx - ax, bz - az), 2)])

if aerodrome is None:
    sys.exit("no aerodrome polygon found")
aerodrome = aerodrome.buffer(0)
if isinstance(aerodrome, MultiPolygon): aerodrome = max(aerodrome.geoms, key=lambda g: g.area)
print("aerodrome area ha", aerodrome.area / 1e4, "runway len", runway.length)

# runway frame: s along runway (west->east), t across (positive = south in our z-down coords)
(x0, z0), (x1, z1) = runway.coords[0], runway.coords[-1]
if x1 < x0: x0, z0, x1, z1 = x1, z1, x0, z0
L = math.hypot(x1 - x0, z1 - z0); ux, uz = (x1 - x0) / L, (z1 - z0) / L
cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
nx, nz = -uz, ux   # perpendicular; +t
if nz < 0: nx, nz = -nx, -nz   # make +t point south (z grows to south)
def biggest(g):
    if isinstance(g, MultiPolygon): return max(g.geoms, key=lambda q: q.area)
    return g
def to_st(x, z): return ((x - cx) * ux + (z - cz) * uz, (x - cx) * nx + (z - cz) * nz)
def from_st(s, t): return (cx + s * ux + t * nx, cz + s * uz + t * nz)
ang = math.atan2(uz, ux)

# ---------- 2033 schematic zones (300 ha site) ----------
mil = []; ai_extra = []
for el in feats:
    t = el.get("tags", {})
    if t.get("landuse") == "military" or t.get("military") in ("base", "airfield", "barracks"):
        for pg in as_polys(el):
            if pg.distance(aerodrome) < 120 and pg.area > 3000: mil.append(pg.buffer(0))
            elif pg.distance(aerodrome) < 700 and pg.area > 8000 and t.get("name", "") in ("松南營區", "新通航聯隊", "福山營區") or (
                    pg.distance(aerodrome) < 500 and pg.area > 20000 and pg.centroid.y > aerodrome.centroid.y):
                ai_extra.append(pg.buffer(0))
site = unary_union([aerodrome] + mil).buffer(8).buffer(-8)
if isinstance(site, MultiPolygon):
    parts = sorted(site.geoms, key=lambda g: -g.area)
    site = parts[0]
    ai_extra += [q for q in parts[1:] if q.area > 5000]
site = site.simplify(2)
ai_extra = [p.difference(site) for p in ai_extra]
ai_extra = [biggest(p) for p in ai_extra if not p.is_empty and p.area > 5000] if False else ai_extra
print("site ha", site.area / 1e4, "military parts", len(mil), "ai extra", [round(p.area / 1e4, 1) for p in ai_extra])
north = site.intersection(Polygon([from_st(-3 * L, -3000), from_st(3 * L, -3000), from_st(3 * L, 0), from_st(-3 * L, 0)]))
# find band t0 so that park (t < t0) == 110 ha
lo, hi = -800.0, 800.0
for _ in range(40):
    mid = (lo + hi) / 2
    park = site.intersection(Polygon([from_st(-3 * L, -3000), from_st(3 * L, -3000), from_st(3 * L, mid), from_st(-3 * L, mid)]))
    if park.area > 1.10e6: hi = mid
    else: lo = mid
t_park = (lo + hi) / 2
park = site.intersection(Polygon([from_st(-3 * L, -3000), from_st(3 * L, -3000), from_st(3 * L, t_park), from_st(-3 * L, t_park)]))
south = site.difference(park)
# split south into AI (west) and living (east) with AI:living = 100:90
lo, hi = -L, L
for _ in range(40):
    mid = (lo + hi) / 2
    ai = south.intersection(Polygon([from_st(-3 * L, -3000), from_st(mid, -3000), from_st(mid, 3000), from_st(-3 * L, 3000)]))
    if ai.area / max(south.area, 1) > 100 / 190: hi = mid
    else: lo = mid
s_split = (lo + hi) / 2
ai = south.intersection(Polygon([from_st(-3 * L, -3000), from_st(s_split, -3000), from_st(s_split, 3000), from_st(-3 * L, 3000)]))
live = south.difference(ai)
def biggest(g):
    if isinstance(g, MultiPolygon): return max(g.geoms, key=lambda q: q.area)
    return g
park, ai, live = biggest(park.buffer(0)), biggest(ai.buffer(0)), biggest(live.buffer(0))
print("zones ha park/ai/live", park.area / 1e4, ai.area / 1e4, live.area / 1e4)

# height-restriction (approach / transitional surfaces) – schematic 570 ha band outside the site
def restricted(x, z):
    s, t = to_st(x, z)
    half = L / 2
    if abs(s) <= half: return abs(t) < 700
    d = abs(s) - half
    return d < 2300 and abs(t) < 520 + 0.12 * d

# ---------- buildings ----------
blds = {}
import glob
for fn in sorted(glob.glob(f"{RAW}/buildings_*.json.gz")):
    for el in load(os.path.basename(fn)[:-8]):
        blds[(el["type"], el["id"])] = el
print("buildings raw", len(blds))
B = {"h": [], "f": [], "g": [], "n": [], "c": []}
cands = []
TAIPEI101 = P(25.03363, 121.56481)
GRAND = P(25.07906, 121.52617)
skip_near = [(TAIPEI101, 90, 100), (GRAND, 60, 10)]
restricted_area = 0.0
n_air = 0
for (typ, oid), el in blds.items():
    t = el.get("tags", {})
    for pg in as_polys(el):
        if pg.area < 30: continue
        c = pg.centroid
        if any(math.hypot(c.x - p[0], c.y - p[1]) < r for p, r, _ in skip_near): continue
        h = num(t.get("height")) or (num(t.get("building:levels")) or 0) * 3.3
        bt = t.get("building", t.get("building:part", "yes"))
        if not h:
            a = pg.area
            if bt in ("house", "detached", "hut", "shed", "garage", "roof", "kiosk"): h = hrand(oid, 4, 9)
            elif bt in ("apartments", "residential"): h = hrand(oid, 13, 26)
            elif bt in ("commercial", "office", "retail", "hotel"): h = hrand(oid, 20, 45)
            elif bt in ("industrial", "warehouse", "hangar"): h = hrand(oid, 9, 15)
            elif bt in ("school", "university", "college", "hospital", "public", "government", "civic"): h = hrand(oid, 14, 22)
            else: h = 8 if a < 80 else hrand(oid, 10, 15) if a < 300 else hrand(oid, 14, 24) if a < 1500 else hrand(oid, 18, 30)
        if t.get("building:part") and not t.get("height") and not t.get("building:levels"): continue
        h = max(3.0, min(h, 520.0))
        in_air = aerodrome.contains(c)
        in_site = site.contains(c) or any(p.contains(c) for p in ai_extra)
        flag = 0; g = 0
        if in_site: flag = 1; n_air += 1
        elif restricted(c.x, c.y) and h <= 30:
            flag = 2; g = round(hrand(oid + 1, 1.2, 3.6), 2); restricted_area += pg.area
        r = ring_list(pg, 0.7)
        if not r: continue
        dist = math.hypot(c.x - cx, c.y - cz)
        keep = dist < 2600 or pg.area > 160 or h > 30 or (dist < 3600 and pg.area > 70)
        if not keep: continue
        cands.append((dist, -pg.area, round(h, 1), flag, g, r))
cands.sort(key=lambda q: (q[0] > 2600, -q[1] if q[0] > 2600 else q[0]))
for dist, na, h, flag, g, r in cands[:60000]:
    # delta encode: first point absolute, then differences
    dr = r[:2] + [r[k] - r[k - 2] for k in range(2, len(r))]
    B["n"].append(len(r) // 2); B["c"] += dr
    B["h"].append(int(round(h))); B["f"].append(flag); B["g"].append(int(round(g * 10)))
print("buildings kept", len(B["h"]), "in site", n_air, "restricted footprint ha", restricted_area / 1e4)

# ---------- roads / rail / water / green / labels ----------
RW = {"motorway": 22, "trunk": 18, "primary": 16, "secondary": 13, "tertiary": 10, "motorway_link": 8, "trunk_link": 8,
      "primary_link": 8, "secondary_link": 7, "residential": 7, "unclassified": 7, "living_street": 5, "pedestrian": 5, "service": 4}
RK = {k: i for i, k in enumerate(RW)}
roads = {"k": [], "e": [], "o": [], "c": [], "n": []}
names = []
rail = []
water, green = [], []
labels = []
GREEN = {"park": 0, "garden": 0, "golf_course": 2, "pitch": 3, "stadium": 3, "nature_reserve": 1, "grass": 0, "forest": 1,
         "recreation_ground": 0, "cemetery": 0, "meadow": 0, "wood": 1, "scrub": 1, "grassland": 0}
for el in feats:
    t = el.get("tags", {})
    if el["type"] == "node":
        nm = t.get("name:zh-Hant") or t.get("name")
        if not nm: continue
        x, z = P(el["lat"], el["lon"])
        kind = "station" if t.get("railway") == "station" else t.get("place") or ("attraction" if t.get("tourism") == "attraction" else None) or ("university" if t.get("amenity") == "university" else None)
        if kind in ("station", "suburb", "quarter", "neighbourhood", "attraction", "university"):
            if not any(l["n"] == nm for l in labels): labels.append({"n": nm, "x": round(x), "z": round(z), "k": kind})
        continue
    hw = t.get("highway")
    if hw in RW and el["type"] == "way":
        if t.get("tunnel") in ("yes", "building_passage") or t.get("area") == "yes": continue
        c = way_coords(el["geometry"])
        if len(c) < 2: continue
        lay = num(t.get("layer")) or 0
        elev = 1 if (t.get("bridge") == "yes" and hw in ("motorway", "trunk", "motorway_link", "trunk_link", "primary") and lay >= 1) else 0
        roads["o"].append(len(roads["c"])); roads["c"] += line_list(LineString(c), 1.0)
        roads["k"].append(RK[hw]); roads["e"].append(elev)
        nm = t.get("name", "")
        if nm and hw in ("motorway", "trunk", "primary", "secondary"):
            if nm not in names: names.append(nm)
            roads["n"].append(names.index(nm))
        else: roads["n"].append(-1)
        continue
    rw = t.get("railway")
    if rw in ("rail", "subway", "light_rail", "monorail") and el["type"] == "way":
        if t.get("tunnel") == "yes": continue
        c = way_coords(el["geometry"])
        if len(c) < 2: continue
        elev = 1 if t.get("bridge") in ("yes", "viaduct") or (num(t.get("layer")) or 0) >= 1 else 0
        rail.append({"c": line_list(LineString(c), 1.0), "e": elev, "k": rw})
        continue
    is_water = t.get("natural") == "water" or t.get("waterway") == "riverbank" or "water" in t
    if is_water and el["type"] in ("way", "relation"):
        for pg in as_polys(el):
            if pg.area > 200:
                r = ring_list(pg, 1.5)
                if r: water.append(r)
        continue
    if t.get("waterway") in ("river", "canal") and el["type"] == "way":
        c = way_coords(el["geometry"])
        if len(c) >= 2:
            w = {"river": 90, "canal": 12}[t["waterway"]]
            r = ring_list(LineString(c).buffer(w / 2, cap_style=2), 2.0)
            if r: water.append(r)
        continue
    gk = t.get("leisure") or t.get("landuse") or t.get("natural")
    if gk in GREEN and el["type"] in ("way", "relation"):
        for pg in as_polys(el):
            if pg.area > 400:
                r = ring_list(pg, 2.0)
                if r: green.append({"k": GREEN[gk], "c": r})

roads_list_for_bounds = [roads["c"]]
# ---------- schematic future layout ----------
rnd = random.Random(2033)
def poly_pts(pg, tol=2.0): return ring_list(pg, tol)
fut = {"park": poly_pts(park), "ai": poly_pts(ai), "live": poly_pts(live), "site": poly_pts(site),
       "towers": [], "homes": [], "trees": [], "lakes": [], "paths": [], "spine": None}
# AI cluster: grid of towers, aligned to runway axis
def grid_in(pg, step_s, step_t, margin):
    inner = pg.buffer(-margin)
    s_vals = [to_st(*xy)[0] for xy in pg.exterior.coords]; t_vals = [to_st(*xy)[1] for xy in pg.exterior.coords]
    s = min(s_vals)
    while s <= max(s_vals):
        t = min(t_vals)
        while t <= max(t_vals):
            x, z = from_st(s, t)
            if inner.contains(Point(x, z)): yield s, t, x, z
            t += step_t
        s += step_s
ai_c = to_st(ai.centroid.x, ai.centroid.y)
fut["aiExtra"] = []
for pe in ai_extra:
    pe = biggest(pe.buffer(0))
    if pe.is_empty or pe.area < 5000: continue
    fut["aiExtra"].append(poly_pts(pe))
    for s_, t_, x, z in grid_in(pe, 80, 75, 22):
        fut["towers"].append([round(x, 1), round(z, 1), round(rnd.uniform(30, 44), 1), round(rnd.uniform(26, 38), 1), round(rnd.uniform(70, 150)), rnd.randint(0, 3)])
for s, t, x, z in grid_in(ai, 95, 85, 30):
    d = math.hypot(s - ai_c[0], t - ai_c[1])
    h = max(38, 195 - d * 0.36 + rnd.uniform(-30, 30))
    w = rnd.uniform(34, 50); dp = rnd.uniform(30, 44)
    if rnd.random() < 0.22: h = rnd.uniform(18, 34); w = rnd.uniform(60, 78); dp = rnd.uniform(50, 66)
    fut["towers"].append([round(x, 1), round(z, 1), round(w, 1), round(dp, 1), round(h), rnd.randint(0, 3)])
# landmark AI tower at the cluster centre
ax, az = ai.centroid.x, ai.centroid.y
fut["landmark"] = [round(ax, 1), round(az, 1)]
fut["towers"] = [tw for tw in fut["towers"] if math.hypot(tw[0] - ax, tw[1] - az) > 70]
for s, t, x, z in grid_in(live, 70, 70, 25):
    h = rnd.uniform(28, 75)
    fut["homes"].append([round(x, 1), round(z, 1), round(rnd.uniform(22, 34), 1), round(rnd.uniform(16, 24), 1), round(h), rnd.randint(0, 3)])
# park: lakes along the old runway, trees everywhere else, spine promenade on the runway centre line
lake_s = [-0.30 * L, 0.05 * L, 0.33 * L]
for k, ls_ in enumerate(lake_s):
    t_mid = t_park - 260 if t_park > -200 else t_park / 2
    x, z = from_st(ls_, -120 - 60 * k % 120)
    lake = affinity.rotate(Point(x, z).buffer(1, 48), 0)
    lake = affinity.scale(lake, 180 + 40 * k, 70 + 15 * k)
    lake = affinity.rotate(lake, math.degrees(ang) + rnd.uniform(-12, 12), origin=(x, z))
    lake = lake.intersection(park.buffer(-25))
    if not lake.is_empty and lake.area > 2000:
        fut["lakes"].append(poly_pts(biggest(lake), 1.0))
lakes_u = unary_union([Polygon([(fut["lakes"][i][j] / SCALE, fut["lakes"][i][j + 1] / SCALE) for j in range(0, len(fut["lakes"][i]), 2)]) for i in range(len(fut["lakes"]))]) if fut["lakes"] else Polygon()
spine = runway.intersection(park.buffer(-10))
if spine.is_empty: spine = LineString([from_st(-L / 2 + 50, t_park / 2), from_st(L / 2 - 50, t_park / 2)])
fut["spine"] = line_list(spine if isinstance(spine, LineString) else max(spine.geoms, key=lambda g: g.length), 1)
pk_inner = park.buffer(-8)
minx, minz, maxx, maxz = park.bounds
tries = 0
while len(fut["trees"]) < 5200 and tries < 60000:
    tries += 1
    x, z = rnd.uniform(minx, maxx), rnd.uniform(minz, maxz)
    p = Point(x, z)
    if not pk_inner.contains(p) or lakes_u.buffer(6).contains(p): continue
    s, t = to_st(x, z)
    if abs(t) < 22 and rnd.random() < 0.9: continue        # keep the runway-memory promenade open
    if rnd.random() < 0.35 and math.sin(s / 140) * math.cos(t / 110) > 0.25: continue  # meadows
    fut["trees"].append([round(x, 1), round(z, 1), round(rnd.uniform(6, 15), 1), rnd.randint(0, 2)])
# street trees between towers and homes
blocks_xy = [(t_[0], t_[1]) for t_ in fut["towers"]] + [(h_[0], h_[1]) for h_ in fut["homes"]]
for zone, n_ in ((ai, 500), (live, 450)):
    zi = zone.buffer(-6); bx0, bz0, bx1, bz1 = zone.bounds; k = 0; tries = 0
    while k < n_ and tries < n_ * 30:
        tries += 1
        x, z = rnd.uniform(bx0, bx1), rnd.uniform(bz0, bz1)
        if not zi.contains(Point(x, z)): continue
        if any(abs(x - bx) < 30 and abs(z - bz) < 30 for bx, bz in blocks_xy): continue
        fut["trees"].append([round(x, 1), round(z, 1), round(rnd.uniform(5, 9), 1), rnd.randint(0, 1)]); k += 1
# winding paths through the park
for k in range(5):
    pts = []
    t_off = t_park * (k + 1) / 6
    for i in range(0, 41):
        s = -L / 2 + L * i / 40
        pts.append(from_st(s, t_off + 60 * math.sin(i / 3.0 + k)))
    ln = LineString(pts).intersection(pk_inner)
    for g in (ln.geoms if hasattr(ln, "geoms") else [ln]):
        if isinstance(g, LineString) and g.length > 50: fut["paths"].append(line_list(g, 1))

# new cross-river corridors and the XY metro (schematic)
cross = []
for s_frac, name in [(-0.33, "基湖路延伸 跨河廊道"), (0.02, "敬業三路延伸 跨河廊道"), (0.30, "北安路─松山 跨河廊道")]:
    a = from_st(s_frac * L, -1300); b = from_st(s_frac * L + 120, 1400)
    cross.append({"n": name, "c": [round(v, 1) for xy in (a, b) for v in xy]})
east = from_st(L / 2 + 1500, 150); west = from_st(-L / 2 - 1500, -150)
fut["corridors"] = cross
fut["minzu"] = [round(v, 1) for xy in (west, east) for v in xy]
fut["metroY"] = [round(v, 1) for xy in (from_st(0, -400), from_st(80, 800), from_st(300, 3200)) for v in xy]
fut["metroX"] = [round(v, 1) for xy in (from_st(-L / 2 - 2200, -900), from_st(-L / 2, -260), from_st(L / 2, -260), from_st(L / 2 + 2200, -700)) for v in xy]
fut["stations"] = [[round(c, 1) for c in from_st(0, -260)], [round(c, 1) for c in from_st(-L / 2 + 200, -260)], [round(c, 1) for c in from_st(L / 2 - 200, -260)], [round(c, 1) for c in from_st(60, 500)]]

xs = [v for r in roads_list_for_bounds for v in r[0::2]]; zs = [v for r in roads_list_for_bounds for v in r[1::2]]
out = {
    "origin": [LAT0, LON0], "scale": SCALE,
    "bounds": [min(xs) / SCALE, min(zs) / SCALE, max(xs) / SCALE, max(zs) / SCALE],
    "runway": {"a": [round(v, 1) for v in from_st(-L / 2, 0)], "b": [round(v, 1) for v in from_st(L / 2, 0)], "w": rw_w, "ang": ang, "L": L,
                "c": [round(cx, 1), round(cz, 1)], "u": [ux, uz], "n": [nx, nz], "tPark": t_park, "sSplit": s_split},
    "aerodrome": poly_pts(aerodrome), "aero": aero,
    "buildings": B, "roads": roads, "roadNames": names, "rail": rail, "water": water, "green": green,
    "labels": labels, "future": fut,
    "landmarks": {"taipei101": [round(v, 1) for v in TAIPEI101], "grandHotel": [round(v, 1) for v in GRAND],
                   "miramar": [round(v, 1) for v in P(25.08325, 121.55735)]},
    "areas": {"aiExtra": round(sum(p.area for p in ai_extra) / 1e4), "site": round(site.area / 1e4), "park": round(park.area / 1e4), "ai": round(ai.area / 1e4), "live": round(live.area / 1e4)},
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT, os.path.getsize(OUT) / 1e6, "MB")
from city_lite import write_lite
write_lite(OUT)
