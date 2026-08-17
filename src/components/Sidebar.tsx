import { useState } from "react";
import { Article } from "@/hooks/useArticles";
import { Loader2, CheckCircle, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSidebarWidgets, SidebarWidget } from "@/hooks/useSidebarWidgets";
import WidgetRotating from "@/components/WidgetRotating";
import { sendAdminNotification } from "@/lib/admin.functions";

interface SidebarProps {
  articles: Article[];
  rotatingWidgets?: SidebarWidget[];
}


const Sidebar = ({ articles, rotatingWidgets }: SidebarProps) => {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();
  const { widgets } = useSidebarWidgets();
  const notifyAdmin = sendAdminNotification;

  const displayWidgets = rotatingWidgets ?? widgets.filter(w => w.isActive);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes("@")) {
      toast({
        title: "שגיאה",
        description: "נא להזין כתובת מייל תקינה",
        variant: "destructive",
      });
      return;
    }

    if (!fullName.trim()) {
      toast({
        title: "שגיאה",
        description: "נא להזין שם מלא",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: newId, error } = await supabase.rpc("subscribe_newsletter", {
        p_email: email.trim(),
        p_full_name: fullName.trim(),
        p_phone: (phone.trim() || null) as unknown as string,
        p_interest_category: "כללי",
      });

      if (error) {
        if ((error as any).code === "23505" || /duplicate/i.test(error.message)) {
          toast({
            title: "כבר רשום!",
            description: "כתובת המייל הזו כבר רשומה לניוזלטר",
          });
        } else {
          throw error;
        }
      } else {
        setIsSubscribed(true);
        setEmail("");
        toast({
          title: "נרשמת בהצלחה!",
          description: "תודה שהצטרפת לניוזלטר שלנו",
        });
        if (newId) {
          notifyAdmin({ data: { type: "newsletter", recordId: newId } }).catch((e) =>
            console.error("notify failed", e)
          );
        }
      }
    } catch (error) {
      console.error("Newsletter subscription error:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן להירשם כרגע, נסו שוב מאוחר יותר",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="space-y-8">
      {/* Newsletter */}
      <div className="glass-panel rounded-xl p-5">
        <h3 className="font-bold text-lg mb-2 text-white">הרשמו לניוזלטר</h3>
        <p className="text-sm text-white/80 mb-4">
          קבלו את החדשות החמות ביותר ישירות לתיבת המייל
        </p>
        {isSubscribed ? (
          <div className="flex items-center gap-2 text-white">
            <CheckCircle className="w-5 h-5" />
            <span>תודה שנרשמת!</span>
          </div>
        ) : !showDetails ? (
          <button
            onClick={() => setShowDetails(true)}
            className="w-full bg-accent text-white py-2.5 rounded-lg font-medium hover:bg-accent/90 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            הצטרפו עכשיו
          </button>
        ) : (
          <form onSubmit={handleNewsletterSubmit} className="space-y-3">
            <input
              type="text"
              aria-label="שם מלא"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="שם מלא *"
              className="w-full px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 placeholder:text-white/60 text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-white/30"
              disabled={isLoading}
              maxLength={100}
            />
            <input
              type="email"
              aria-label="אימייל"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="אימייל *"
              dir="ltr"
              className="w-full px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 placeholder:text-white/60 text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-white/30"
              disabled={isLoading}
            />
            <input
              type="tel"
              aria-label="טלפון"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="טלפון (לא חובה)"
              dir="ltr"
              className="w-full px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 placeholder:text-white/60 text-white text-sm focus:outline-hidden focus:ring-2 focus:ring-white/30"
              disabled={isLoading}
              maxLength={20}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent text-white py-2 rounded-lg font-medium hover:bg-accent/90 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  נרשם...
                </>
              ) : (
                "הרשמה"
              )}
            </button>
          </form>
        )}
      </div>

      {/* Rotating CTA Widgets */}
      {displayWidgets.length > 0 && (
        <WidgetRotating widgets={displayWidgets} />
      )}
    </aside>
  );
};

export default Sidebar;