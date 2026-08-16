import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail, Loader2, CheckCircle } from "lucide-react";
import { sendAdminNotification } from "@/lib/admin.functions";

interface ArticleNewsletterCardProps {
  category: string;
}

const ArticleNewsletterCard = ({ category }: ArticleNewsletterCardProps) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();
  const notifyAdmin = sendAdminNotification;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim()) {
      toast({ title: "יש למלא שם מלא ואימייל", variant: "destructive" });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({ title: "כתובת אימייל לא תקינה", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { data: newId, error } = await supabase.rpc("subscribe_newsletter", {
        p_email: email.trim(),
        p_full_name: fullName.trim(),
        p_phone: (phone.trim() || null) as unknown as string,
        p_interest_category: category,
      });

      if (error) {
        if ((error as any).code === "23505" || /duplicate/i.test(error.message)) {
          toast({ title: "כתובת האימייל כבר רשומה במערכת" });
        } else {
          throw error;
        }
      } else {
        setIsSubscribed(true);
        toast({ title: "נרשמת בהצלחה! 🎉" });
        if (newId) {
          notifyAdmin({ data: { type: "newsletter", recordId: newId } }).catch((e) =>
            console.error("notify failed", e)
          );
        }
      }
    } catch (error) {
      console.error("Newsletter signup error:", error);
      toast({ title: "שגיאה בהרשמה, נסו שוב", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubscribed) {
    return (
      <Card className="mt-8 border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle className="w-12 h-12 text-primary" />
          <h3 className="text-xl font-bold text-foreground">תודה שנרשמת!</h3>
          <p className="text-muted-foreground">
            נעדכן אותך בחדשות מעולם ה{category}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-8 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardContent className="py-8">
        <div className="flex flex-col items-center text-center gap-4">
          <Mail className="w-10 h-10 text-primary" />
          <h3 className="text-xl md:text-2xl font-bold text-foreground">
            רוצים לקבל עדכונים על עולם ה{category}?
          </h3>
          <p className="text-muted-foreground max-w-md">
            הצטרפו לניוזלטר שלנו וקבלו את החדשות ישירות למייל
          </p>

          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md flex flex-col gap-3 mt-2"
          >
            <Input
              aria-label="שם מלא"
              placeholder="שם מלא *"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="text-right"
              required
              maxLength={100}
            />
            <Input
              type="email"
              aria-label="אימייל"
              placeholder="אימייל *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-right"
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
              className="text-right"
              dir="ltr"
              maxLength={20}
            />
            <Button type="submit" disabled={isLoading} className="w-full gap-2">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              הצטרפו לניוזלטר
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};

export default ArticleNewsletterCard;
