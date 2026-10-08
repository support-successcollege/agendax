import { useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useArticles } from "@/hooks/useArticles";
import { useCategories } from "@/hooks/useCategories";
import { useSocialLinks } from "@/hooks/useSocialLinks";
import { sendAdminNotification } from "@/lib/admin.functions";
import { timeLabel } from "@/lib/newsTime";
import { articleSlugOrId } from "@/lib/queries";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2 } from "lucide-react";

/**
 * The page a post, a bio or a printed card can point at.
 *
 * Built the way the rest of the site is built — rules, markers and weight,
 * no rounded cards with an icon in a circle — because this page is the first
 * thing a stranger sees and it should look like the newspaper it is selling.
 *
 * Its argument is the product rather than adjectives about the product: the
 * channel shows a real message carrying today's top story, and the page ends
 * with the stories that actually went out. A reader can judge the thing itself
 * instead of a list of promises, and the page cannot go stale while the site
 * keeps publishing.
 */

const PROMISES = ["בלי ספאם", "בלי העברת פרטים לאף אחד", "יציאה בלחיצה אחת"];

const JoinPage = () => {
  const { toast } = useToast();
  const { articles } = useArticles();
  const { categories } = useCategories();
  const { data: socialLinks, isLoading: linksLoading } = useSocialLinks();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [sending, setSending] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const whatsappUrl = socialLinks?.whatsapp?.enabled ? socialLinks.whatsapp.url : "";

  const live = useMemo(
    () =>
      articles
        .filter((a) => !a.isDraft && a.categorySlug !== "marketing")
        .slice(0, 5),
    [articles],
  );
  const lead = live[0];

  /** Today's output, counted on the reader's own clock — the page's only claim. */
  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return articles.filter(
      (a) => !a.isDraft && new Date(a.publishedAt || a.date).toDateString() === today,
    ).length;
  }, [articles]);

  const topics = useMemo(
    () => categories.filter((c) => c.isActive && c.slug !== "home" && c.slug !== "marketing"),
    [categories],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast({ title: "יש למלא שם מלא ואימייל", variant: "destructive" });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ title: "כתובת אימייל לא תקינה", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      const { data: newId, error } = await supabase.rpc("subscribe_newsletter", {
        p_email: email.trim(),
        p_full_name: fullName.trim(),
        p_phone: (phone.trim() || null) as unknown as string,
        p_interest_category: interest || "כללי",
      });

      if (error) {
        // An address already on the list is not a failure worth a red toast.
        if ((error as { code?: string }).code === "23505" || /duplicate/i.test(error.message)) {
          setSubscribed(true);
          toast({ title: "כבר רשומים אצלנו 👌" });
          return;
        }
        throw error;
      }

      setSubscribed(true);
      toast({ title: "נרשמתם בהצלחה 🎉" });
      if (newId) {
        sendAdminNotification({ data: { type: "newsletter", recordId: newId as string } }).catch((err) =>
          console.error("notify failed", err),
        );
      }
    } catch (err) {
      console.error("join signup failed", err);
      toast({ title: "ההרשמה נכשלה, נסו שוב", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const field =
    "w-full bg-transparent border-0 border-b border-border px-0 py-2.5 text-[15px] text-foreground " +
    "placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none transition-colors";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content">
        {/* ---------------- masthead ---------------- */}
        <section className="container pt-10 md:pt-14">
          <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.18em] text-primary">
            <span className="h-[14px] w-[4px] bg-primary" aria-hidden="true" />
            הצטרפות · ללא תשלום
          </p>

          <h1 className="mt-4 max-w-[16ch] text-[38px] leading-[1.05] font-black text-foreground md:max-w-[15ch] md:text-[62px]">
            <span className="block">אל תרדפו אחרי החדשות.</span>
            <span className="block text-primary">שהן ירדפו אחריכם.</span>
          </h1>

          <p className="mt-5 max-w-[56ch] text-[16px] leading-relaxed text-muted-foreground md:text-[18px]">
            הטכנולוגיה, ה-AI והכסף של ישראל — בערוץ וואטסאפ שמעדכן במהלך היום, או בניוזלטר
            יומי למייל. בחרו אחד, או את שניהם.
          </p>

          <dl className="mt-8 flex flex-wrap items-stretch gap-x-8 gap-y-4 border-y border-border py-4">
            <div>
              <dt className="text-[11px] tracking-wider text-muted-foreground">פורסם היום</dt>
              <dd className="text-[26px] font-black leading-tight text-foreground tabular-nums">
                {todayCount || "—"}
              </dd>
            </div>
            <div className="hidden w-px self-stretch bg-border sm:block" aria-hidden="true" />
            <div>
              <dt className="text-[11px] tracking-wider text-muted-foreground">שעות פרסום</dt>
              <dd className="text-[26px] font-black leading-tight text-foreground tabular-nums" dir="ltr">
                06:00–24:00
              </dd>
            </div>
            <div className="hidden w-px self-stretch bg-border sm:block" aria-hidden="true" />
            <div>
              <dt className="text-[11px] tracking-wider text-muted-foreground">נכתב על ידי</dt>
              <dd className="text-[26px] font-black leading-tight text-foreground">
                סוכני AI
                <Link to="/newsroom" className="mr-2 align-middle text-[12px] font-semibold text-primary hover:underline">
                  מי הם?
                </Link>
              </dd>
            </div>
          </dl>
        </section>

        {/* ---------------- the two ways ---------------- */}
        <section className="container grid gap-10 py-12 lg:grid-cols-2 lg:gap-0">
          {/* WhatsApp — shown, not described */}
          <div className="lg:pl-10">
            <div className="flex items-center gap-3 border-b-2 border-border pb-1.5">
              <span className="h-[18px] w-[4px] shrink-0 bg-[#25D366]" aria-hidden="true" />
              <h2 className="text-[19px] font-black leading-none text-foreground">ערוץ הוואטסאפ</h2>
              <span className="text-[11px] text-muted-foreground">במהלך היום</span>
            </div>

            {/* A message the way it lands on the phone. */}
            <div className="mt-5 rounded-md bg-[#0b141a] p-4">
              <div className="me-auto max-w-[92%] rounded-lg rounded-tr-sm bg-[#005c4b] p-3 text-right">
                <p className="text-[12px] font-bold text-[#8fe3c4]">Agendax</p>
                <p className="mt-1 text-[14.5px] leading-snug text-white">
                  {lead ? lead.title : "אנבידיה מציגה שיא הכנסות — והמניה מגיבה"}
                </p>
                <p className="mt-1.5 text-[12.5px] text-[#8696a0]" dir="ltr">
                  agendax.co.il
                </p>
                <p className="mt-1 text-left text-[10.5px] text-[#8696a0]" dir="ltr">
                  {lead ? timeLabel(lead.publishedAt || lead.date) : "09:41"} ✓✓
                </p>
              </div>
            </div>

            <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">
              ערוץ שידור בלבד: אף אחד לא רואה את המספר שלכם, אין קבוצה ואין דיון. רק הידיעות
              הגדולות, ברגע שהן קורות.
            </p>

            <div className="mt-5">
              {whatsappUrl ? (
                <Button asChild size="lg" className="w-full gap-2 bg-[#25D366] text-[15px] font-bold text-black hover:bg-[#1eb855]">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    הצטרפו לערוץ
                  </a>
                </Button>
              ) : linksLoading ? (
                <Button size="lg" disabled className="w-full gap-2 bg-[#25D366]/50 text-black">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  רגע…
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">הערוץ ייפתח בקרוב</p>
              )}
            </div>
          </div>

          {/* Newsletter */}
          <div className="border-t border-border pt-10 lg:border-s lg:border-t-0 lg:pe-10 lg:ps-10 lg:pt-0">
            <div className="flex items-center gap-3 border-b-2 border-border pb-1.5">
              <span className="h-[18px] w-[4px] shrink-0 bg-primary" aria-hidden="true" />
              <h2 className="text-[19px] font-black leading-none text-foreground">הניוזלטר</h2>
              <span className="text-[11px] text-muted-foreground">סיכום יומי למייל</span>
            </div>

            {subscribed ? (
              <div className="mt-8 border-s-2 border-primary ps-5">
                <p className="text-[22px] font-black text-foreground">נתראה במייל.</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                  הסיכום הבא שיוצא — יוצא גם אליכם. שווה להצטרף גם לערוץ, שם זה מגיע קודם.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-5">
                <input
                  aria-label="שם מלא"
                  placeholder="שם מלא"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  maxLength={100}
                  className={field}
                />
                <input
                  type="email"
                  aria-label="אימייל"
                  placeholder="אימייל"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                  required
                  maxLength={255}
                  className={`${field} text-left`}
                />
                <input
                  type="tel"
                  aria-label="טלפון"
                  placeholder="טלפון (לא חובה)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  maxLength={20}
                  className={`${field} text-left`}
                />

                {topics.length > 0 && (
                  <div>
                    <p className="mb-2 text-[12px] tracking-wider text-muted-foreground">
                      מה הכי מעניין אתכם?
                    </p>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {topics.map((topic) => {
                        const active = interest === topic.name;
                        return (
                          <button
                            key={topic.slug}
                            type="button"
                            onClick={() => setInterest(active ? "" : topic.name)}
                            className={`flex items-center gap-1.5 text-[14px] transition-colors ${
                              active ? "font-bold text-primary" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span
                              className={`h-[3px] w-[14px] ${active ? "bg-primary" : "bg-border"}`}
                              aria-hidden="true"
                            />
                            {topic.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <Button type="submit" size="lg" disabled={sending} className="w-full gap-2 text-[15px] font-bold">
                  {sending && <Loader2 className="h-5 w-5 animate-spin" />}
                  שלחו לי את הסיכום היומי
                </Button>

                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                  {PROMISES.map((promise) => (
                    <li key={promise} className="flex items-center gap-1">
                      <Check className="h-3 w-3 text-primary" />
                      {promise}
                    </li>
                  ))}
                </ul>
              </form>
            )}
          </div>
        </section>

        {/* ---------------- proof: what actually went out ---------------- */}
        {live.length > 1 && (
          <section className="border-t border-border bg-surface-1">
            <div className="container py-10 md:py-12">
              <div className="flex items-center gap-3 border-b-2 border-border pb-1.5">
                <span className="h-[18px] w-[4px] shrink-0 bg-primary" aria-hidden="true" />
                <h2 className="text-[19px] font-black leading-none text-foreground">מה יצא לאחרונה</h2>
                <span className="text-[11px] text-muted-foreground">בדיוק מה שתקבלו</span>
              </div>

              <ol className="mt-2 divide-y divide-border">
                {live.map((article, i) => (
                  <li key={article.id}>
                    <Link
                      to={`/article/${articleSlugOrId(article)}`}
                      className="group flex items-baseline gap-4 py-3.5"
                    >
                      <span className="w-6 shrink-0 text-[13px] font-black tabular-nums text-primary/70">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0 flex-1 text-[15.5px] font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
                        {article.title}
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                        {timeLabel(article.publishedAt || article.date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default JoinPage;
