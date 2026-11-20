"""
Export every dataset of the Manila Zoo Navigation System into one Excel workbook.

    python export_datasets.py                      writes ManilaZoo_Datasets.xlsx next to this script
    python export_datasets.py -o other.xlsx        another file name
    python export_datasets.py --no-image-check     skip checking that image links open (works offline)

Sources
  * The live PostgreSQL database (Supabase), read-only. The connection string is DATABASE_URL, taken
    from the environment or from the project's .env file; it is never printed.
  * ZooBot's training data and model report (ai-training/data, ai-training/models).
  * ZooBot's rule and visitor-information answers, read from the API's source files.

Privacy: visitor names, emails and phone numbers are not exported, nor chat/analytics session ids,
and the audit log (staff emails) is left out. Visitor rows keep their ids, ages, age categories, PWD
flags and visit dates, so visitor statistics still add up.

Needs: pip install openpyxl "psycopg[binary]"
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import sys
import urllib.request
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

try:
    import psycopg
    from openpyxl import Workbook
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
except ImportError as missing:
    sys.exit(f"Missing package ({missing.name}). Run: pip install openpyxl \"psycopg[binary]\"")

ROOT = Path(__file__).resolve().parent
AI = ROOT / "ai-training"
API_SRC = ROOT / "artifacts" / "api-server" / "src"
PUBLIC = ROOT / "artifacts" / "manila-zoo" / "public"
MANILA = timezone(timedelta(hours=8))  # Philippine time has no daylight saving
EXCEL_CELL_MAX = 32_767

# Same rules as the walking-directions code (artifacts/api-server/src/lib/routing.ts)
SNAP_M = 6
M_PER_DEG_LAT = 111_320

# ─── Sheets taken straight from database tables ─────────────────────────────────────────────────
# (sheet, table, description, columns left out, order by)
TABLE_SHEETS = [
    ("Animals", "animals", "Every animal record. location_id is the exhibit (Map_Places.id); category_id is Categories.id.", [], "id"),
    ("Categories", "categories", "Animal categories (Mammals, Birds, Reptiles…).", [], "id"),
    ("Animal_Gallery", "animal_gallery", "Extra photos per animal (animal_id = Animals.id).", [], "animal_id, sort_order, id"),
    ("Map_Places", "map_pins", "Every place on the map: animal exhibits, restrooms, food, gates, buildings, first aid. pin_type says which.", [], "id"),
    ("Map_Features", "map_features", "Building/enclosure/water/garden outlines (GeoJSON polygons, [lng, lat]) with heights for 2D/3D. map_pin_id = Map_Places.id.", [], "id"),
    ("Map_Paths", "map_paths", "Walkways used for walking directions (GeoJSON lines, [lng, lat]). Closed or non-accessible paths are skipped by routing.", [], "id"),
    ("Map_Config", "map_config", "Map start position and zoom.", [], "id"),
    ("Map_Layout_Meta", "map_layout_meta", "Layout version number; visitors' maps refresh when it changes.", [], "id"),
    ("Map_Versions", "map_versions", "Saved map snapshots (the full snapshot JSON is left out; counts are kept).", ["snapshot"], "id"),
    ("Facilities", "facilities", "Park facilities shown on the 3D map (status: open / maintenance / closed).", [], "id"),
    ("Park_Zones", "park_zones", "Tree-survey zones and their marker shape/colour.", [], "sort_order, id"),
    ("Zone_Trees", "zone_trees", "Surveyed trees (zone_id = Park_Zones.id).", [], "zone_id, id"),
    ("QR_Codes", "qr_codes", "Printed QR codes: animal codes (animal_id) and location codes (map_pin_id).", [], "id"),
    ("FAQ", "faq", "FAQ entries, also used by ZooBot.", [], "id"),
    ("Events", "events", "Events (pin_id = Map_Places.id where it happens).", [], "id"),
    ("Announcements", "announcements", "Announcements shown to visitors.", [], "id"),
    ("Ticket_Prices", "ticket_prices", "Admission rates used by ZooBot and the Visit page.", [], "sort_order, id"),
    ("Ticket_Price_History", "ticket_price_history", "Changes to ticket prices.", [], "id"),
    ("Games", "games", "QR scavenger-hunt games.", [], "id"),
    ("Game_Stops", "game_stops", "Animals to find in each game (game_id = Games.id, animal_id = Animals.id).", [], "game_id, sort_order"),
    ("System_Settings", "system_settings", "System settings (key/value).", [], "key"),
    ("Chat_History", "chat_history", "Every ZooBot message (user and assistant) with the detected intent and confidence. Session ids left out.", ["session_id"], "id"),
    ("Analytics", "analytics", "Usage events (QR scans, chat messages, page views). Session ids left out.", ["session_id"], "id"),
    ("Visitor_Registrations", "visitor_registrations", "Registered visits. Names, emails and phones left out for privacy.", ["full_name", "email", "phone"], "id"),
    ("Visitor_Profiles", "visitor_profiles", "Visitor accounts. Names, emails and phones left out for privacy.", ["full_name", "email", "phone"], "created_at"),
    ("Visitor_Group_Members", "visitor_group_members", "Each person in a registered visit (registration_id = Visitor_Registrations.id).", [], "registration_id, member_no"),
]
# Tables deliberately not exported
SKIPPED_TABLES = {
    "audit_logs": "Left out: contains staff emails and full before/after records.",
    "schema_migrations": "Technical table (applied database migrations).",
}

# ─── Helpers ────────────────────────────────────────────────────────────────────────────────────


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        env = ROOT / ".env"
        if env.exists():
            for line in env.read_text(encoding="utf-8").splitlines():
                m = re.match(r"\s*DATABASE_URL\s*=\s*(.+?)\s*$", line)
                if m:
                    url = m.group(1).strip().strip('"').strip("'")
    if not url:
        sys.exit("DATABASE_URL is not set (environment or .env).")
    return url


def excel_value(v, issues: list | None = None, where: str = ""):
    """A database/CSV value as something Excel stores natively: numbers, booleans, dates, or text."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() and abs(v) < 10**15 else float(v)
    if isinstance(v, datetime):
        return v.astimezone(MANILA).replace(tzinfo=None) if v.tzinfo else v
    if isinstance(v, (int, float, date)):
        return v
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, list) and all(isinstance(x, str) for x in v):
        v = "; ".join(v)
    elif isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
    v = ILLEGAL_CHARACTERS_RE.sub("", str(v))
    if len(v) > EXCEL_CELL_MAX:
        if issues is not None:
            issues.append(("Info", where, "", "", "Text longer than an Excel cell allows", f"Cut to {EXCEL_CELL_MAX:,} characters in the workbook."))
        v = v[: EXCEL_CELL_MAX - 20] + " …[truncated]"
    return v


HEADER_FILL = PatternFill("solid", fgColor="1F5C3F")
HEADER_FONT = Font(bold=True, color="FFFFFF")


def write_sheet(wb: Workbook, name: str, headers: list[str], rows: list[list], issues: list) -> int:
    ws = wb.create_sheet(name)
    ws.append(headers)
    widths = [len(h) for h in headers]
    for r in rows:
        values = [excel_value(v, issues, name) for v in r]
        ws.append(values)
        for i, v in enumerate(values):
            if v is None:
                continue
            text = v.strftime("%Y-%m-%d %H:%M") if isinstance(v, datetime) else str(v)
            widths[i] = max(widths[i], min(len(text.split("\n")[0]), 80))
    style_sheet(ws, widths)
    return len(rows)


def style_sheet(ws, widths: list[int]) -> None:
    for cell in ws[1]:
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(vertical="center")
    ws.freeze_panes = "A2"
    if ws.max_row >= 1 and ws.max_column >= 1:
        ws.auto_filter.ref = f"A1:{get_column_letter(ws.max_column)}{max(ws.max_row, 1)}"
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = min(max(w + 2, 8), 62)
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value, datetime):
                cell.number_format = "yyyy-mm-dd hh:mm"
            elif isinstance(cell.value, date):
                cell.number_format = "yyyy-mm-dd"


def aware(v):
    """A database timestamp with its timezone; ones stored without a zone are Philippine time."""
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=MANILA)
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day, 23, 59, tzinfo=MANILA)
    return None


def dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Same flat-earth distance as routing.ts (accurate to centimetres across the zoo)."""
    dy = (lat2 - lat1) * M_PER_DEG_LAT
    dx = (lng2 - lng1) * M_PER_DEG_LAT * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def read_csv(path: Path) -> tuple[list[str], list[list[str]]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    return rows[0], [r for r in rows[1:] if any(c.strip() for c in r)]


def js_strings(text: str, key: str) -> str | None:
    """The value of `key: "…" + "…"` in a TypeScript object (string literals joined with +)."""
    m = re.search(rf"\b{key}:\s*((?:\"(?:[^\"\\]|\\.)*\"\s*\+?\s*)+)", text)
    if not m:
        return None
    return "".join(json.loads(s) for s in re.findall(r"\"(?:[^\"\\]|\\.)*\"", m.group(1)))


def zoo_boundary() -> list[tuple[float, float]]:
    """The zoo fence [lng, lat] from the API's zooBoundary.ts (the same outline the app uses)."""
    text = (API_SRC / "lib" / "zooBoundary.ts").read_text(encoding="utf-8")
    block = text[text.index("ZOO_BOUNDARY"): text.index("];", text.index("ZOO_BOUNDARY"))]
    return [(float(a), float(b)) for a, b in re.findall(r"\[\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*\]", block)]


def inside(lat: float, lng: float, ring: list[tuple[float, float]]) -> bool:
    hit = False
    for i in range(len(ring)):
        x1, y1 = ring[i - 1]
        x2, y2 = ring[i]
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def edit_distance(a: str, b: str) -> int:
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", (s or "").lower())).strip()


# ─── Export ─────────────────────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-o", "--output", default=str(ROOT / "ManilaZoo_Datasets.xlsx"))
    parser.add_argument("--no-image-check", action="store_true", help="Don't check that image links open")
    args = parser.parse_args()

    exported_at = datetime.now(MANILA).replace(tzinfo=None, microsecond=0)
    issues: list[tuple] = []  # (severity, sheet, record id, record name, issue, details)
    readme: list[list] = []   # sheet, contents, source, source rows, exported rows, match, notes
    wb = Workbook()
    wb.remove(wb.active)
    data: dict[str, list[dict]] = {}

    def issue(severity, sheet, rid, name, what, details=""):
        issues.append((severity, sheet, rid, name, what, details))

    print("Reading the database (read-only)...")
    with psycopg.connect(database_url(), connect_timeout=20) as conn:
        conn.read_only = True
        cur = conn.cursor()
        cur.execute("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")
        all_tables = [r[0] for r in cur.fetchall()]

        def count(table: str) -> int:
            cur.execute(f'select count(*) from public."{table}"')
            return cur.fetchone()[0]

        def fetch(table: str, order: str) -> tuple[list[str], list[tuple]]:
            cur.execute(f'select * from public."{table}" order by {order}')
            return [d.name for d in cur.description], cur.fetchall()

        exported_tables = set()
        for sheet, table, desc, drop, order in TABLE_SHEETS:
            if table not in all_tables:
                issue("Medium", sheet, "", "", f"Table {table} not found", "The export expected this table; the database schema may have changed.")
                continue
            cols, rows = fetch(table, order)
            data[table] = [dict(zip(cols, r)) for r in rows]
            keep = [i for i, c in enumerate(cols) if c not in drop]
            n = write_sheet(wb, sheet, [cols[i] for i in keep], [[r[i] for i in keep] for r in rows], issues)
            src = count(table)
            exported_tables.add(table)
            note = f"Columns left out: {', '.join(drop)}." if drop else ""
            readme.append([sheet, desc, f"Database table {table}", src, n, src == n, note])

        # Every other table: listed (with its row count) so nothing is silently missed
        other_tables = []
        for t in all_tables:
            if t in exported_tables:
                continue
            n = count(t)
            other_tables.append((t, n, SKIPPED_TABLES.get(t, "Empty: no rows to export." if n == 0 else "Not exported.")))

    # ─── Derived sheets: exhibits and their animals ───
    animals = data.get("animals", [])
    pins = data.get("map_pins", [])
    pin_by_id = {p["id"]: p for p in pins}
    cat_by_id = {c["id"]: c["name"] for c in data.get("categories", [])}
    exhibits = [p for p in pins if p["pin_type"] == "animal"]
    residents = defaultdict(list)
    for a in animals:
        if a.get("location_id") is not None:
            residents[a["location_id"]].append(a)
    features_by_pin = defaultdict(list)
    for f in data.get("map_features", []):
        if f.get("map_pin_id") is not None:
            features_by_pin[f["map_pin_id"]].append(f)

    rows = []
    for p in exhibits:
        here = sorted(residents.get(p["id"], []), key=lambda a: a["name"])
        rows.append([p["id"], p["name"], p["description"], len(here), ", ".join(a["name"] for a in here),
                     p["lat"], p["lng"], p["is_active"], ", ".join(str(f["id"]) for f in features_by_pin.get(p["id"], []))])
    n = write_sheet(wb, "Exhibits", ["exhibit_id (map_pins.id)", "exhibit_name", "description", "animal_count", "animals", "lat", "lng", "is_active", "map_feature_ids"], rows, issues)
    readme.insert(0, ["Exhibits", "One row per animal exhibit with its animals, from map_pins where pin_type = 'animal' and animals.location_id.",
                      "Derived: map_pins + animals", len(exhibits), n, len(exhibits) == n, ""])

    rows = []
    for a in sorted(animals, key=lambda a: (pin_by_id.get(a.get("location_id"), {}).get("name", "~"), a["name"])):
        p = pin_by_id.get(a.get("location_id"))
        rows.append([p["id"] if p else a.get("location_id"), p["name"] if p else None, a["id"], a["name"], a.get("scientific_name"), cat_by_id.get(a.get("category_id"))])
    n = write_sheet(wb, "Exhibit_Animals", ["exhibit_id", "exhibit_name", "animal_id", "animal_name", "scientific_name", "category"], rows, issues)
    readme.insert(1, ["Exhibit_Animals", "One row per animal–exhibit link (animals.location_id). Animals with no exhibit have an empty exhibit.",
                      "Derived: animals.location_id → map_pins", len(animals), n, len(animals) == n, ""])

    # ─── Derived sheets: walkway points and the routing graph ───
    paths = data.get("map_paths", [])
    rows = []
    for p in paths:
        for seq, (lng, lat) in enumerate((p.get("geometry") or {}).get("coordinates", []), start=1):
            rows.append([p["id"], p["name"], seq, lat, lng, p["is_open"], p["is_accessible"]])
    total_pts = sum(len((p.get("geometry") or {}).get("coordinates", [])) for p in paths)
    n = write_sheet(wb, "Map_Path_Points", ["path_id", "path_name", "point_no", "lat", "lng", "is_open", "is_accessible"], rows, issues)
    readme.append(["Map_Path_Points", "Every point of every walkway, in drawing order (easier to read than the GeoJSON in Map_Paths).",
                   "Derived: map_paths.geometry", total_pts, n, total_pts == n, ""])

    nodes: list[tuple[float, float]] = []
    def node_for(lat, lng):
        for i, (nl, ng) in enumerate(nodes):
            if dist_m(nl, ng, lat, lng) <= SNAP_M:
                return i
        nodes.append((lat, lng))
        return len(nodes) - 1
    edges = []
    for p in sorted(paths, key=lambda p: p["id"]):
        if not p["is_open"]:
            continue
        ids = [node_for(lat, lng) for lng, lat in p["geometry"]["coordinates"]]
        for a, b in zip(ids, ids[1:]):
            if a != b:
                edges.append((a, b, p["id"], p["name"], p["is_accessible"], dist_m(*nodes[a], *nodes[b])))
    adj = defaultdict(set)
    for a, b, *_ in edges:
        adj[a].add(b)
        adj[b].add(a)
    component = {}
    for start in range(len(nodes)):
        if start in component:
            continue
        stack, cid = [start], len(set(component.values()))
        while stack:
            u = stack.pop()
            if u in component:
                continue
            component[u] = cid
            stack.extend(adj[u] - component.keys())
    write_sheet(wb, "Route_Nodes", ["node_id", "lat", "lng", "connections", "network_part"],
                [[i, lat, lng, len(adj[i]), component[i] + 1] for i, (lat, lng) in enumerate(nodes)], issues)
    write_sheet(wb, "Route_Edges", ["from_node", "to_node", "path_id", "path_name", "is_accessible", "length_m"],
                [[a, b, pid, name, acc, round(d, 1)] for a, b, pid, name, acc, d in edges], issues)
    readme.append(["Route_Nodes", f"The walking-directions graph: walkway points merged when closer than {SNAP_M} m, as routing.ts builds it (open walkways only). "
                   "network_part > 1 means a piece not connected to the rest.", "Derived: map_paths (same rules as api-server/src/lib/routing.ts)", len(nodes), len(nodes), True, ""])
    readme.append(["Route_Edges", "Connections between route nodes with their length; Dijkstra's shortest path runs over these.",
                   "Derived: map_paths", len(edges), len(edges), True, "Edges are stored once; walking works in both directions."])

    # ─── ZooBot ───
    labels = json.loads((AI / "models" / "labels.json").read_text(encoding="utf-8"))
    report = json.loads((AI / "models" / "eval_report.json").read_text(encoding="utf-8"))
    train_file = AI / "data" / "train_v5.csv"
    test_file = AI / "data" / "test.csv"
    th, train = read_csv(train_file)
    sh, test = read_csv(test_file)
    train_counts, test_counts = Counter(r[1] for r in train), Counter(r[1] for r in test)
    per = report.get("per_intent") or {}
    rows = []
    for intent, idx in sorted(labels.items(), key=lambda kv: kv[1]):
        m = per.get(intent, {}) if isinstance(per, dict) else {}
        example = next((r[0] for r in train if r[1] == intent), None)
        rows.append([idx, intent, train_counts.get(intent, 0), test_counts.get(intent, 0),
                     m.get("precision"), m.get("recall"), m.get("f1-score", m.get("f1")), example])
    n = write_sheet(wb, "Chatbot_Intents", ["label_id", "intent", "training_examples", "test_examples", "precision", "recall", "f1", "example_question"], rows, issues)
    readme.append(["Chatbot_Intents", f"ZooBot's {len(labels)} intents (BERT labels) with example counts and test scores. Model: {report.get('base_model')}, trained {report.get('trained_at')}, "
                   f"accuracy {report.get('bert', {}).get('accuracy', 0):.1%} on {report.get('test_size')} test questions.",
                   "ai-training/models/labels.json + eval_report.json", len(labels), n, len(labels) == n, ""])
    n = write_sheet(wb, "Chatbot_Train", th, train, issues)
    readme.append(["Chatbot_Train", "Questions the current BERT model was fine-tuned on (English, Tagalog, Taglish) with their intent.",
                   "ai-training/data/train_v5.csv", len(train), n, len(train) == n, f"The trained model reports train_size = {report.get('train_size')}."])
    n = write_sheet(wb, "Chatbot_Test", sh, test, issues)
    readme.append(["Chatbot_Test", "Held-out test questions used to measure accuracy (never trained on).", "ai-training/data/test.csv", len(test), n, len(test) == n, ""])

    rules_text = (API_SRC / "lib" / "zooRules.ts").read_text(encoding="utf-8")
    rule_rows = []
    rules_part = rules_text[rules_text.index("const RULES"): rules_text.index("const INFO")]
    for block in re.split(r"\n  \{\n", rules_part)[1:]:
        title = re.search(r"rule:\s*\{([^}]*)\}", block)
        answer = re.search(r"answer:\s*\{(.*?)\n    \}", block, re.S)
        rule_rows.append(["Visitor rule", js_strings(title.group(1), "en") if title else None, js_strings(title.group(1), "fil") if title else None,
                          js_strings(answer.group(1), "en") if answer else None, js_strings(answer.group(1), "fil") if answer else None, "api-server/src/lib/zooRules.ts (RULES)"])
    info_part = rules_text[rules_text.index("const INFO"):]
    info_part = info_part[: info_part.index("\n];") + 3]
    for block in re.split(r"\n  \{\n", info_part)[1:]:
        topic = re.search(r"//\s*(.+)", block)
        en = js_strings(block, "en")
        # Entries without a comment in the code get the start of their answer as the topic
        title = topic.group(1).strip() if topic else (" ".join((en or "").split()[:6]) + " …" if en else None)
        rule_rows.append(["Visitor information", title, None, en, js_strings(block, "fil"), "api-server/src/lib/zooRules.ts (INFO)"])
    visit_text = (API_SRC / "lib" / "visitInfo.ts").read_text(encoding="utf-8")
    for const, topic in (("HOURS_ANSWER", "Opening hours"), ("TICKETS_ANSWER", "Admission rates (fallback text)")):
        block = visit_text[visit_text.index(const): visit_text.index("};", visit_text.index(const))]
        rule_rows.append(["Fixed answer", topic, None, js_strings(block, "en"), js_strings(block, "fil"), f"api-server/src/lib/visitInfo.ts ({const})"])
    expected_rules = len(re.findall(r"^\s{4}rule:\s*\{", rules_part, re.M)) + len(re.findall(r"^\s{4}answer:", info_part, re.M)) + 2
    n = write_sheet(wb, "Chatbot_Rules", ["kind", "title_or_topic", "title_fil", "answer_en", "answer_fil", "source"], rule_rows, issues)
    readme.append(["Chatbot_Rules", "Answers ZooBot gives from the code rather than the database: official zoo rules, visitor information (reservations, items not allowed…), opening hours.",
                   "api-server/src/lib/zooRules.ts, visitInfo.ts", expected_rules, n, expected_rules == n, "ZooBot uses no LLM or system prompt; its other answers come from the database sheets."])

    # ─── Checks ───
    print("Checking the data...")
    boundary = zoo_boundary()
    exhibit_ids = {p["id"] for p in exhibits}
    animal_ids = {a["id"] for a in animals}

    for a in animals:
        loc = a.get("location_id")
        if loc is None:
            issue("High", "Animals", a["id"], a["name"], "Animal has no exhibit", "Set its exhibit (location_id) in Admin → Animals so ZooBot and the map can place it.")
        elif loc not in pin_by_id:
            issue("High", "Animals", a["id"], a["name"], "Exhibit does not exist", f"location_id {loc} is not a map place.")
        elif loc not in exhibit_ids:
            issue("Medium", "Animals", a["id"], a["name"], "Exhibit is not an animal exhibit", f"Linked to '{pin_by_id[loc]['name']}' ({pin_by_id[loc]['pin_type']}).")
        elif not pin_by_id[loc]["is_active"]:
            issue("Medium", "Animals", a["id"], a["name"], "Exhibit is hidden", f"'{pin_by_id[loc]['name']}' is not active, so visitors don't see where the animal is.")
        missing = [f for f in ("scientific_name", "category_id", "conservation_status", "description", "habitat", "diet", "feeding_schedule", "image_url", "interesting_facts")
                   if a.get(f) in (None, "")]
        if missing:
            issue("Low", "Animals", a["id"], a["name"], "Missing fields", ", ".join(missing) + " (ZooBot answers 'not available' for these).")
        sci = (a.get("scientific_name") or "").strip()
        if sci and not re.fullmatch(r"[A-Z][a-z]+ [a-z]+( [a-z]+)?( \(.+\))?", sci):
            issue("Low", "Animals", a["id"], a["name"], "Scientific name format", f"'{sci}' is not in 'Genus species' form.")

    for p in exhibits:
        if not residents.get(p["id"]):
            issue("Medium", "Exhibits", p["id"], p["name"], "Exhibit has no animals linked",
                  "No animal has this exhibit as its location_id, so ZooBot and the map show no animals here. Link its animals in Admin → Animals.")

    def duplicates(rows_, key, sheet, label):
        groups = defaultdict(list)
        for r in rows_:
            k = key(r)
            if k:
                groups[k].append(r)
        for k, rs in groups.items():
            if len(rs) > 1:
                ids = ", ".join(str(r.get("id", r.get("key"))) for r in rs)
                names = [r.get("name") or r.get("question") or r.get("code") for r in rs]
                # Same species shown as varieties ("Burmese Python" and "Burmese Python (Albino)") is expected
                bases = {norm(re.sub(r"\(.*?\)", "", n or "")) for n in names}
                if label == "scientific name" and len(bases) == 1:
                    issue("Info", sheet, ids, " / ".join(names), "Same species, different variety", "Expected for colour varieties; listed so it isn't mistaken for a duplicate.")
                else:
                    issue("Medium", sheet, ids, names[0], f"Duplicate {label}", f"{len(rs)} rows share the same {label}: {' / '.join(map(str, names))}.")
    duplicates(animals, lambda r: norm(r["name"]), "Animals", "name")
    duplicates(animals, lambda r: norm(r.get("scientific_name")), "Animals", "scientific name")
    duplicates(pins, lambda r: norm(r["name"]), "Map_Places", "name")
    duplicates(data.get("faq", []), lambda r: (norm(r["question"]), r.get("language")), "FAQ", "question")
    duplicates(data.get("qr_codes", []), lambda r: r["code"], "QR_Codes", "code")
    duplicates(data.get("facilities", []), lambda r: norm(r["name"]), "Facilities", "name")

    def near_names(rows_, sheet, field="name"):
        names = [(r["id"], r[field], norm(r[field])) for r in rows_ if r.get(field)]
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                (ia, a, na), (ib, b, nb) = names[i], names[j]
                if na != nb and min(len(na), len(nb)) >= 5 and edit_distance(na, nb) <= 2:
                    issue("Low", sheet, f"{ia}, {ib}", f"{a} / {b}", "Possible typo or near-duplicate name", "The names differ by only one or two letters.")
    near_names(animals, "Animals")
    near_names(pins, "Map_Places")
    # Same word written singular in one exhibit name and plural in another ("Indoor Reptiles" / "Outdoor Reptile")
    words = defaultdict(set)
    for p in exhibits:
        for w in norm(p["name"]).split():
            words[re.sub(r"s$", "", w)].add((w, p["name"]))
    for stem, forms in words.items():
        if len({w for w, _ in forms}) > 1:
            issue("Low", "Exhibits", "", " / ".join(sorted(n for _, n in forms)), "Inconsistent singular/plural in exhibit names",
                  f"'{stem}' is written as {', '.join(sorted({w for w, _ in forms}))}.")

    for p in pins:
        if p.get("lat") is None or p.get("lng") is None:
            issue("High", "Map_Places", p["id"], p["name"], "Place has no coordinates")
        elif not inside(float(p["lat"]), float(p["lng"]), boundary):
            issue("Medium", "Map_Places", p["id"], p["name"], "Place is outside the zoo fence", "The visitor map hides places outside the zoo.")
    for f in data.get("facilities", []):
        if f.get("lat") is not None and not inside(float(f["lat"]), float(f["lng"]), boundary):
            issue("Low", "Facilities", f["id"], f["name"], "Facility is outside the zoo fence")
    for f in data.get("map_features", []):
        if f.get("map_pin_id") is not None and f["map_pin_id"] not in pin_by_id:
            issue("Medium", "Map_Features", f["id"], f["name"], "Linked place does not exist", f"map_pin_id {f['map_pin_id']}.")
    for p in paths:
        pts = (p.get("geometry") or {}).get("coordinates", [])
        if len(pts) < 2:
            issue("Medium", "Map_Paths", p["id"], p["name"], "Walkway has fewer than 2 points")
        if not p["is_open"]:
            issue("Info", "Map_Paths", p["id"], p["name"], "Walkway is closed", "Walking directions avoid it until it is reopened.")
    parts = Counter(component.values())
    if len(parts) > 1:
        issue("Medium", "Route_Nodes", "", "", "Walkway network is in separate pieces",
              f"{len(parts)} pieces (sizes {sorted(parts.values(), reverse=True)}): places on a small piece can't be reached by walking directions.")
    main_part = parts.most_common(1)[0][0] if parts else None
    for p in pins:
        if p.get("lat") is None or not nodes:
            continue
        lat, lng = float(p["lat"]), float(p["lng"])
        best = min(range(len(nodes)), key=lambda i: dist_m(lat, lng, *nodes[i]))
        d = dist_m(lat, lng, *nodes[best])
        if d > 40:
            issue("Low", "Map_Places", p["id"], p["name"], "Far from any walkway", f"Nearest walkway point is {d:.0f} m away; directions end with a long walk off-path.")
        if main_part is not None and component[best] != main_part:
            issue("Medium", "Map_Places", p["id"], p["name"], "Not reachable on the main walkway network", "Its nearest walkway is not connected to the rest.")

    qr_animals = set()
    for q in data.get("qr_codes", []):
        if q.get("animal_id") is None and q.get("map_pin_id") is None:
            issue("Medium", "QR_Codes", q["id"], q["code"], "QR code points to nothing")
        if q.get("animal_id") is not None and q["animal_id"] not in animal_ids:
            issue("High", "QR_Codes", q["id"], q["code"], "QR code's animal does not exist", f"animal_id {q['animal_id']}: scanning it fails.")
        if q.get("map_pin_id") is not None and q["map_pin_id"] not in pin_by_id:
            issue("High", "QR_Codes", q["id"], q["code"], "QR code's place does not exist", f"map_pin_id {q['map_pin_id']}.")
        if q.get("animal_id") is not None and q.get("is_active"):
            qr_animals.add(q["animal_id"])
    for a in animals:
        if a["id"] not in qr_animals:
            issue("Low", "Animals", a["id"], a["name"], "No active QR code", "Visitors can't scan this animal (and it can't be a game stop).")
    for g in data.get("animal_gallery", []):
        if g["animal_id"] not in animal_ids:
            issue("Medium", "Animal_Gallery", g["id"], "", "Photo for an animal that does not exist", f"animal_id {g['animal_id']}.")
    for s in data.get("game_stops", []):
        if s["animal_id"] not in animal_ids:
            issue("High", "Game_Stops", s["id"], "", "Game stop animal does not exist", f"animal_id {s['animal_id']}.")
        elif s["animal_id"] not in qr_animals:
            issue("High", "Game_Stops", s["id"], next(a["name"] for a in animals if a["id"] == s["animal_id"]), "Game stop has no active QR code", "Players can't complete this stop.")

    now = datetime.now(timezone.utc)
    for e in data.get("events", []):
        if e.get("pin_id") is not None and e["pin_id"] not in pin_by_id:
            issue("Medium", "Events", e["id"], e["title"], "Event place does not exist", f"pin_id {e['pin_id']}.")
        end = aware(e.get("end_date") or e.get("start_date"))
        if end and end < now and e.get("is_active") and e.get("status") not in ("cancelled", "archived"):
            issue("Low", "Events", e["id"], e["title"], "Past event still active", f"Ended {end.astimezone(MANILA):%Y-%m-%d}.")
    for an in data.get("announcements", []):
        expires = aware(an.get("expires_at"))
        if expires and expires < now and an.get("is_active"):
            issue("Low", "Announcements", an["id"], an["title"], "Expired announcement still active")
    for t in data.get("ticket_prices", []):
        if not t.get("is_verified") or t.get("status") != "published":
            issue("Low", "Ticket_Prices", t["id"], f"{t['category']} ({t['visitor_type']})", "Price not verified or not published", "ZooBot only quotes verified, published prices.")

    regs = {r["id"]: r for r in data.get("visitor_registrations", [])}
    members = Counter(m["registration_id"] for m in data.get("visitor_group_members", []))
    for rid, r in regs.items():
        if r.get("party_size") is not None and members.get(rid, 0) != r["party_size"]:
            issue("Low", "Visitor_Registrations", rid, "", "Party size doesn't match group members", f"party_size {r['party_size']}, members recorded {members.get(rid, 0)}.")

    known = set(labels)
    for sheet, rows_ in (("Chatbot_Train", train), ("Chatbot_Test", test)):
        for i, r in enumerate(rows_, start=2):
            if r[1] not in known:
                issue("High", sheet, f"row {i}", r[0], "Unknown intent", f"'{r[1]}' is not one of the model's intents.")
        by_text = defaultdict(set)
        for r in rows_:
            by_text[norm(r[0])].add(r[1])
        for text, intents in by_text.items():
            if len(intents) > 1:
                issue("High", sheet, "", text, "Same question labelled with different intents", ", ".join(sorted(intents)))
        dupes = [t for t, c in Counter(norm(r[0]) for r in rows_).items() if c > 1]
        if dupes:
            issue("Low", sheet, "", "; ".join(dupes[:5]) + (" …" if len(dupes) > 5 else ""), "Duplicate questions", f"{len(dupes)} questions appear more than once.")
    leaked = {norm(r[0]) for r in train} & {norm(r[0]) for r in test}
    for t in sorted(leaked):
        issue("High", "Chatbot_Test", "", t, "Test question also in training data", "Inflates the reported accuracy; remove it from one of the two files.")
    for intent in labels:
        if train_counts.get(intent, 0) < 30:
            issue("Low", "Chatbot_Intents", labels[intent], intent, "Few training examples", f"{train_counts.get(intent, 0)} examples.")
    if report.get("train_size") != len(train):
        issue("Medium", "Chatbot_Train", "", "", "Training file differs from the trained model", f"train_v5.csv has {len(train)} rows; the model reports {report.get('train_size')}.")
    train_py = (AI / "train.py").read_text(encoding="utf-8")
    m = re.search(r'"--train",\s*default="([^"]+)"', train_py)
    if m and Path(m.group(1)).name != train_file.name:
        default_rows = len(read_csv(AI / m.group(1))[1]) if (AI / m.group(1)).exists() else "?"
        issue("Medium", "Chatbot_Train", "", "", "train.py's default training file is not the one the model used",
              f"train.py defaults to {m.group(1)} ({default_rows} rows); the deployed model used {train_file.name} ({len(train)} rows). "
              f"Retrain with: python train.py --train data/{train_file.name}")
    if "training_dataset" in dict((t, n) for t, n, _ in other_tables) and dict((t, n) for t, n, _ in other_tables)["training_dataset"] == 0:
        issue("Info", "README", "", "training_dataset", "No admin-added chatbot examples", "The Chatbot Configuration page's training examples table is empty.")

    if not args.no_image_check:
        print("Checking image links...")
        checked: dict[str, str | None] = {}
        def problem(url: str) -> str | None:
            if url in checked:
                return checked[url]
            result = None
            if url.startswith("/"):
                if not (PUBLIC / url.lstrip("/")).exists():
                    result = "file missing from artifacts/manila-zoo/public"
            elif url.startswith("http"):
                try:
                    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "zoo-dataset-export"})
                    with urllib.request.urlopen(req, timeout=10) as r:
                        result = None if r.status < 400 else f"HTTP {r.status}"
                except Exception as e:  # network errors, 404s
                    result = str(getattr(e, "code", "")) and f"HTTP {e.code}" or type(e).__name__
            checked[url] = result
            return result
        for a in animals:
            if a.get("image_url") and (p := problem(a["image_url"])):
                issue("Medium", "Animals", a["id"], a["name"], "Image doesn't open", f"{a['image_url']} ({p})")
        for g in data.get("animal_gallery", []):
            if g.get("image_url") and (p := problem(g["image_url"])):
                issue("Low", "Animal_Gallery", g["id"], "", "Gallery image doesn't open", f"{g['image_url']} ({p})")

    # ─── README and Data_Issues, first in the workbook ───
    severity_order = {"High": 0, "Medium": 1, "Low": 2, "Info": 3}
    issues.sort(key=lambda i: (severity_order.get(i[0], 9), i[1], str(i[2])))
    ws = wb.create_sheet("Data_Issues", 0)
    ws.append(["severity", "sheet", "record_id", "record", "issue", "details / how to fix"])
    for i in issues:
        ws.append([excel_value(v) for v in i])
    style_sheet(ws, [8, 22, 14, 44, 46, 90])
    fills = {"High": "F8CBAD", "Medium": "FFE699", "Low": "DDEBF7"}
    for row in ws.iter_rows(min_row=2):
        if row[0].value in fills:
            row[0].fill = PatternFill("solid", fgColor=fills[row[0].value])

    ws = wb.create_sheet("README", 0)
    ws.append(["Manila Zoo Navigation System: datasets"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append(["Exported", exported_at])
    ws["B2"].number_format = "yyyy-mm-dd hh:mm"
    ws.append(["Source", "Live database (PostgreSQL on Supabase, read-only), ZooBot training files, and ZooBot's rule texts in the API code. Re-run export_datasets.py to refresh."])
    ws.append(["Privacy", "Visitor names, emails and phone numbers, chat/analytics session ids and the audit log are not included."])
    ws.append(["Data issues", f"{len(issues)} found: {sum(i[0] == 'High' for i in issues)} high, {sum(i[0] == 'Medium' for i in issues)} medium, "
               f"{sum(i[0] == 'Low' for i in issues)} low, {sum(i[0] == 'Info' for i in issues)} info. See the Data_Issues sheet."])
    ws.append([])
    header_row = ws.max_row + 1
    ws.append(["sheet", "contents", "source", "source_rows", "exported_rows", "counts_match", "notes"])
    for r in readme:
        ws.append(r)
    for t, n, why in other_tables:
        ws.append([f"(not a sheet) {t}", why, f"Database table {t}", n, 0, None, ""])
    for cell in ws[header_row]:
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
    ws.freeze_panes = f"A{header_row + 1}"
    ws.auto_filter.ref = f"A{header_row}:G{ws.max_row}"
    for col, w in zip("ABCDEFG", (34, 100, 46, 12, 14, 13, 60)):
        ws.column_dimensions[col].width = w
    for row in ws.iter_rows(min_row=header_row + 1):
        row[1].alignment = Alignment(wrap_text=True, vertical="top")
        if row[5].value is False:
            row[5].fill = PatternFill("solid", fgColor="F8CBAD")

    out = Path(args.output)
    try:
        wb.save(out)
    except PermissionError:
        sys.exit(f"Can't write {out}: close it in Excel and run again.")

    mismatches = [r[0] for r in readme if r[5] is False]
    print(f"\nSaved {out}")
    print(f"  {len(wb.sheetnames)} sheets, {len(issues)} data issues")
    print(f"  Row counts: {'all match' if not mismatches else 'MISMATCH in ' + ', '.join(mismatches)}")


if __name__ == "__main__":
    main()
