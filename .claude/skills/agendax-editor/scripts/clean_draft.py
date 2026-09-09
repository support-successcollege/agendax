#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agendax-editor / clean_draft.py
--------------------------------
מנקה מכני-דטרמיניסטי לטיוטות של Agendax.

מה הוא עושה (בלי מודל, בלי ניחושים):
  1. מקפים: — – ― ‒ − ⸺ ⸻ → "-"
  2. טיפוגרפיה: מרכאות מסולסלות, אליפסיס, רווחים כפולים, רווח לפני פיסוק,
     תווי כיווניות (LRM/RLM), NBSP, פיסוק כפול (!!!, ???).
  3. מקורות: כותרת "מקורות"/"קישורים"/"לקריאה נוספת" + כל הבלוק שאחריה,
     פסקאות "מקור: ...", קישורים חיצוניים (הטקסט נשאר, ה-<a> יורד), URL חשוף.
  4. פרסומות: בלוקים עם סימני חסות/תוכן שיווקי, פסקאות CTA קצרות,
     adsbygoogle / iframe / script, קישורי אפיליאייט (utm_/aff/ref).
  5. ניקוי שאריות: פסקאות ריקות, code fences, רווחים בקצוות.

מה הוא לא עושה: לא נוגע בתוכן עצמי, לא משכתב, לא מתקן שגיאות כתיב לשוניות
(זה התפקיד של Claude בשלב השני), ולא נוגע בפסקת הדיסקליימר.

שימוש:
    python3 clean_draft.py --in draft.json --out clean.json
    cat draft.json | python3 clean_draft.py > clean.json
    python3 clean_draft.py --in draft.json --report-only

קלט (JSON): {"id": "...", "title": "...", "excerpt": "...", "content": "<html>"}
           או מערך של אובייקטים כאלה.
פלט (JSON): אותו אובייקט + "changes": [...] + "warnings": [...]

דגלים:
    --keep-links      לא לפרק קישורים חיצוניים
    --keep-ads        לא להסיר בלוקים פרסומיים (רק לדווח)
    --report-only     לא להחזיר תוכן מנוקה, רק את יומן השינויים
"""

import argparse
import json
import re
import sys

try:
    from bs4 import BeautifulSoup, NavigableString, Comment
except ImportError:  # pragma: no cover
    sys.stderr.write("חסר beautifulsoup4. התקן: pip install beautifulsoup4 --break-system-packages\n")
    raise

# ---------------------------------------------------------------------------
# קבועים
# ---------------------------------------------------------------------------

INTERNAL_HOSTS = ("agendax.co.il", "www.agendax.co.il")

DASHES = "—–―‒−⸺⸻﹘﹣－"

# כותרת שפותחת בלוק מקורות
SOURCE_HEADING = re.compile(
    r"^\s*(מקורות|מקור|מקורות נוספים|קישורים|קישורים רלוונטיים|לקריאה נוספת|"
    r"קרדיט|קרדיטים|הפניות|לינקים|sources?|references?|further\s+reading|read\s+more)\s*:?\s*$",
    re.I,
)

# פסקה שכולה שורת מקור
SOURCE_LINE = re.compile(
    r"^\s*(מקור|מקורות|קרדיט|צילום|קרדיט תמונה|תמונה|source|credit|photo|via)\s*[:\-]\s*\S",
    re.I,
)

# סימני פרסומת / תוכן ממומן
AD_MARKERS = re.compile(
    r"(תוכן\s+שיווקי|כתבה\s+ממומנת|פוסט\s+ממומן|תוכן\s+ממומן|בחסות|בשיתוף\s+עם|"
    r"בשיתוף\s+פעולה\s+עם|מודעה|פרסומת|פרסום\s*:|ממומן|sponsored|advertisement|"
    r"\badvertorial\b|promoted\s+content|paid\s+partnership|affiliate)",
    re.I,
)

# קריאה לפעולה שיווקית מובהקת — ציווי שיווקי, תמיד פרסומת
CTA_HARD = re.compile(
    r"(לחצו\s+כאן|לחץ\s+כאן|לחצי\s+כאן|הירשמו\s+עכשיו|הרשמו\s+עכשיו|הצטרפו\s+עכשיו|"
    r"להרשמה\s+לחצו|לפרטים\s+נוספים\s+לחצו|לפרטים\s+והרשמה|קנו\s+עכשיו|הזמינו\s+עכשיו|"
    r"רכשו\s+עכשיו|נסו\s+בחינם|התנסו\s+בחינם|לרכישה\s+לחצו|"
    r"buy\s+now|shop\s+now|sign\s+up\s+now|subscribe\s+now|click\s+here|"
    r"get\s+started\s+now)",
    re.I,
)

# ניסוח מסחרי שיכול להיות גם ידיעה לגיטימית ("מבצע בלעדי שהשיקה החברה…").
# נמחק רק אם הפסקה קצרה מאוד או שיש בה קישור — כלומר היא באנר, לא משפט.
CTA_SOFT = re.compile(
    r"(קוד\s+קופון|קופון\s+הנחה|הנחה\s+בלעדית|מבצע\s+בלעדי|במחיר\s+מיוחד|"
    r"limited\s+time\s+offer|learn\s+more|special\s+offer|exclusive\s+deal)",
    re.I,
)

# פסקת דיסקליימר — לעולם לא נמחקת, גם אם היא מכילה "תוכן שיווקי"
DISCLAIMER = re.compile(
    r"(אינו\s+מהווה\s+ייעוץ|אינה\s+מהווה\s+ייעוץ|האמור\s+בכתבה|גילוי\s+נאות|"
    r"אינו\s+מהווה\s+המלצה|באחריותו\s+הבלעדית|למטרות\s+מידע\s+והעשרה|"
    r"אינו\s+מהווה\s+תחליף|המערכת\s+אינה\s+אחראית|דיסקליימר)",
    re.I,
)

TRACKING_PARAM = re.compile(r"^(utm_|aff|affiliate|ref|referrer|partner|clickid|cid|fbclid|gclid|tag|campaign)", re.I)

AD_CLASS = re.compile(r"(adsbygoogle|(^|[-_ ])ads?([-_ ]|$)|advert|banner|promo|sponsor|taboola|outbrain|dianomi)", re.I)

BARE_URL = re.compile(r"(?<![\w@])https?://\S+")

BLOCK_TAGS = ("p", "div", "section", "aside", "blockquote", "ul", "ol", "figure", "table")
HEADINGS = ("h1", "h2", "h3", "h4", "h5", "h6")


# ---------------------------------------------------------------------------
# תיקוני טקסט
# ---------------------------------------------------------------------------

def fix_text(s: str, log: list, where: str) -> str:
    """תיקונים מכניים על מחרוזת טקסט. מחזיר את המחרוזת המתוקנת ומוסיף ליומן."""
    original = s

    # 1. מקפים ארוכים → מקף קצר. עם רווחים משני הצדדים → " - ", אחרת "-".
    s = re.sub(r"[ \t ]*[" + DASHES + r"][ \t ]*(?=\s|$)", " - ", s)
    s = re.sub(r"(?<=\s)[ \t ]*[" + DASHES + r"][ \t ]*", " - ", s)
    s = re.sub(r"[" + DASHES + r"]", "-", s)

    # 2. תווי כיווניות ורווחים לא-שוברים
    s = re.sub(r"[‎‏‪-‮⁦-⁩﻿​]", "", s)
    s = s.replace(" ", " ").replace(" ", " ").replace(" ", " ")

    # 3. מרכאות ואליפסיס
    s = s.replace("“", '"').replace("”", '"').replace("„", '"')
    s = s.replace("«", '"').replace("»", '"')
    s = s.replace("‘", "'").replace("’", "'").replace("‚", "'")
    s = s.replace("…", "...")

    # 4. פיסוק כפול
    s = re.sub(r"!{2,}", "!", s)
    s = re.sub(r"\?{2,}", "?", s)
    s = re.sub(r"\.{4,}", "...", s)

    # 5. רווח לפני פיסוק / חוסר רווח אחריו
    s = re.sub(r"[ \t]+([,.;:!?])", r"\1", s)
    s = re.sub(r"([,;:])(?=[֐-׿A-Za-z])", r"\1 ", s)
    s = re.sub(r"([.!?])(?=[֐-׿])", r"\1 ", s)

    # 6. רווחים בתוך סוגריים ומרכאות
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"\s+\)", ")", s)

    # 7. רווחים כפולים
    s = re.sub(r"[ \t]{2,}", " ", s)

    if s != original:
        log.append({
            "type": "typography",
            "where": where,
            "before": original.strip()[:160],
            "after": s.strip()[:160],
        })
    return s


def text_of(el) -> str:
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True))


def is_disclaimer(el) -> bool:
    return bool(DISCLAIMER.search(text_of(el)))


# ---------------------------------------------------------------------------
# ניקוי HTML
# ---------------------------------------------------------------------------

def clean_html(html: str, keep_links: bool = False, keep_ads: bool = False):
    log, warnings = [], []
    html = (html or "").strip()
    html = re.sub(r"^```(?:html|markdown|md)?\s*\n?|\n?```$", "", html).strip()

    soup = BeautifulSoup(html, "html.parser")

    # --- הערות HTML -------------------------------------------------------
    for c in soup.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()

    # --- סקריפטים / iframes / יחידות מודעות ------------------------------
    for tag in soup.find_all(["script", "style", "iframe", "ins", "noscript"]):
        if tag.name in ("script", "style", "iframe", "noscript") or AD_CLASS.search(" ".join(tag.get("class", []) or [])):
            log.append({"type": "ad_removed", "reason": f"<{tag.name}>", "text": text_of(tag)[:120]})
            tag.decompose()

    # --- בלוק מקורות שנפתח בכותרת ---------------------------------------
    for h in list(soup.find_all(HEADINGS)):
        if not h.parent:
            continue
        if SOURCE_HEADING.match(text_of(h)):
            level = int(h.name[1])
            removed = [text_of(h)]
            sib = h.next_sibling
            while sib is not None:
                nxt = sib.next_sibling
                if getattr(sib, "name", None) in HEADINGS and int(sib.name[1]) <= level:
                    break
                if getattr(sib, "name", None) or (isinstance(sib, NavigableString) and sib.strip()):
                    if getattr(sib, "name", None) and is_disclaimer(sib):
                        break
                    txt = text_of(sib) if getattr(sib, "name", None) else str(sib).strip()
                    if txt:
                        removed.append(txt[:120])
                    sib.extract()
                sib = nxt
            log.append({"type": "sources_removed", "reason": "בלוק מקורות", "text": " | ".join(removed)[:300]})
            h.decompose()

    # --- בלוקים: מקור / פרסומת / CTA -------------------------------------
    for el in list(soup.find_all(BLOCK_TAGS)):
        if not el.parent:
            continue
        # אל תמחק מיכל שמכיל בלוקים אחרים — רק עלים
        if el.find(BLOCK_TAGS):
            continue
        txt = text_of(el)
        if not txt:
            continue
        if is_disclaimer(el):
            continue

        if SOURCE_LINE.match(txt) and len(txt) < 300:
            log.append({"type": "sources_removed", "reason": "שורת מקור", "text": txt[:160]})
            el.decompose()
            continue

        if AD_MARKERS.search(txt) and len(txt) < 600:
            if keep_ads:
                warnings.append(f"בלוק פרסומי אותר ולא הוסר (--keep-ads): {txt[:120]}")
            else:
                log.append({"type": "ad_removed", "reason": "סימן חסות/תוכן ממומן", "text": txt[:160]})
                el.decompose()
            continue

        hard = CTA_HARD.search(txt) and len(txt) < 220
        soft = CTA_SOFT.search(txt) and (len(txt) < 120 or el.find("a"))
        if hard or soft:
            if keep_ads:
                warnings.append(f"פסקת CTA אותרה ולא הוסרה (--keep-ads): {txt[:120]}")
            else:
                log.append({
                    "type": "ad_removed",
                    "reason": "קריאה לפעולה שיווקית" if hard else "ניסוח מסחרי בפסקה קצרה/עם קישור",
                    "text": txt[:160],
                })
                el.decompose()
            continue

    # --- קישורים ----------------------------------------------------------
    for a in list(soup.find_all("a")):
        href = (a.get("href") or "").strip()
        text = text_of(a)
        internal = any(h in href for h in INTERNAL_HOSTS) or href.startswith(("/", "#"))
        tracking = bool(re.search(r"[?&]", href) and any(
            TRACKING_PARAM.match(p.split("=")[0]) for p in href.split("?")[-1].split("&") if p
        ))
        if internal and not tracking:
            continue
        if keep_links and not tracking:
            continue
        reason = "קישור אפיליאייט/מעקב" if tracking else "קישור למקור חיצוני"
        log.append({"type": "link_unwrapped", "reason": reason, "text": f"{text[:80]} → {href[:100]}"})
        a.replace_with(NavigableString(text))

    # --- URL חשוף בטקסט ---------------------------------------------------
    for node in list(soup.find_all(string=True)):
        if BARE_URL.search(str(node)):
            new = BARE_URL.sub("", str(node))
            new = re.sub(r"\s*\(\s*\)", "", new)
            log.append({"type": "sources_removed", "reason": "URL חשוף", "text": str(node)[:160]})
            node.replace_with(NavigableString(new))

    # --- טיפוגרפיה על כל צומת טקסט ---------------------------------------
    for node in list(soup.find_all(string=True)):
        if node.parent and node.parent.name in ("script", "style"):
            continue
        fixed = fix_text(str(node), log, "content")
        if fixed != str(node):
            node.replace_with(NavigableString(fixed))

    # --- שאריות ריקות -----------------------------------------------------
    for el in list(soup.find_all(BLOCK_TAGS + HEADINGS)):
        if el.parent and not text_of(el) and not el.find(["img", "br", "hr", "iframe"]):
            el.decompose()

    out = str(soup)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out, log, warnings


# ---------------------------------------------------------------------------
# מעטפת
# ---------------------------------------------------------------------------

def clean_record(rec: dict, keep_links=False, keep_ads=False, report_only=False) -> dict:
    log, warnings = [], []

    title = rec.get("title") or ""
    excerpt = rec.get("excerpt") or ""
    new_title = fix_text(title, log, "title")
    new_excerpt = fix_text(excerpt, log, "excerpt")

    content = rec.get("content") or ""
    new_content, clog, cwarn = clean_html(content, keep_links, keep_ads)
    log += clog
    warnings += cwarn

    # אזהרות איכות שדורשות עין אנושית / Claude
    if not DISCLAIMER.search(new_content):
        warnings.append("לא נמצאה פסקת דיסקליימר בסוף הכתבה — יש להוסיף לפי התבנית המתאימה.")
    h2s = len(re.findall(r"<h2", new_content, re.I))
    if h2s < 3:
        warnings.append(f"נמצאו {h2s} כותרות ביניים (h2) — ההנחיה דורשת לפחות 3.")
    words = len(re.sub(r"<[^>]+>", " ", new_content).split())
    if words < 450:
        warnings.append(f"אורך גוף הכתבה כ-{words} מילים — מתחת ל-500 שבהנחיות.")
    if words > 950:
        warnings.append(f"אורך גוף הכתבה כ-{words} מילים — מעל ל-850 שבהנחיות.")

    result = {
        "id": rec.get("id"),
        "changes": log,
        "warnings": warnings,
        "stats": {
            "typography": sum(1 for c in log if c["type"] == "typography"),
            "sources_removed": sum(1 for c in log if c["type"] == "sources_removed"),
            "ads_removed": sum(1 for c in log if c["type"] == "ad_removed"),
            "links_unwrapped": sum(1 for c in log if c["type"] == "link_unwrapped"),
            "words": words,
            "h2": h2s,
        },
    }
    if not report_only:
        result.update({"title": new_title, "excerpt": new_excerpt, "content": new_content})
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp")
    ap.add_argument("--out", dest="out")
    ap.add_argument("--keep-links", action="store_true")
    ap.add_argument("--keep-ads", action="store_true")
    ap.add_argument("--report-only", action="store_true")
    args = ap.parse_args()

    raw = open(args.inp, encoding="utf-8").read() if args.inp else sys.stdin.read()
    data = json.loads(raw)
    records = data if isinstance(data, list) else [data]

    out = [clean_record(r, args.keep_links, args.keep_ads, args.report_only) for r in records]
    payload = json.dumps(out if isinstance(data, list) else out[0], ensure_ascii=False, indent=2)

    if args.out:
        open(args.out, "w", encoding="utf-8").write(payload)
        sys.stderr.write(f"נכתב ל-{args.out}\n")
    else:
        print(payload)


if __name__ == "__main__":
    main()
