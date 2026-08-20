import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Loader2, MailX, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * The newsletter's unsubscribe landing page. The email link carries the
 * subscriber's own row id; the security-definer RPC flips is_active off and
 * nothing else. Lives on the site (not an edge function) because the
 * functions gateway rewrites GET responses to text/plain, which rendered the
 * old confirmation page as raw source.
 */
const Unsubscribe = () => {
  const [state, setState] = useState<"loading" | "done" | "invalid" | "error">("loading");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      setState("invalid");
      return;
    }
    supabase
      .rpc("unsubscribe_newsletter", { _id: id })
      .then(({ error }) => setState(error ? "error" : "done"));
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center p-6" id="main-content">
        <div className="glass-panel rounded-2xl shadow-card p-10 max-w-md w-full text-center">
          {state === "loading" && (
            <>
              <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-primary" />
              <h1 className="type-title text-foreground">מסירים אותך מהרשימה...</h1>
            </>
          )}
          {state === "done" && (
            <>
              <CheckCircle2 className="w-10 h-10 mx-auto mb-4 text-emerald-500" />
              <h1 className="type-title text-foreground mb-2">הוסרת מרשימת התפוצה</h1>
              <p className="text-muted-foreground text-sm mb-6">
                לא תקבלו מאיתנו עוד ניוזלטרים. אפשר להירשם שוב מהאתר בכל רגע.
              </p>
            </>
          )}
          {state === "invalid" && (
            <>
              <MailX className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
              <h1 className="type-title text-foreground mb-2">קישור לא תקין</h1>
              <p className="text-muted-foreground text-sm mb-6">
                הקישור שהגעתם ממנו אינו שלם. אפשר לפנות אלינו במייל ונסיר ידנית.
              </p>
            </>
          )}
          {state === "error" && (
            <>
              <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-destructive" />
              <h1 className="type-title text-foreground mb-2">משהו השתבש</h1>
              <p className="text-muted-foreground text-sm mb-6">
                לא הצלחנו להסיר אתכם כרגע. נסו שוב בעוד רגע.
              </p>
            </>
          )}
          {state !== "loading" && (
            <Link to="/" className="text-primary hover:underline text-sm">
              חזרה לאתר ←
            </Link>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Unsubscribe;
