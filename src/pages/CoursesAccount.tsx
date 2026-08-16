import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, LogIn, UserPlus, Eye, EyeOff } from "lucide-react";

const isSafePath = (p: string | null) => !!p && p.startsWith("/") && !p.startsWith("//");

const CoursesAccount = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "signup" | "forgot">("login");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();

  const redirect = params.get("redirect");
  const target = isSafePath(redirect) ? redirect! : "/courses";

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) navigate(target, { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) navigate(target, { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate, target]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        console.error("[student-login]", error);
        toast({
          title: "שגיאת התחברות",
          description: error.message === "Invalid login credentials" ? "אימייל או סיסמה שגויים" : error.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "התחברת בהצלחה" });
      if (data.session?.user) window.location.assign(target);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, account_type: "student" },
          emailRedirectTo: `${window.location.origin}${target}`,
        },
      });
      if (error && !/already registered|already exists/i.test(error.message)) {
        console.error("[student-signup]", error);
        const msg = /weak|password/i.test(error.message)
          ? "סיסמה חלשה מדי, השתמש ב-6 תווים או יותר"
          : error.message;
        toast({ title: "שגיאת הרשמה", description: msg, variant: "destructive" });
        return;
      }
      // Always finalize with an explicit password login so the session is
      // established even if signUp didn't attach one (e.g., existing account or
      // slow auto-confirm). Then hard-navigate to guarantee the redirect.
      const { data: signedIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signedIn?.session?.user) {
        toast({ title: "נרשמת בהצלחה!", description: "מעביר אותך..." });
        window.location.assign(target);
        return;
      }
      if (data.session?.user) {
        toast({ title: "נרשמת בהצלחה!", description: "מעביר אותך..." });
        window.location.assign(target);
        return;
      }
      if (signInErr) console.error("[student-signup-signin]", signInErr);
      const errMsg = error?.message || signInErr?.message || "";
      if (/already registered|already exists/i.test(errMsg)) {
        toast({
          title: "המייל כבר רשום",
          description: "סיסמה שגויה עבור חשבון קיים – השתמש ב'שכחתי סיסמה'.",
          variant: "destructive",
        });
        setTab("login");
        return;
      }
      toast({ title: "נשלח מייל אימות", description: "לאחר אישור המייל תוכל להתחבר." });
      setTab("login");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast({ title: "שגיאה", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "נשלח מייל לאיפוס הסיסמה", description: "בדוק את תיבת המייל שלך." });
      setTab("login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">

      <Header />

      <main id="main-content" className="flex-1 flex items-center justify-center p-4 bg-gradient-to-l from-primary/5 via-background to-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-3">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {tab === "login" ? "התחברות תלמידים" : tab === "signup" ? "הרשמת תלמיד חדש" : "איפוס סיסמה"}
            </CardTitle>
            <CardDescription>
              {tab === "forgot"
                ? "הזן אימייל ונשלח לך קישור לאיפוס הסיסמה."
                : "אזור אישי לתלמידי הקורסים וההרצאות."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab === "forgot" ? "login" : tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">התחברות</TabsTrigger>
                <TabsTrigger value="signup">הרשמה</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                {tab === "forgot" ? (
                  <form onSubmit={handleForgot} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="fe">אימייל</Label>
                      <Input id="fe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "שולח..." : "שלח קישור לאיפוס"}
                    </Button>
                    <Button type="button" variant="ghost" className="w-full" onClick={() => setTab("login")}>
                      חזרה להתחברות
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">אימייל</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">סיסמה</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          dir="ltr"
                          className="pl-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "מתחבר..." : (<><LogIn className="w-4 h-4 ml-2" />התחבר</>)}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setTab("forgot")}
                      className="text-sm text-primary hover:underline w-full text-center"
                    >
                      שכחתי סיסמה
                    </button>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="sn">שם מלא</Label>
                    <Input id="sn" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="se">אימייל</Label>
                    <Input id="se" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sp">סיסמה (לפחות 6 תווים)</Label>
                    <Input
                      id="sp"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      dir="ltr"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "נרשם..." : (<><UserPlus className="w-4 h-4 ml-2" />הרשמה</>)}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default CoursesAccount;
