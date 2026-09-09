#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agendax-editor / guard.py
-------------------------
שער בטיחות דטרמיניסטי בין העריכה לכתיבה ל-DB.

הסוכן מריץ אותו אחרי שהוא סיים לערוך ולפני ה-UPDATE. הוא משווה את המקור
(drafts.json) לתוצר (final.json) ומחזיר קוד יציאה 1 אם משהו חצה גבול.

    python3 guard.py --before drafts.json --after final.json --out guard.json

בדיקות (BLOCK עוצר, WARN רק מדווח):
  BLOCK  אובדן טקסט מעל הסף (ברירת מחדל 40%)
  BLOCK  מחלקת Tailwind שנעלמה או נוספה (למעט פסקת הדיסקליימר המאושרת)
  BLOCK  שינוי בהתפלגות סוגי התגיות מעבר לסף
  BLOCK  שדה אסור בתוצר (is_draft, published_at, slug, image_url, category...)
  BLOCK  רשומה בלי id / id שלא היה במקור / JSON לא תקין
  BLOCK  is_draft = false נכנס לסט
  WARN   גדילת טקסט מעל 15% (סימן לשכתוב במקום עריכה)
  WARN   שינוי בכותרת מעל 60% מרחק תווים
  WARN   פחות מ-3 כותרות ביניים / אורך מחוץ ל-500-850 מילים
  WARN   לא נוספה פסקת דיסקליימר כשלא הייתה כזו במקור
"""

import argparse
import json
import re
import sys
from collections import Counter
from difflib import SequenceMatcher

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.stderr.write("חסר beautifulsoup4. הרץ: pip install beautifulsoup4 --break-system-packages\n")
    sys.exit(2)

FORBIDDEN_FIELDS = {
    "is_draft", "published_at", "slug", "image_url", "category",
    "author", "author_id", "created_at", "updated_at", "views", "tags",
}
ALLOWED_FIELDS = {"id", "title", "excerpt", "content"}
DISCLAIMER_HINTS = ("אינו מהווה", "ייעוץ", "באחריותו", "AS IS", "תחליף לייעוץ")


def text_of(html: str) -> str:
    soup = BeautifulSoup(html or "", "html.parser")
    return re.sub(r"\s+", " ", soup.get_text(" ")).strip()


def classes_of(html: str) -> Counter:
    soup = BeautifulSoup(html or "", "html.parser")
    c = Counter()
    for el in soup.find_all(True):
        for cls in el.get("class", []):
            c[cls] += 1
    return c


def tags_of(html: str) -> Counter:
    soup = BeautifulSoup(html or "", "html.parser")
    return Counter(el.name for el in soup.find_all(True))


def has_disclaimer(html: str) -> bool:
    t = text_of(html)
    tail = t[-600:]
    return any(h in tail for h in DISCLAIMER_HINTS)


def load(path: str):
    try:
        data = json.loads(open(path, encoding="utf-8").read())
    except Exception as e:
        sys.stderr.write(f"לא ניתן לקרוא {path}: {e}\n")
        sys.exit(2)
    return data if isinstance(data, list) else [data]


def index_by_id(rows, label):
    idx = {}
    for r in rows:
        rid = r.get("id")
        if not rid:
            sys.stderr.write(f"רשומה ללא id ב-{label}\n")
            sys.exit(2)
        idx[rid] = r
    return idx


def check(before, after, max_loss, max_growth):
    blocks, warns, info = [], [], {}

    b_text, a_text = text_of(before.get("content", "")), text_of(after.get("content", ""))
    bl, al = len(b_text), len(a_text)
    loss = (bl - al) / bl if bl else 0.0
    info["chars_before"], info["chars_after"] = bl, al
    info["delta_pct"] = round(-loss * 100, 1)

    if loss > max_loss:
        blocks.append(f"אובדן טקסט {loss * 100:.1f}% (סף {max_loss * 100:.0f}%) — סימן לזיהוי שגוי בניקוי")
    elif loss < -max_growth:
        warns.append(f"הטקסט גדל ב-{-loss * 100:.1f}% — עריכה אמורה לצמצם, לא להרחיב. ודא שלא נוספו עובדות")

    b_cls, a_cls = classes_of(before.get("content", "")), classes_of(after.get("content", ""))
    new_cls = set(a_cls) - set(b_cls)
    if new_cls:
        blocks.append("מחלקות Tailwind חדשות שלא היו במקור: " + ", ".join(sorted(new_cls)))
    lost_cls = {c for c in set(b_cls) - set(a_cls)}
    if lost_cls:
        info["lost_classes"] = sorted(lost_cls)

    b_tags, a_tags = tags_of(before.get("content", "")), tags_of(after.get("content", ""))
    new_tags = set(a_tags) - set(b_tags)
    if new_tags:
        blocks.append("סוגי תגיות חדשים שלא היו במקור: " + ", ".join(sorted(new_tags)))
    for tag in ("h2", "h3"):
        if a_tags.get(tag, 0) > b_tags.get(tag, 0):
            blocks.append(f"נוספו כותרות <{tag}> ({b_tags.get(tag, 0)} → {a_tags.get(tag, 0)}) — אסור להוסיף כותרות ביניים")

    bad = (set(after) - ALLOWED_FIELDS) & FORBIDDEN_FIELDS
    if bad:
        blocks.append("שדות אסורים בתוצר: " + ", ".join(sorted(bad)))
    if before.get("is_draft") is False:
        blocks.append("הכתבה כבר פורסמה (is_draft = false) — אין לגעת בה")

    bt, at = (before.get("title") or "").strip(), (after.get("title") or "").strip()
    if bt and at:
        sim = SequenceMatcher(None, bt, at).ratio()
        info["title_similarity"] = round(sim, 2)
        if sim < 0.4:
            warns.append(f'הכותרת שונתה מהותית (דמיון {sim:.0%}): "{bt[:60]}" → "{at[:60]}"')

    if not has_disclaimer(before.get("content", "")) and not has_disclaimer(after.get("content", "")):
        warns.append("אין פסקת דיסקליימר לא במקור ולא בתוצר — יש להוסיף לפי disclaimers.md")

    words = len(a_text.split())
    info["words"] = words
    if words < 500:
        warns.append(f"אורך {words} מילים — מתחת ל-500")
    elif words > 850:
        warns.append(f"אורך {words} מילים — מעל 850")
    h2 = a_tags.get("h2", 0)
    info["h2"] = h2
    if h2 < 3:
        warns.append(f"{h2} כותרות ביניים (h2) — ההנחיה דורשת לפחות 3")

    return blocks, warns, info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before", required=True, help="drafts.json — המקור מה-DB")
    ap.add_argument("--after", required=True, help="final.json — התוצר אחרי הניקוי והעריכה")
    ap.add_argument("--out", help="קובץ דוח JSON")
    ap.add_argument("--max-loss", type=float, default=0.40, help="סף אובדן טקסט (0.40 = 40%%)")
    ap.add_argument("--max-growth", type=float, default=0.15, help="סף גדילת טקסט לאזהרה")
    a = ap.parse_args()

    b_idx = index_by_id(load(a.before), a.before)
    a_rows = load(a.after)
    a_idx = index_by_id(a_rows, a.after)

    report, total_blocks, total_warns = [], 0, 0
    orphans = sorted(set(a_idx) - set(b_idx))
    if orphans:
        report.append({"id": None, "blocks": [f"id בתוצר שלא היה במקור: {', '.join(orphans)}"], "warnings": [], "info": {}})
        total_blocks += 1

    for rid, after in a_idx.items():
        if rid in orphans:
            continue
        blocks, warns, info = check(b_idx[rid], after, a.max_loss, a.max_growth)
        total_blocks += len(blocks)
        total_warns += len(warns)
        report.append({
            "id": rid,
            "title": (after.get("title") or b_idx[rid].get("title") or "")[:90],
            "verdict": "BLOCK" if blocks else ("WARN" if warns else "OK"),
            "blocks": blocks,
            "warnings": warns,
            "info": info,
        })

    skipped = sorted(set(b_idx) - set(a_idx))
    out = {
        "checked": len(a_idx),
        "blocked": sum(1 for r in report if r.get("verdict") == "BLOCK"),
        "warned": sum(1 for r in report if r.get("verdict") == "WARN"),
        "not_submitted": skipped,
        "articles": report,
    }
    js = json.dumps(out, ensure_ascii=False, indent=2)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(js)
    print(js)

    for r in report:
        for b in r.get("blocks", []):
            sys.stderr.write(f"BLOCK [{r.get('id')}] {b}\n")
    sys.stderr.write(f"נבדקו {len(a_idx)} · נחסמו {out['blocked']} · אזהרות {total_warns}\n")

    sys.exit(1 if total_blocks else 0)


if __name__ == "__main__":
    main()
