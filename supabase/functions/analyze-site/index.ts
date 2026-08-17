import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data, error } = await authClient.auth.getClaims(token);
  if (error || !data?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await authClient.rpc("has_role", {
    _user_id: data.claims.sub, _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gather site data
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      { data: topArticles },
      { data: recentViews },
      { data: referrerData },
      { data: articles },
      { data: categories },
      { count: totalViews },
      { count: weekViews },
    ] = await Promise.all([
      supabase.rpc("get_article_view_counts"),
      supabase.from("page_views").select("article_id, referrer, viewed_at").gte("viewed_at", weekAgo.toISOString()).order("viewed_at", { ascending: false }).limit(500),
      supabase.from("page_views").select("referrer, article_id").gte("viewed_at", monthAgo.toISOString()).limit(1000),
      supabase.from("articles").select("id, title, category, category_slug, date, is_draft, excerpt").eq("is_draft", false).order("date", { ascending: false }).limit(50),
      supabase.from("categories").select("name, slug").eq("is_active", true),
      supabase.from("page_views").select("*", { count: "exact", head: true }),
      supabase.from("page_views").select("*", { count: "exact", head: true }).gte("viewed_at", weekAgo.toISOString()),
    ]);

    // Build article view map
    const viewMap: Record<string, number> = {};
    topArticles?.forEach((r: any) => { if (r.article_id) viewMap[r.article_id] = Number(r.view_count); });

    // Enrich articles with views
    const enrichedArticles = articles?.map((a: any) => ({
      title: a.title,
      category: a.category,
      date: a.date,
      views: viewMap[a.id] || 0,
    })).sort((a: any, b: any) => b.views - a.views) || [];

    // Referrer analysis
    const referrerCounts: Record<string, number> = {};
    referrerData?.forEach((r: any) => {
      const ref = r.referrer || "ישיר";
      referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    });

    // Traffic flow analysis: which referrers lead to which articles
    const refToArticle: Record<string, Record<string, number>> = {};
    referrerData?.forEach((r: any) => {
      if (!r.article_id || !r.referrer) return;
      if (!refToArticle[r.referrer]) refToArticle[r.referrer] = {};
      const articleTitle = articles?.find((a: any) => a.id === r.article_id)?.title || r.article_id;
      refToArticle[r.referrer][articleTitle] = (refToArticle[r.referrer][articleTitle] || 0) + 1;
    });

    // Category performance
    const categoryViews: Record<string, number> = {};
    articles?.forEach((a: any) => {
      categoryViews[a.category] = (categoryViews[a.category] || 0) + (viewMap[a.id] || 0);
    });

    const dataPrompt = `
אתה יועץ אסטרטגי לAgendax, אתר ישראלי המסקר הייטק, בינה מלאכותית, שוקי הון וחברות. נתח את הנתונים הבאים ותן המלצות מעשיות ומפורטות.

## נתוני האתר:

### סטטיסטיקות כלליות:
- סה"כ צפיות כל הזמנים: ${totalViews || 0}
- צפיות בשבוע האחרון: ${weekViews || 0}
- סה"כ כתבות שפורסמו: ${articles?.length || 0}
- קטגוריות פעילות: ${categories?.map((c: any) => c.name).join(", ")}

### כתבות מובילות (לפי צפיות):
${enrichedArticles.slice(0, 15).map((a: any, i: number) => `${i + 1}. "${a.title}" (${a.category}) - ${a.views} צפיות, תאריך: ${a.date}`).join("\n")}

### מקורות תנועה (חודש אחרון):
${Object.entries(referrerCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10).map(([ref, count]) => `- ${ref}: ${count} צפיות`).join("\n")}

### ביצועי קטגוריות:
${Object.entries(categoryViews).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([cat, views]) => `- ${cat}: ${views} צפיות`).join("\n")}

### זרימת תנועה (מאיפה מגיעים לאיזו כתבה):
${Object.entries(refToArticle).slice(0, 5).map(([ref, articles]) => {
  const topArts = Object.entries(articles).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 3);
  return `מ-${ref}:\n${topArts.map(([title, c]) => `  → "${title}" (${c} צפיות)`).join("\n")}`;
}).join("\n")}

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

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3.6-flash",
        messages: [
          { role: "system", content: "אתה יועץ אסטרטגי מומחה לאתרי תוכן דיגיטליים בתחומי טכנולוגיה וכלכלה. אתה מנתח נתונים ונותן המלצות מעשיות, ספציפיות ומבוססות נתונים. כתוב תמיד בעברית." },
          { role: "user", content: dataPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "מגבלת בקשות, נסה שוב מאוחר יותר" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "נדרש חידוש מנוי AI" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const advice = result.choices?.[0]?.message?.content || "לא ניתן לייצר ניתוח כרגע";

    return new Response(JSON.stringify({ advice }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-site error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "שגיאה בניתוח" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
