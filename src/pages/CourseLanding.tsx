import { useEffect, useMemo, useState } from "react";
import { useParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useCourse, useCourseStructure, useMyEnrollment, enrollInCourse, CourseLesson } from "@/hooks/useCourses";
import { GraduationCap, PlayCircle, Lock, Clock, User, CheckCircle2, FileText, Check } from "lucide-react";
import CourseAccountMenu from "@/components/CourseAccountMenu";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { getPaypalConfig, createPaypalOrder, capturePaypalOrder } from "@/lib/paypal.functions";
import RichHtmlContent from "@/components/RichHtmlContent";

const formatPrice = (p: number, currency = "ILS") =>
  p === 0 ? "חינם" : new Intl.NumberFormat("he-IL", { style: "currency", currency, maximumFractionDigits: 0 }).format(p);

const getEmbedUrl = (url: string) => {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname === "youtu.be") return `https://www.youtube.com/embed${u.pathname}`;
    if (u.hostname.includes("vimeo.com")) return `https://player.vimeo.com/video${u.pathname}`;
    return url;
  } catch { return url; }
};

type CouponPreview = { valid: boolean; discount_percent: number; grants_free_access: boolean; message: string };

const CourseLanding = () => {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { data: course, isLoading } = useCourse(slug);
  const { data: structure } = useCourseStructure(course?.id);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeLesson, setActiveLesson] = useState<CourseLesson | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", coupon: "" });
  const [signupPassword, setSignupPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [couponPreview, setCouponPreview] = useState<CouponPreview | null>(null);
  const [checkingCoupon, setCheckingCoupon] = useState(false);
  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [showPayPal, setShowPayPal] = useState(false);
  const [authMode, setAuthMode] = useState<"choose" | "signup">("choose");
  const getPaypalConfigFn = getPaypalConfig;
  const createPaypalOrderFn = createPaypalOrder;
  const capturePaypalOrderFn = capturePaypalOrder;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const fullName = (data.user?.user_metadata as any)?.full_name || "";
      setUserId(data.user?.id ?? null);
      setUserEmail(data.user?.email ?? "");
      setForm((f) => ({ ...f, email: data.user?.email ?? f.email, full_name: f.full_name || fullName }));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      const fullName = (s?.user?.user_metadata as any)?.full_name || "";
      setUserId(s?.user?.id ?? null);
      setUserEmail(s?.user?.email ?? "");
      setForm((f) => ({ ...f, email: s?.user?.email ?? f.email, full_name: f.full_name || fullName }));
    });
    getPaypalConfigFn().then((data) => {
      if (data?.clientId) setPaypalClientId(data.clientId);
    }).catch(() => {});
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: enrollment, refetch: refetchEnrollment } = useMyEnrollment(course?.id, userId);
  const enrolled = !!enrollment && (enrollment.payment_status === "paid" || enrollment.payment_status === "free");

  const lessonsByModule = useMemo(() => {
    const m: Record<string, CourseLesson[]> = {};
    (structure?.lessons || []).forEach((l) => { (m[l.module_id] ||= []).push(l); });
    return m;
  }, [structure]);

  // Progress tracking
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const lessonIds = useMemo(() => (structure?.lessons || []).map((l) => l.id), [structure]);

  const loadProgress = async () => {
    if (!userId || lessonIds.length === 0) { setCompletedIds(new Set()); return; }
    const { data } = await (supabase as any)
      .from("lesson_views")
      .select("lesson_id, completed")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds);
    setCompletedIds(new Set((data || []).filter((r: any) => r.completed).map((r: any) => r.lesson_id)));
  };

  useEffect(() => { loadProgress(); /* eslint-disable-next-line */ }, [userId, lessonIds.join(",")]);

  const toggleCompleted = async (lessonId: string) => {
    if (!userId) return;
    const isDone = completedIds.has(lessonId);
    const next = !isDone;
    // Optimistic
    setCompletedIds((prev) => {
      const s = new Set(prev);
      next ? s.add(lessonId) : s.delete(lessonId);
      return s;
    });
    const { error } = await (supabase as any)
      .from("lesson_views")
      .upsert({ user_id: userId, lesson_id: lessonId, completed: next }, { onConflict: "user_id,lesson_id" });
    if (error) {
      // rollback
      setCompletedIds((prev) => {
        const s = new Set(prev);
        isDone ? s.add(lessonId) : s.delete(lessonId);
        return s;
      });
      toast({ title: "שגיאה בעדכון התקדמות", description: error.message, variant: "destructive" });
    }
  };

  const totalLessons = structure?.lessons.length ?? 0;
  const completedCount = completedIds.size;
  const progressPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const priceNum = Number(course?.price ?? 0);
  const finalPrice = useMemo(() => {
    if (!course) return 0;
    if (couponPreview?.valid && couponPreview.grants_free_access) return 0;
    const d = couponPreview?.valid ? couponPreview.discount_percent : 0;
    return Math.max(0, +(priceNum * (1 - d / 100)).toFixed(2));
  }, [course, couponPreview, priceNum]);

  const checkCoupon = async () => {
    if (!course || !form.coupon.trim()) { setCouponPreview(null); return; }
    setCheckingCoupon(true);
    try {
      const { data, error } = await (supabase as any).rpc("validate_course_coupon", {
        p_course_id: course.id,
        p_code: form.coupon.trim(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      setCouponPreview(row || null);
    } catch (err: any) {
      setCouponPreview({ valid: false, discount_percent: 0, grants_free_access: false, message: err.message });
    } finally {
      setCheckingCoupon(false);
    }
  };

  // (deprecated: kept only to avoid breaking imports — no longer used; account is created inline in dialog)

  const createStudentAccount = async (): Promise<string | null> => {
    if (userId) return userId;
    if (!form.full_name.trim() || !form.email.trim() || signupPassword.length < 6) {
      toast({ title: "פרטים חסרים", description: "יש למלא שם, אימייל וסיסמה (לפחות 6 תווים).", variant: "destructive" });
      return null;
    }
    setCreatingAccount(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: signupPassword,
        options: {
          data: { full_name: form.full_name.trim(), account_type: "student" },
          emailRedirectTo: `${window.location.origin}/courses/${course!.slug}`,
        },
      });
      if (error) {
        console.error("[course-signup]", error);
        if (/already registered|already exists/i.test(error.message)) {
          // Try password login
          const { data: signIn, error: sErr } = await supabase.auth.signInWithPassword({
            email: form.email.trim(),
            password: signupPassword,
          });
          if (signIn?.session?.user) {
            setUserId(signIn.session.user.id);
            setUserEmail(signIn.session.user.email ?? "");
            return signIn.session.user.id;
          }
          toast({
            title: "המייל כבר רשום",
            description: sErr?.message?.includes("Invalid") ? "סיסמה שגויה. השתמש בקישור 'שכחתי סיסמה'." : "התחבר עם הסיסמה הקיימת.",
            variant: "destructive",
          });
          return null;
        }
        toast({ title: "שגיאת יצירת חשבון", description: error.message, variant: "destructive" });
        return null;
      }
      if (data.session?.user) {
        setUserId(data.session.user.id);
        setUserEmail(data.session.user.email ?? "");
        return data.session.user.id;
      }
      // Fallback: immediate sign-in (auto-confirm on)
      const { data: signIn } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: signupPassword,
      });
      if (signIn?.session?.user) {
        setUserId(signIn.session.user.id);
        setUserEmail(signIn.session.user.email ?? "");
        return signIn.session.user.id;
      }
      toast({ title: "נשלח מייל אימות", description: "אשר את המייל כדי להשלים את ההרשמה לקורס." });
      return null;
    } finally {
      setCreatingAccount(false);
    }
  };

  const requireStudentAccount = async (): Promise<string | null> => {
    if (userId) return userId;
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) {
      const fullName = (data.user.user_metadata as any)?.full_name || "";
      setUserId(data.user.id);
      setUserEmail(data.user.email ?? "");
      setForm((f) => ({ ...f, email: data.user?.email ?? f.email, full_name: f.full_name || fullName }));
      return data.user.id;
    }
    return await createStudentAccount();
  };

  // Free enrollment path (price 0 or coupon grants free access)
  const handleFreeEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course) return;
    setSubmitting(true);
    try {
      const uid = await requireStudentAccount();
      if (!uid) return;

      let redeemed: CouponPreview | null = null;
      if (form.coupon.trim() && couponPreview?.valid && couponPreview.grants_free_access) {
        const { data, error } = await (supabase as any).rpc("redeem_course_coupon", {
          p_course_id: course.id,
          p_code: form.coupon.trim(),
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.valid) {
          toast({ title: "קופון לא תקף", description: row?.message || "קוד קופון שגוי", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        redeemed = row;
      }

      await enrollInCourse({
        course_id: course.id,
        user_id: uid,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        payment_status: "free",
        coupon_code: redeemed ? form.coupon.trim() : null,
        discount_percent: redeemed?.discount_percent ?? null,
      } as any);

      toast({
        title: "נרשמת בהצלחה!",
        description: redeemed?.grants_free_access
          ? "הקופון הפעיל גישה מלאה חינמית לקורס."
          : "גישה מלאה לקורס.",
      });
      setDialogOpen(false);
      setCouponPreview(null);
      setShowPayPal(false);
      setForm((f) => ({ ...f, coupon: "" }));
      refetchEnrollment();
    } catch (err: any) {
      toast({ title: "שגיאה ברישום", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const canPlay = (lesson: CourseLesson) => lesson.is_free || enrolled;

  if (isLoading) return <div className="container py-20 text-center">טוען...</div>;
  if (!course) return <div className="container py-20 text-center">הקורס לא נמצא.</div>;

  const isFreeFlow = priceNum === 0 || (couponPreview?.valid && couponPreview.grants_free_access);
  const formReady = !!form.full_name.trim() && !!form.email.trim() && (!!userId || signupPassword.length >= 6);

  return (
    <div className="min-h-screen flex flex-col bg-background">

      <Header />

      <main id="main-content" className="flex-1">
        <section className="bg-gradient-to-l from-primary/10 via-background to-background border-b">
          <div className="container py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-3 flex justify-end -mb-4">
              <CourseAccountMenu />
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {course.category && <Badge variant="secondary">{course.category}</Badge>}
                {course.level && <Badge variant="outline">{course.level}</Badge>}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">{course.title}</h1>
              {course.short_description && <p className="text-lg text-muted-foreground">{course.short_description}</p>}
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                {course.instructor_name && <span className="flex items-center gap-1"><User className="w-4 h-4" />{course.instructor_name}</span>}
                {course.duration_hours && <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{course.duration_hours} שעות</span>}
                <span className="flex items-center gap-1"><GraduationCap className="w-4 h-4" />{(structure?.lessons.length ?? 0)} שיעורים</span>
              </div>
            </div>
            <Card className="lg:row-span-2 h-fit sticky top-24">
              {course.cover_image_url && (
                <div className="aspect-video overflow-hidden rounded-t-lg bg-muted">
                  <img src={course.cover_image_url} alt={course.title} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-5 space-y-3">
                <div>
                  <span className="text-3xl font-bold text-primary">{formatPrice(priceNum, course.currency)}</span>
                  {course.original_price && Number(course.original_price) > priceNum && (
                    <span className="text-sm text-muted-foreground line-through mr-2">{formatPrice(Number(course.original_price), course.currency)}</span>
                  )}
                </div>
                {enrolled ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
                      <CheckCircle2 className="w-5 h-5" /> נרשמת לקורס – גישה מלאה
                    </div>
                    {totalLessons > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">התקדמות</span>
                          <span className="font-medium">{completedCount} / {totalLessons} ({progressPct}%)</span>
                        </div>
                        <Progress value={progressPct} />
                      </div>
                    )}
                  </div>
                ) : (
                  <Button className="w-full" size="lg" onClick={() => { setDialogOpen(true); setShowPayPal(false); }}>
                    {priceNum === 0 ? "הרשמה חינמית" : "רכישת הקורס"}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        {course.description && (
          <section className="container py-10">
            <h2 className="text-2xl font-bold mb-4">על הקורס</h2>
            <div className="article-content max-w-none" dangerouslySetInnerHTML={{ __html: course.description }} />
          </section>
        )}

        <section className="container py-10">
          <h2 className="text-2xl font-bold mb-4">תוכנית הקורס</h2>
          {!structure || structure.modules.length === 0 ? (
            <p className="text-muted-foreground">תוכנית הקורס תפורסם בקרוב.</p>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {structure.modules.map((m) => (
                <AccordionItem key={m.id} value={m.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline">
                    <div className="text-right">
                      <div className="font-bold">{m.title}</div>
                      {m.description && <div className="text-sm text-muted-foreground font-normal">{m.description}</div>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2">
                      {(lessonsByModule[m.id] || []).map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/40">
                          <div className="flex items-center gap-3">
                            {completedIds.has(l.id) ? (
                              <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            ) : canPlay(l) ? (
                              <PlayCircle className="w-5 h-5 text-primary" />
                            ) : (
                              <Lock className="w-5 h-5 text-muted-foreground" />
                            )}
                            <div>
                              <div className="font-medium">{l.title}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                {l.duration_minutes && <span>{l.duration_minutes} דק'</span>}
                                {l.is_free && <Badge variant="secondary" className="text-[10px]">חינם</Badge>}
                                {completedIds.has(l.id) && <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">הושלם</Badge>}
                              </div>
                            </div>
                          </div>
                          {canPlay(l) ? (
                            <Button size="sm" variant="outline" onClick={() => setActiveLesson(l)}>צפה</Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>הירשם</Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </section>

        {course.instructor_bio && (
          <section className="container pb-10">
            <h2 className="text-2xl font-bold mb-4">על המרצה</h2>
            <Card>
              <CardContent className="p-5">
                <div className="font-bold text-lg mb-1">{course.instructor_name}</div>
                <div className="article-content text-muted-foreground" dangerouslySetInnerHTML={{ __html: course.instructor_bio }} />
              </CardContent>
            </Card>
          </section>
        )}

        {!enrolled && (
          <section className="container pb-14">
            <Card className="bg-surface-2 text-foreground border-primary/30">
              <CardContent className="p-8 text-center space-y-3">
                <h3 className="text-2xl font-bold">מוכנים להתחיל?</h3>
                <p>{priceNum === 0 ? "הרשמה חינמית מלאה לקורס." : "בצעו רכישה מאובטחת דרך PayPal לקבלת גישה מיידית."}</p>
                <Button size="lg" variant="secondary" onClick={() => { setDialogOpen(true); setShowPayPal(false); }}>
                  {priceNum === 0 ? "הרשמה לקורס" : "רכישת הקורס"}
                </Button>
              </CardContent>
            </Card>
          </section>
        )}
      </main>

      <Footer />

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setShowPayPal(false); setAuthMode("choose"); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {!userId
                ? (authMode === "choose" ? "התחברות / הרשמה" : "יצירת חשבון תלמיד")
                : (isFreeFlow ? "הרשמה לקורס" : "רכישת הקורס")}
            </DialogTitle>
            <DialogDescription>
              {!userId
                ? (authMode === "choose"
                    ? "כדי להירשם לקורס יש להתחבר לחשבון תלמיד או ליצור חשבון חדש."
                    : "מלא/י פרטים ליצירת חשבון תלמיד — לאחר מכן תוכל/י להשלים את הרכישה.")
                : (isFreeFlow ? "הרשמה חינמית עם גישה מלאה לקורס." : "מלאו פרטים והשלימו רכישה מאובטחת דרך PayPal.")}
            </DialogDescription>
          </DialogHeader>

          {!userId && authMode === "choose" ? (
            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={() => { window.location.href = `/courses/account?redirect=/courses/${course.slug}`; }}
              >
                יש לי חשבון — התחבר
              </Button>
              <Button
                className="w-full"
                size="lg"
                variant="outline"
                onClick={() => setAuthMode("signup")}
              >
                צור חשבון תלמיד חדש
              </Button>
              <p className="text-xs text-muted-foreground text-center pt-2">
                החשבון נועד לגישה לקורס ולמעקב התקדמות בלבד.
              </p>
            </div>
          ) : (
          <div className="space-y-3">
            {userId && userEmail && (
              <div className="text-sm bg-primary/5 rounded-md p-2 text-center">
                רשום כ: <strong>{userEmail}</strong>
              </div>
            )}
            <div>
              <Label>שם מלא *</Label>
              <Input value={form.full_name} onChange={(e) => { setForm({ ...form, full_name: e.target.value }); setShowPayPal(false); }} required />
            </div>
            <div>
              <Label>אימייל *</Label>
              <Input type="email" value={form.email} onChange={(e) => { setForm({ ...form, email: e.target.value }); setShowPayPal(false); }} required disabled={!!userEmail} />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            {!userId && (
              <div>
                <Label>סיסמה לחשבון תלמיד * (6 תווים ומעלה)</Label>
                <Input
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  minLength={6}
                  dir="ltr"
                  placeholder="בחר/י סיסמה"
                />
              </div>
            )}
            {priceNum > 0 && userId && (
              <div>
                <Label>קוד קופון (אופציונלי)</Label>
                <div className="flex gap-2">
                  <Input
                    dir="ltr"
                    value={form.coupon}
                    onChange={(e) => { setForm({ ...form, coupon: e.target.value }); setCouponPreview(null); setShowPayPal(false); }}
                    placeholder="הזן קוד"
                  />
                  <Button type="button" variant="outline" onClick={checkCoupon} disabled={checkingCoupon || !form.coupon.trim()}>
                    {checkingCoupon ? "בודק..." : "בדוק"}
                  </Button>
                </div>
                {couponPreview && (
                  <p className={`text-xs mt-1 ${couponPreview.valid ? "text-green-600" : "text-destructive"}`}>
                    {couponPreview.valid
                      ? couponPreview.grants_free_access
                        ? "✓ הקופון מעניק גישה מלאה חינמית לקורס"
                        : `✓ הנחה של ${couponPreview.discount_percent}% – מחיר סופי: ${formatPrice(finalPrice, course.currency)}`
                      : couponPreview.message}
                  </p>
                )}
              </div>
            )}

            {!userId ? (
              <Button
                className="w-full"
                onClick={async () => { await createStudentAccount(); }}
                disabled={creatingAccount || !form.full_name.trim() || !form.email.trim() || signupPassword.length < 6}
              >
                {creatingAccount ? "יוצר חשבון..." : "צור חשבון והמשך"}
              </Button>
            ) : isFreeFlow ? (
              <Button className="w-full" onClick={handleFreeEnroll} disabled={submitting || !formReady}>
                {submitting ? "שולח..." : "השלם הרשמה חינמית"}
              </Button>
            ) : (
              <>
                <div className="text-center text-sm text-muted-foreground border-t pt-3">
                  סכום לתשלום: <strong className="text-foreground">{formatPrice(finalPrice, course.currency)}</strong>
                </div>
                {!showPayPal ? (
                  <Button className="w-full" onClick={() => setShowPayPal(true)} disabled={!formReady}>
                    המשך לתשלום ב-PayPal
                  </Button>
                ) : !paypalClientId ? (
                  <p className="text-center text-sm text-muted-foreground">טוען PayPal...</p>
                ) : (
                  <PayPalScriptProvider options={{
                    clientId: paypalClientId,
                    currency: course.currency || "ILS",
                    intent: "capture",
                  }}>
                    <PayPalButtons
                      style={{ layout: "vertical" }}
                      createOrder={async () => {
                        try {
                          const data = await createPaypalOrderFn({ data: { course_id: course.id, coupon_code: form.coupon.trim() || null } });
                          if (!data?.orderID) {
                            toast({ title: "שגיאה ביצירת הזמנה", description: "יצירת הזמנה נכשלה", variant: "destructive" });
                            throw new Error("create order failed");
                          }
                          return data.orderID;
                        } catch (err: any) {
                          toast({ title: "שגיאה ביצירת הזמנה", description: err.message, variant: "destructive" });
                          throw err;
                        }
                      }}
                      onApprove={async (dataApprove) => {
                        setSubmitting(true);
                        try {
                          const uid = await requireStudentAccount();
                          if (!uid) return;
                          const data = await capturePaypalOrderFn({
                            data: {
                              orderID: dataApprove.orderID,
                              course_id: course.id,
                              full_name: form.full_name,
                              email: form.email,
                              phone: form.phone || null,
                              coupon_code: form.coupon.trim() || null,
                            },
                          });
                          if (!data?.success) throw new Error("capture failed");
                          toast({ title: "התשלום התקבל!", description: "קיבלת גישה מלאה לקורס." });
                          setDialogOpen(false);
                          setShowPayPal(false);
                          setCouponPreview(null);
                          setForm((f) => ({ ...f, coupon: "" }));
                          refetchEnrollment();
                        } catch (err: any) {
                          toast({ title: "שגיאה באישור התשלום", description: err.message, variant: "destructive" });
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      onError={(err) => {
                        toast({ title: "שגיאה ב-PayPal", description: String(err), variant: "destructive" });
                      }}
                    />
                  </PayPalScriptProvider>
                )}
              </>
            )}

            {!userId && authMode === "signup" && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground w-full text-center pt-1"
                onClick={() => setAuthMode("choose")}
              >
                ← חזרה
              </button>
            )}
          </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeLesson} onOpenChange={(o) => !o && setActiveLesson(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeLesson?.title}</DialogTitle>
          </DialogHeader>
          {activeLesson?.description && (
            <RichHtmlContent
              content={activeLesson.description}
              className="article-content max-w-none text-sm"
            />
          )}
          {activeLesson && (
            <div className="space-y-3">
              {activeLesson.video_url ? (
                <div className="aspect-video bg-black rounded overflow-hidden">
                  <iframe
                    src={getEmbedUrl(activeLesson.video_url)}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : activeLesson.video_file_url ? (
                <video src={activeLesson.video_file_url} controls className="w-full rounded" />
              ) : (
                <p className="text-muted-foreground">תוכן הוידאו יעלה בקרוב.</p>
              )}
              <div className="flex flex-wrap items-center gap-2 justify-between">
                {activeLesson.presentation_url && (
                  <a href={activeLesson.presentation_url} target="_blank" rel="noreferrer">
                    <Button variant="outline" className="gap-2"><FileText className="w-4 h-4" />הורד מצגת</Button>
                  </a>
                )}
                {userId && enrolled && (
                  <Button
                    variant={completedIds.has(activeLesson.id) ? "secondary" : "default"}
                    className="gap-2"
                    onClick={() => toggleCompleted(activeLesson.id)}
                  >
                    <Check className="w-4 h-4" />
                    {completedIds.has(activeLesson.id) ? "הושלם – סמן שלא הושלם" : "סמן כהושלם"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CourseLanding;
