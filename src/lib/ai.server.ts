import { marked } from "marked";

export const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveAndFetch(url: string, timeoutMs = 12000): Promise<{ url: string; text: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const resp = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; YZNewsBot/1.0; +https://yznews.store)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "he,en;q=0.8",
      },
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    const html = await resp.text();
    const text = htmlToText(html).slice(0, 8000);
    if (text.length < 200) return null;
    return { url: resp.url || url, text };
  } catch (e) {
    console.error("resolveAndFetch failed", url, (e as Error).message);
    return null;
  }
}

export async function fetchRss(rssUrl: string) {
  try {
    const r = await fetch(rssUrl);
    if (!r.ok) return [];
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12);
    return items
      .map((m) => {
        const block = m[1];
        const get = (tag: string) => {
          const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block);
          return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
        };
        const title = get("title");
        const link = get("link");
        const pubDate = get("pubDate");
        const descRaw = get("description");
        const desc = descRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return { title, link, pubDate, desc };
      })
      .filter((it) => it.title && it.link);
  } catch (e) {
    console.error("RSS error", rssUrl, e);
    return [];
  }
}

export function mdToArticleHtml(md: string): string {
  let cleaned = (md || "").trim();
  cleaned = cleaned.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  marked.setOptions({ gfm: true, breaks: true });
  let html = marked.parse(cleaned) as string;
  html = html
    .replace(/<h1>/g, '<h1 class="text-3xl md:text-4xl font-bold text-foreground mt-8 mb-4">')
    .replace(/<h2>/g, '<h2 class="text-2xl md:text-3xl font-bold text-foreground mt-8 mb-4 border-b-2 border-primary/20 pb-2">')
    .replace(/<h3>/g, '<h3 class="text-xl md:text-2xl font-bold text-foreground mt-6 mb-3">')
    .replace(/<h4>/g, '<h4 class="text-lg font-bold text-foreground mt-4 mb-2">')
    .replace(/<p>/g, '<p class="text-foreground/90 leading-relaxed mb-4">')
    .replace(/<ul>/g, '<ul class="list-disc pr-6 space-y-2 my-4 text-foreground/90">')
    .replace(/<ol>/g, '<ol class="list-decimal pr-6 space-y-2 my-4 text-foreground/90">')
    .replace(/<li>/g, '<li class="leading-relaxed">')
    .replace(/<blockquote>/g, '<blockquote class="border-r-4 border-primary pr-4 my-6 italic text-foreground/75 bg-muted/30 py-4 rounded-l-lg">')
    .replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80" ')
    .replace(/<strong>/g, '<strong class="font-bold text-foreground">')
    .replace(/<table>/g, '<div class="overflow-x-auto my-6"><table class="w-full border-collapse border border-border text-sm">')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<thead>/g, '<thead class="bg-muted">')
    .replace(/<th>/g, '<th class="border border-border px-3 py-2 text-right font-bold">')
    .replace(/<td>/g, '<td class="border border-border px-3 py-2 text-right">')
    .replace(/<hr>/g, '<hr class="my-8 border-border" />');
  return html;
}

export function researchSystemPrompt(today: string): string {
  return `היום ${today}. אתה כתב חדשות בכיר וכתב כלכלי בעברית. קיבלת תוצאות מחקר עדכניות מהרשת. נסח כתבה עיתונאית-חדשותית מעמיקה ומקיפה ברמה מקצועית גבוהה בעברית תקנית, המבוססת אך ורק על המידע במחקר.

דרישות כלליות:
- מבנה פירמידה הפוכה: לידה חזק, עיקרי הדברים, פירוט, הקשר, רקע, השלכות, סיום.
- **אורך: 800-1400 מילים** בגוף הכתבה — כתבה מקיפה ומעמיקה, לא תקציר.
- חובה לכלול **לפחות 3 כותרות משנה** במרקדאון (## כותרת משנה) לפי נושאי משנה (למשל: "התוצאות הכספיות", "תחזית להמשך", "תגובות בשוק", "רקע").
- השתמש ברשימות bullet (- פריט) כשמתאים, ב-**bold** להדגשות, וב-> לציטוטים.
- אל תעטוף את הפלט ב-code fences, החזר מרקדאון נקי בלבד בשדה body.
- שפה רהוטה, אובייקטיבית, ללא דעות.
- שלב במלואם נתונים מספריים, אחוזים, תאריכים, שמות וציטוטים מהמחקר.

**אם הכתבה עוסקת בדוח כספי / תוצאות חברה / נתונים פיננסיים / מאקרו:**
- העדף את "תוכן מלא של מקורות מובילים" על פני התקצירים — שם הנתונים המדויקים מהדוח עצמו (מאיה / אתר החברה / כלכליסט / גלובס).
- סקור את **כל** הסעיפים המרכזיים של הדוח: הכנסות, רווח גולמי, רווח תפעולי, EBITDA, רווח נקי, תזרים מפעילות, הון עצמי, חוב פיננסי, מזומנים.
- כלול לפחות **טבלת מרקדאון אחת** (GFM) שמסכמת את הנתונים המרכזיים מול תקופה מקבילה.
- הצג שינויים באחוזים (YoY / QoQ) וביחס לתחזיות אנליסטים אם קיימים.
- צטט **דברי הנהלה / מנכ"ל / סמנכ"ל כספים** מתוך הדוח אם מופיעים בתוכן המלא (ב-> בלוקים).
- ציין סיכונים, צפי קדימה (guidance), דיבידנד, ורכישות עצמיות אם הוזכרו.
- כלול תגובת שוק (תנועת המניה, שווי שוק) אם זמינה.

- אל תמציא עובדות, מספרים או ציטוטים שלא מופיעים במחקר. אם נתון חסר — דלג עליו.
- צור פרומפט באנגלית לתמונה חדשותית ריאליסטית (photojournalism, editorial, realistic, no text).

בנוסף, החזר שדה category בעברית מתוך הרשימה: חדשות, טכנולוגיה, כלכלה, פוליטיקה, אקטואליה, שוק ההון.

החזר רק דרך הכלי write_article.`;
}

export const WRITE_ARTICLE_TOOL = {
  type: "function",
  function: {
    name: "write_article",
    description: "מחזיר כתבה עיתונאית מנוסחת בעברית ופרומפט תמונה",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "כותרת ראשית חדה (עד 12 מילים)" },
        subtitle: { type: "string", description: "כותרת משנה / לידה (1-2 משפטים)" },
        body: { type: "string", description: "גוף הכתבה במרקדאון GFM, 800-1400 מילים" },
        category: { type: "string", description: "קטגוריה בעברית: חדשות / טכנולוגיה / כלכלה / פוליטיקה / אקטואליה / שוק ההון" },
        image_prompt: { type: "string", description: "פרומפט באנגלית להפקת תמונה חדשותית ריאליסטית" },
        key_facts: {
          type: "array",
          items: { type: "string" },
          description: "3-5 עובדות מפתח קצרות מהכתבה",
        },
      },
      required: ["title", "subtitle", "body", "category", "image_prompt", "key_facts"],
      additionalProperties: false,
    },
  },
} as const;

export interface VerificationResult {
  overallScore: number;
  isReliable: boolean;
  issues: string[];
  suggestions: string[];
  factChecks: {
    claim: string;
    status: "verified" | "unverified" | "false" | "needs_context";
    explanation: string;
  }[];
  summary: string;
}

export const VERIFY_SYSTEM_PROMPT = `אתה מומחה לבדיקת עובדות (Fact-Checker) מקצועי. תפקידך לנתח כתבות ולזהות:
1. טענות עובדתיות שצריך לאמת
2. מידע שעלול להיות לא מדויק או מטעה
3. סטטיסטיקות או נתונים שצריך לבדוק
4. הטיות או חד-צדדיות

החזר תשובה בפורמט JSON בלבד:
{
  "overallScore": מספר מ-1 עד 10 (10 = אמין ביותר),
  "isReliable": true/false,
  "issues": ["רשימת בעיות שזוהו בכתבה"],
  "suggestions": ["המלצות לשיפור האמינות"],
  "factChecks": [
    {
      "claim": "הטענה שנבדקה",
      "status": "verified" | "unverified" | "false" | "needs_context",
      "explanation": "הסבר קצר"
    }
  ],
  "summary": "סיכום קצר של בדיקת האמינות"
}

הנחיות:
- "verified" = הטענה נכונה ומדויקת לפי הידע שלך
- "unverified" = לא ניתן לאמת, דרושות מקורות חיצוניים
- "false" = הטענה שגויה או מטעה
- "needs_context" = הטענה נכונה חלקית או דורשת הקשר נוסף

היה קפדני אך הוגן. אם הכתבה מבוססת על ידע כללי נכון, תן ציון גבוה.
החזר JSON תקין בלבד, ללא טקסט נוסף.`;

export function socialPostPrompt(params: { title: string; excerpt: string; category: string; url: string; truncatedContent: string }): string {
  const { title, excerpt, category, url, truncatedContent } = params;
  return `אתה כותב תוכן מקצועי ומעמיק לרשתות חברתיות עבור אתר חדשות בשם YZ News.
צור פוסט מרשים לרשת חברתית (פייסבוק/טוויטר/לינקדאין) על הכתבה הבאה.

הפוסט צריך לכלול:
- כותרת מושכת או שאלה פרובוקטיבית שמעוררת סקרנות
- תיאור מעמיק של 4-5 משפטים שנותן רקע על הנושא, מסביר למה זה חשוב, מספק הקשר רחב יותר ומסקרן את הקורא לרצות לדעת עוד
- אל תתייחס לתמונת הכתבה או לתוכן חזותי כלשהו - התמקד רק בתוכן הכתוב
- אמוג'ים רלוונטיים בתוך הטקסט
- קריאה לפעולה שמעודדת את הקוראים ללחוץ על הלינק לכתבה המלאה
- חובה לסיים עם הלינק לכתבה המלאה ואז האשטגים בשורה האחרונה ממש, בפורמט הזה:
  📖 לכתבה המלאה: ${url}
  
  (שורה ריקה)
  האשטגים בעברית (לפחות 4)

חשוב מאוד: האשטגים תמיד בסוף הפוסט, אחרי הלינק. אף פעם לא לפני.

פרטי הכתבה:
כותרת: ${title}
תקציר: ${excerpt}
קטגוריה: ${category}
תוכן הכתבה: ${truncatedContent}
לינק: ${url}

כתוב את הפוסט בעברית. אל תוסיף הערות או הסברים, רק את הפוסט עצמו. וודא שהלינק מופיע לפני האשטגים והאשטגים בסוף.`;
}

export function whatsappPostPrompt(params: { title: string; excerpt: string; category: string; url: string; truncatedContent: string }): string {
  const { title, excerpt, category, url, truncatedContent } = params;
  return `אתה כותב הודעות עבור ערוץ וואטסאפ של אתר חדשות בשם YZ News.
צור הודעה קצרה, ממוקדת ומסקרנת לערוץ וואטסאפ על הכתבה הבאה.

ההודעה צריכה להיות:
- קצרה ותמציתית (מתאימה לוואטסאפ - לא פוסט ארוך)
- כותרת מודגשת בפורמט וואטסאפ: *הכותרת בכוכביות*
- 2-3 שורות תקציר מסקרנות שגורמות לרצות לקרוא עוד
- 1-2 אמוג'ים רלוונטיים (לא להגזים)
- שורה ריקה ואז קריאה לפעולה קצרה עם הלינק
- ללא האשטגים (לא רלוונטיים בוואטסאפ)
- אל תתייחס לתמונת הכתבה

פורמט מבוקש:
*כותרת מודגשת* 🔴

תקציר קצר ומסקרן בשורה-שתיים שמסביר על מה הכתבה ולמה כדאי לקרוא.

📰 לכתבה המלאה:
${url}

פרטי הכתבה:
כותרת: ${title}
תקציר: ${excerpt}
קטגוריה: ${category}
תוכן: ${truncatedContent}

כתוב בעברית. החזר רק את ההודעה עצמה ללא הסברים.`;
}

export const ANALYZE_SITE_SYSTEM_PROMPT = "אתה יועץ אסטרטגי מומחה לאתרי חדשות דיגיטליים. אתה מנתח נתונים ונותן המלצות מעשיות, ספציפיות ומבוססות נתונים. כתוב תמיד בעברית.";

export function analyzeSiteDataPrompt(params: {
  totalViews: number;
  weekViews: number;
  articlesCount: number;
  categoryNames: string;
  topArticlesText: string;
  referrersText: string;
  categoryViewsText: string;
  trafficFlowText: string;
}): string {
  const { totalViews, weekViews, articlesCount, categoryNames, topArticlesText, referrersText, categoryViewsText, trafficFlowText } = params;
  return `
אתה יועץ אסטרטגי לאתר חדשות בשם YZ News. נתח את הנתונים הבאים ותן המלצות מעשיות ומפורטות.

## נתוני האתר:

### סטטיסטיקות כלליות:
- סה"כ צפיות כל הזמנים: ${totalViews || 0}
- צפיות בשבוע האחרון: ${weekViews || 0}
- סה"כ כתבות שפורסמו: ${articlesCount || 0}
- קטגוריות פעילות: ${categoryNames}

### כתבות מובילות (לפי צפיות):
${topArticlesText}

### מקורות תנועה (חודש אחרון):
${referrersText}

### ביצועי קטגוריות:
${categoryViewsText}

### זרימת תנועה (מאיפה מגיעים לאיזו כתבה):
${trafficFlowText}

## הנחיות:
1. נתח את הנתונים בצורה מעמיקה
2. זהה דפוסים ומגמות
3. המלץ על פעולות קונקרטיות - לא רק כתבות, אלא גם:
   - שינויים במבנה האתר
   - קטגוריות שכדאי לחזק או להוסיף
   - כתבות שכדאי לקדם/להמליץ עליהן (בהתבסס על תנועה)
   - מקורות תנועה שכדאי לנצל
   - תזמון פרסום אופטימלי
   - שיפורי SEO
4. כתוב בעברית בצורה ברורה ומעשית
5. השתמש באימוג'ים לסימון סעיפים
6. תן לפחות 5 המלצות מפורטות`;
}

export async function assertAdmin(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
}
