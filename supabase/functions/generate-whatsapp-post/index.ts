// deno-lint-ignore-file no-explicit-any
// Writes the WhatsApp-channel message for one article.
//
// Claude writes this one: the channel's copy is short, tonal and read by
// people rather than crawlers, and it reads better for it. Gemini stays
// behind it as the fallback, so a bad Anthropic minute costs a retry rather
// than the button. An empty answer is an error either way — the panel cannot
// tell an empty string apart from never having generated anything.
import { authorize, callClaude, callModelWithFallback, corsHeaders, json } from "../_shared/ingest.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || "").trim();
    // Readable, not escaped: a Hebrew slug arrives from some callers already
    // percent-encoded, which reaches the channel as an unreadable wall of
    // %D7%9E. decodeURI leaves the reserved characters (:/?#) alone, so the
    // address stays valid while the Hebrew becomes Hebrew again.
    const url = ((raw: string) => {
      try {
        return decodeURI(raw);
      } catch {
        return raw;
      }
    })(String(body?.url || "").trim());
    if (!title) return json({ error: "חסרה כותרת הכתבה" }, 400);

    const excerpt = String(body?.excerpt || "");
    const category = String(body?.category || "");
    // The body arrives as article HTML; the model only needs the prose.
    const content = String(body?.content || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    const prompt = `אתה כותב הודעות עבור ערוץ הוואטסאפ של Agendax, אתר ישראלי המסקר הייטק, בינה מלאכותית, שוקי הון וחברות.
צור הודעה קצרה, ממוקדת ומסקרנת על הכתבה הבאה.

ההודעה צריכה להיות:
- קצרה ותמציתית (הודעת וואטסאפ, לא פוסט ארוך)
- כותרת מודגשת בפורמט וואטסאפ: *הכותרת בכוכביות*
- 2-3 שורות תקציר מסקרנות שגורמות לרצות לקרוא עוד
- 1-2 אמוג'ים רלוונטיים (לא להגזים)
- **אל תכתוב קישור ואל תכתוב שורת "לכתבה המלאה"** — המערכת מוסיפה אותם בעצמה
- ללא האשטגים (לא רלוונטיים בוואטסאפ)
- אל תתייחס לתמונת הכתבה

פורמט מבוקש:
*כותרת מודגשת* 🔴

תקציר קצר ומסקרן בשורה-שתיים שמסביר על מה הכתבה ולמה כדאי לקרוא.

פרטי הכתבה:
כותרת: ${title}
תקציר: ${excerpt}
קטגוריה: ${category}
תוכן: ${content || "לא סופק"}

כתוב בעברית. **החזר אך ורק את ההודעה עצמה** — בלי הסברים, בלי כותרות עזר, בלי ציטוט. כל תו שתחזיר יישלח לערוץ כלשונו.`;

    // Hebrew costs roughly two tokens a word here, and the old 500-token cap
    // truncated longer messages mid-sentence — which reached the panel as a
    // half-written post nobody could use.
    const request = { messages: [{ role: "user", content: prompt }], max_tokens: 1200 };
    let data: Record<string, unknown>;
    try {
      data = await callClaude(request);
    } catch (e) {
      console.error("Claude failed, falling back to Gemini:", (e as Error)?.message);
      data = await callModelWithFallback(request);
    }

    const post = String(
      (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "",
    ).trim();

    // An empty answer is a failure, not a result. Saying so lets the panel
    // show why instead of silently resetting its button.
    if (!post) return json({ error: "המודל לא החזיר הודעה — נסו שוב" }, 502);

    // The call to action is assembled here, never by the model. Asked for a
    // link, it writes the Hebrew slug from memory and truncates it — a message
    // that looks right and leads to a 404. Anything link-shaped is stripped
    // from the answer and the real URL is appended exactly once.
    const cleaned = post
      .replace(/https?:\/\/\S+/g, "")
      .replace(/^.*(?:לכתבה המלאה|לקריאה המלאה|לכתבה באתר).*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const withLink = url ? `${cleaned}\n\n📰 לכתבה המלאה:\n${url}` : cleaned;

    return json({ post: withLink });
  } catch (e: any) {
    console.error("generate-whatsapp-post error", e);
    return json({ error: e?.message || "שגיאה לא ידועה" }, 500);
  }
});
