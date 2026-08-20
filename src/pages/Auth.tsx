import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Home, LogIn } from "lucide-react";
import wordmark from "@/assets/agendax-wordmark-light.png";

const isSafePath = (p: string | null) => !!p && p.startsWith("/") && !p.startsWith("//");

const clearAuthStorage = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))
      .forEach((key) => localStorage.removeItem(key));
  } catch (_e) {
    // ignore storage access errors
  }
};

const signOutLocally = async () => {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch (_e) {
    // ignore sign-out errors and still purge local auth state
  } finally {
    clearAuthStorage();
  }
};

const checkIsAdmin = async (userId: string) => {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return !error && data === true;
};

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const suppressNonAdminToastRef = useRef(false);
  const redirect = params.get("redirect");
  const target = isSafePath(redirect) ? redirect! : "/admin";

  useEffect(() => {
    let mounted = true;

    const handleSession = async (session: any) => {
      if (!session?.user) return;

      const admin = await checkIsAdmin(session.user.id);
      if (!mounted) return;

      if (admin) {
        navigate(target, { replace: true });
        return;
      }

      await signOutLocally();
      if (!mounted) return;

      if (!suppressNonAdminToastRef.current) {
        toast({
          title: "גישה למנהלים בלבד",
          description: "נותקת מחשבון התלמיד. התחבר כאן עם חשבון מנהל.",
          variant: "destructive",
        });
      }
      suppressNonAdminToastRef.current = false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setTimeout(() => { void handleSession(session); }, 0);
    });

    supabase.auth.getSession().then(({ data: { session } }) => { void handleSession(session); });

    return () => subscription.unsubscribe();
  }, [navigate, target, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast({
          title: "שגיאת התחברות",
          description: error.message === "Invalid login credentials" ? "פרטי התחברות שגויים" : error.message,
          variant: "destructive",
        });
        return;
      }

      const admin = data.user ? await checkIsAdmin(data.user.id) : false;
      if (!admin) {
        suppressNonAdminToastRef.current = true;
        await signOutLocally();
        toast({
          title: "גישה למנהלים בלבד",
          description: "פרטי ההתחברות שייכים לתלמיד. למסך הניהול יש להתחבר עם חשבון מנהל.",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "התחברת בהצלחה" });
      navigate(target, { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast({ title: "שגיאה", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "נשלח מייל לאיפוס הסיסמה", description: "בדוק את תיבת הדוא\"ל שלך." });
      setMode("login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img
            src={wordmark}
            alt="Agendax"
            width={800}
            height={107}
            className="mx-auto h-8 w-auto mb-4"
          />
          <CardTitle className="text-2xl font-bold">
            {mode === "login" ? "התחברות מנהלים" : "איפוס סיסמה"}
          </CardTitle>
          <CardDescription>
            {mode === "forgot" ? "הזן אימייל ונשלח קישור לאיפוס הסיסמה." : "אזור מנהלי המערכת בלבד"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "forgot" ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fe">אימייל</Label>
                <Input id="fe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "שולח..." : "שלח קישור לאיפוס"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("login")}>חזרה להתחברות</Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">אימייל</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">סיסמה</Label>
                <div className="relative">
                  <Input id="password" type={showPassword ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} required minLength={6} dir="ltr" className="pl-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "מתחבר..." : <><LogIn className="w-4 h-4 ml-2" />התחבר</>}
              </Button>
              <button type="button" onClick={() => setMode("forgot")} className="text-sm text-primary hover:underline w-full text-center">
                שכחתי סיסמה
              </button>
              <p className="text-xs text-muted-foreground text-center pt-2 border-t">
                תלמידי קורסים – יש להיכנס דרך אזור הקורסים באתר.
              </p>
            </form>
          )}
          <Button
            type="button"
            variant="ghost"
            className="w-full mt-4"
            onClick={() => navigate("/")}
          >
            <Home className="w-4 h-4 ml-2" />
            חזרה לדף הבית
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
