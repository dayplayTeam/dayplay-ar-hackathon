#!/usr/bin/env python3
"""Rebuild eval/fixtures/corridor_real.json from DayPlay's Supabase (anon REST).

Provenance: every pin traces to a real row in the `entities` table (status=published).
The publishable anon key is NEVER committed — it lives in a local, gitignored env file.

Usage:
  SUPABASE_ENV_FILE=/path/to/supabase_anon.env python3 eval/build_real_fixture.py
  (default env-file path is the local workspace secrets dir; adjust as needed)
"""
import json, os, sys, datetime, urllib.request
from pathlib import Path

REPO = Path(__file__).parent.parent
# Default: repo-local gitignored env file. Override with SUPABASE_ENV_FILE env var.
ENV_FILE = Path(os.environ.get("SUPABASE_ENV_FILE", REPO / ".secrets" / "supabase.env"))
OUT = REPO / "eval" / "fixtures" / "corridor_real.json"

# Mission corridor bbox (Valencia St 16th–24th, slightly widened)
BBOX = dict(lat_min=37.75, lat_max=37.77, lng_min=-122.42, lng_max=-122.40)
MAX_PINS = 12

def load_creds():
    if not ENV_FILE.exists():
        sys.exit(f"env file not found: {ENV_FILE} (SUPABASE_ENV_FILE env var can override)")
    creds = {}
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            creds[k.strip()] = v.strip()
    if "SUPABASE_URL" not in creds or "SUPABASE_ANON_KEY" not in creds:
        sys.exit("env file must define SUPABASE_URL and SUPABASE_ANON_KEY")
    return creds["SUPABASE_URL"], creds["SUPABASE_ANON_KEY"]

def fetch(url, key):
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def main():
    sys.path.insert(0, str(REPO))
    from backend.validator import validate_pin

    base, key = load_creds()
    q = (f"{base}/rest/v1/entities?select=id,title,latitude,longitude,entity_type,event_start_date"
         f"&status=eq.published&latitude=gte.{BBOX['lat_min']}&latitude=lte.{BBOX['lat_max']}"
         f"&longitude=gte.{BBOX['lng_min']}&longitude=lte.{BBOX['lng_max']}&order=latitude.asc&limit=500")
    rows = fetch(q, key)
    print(f"fetched {len(rows)} published rows in bbox")

    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    def parse(s):
        return datetime.datetime.fromisoformat(s.replace("+00:00", "Z")).timestamp()

    # dedupe by title (prefer upcoming occurrence, else earliest)
    by_title = {}
    for r in rows:
        t = r["title"]
        st = parse(r["event_start_date"]) if r.get("event_start_date") else 0
        up = st > now
        cur = by_title.get(t)
        if cur is None or (up and not cur[1]) or (up == cur[1] and st < cur[2]):
            by_title[t] = (r, up, st)
    uniq = [v[0] for v in by_title.values()]

    upcoming = sorted((r for r in uniq if parse(r["event_start_date"]) > now),
                      key=lambda r: r["latitude"])
    past = sorted((r for r in uniq if parse(r["event_start_date"]) <= now),
                  key=lambda r: r["latitude"])
    sel = upcoming[:2]
    if past:
        step = max(1, len(past) // (MAX_PINS - len(sel)))
        sel += past[::step][:MAX_PINS - len(sel)]

    pins, dropped = [], []
    for r in sel:
        pin = {
            "listing_id": r["id"],
            "name": r["title"],
            "lat": r["latitude"],
            "lng": r["longitude"],
            "kind": "saved",
            "starts_at": r.get("event_start_date"),
            "source_tool": "supabase_entities_anon",
        }
        ok, reason = validate_pin(pin)
        (pins if ok else dropped).append((pin, reason))
    for _, why in dropped:
        print(f"validator dropped: {why}")
    OUT.write_text(json.dumps([p for p, _ in pins], indent=2) + "\n")
    print(f"wrote {OUT} with {len(pins)} validated pins")

if __name__ == "__main__":
    main()
