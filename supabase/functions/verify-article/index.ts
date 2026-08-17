import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerificationResult {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = await requireAdmin(req);
  if (authError) return authError;

  try {
    const { title, content } = await req.json();
    
    if (!content) {
      return new Response(
        JSON.stringify({ error: "תוכן הכתבה חסר" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured");
      throw new Error("GEMINI_API_KEY is not configured");
    }

    console.log("Verifying article:", title);

    const verifyResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `אתה מומחה לבדיקת עובדות (Fact-Checker) מקצועי. תפקידך לנתח כתבות ולזהות:
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
החזר JSON תקין בלבד, ללא טקסט נוסף.`
          },
          {
            role: "user",
            content: `בדוק את אמינות הכתבה הבאה:

כותרת: ${title}

תוכן:
${content}`
          }
        ],
      }),
    });

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error("AI gateway error:", verifyResponse.status, errorText);
      
      if (verifyResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "יותר מדי בקשות, נסה שוב בעוד מספר דקות" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (verifyResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "חריגה ממכסת ה-API של Gemini, נסו שוב מאוחר יותר" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${verifyResponse.status}`);
    }

    const data = await verifyResponse.json();
    const generatedContent = data.choices?.[0]?.message?.content;
    
    if (!generatedContent) {
      throw new Error("No verification result generated");
    }

    console.log("Verification result:", generatedContent);

    // Parse the JSON response
    let verificationResult: VerificationResult;
    try {
      const cleanContent = generatedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      verificationResult = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse verification JSON:", parseError);
      verificationResult = {
        overallScore: 5,
        isReliable: false,
        issues: ["לא ניתן היה לנתח את הכתבה באופן מלא"],
        suggestions: ["יש לבדוק את התוכן באופן ידני"],
        factChecks: [],
        summary: "הבדיקה האוטומטית נכשלה חלקית. מומלץ לבדוק את התוכן באופן ידני."
      };
    }

    return new Response(JSON.stringify(verificationResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error verifying article:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "שגיאה בבדיקת הכתבה" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
