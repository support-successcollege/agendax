#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agendax-editor / agendax_db.py
------------------------------
שליפה ועדכון של טיוטות ב-Supabase דרך PostgREST, בלי תלות ב-MCP.

משתני סביבה (חובה):
    SUPABASE_URL                 למשל https://kjazrljlfreczicstymr.supabase.co
    SUPABASE_SERVICE_ROLE_KEY    מפתח service_role (עוקף RLS — לעולם לא בקוד ולא ב-git)

פקודות:
    list    --limit 20 [--since 2026-08-18] [--id UUID]   → JSON של טיוטות
    update  --file clean.json [--dry-run]                 → כותב title/excerpt/content בחזרה
    verify  --id UUID                                     → שולף שוב ומדפיס אורך ו-hash

הערה: הניקוי אידמפוטנטי. הרצה חוזרת על טיוטה נקייה מחזירה 0 שינויים,
ולכן אין צורך בעמודת "כבר נערך" בסכמה.
"""

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

FIELDS = "id,title,excerpt,content,category,is_draft,created_at,updated_at"


def cfg():
    url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key:
        sys.stderr.write(
            "חסרים SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY בסביבה.\n"
            "הרץ: export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...\n"
        )
        sys.exit(2)
    return url, key


def req(method: str, path: str, body=None, extra_headers=None):
    url, key = cfg()
    full = f"{url}/rest/v1/{path}"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    headers.update(extra_headers or {})
    r = urllib.request.Request(full, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"HTTP {e.code} על {method} {path}: {e.read().decode('utf-8', 'replace')[:500]}\n")
        sys.exit(1)


def cmd_list(a):
    q = {"select": FIELDS, "is_draft": "eq.true", "order": "created_at.desc", "limit": str(a.limit)}
    if a.id:
        q["id"] = f"eq.{a.id}"
    if a.since:
        q["created_at"] = f"gte.{a.since}"
    rows = req("GET", "articles?" + urllib.parse.urlencode(q))
    print(json.dumps(rows, ensure_ascii=False, indent=2))
    sys.stderr.write(f"נשלפו {len(rows)} טיוטות\n")


def cmd_update(a):
    data = json.loads(open(a.file, encoding="utf-8").read())
    records = data if isinstance(data, list) else [data]
    done = 0
    for rec in records:
        rid = rec.get("id")
        if not rid:
            sys.stderr.write("רשומה בלי id — דילוג\n")
            continue
        payload = {k: rec[k] for k in ("title", "excerpt", "content") if k in rec and rec[k] is not None}
        if not payload:
            continue
        if a.dry_run:
            sys.stderr.write(f"[dry-run] {rid}: {list(payload)}\n")
            continue
        req("PATCH", f"articles?id=eq.{rid}", payload, {"Prefer": "return=minimal"})
        done += 1
        sys.stderr.write(f"עודכן {rid}\n")
    print(json.dumps({"updated": done}, ensure_ascii=False))


def cmd_verify(a):
    rows = req("GET", "articles?" + urllib.parse.urlencode({"select": FIELDS, "id": f"eq.{a.id}"}))
    for r in rows:
        c = r.get("content") or ""
        print(json.dumps({
            "id": r["id"],
            "title": r["title"],
            "chars": len(c),
            "sha256": hashlib.sha256(c.encode("utf-8")).hexdigest()[:16],
            "updated_at": r.get("updated_at"),
        }, ensure_ascii=False, indent=2))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("list");   p.add_argument("--limit", type=int, default=20); p.add_argument("--since"); p.add_argument("--id"); p.set_defaults(f=cmd_list)
    p = sub.add_parser("update"); p.add_argument("--file", required=True); p.add_argument("--dry-run", action="store_true"); p.set_defaults(f=cmd_update)
    p = sub.add_parser("verify"); p.add_argument("--id", required=True); p.set_defaults(f=cmd_verify)

    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
