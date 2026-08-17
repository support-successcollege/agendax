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
    const { title, excerpt, category, url, content, imageUrl } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("Missing LOVABLE_API_KEY");
    }

    // Truncate content to avoid timeouts
    const truncatedContent = content ? content.substring(0, 2000) : "לא סופק";

    const prompt = `אתה כותב תוכן מקצועי ומעמיק לרשתות חברתיות עבור Agendax, אתר ישראלי המסקר הייטק, בינה מלאכותית, שוקי הון וחברות.
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

    const userContent: any[] = [{ type: "text", text: prompt }];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: userContent }],
        max_tokens: 800,
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
    console.error("Error generating social post:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
