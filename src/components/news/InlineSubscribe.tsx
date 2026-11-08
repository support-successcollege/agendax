import { useState } from "react";
import { CheckCircle, Loader2, Mail, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_SOCIAL_LINKS, useSocialLinks } from "@/hooks/useSocialLinks";
import { sendAdminNotification } from "@/lib/admin.functions";

type Placement = "mid" | "end";

const track = (event: string, placement: Placement) => {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", event, { placement });
};

/**
 * The one ask a reader sees inside a story: follow the WhatsApp channel, or
 * leave an email. One field, no name or phone, because every extra field
 * costs signups and the readers arriving from Facebook read one story and go.
 *
 * Rendered twice per story: mid-way through the text, where attention is
 * highest, and right after it. Clicks and signups go to GA with the placement,
 * so the two can be compared.
 */
const InlineSubscribe = ({
  category,
  placement,
}: {
  category: string;
  placement: Placement;
}) => {
  const { toast } = useToast();
  const { data } = useSocialLinks();
  const whatsapp = (data ?? DEFAULT_SOCIAL_LINKS).whatsapp;
  const whatsappUrl =
    whatsapp?.enabled && /^https?:\/\/\S+$/i.test(whatsapp.url)
      ? whatsapp.url
      : "";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast({ title: "כתובת אימייל לא תקינה", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data: newId, error } = await supabase.rpc("subscribe_newsletter", {
        p_email: value,
        p_full_name: "",
        p_phone: null as unknown as string,
        p_interest_category: category || "כללי",
      });
      if (error) {
        if ((error as { code?: string }).code === "23505" || /duplicate/i.test(error.message)) {
          setDone(true);
          return;
        }
        throw error;
      }
      setDone(true);
      track("newsletter_signup", placement);
      if (newId) {
        sendAdminNotification({ data: { type: "newsletter", recordId: newId as string } }).catch(
          (err) => console.error("notify failed", err),
        );
      }
    } catch (err) {
      console.error("inline signup failed", err);
      toast({ title: "ההרשמה נכשלה, נסו שוב", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className={`not-prose ${placement === "mid" ? "my-8" : "mt-10"} border-y-2 border-primary/60 bg-primary/[0.04] px-4 py-5 sm:px-6`}
      aria-label="הצטרפו לעדכונים של AgendaX"
    >
      <p className="text-[17px] font-black leading-snug text-foreground">
        {placement === "mid"
          ? "החדשות החשובות של היום, בלי רעש"
          : "אהבתם? יש עוד כאלה כל יום"}
      </p>
      <p className="mt-1 text-[13.5px] text-muted-foreground">
        הייטק, AI, שוק ההון וקריירה. הצטרפו לערוץ הוואטסאפ של AgendaX או השאירו מייל.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("whatsapp_join_click", placement)}
            className="inline-flex shrink-0 items-center justify-center gap-2 bg-[#25D366] px-4 py-2.5 text-[14px] font-bold text-white hover:opacity-90 transition-opacity"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            להצטרפות לערוץ
          </a>
        )}

        {done ? (
          <p className="flex items-center gap-2 text-[14px] font-semibold text-primary">
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
            נרשמתם. נתראה במייל.
          </p>
        ) : (
          <form onSubmit={submit} className="flex min-w-0 flex-1 items-stretch">
            <label htmlFor={`inline-email-${placement}`} className="sr-only">
              אימייל
            </label>
            <input
              id={`inline-email-${placement}`}
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              required
              maxLength={255}
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex shrink-0 items-center gap-1.5 bg-primary px-4 text-[14px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Mail className="h-4 w-4" aria-hidden="true" />
              )}
              הרשמה
            </button>
          </form>
        )}
      </div>
    </aside>
  );
};

export default InlineSubscribe;
