import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: data.claims.sub, _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const { title, excerpt, category, url, content } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("Missing LOVABLE_API_KEY");
    }

    const truncatedContent = content ? content.substring(0, 2000) : "לא סופק";

    const prompt = `אתה כותב הודעות עבור ערוץ וואטסאפ של אתר חדשות בשם YZ News.
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const post = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ post }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating whatsapp post:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
