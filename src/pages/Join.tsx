import { useMemo, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/hooks/useCategories";
import { useSocialLinks } from "@/hooks/useSocialLinks";
import { sendAdminNotification } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, Loader2, Mail, MessageCircle, Newspaper, ShieldCheck } from "lucide-react";

/**
 * The one page to send people to.
 *
 * Two ways to follow the site, side by side rather than stacked, because they
 * are genuinely different products: the channel is a push during the day, the
 * newsletter is a digest in the morning. Someone who wants one and not the
 * other should not have to scroll past the one they do not want.
 *
 * The channel link comes from the panel's social settings, so this page cannot
 * drift from the button in the footer the way a second hard-coded URL would.
 */

const BENEFITS = [
  {
    Icon: Clock,
    title: "לפני כולם",
    text: "הידיעות החשובות מגיעות אליכם תוך דקות מהרגע שהן קורות, לא למחרת בבוקר.",
  },
  {
    Icon: Newspaper,
    title: "רק מה שחשוב",
    text: "מאות מקורות בעולם ובישראל נסרקים כל שעה, ואנחנו בוחרים מהם את מה ששווה את הזמן שלכם.",
  },
  {
    Icon: ShieldCheck,
    title: "בלי ספאם",
    text: "לא מוכרים ולא מעבירים את הפרטים שלכם לאף אחד, ואפשר להסיר את עצמכם בלחיצה אחת.",
  },
];

const JoinPage = () => {
  const { toast } = useToast();
  const { categories } = useCategories();
  const { data: socialLinks, isLoading: linksLoading } = useSocialLinks();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [sending, setSending] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const whatsappUrl = socialLinks?.whatsapp?.enabled ? socialLinks.whatsapp.url : "";

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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main id="main-content">
        {/* ---------- hero ---------- */}
        <section className="border-b border-border bg-surface-1">
          <div className="container py-12 md:py-16 text-center">
            <h1 className="mx-auto max-w-[20ch] text-[30px] md:text-[44px] font-black leading-[1.1] text-foreground text-balance">
              הטכנולוגיה והכסף של ישראל, בלי לרדוף אחרי החדשות
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] md:text-[18px] leading-relaxed text-muted-foreground">
              בחרו איך נוח לכם לקבל אותנו: ערוץ וואטסאפ שמעדכן במהלך היום, או ניוזלטר יומי למייל.
              אפשר גם שניהם.
            </p>
          </div>
        </section>

        {/* ---------- the two ways ---------- */}
        <section className="container py-10 md:py-14">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* WhatsApp */}
            <div className="flex flex-col rounded-lg border-2 border-[#25D366]/40 bg-surface-1 p-6 md:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#25D366]">
                  <MessageCircle className="h-6 w-6 text-white" />
                </span>
                <div>
                  <h2 className="text-[22px] font-black text-foreground">ערוץ הוואטסאפ</h2>
                  <p className="text-[13px] text-muted-foreground">עדכונים קצרים במהלך היום</p>
                </div>
              </div>

              <ul className="mt-5 space-y-2.5 text-[15px] leading-relaxed text-muted-foreground">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#25D366]" />
                  הידיעות הגדולות ברגע שהן קורות, עם קישור לכתבה המלאה
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#25D366]" />
                  ערוץ שידור בלבד — אף אחד לא רואה את המספר שלכם ואין בו קבוצה שמציפה
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#25D366]" />
                  יציאה בלחיצה אחת, מתי שתרצו
                </li>
              </ul>

              <div className="mt-auto pt-6">
                {whatsappUrl ? (
                  <Button
                    asChild
                    size="lg"
                    className="w-full gap-2 bg-[#25D366] text-white hover:bg-[#1eb855]"
                  >
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-5 w-5" />
                      הצטרפו לערוץ
                    </a>
                  </Button>
                ) : linksLoading ? (
                  <Button size="lg" disabled className="w-full gap-2 bg-[#25D366]/60 text-white">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    רגע…
                  </Button>
                ) : (
                  <p className="text-center text-sm text-muted-foreground">הערוץ ייפתח בקרוב</p>
                )}
              </div>
            </div>

            {/* Newsletter */}
            <div className="flex flex-col rounded-lg border-2 border-primary/40 bg-surface-1 p-6 md:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary">
                  <Mail className="h-6 w-6 text-primary-foreground" />
                </span>
                <div>
                  <h2 className="text-[22px] font-black text-foreground">הניוזלטר</h2>
                  <p className="text-[13px] text-muted-foreground">סיכום יומי למייל</p>
                </div>
              </div>

              {subscribed ? (
                <div className="my-auto flex flex-col items-center gap-3 py-10 text-center">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                  <h3 className="text-xl font-bold text-foreground">נתראה במייל</h3>
                  <p className="max-w-[34ch] text-[15px] text-muted-foreground">
                    הסיכום הבא שיוצא — יוצא גם אליכם. בינתיים שווה להצטרף גם לערוץ.
                  </p>
                </div>
              ) : (
                <form onSubmit={submit} className="mt-5 flex flex-1 flex-col gap-3">
                  <Input
                    aria-label="שם מלא"
                    placeholder="שם מלא *"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    maxLength={100}
                  />
                  <Input
                    type="email"
                    aria-label="אימייל"
                    placeholder="אימייל *"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    dir="ltr"
                    required
                    maxLength={255}
                  />
                  <Input
                    type="tel"
                    aria-label="טלפון"
                    placeholder="טלפון (לא חובה)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    dir="ltr"
                    maxLength={20}
                  />

                  {topics.length > 0 && (
                    <div>
                      <p className="mb-2 text-[13px] text-muted-foreground">מה הכי מעניין אתכם?</p>
                      <div className="flex flex-wrap gap-2">
                        {topics.map((topic) => {
                          const active = interest === topic.name;
                          return (
                            <button
                              key={topic.slug}
                              type="button"
                              onClick={() => setInterest(active ? "" : topic.name)}
                              className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border text-muted-foreground hover:border-primary/50"
                              }`}
                            >
                              {topic.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="mt-auto pt-3">
                    <Button type="submit" size="lg" disabled={sending} className="w-full gap-2">
                      {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
                      הרשמה לניוזלטר
                    </Button>
                    <p className="mt-2 text-center text-[12px] text-muted-foreground">
                      לא נשלח ספאם ואפשר להסיר את עצמכם מכל מייל.
                    </p>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* ---------- why ---------- */}
        <section className="border-t border-border bg-surface-1">
          <div className="container grid gap-8 py-10 md:grid-cols-3 md:py-14">
            {BENEFITS.map(({ Icon, title, text }) => (
              <div key={title}>
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 text-[17px] font-bold text-foreground">{title}</h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default JoinPage;
