import { useEffect, useState } from "react";
import { useParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useEvent, registerForEvent } from "@/hooks/useEvents";
import { Calendar, Clock, MapPin, User, CheckCircle2 } from "lucide-react";
import CourseAccountMenu from "@/components/CourseAccountMenu";

const formatPrice = (p: number) =>
  p === 0 ? "חינם" : new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(p);

const EventLanding = () => {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { data: event, isLoading } = useEvent(slug);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setUserEmail(data.user?.email ?? "");
      setForm((f) => ({ ...f, email: data.user?.email ?? f.email }));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;
    setSubmitting(true);
    try {
      await registerForEvent({
        event_id: event.id,
        user_id: userId,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
      });
      toast({ title: "נרשמת לאירוע בהצלחה!" });
      setRegistered(true);
      setOpen(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="container py-20 text-center">טוען...</div>;
  if (!event) return <div className="container py-20 text-center">האירוע לא נמצא.</div>;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container py-10">
        <div className="flex justify-end mb-4">
          <CourseAccountMenu />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-5">
            {event.cover_image_url && (
              <img src={event.cover_image_url} alt={event.title} className="w-full rounded-lg" />
            )}
            <h1 className="text-3xl md:text-4xl font-bold">{event.title}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />{new Date(event.event_date).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}</span>
              {event.event_time && <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{event.event_time.slice(0,5)}</span>}
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{event.location_type === "online" ? "אונליין" : event.location || "פרונטלי"}</span>
              {event.speaker_name && <span className="flex items-center gap-1"><User className="w-4 h-4" />{event.speaker_name}</span>}
            </div>
            {event.description && (
              <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap">{event.description}</div>
            )}
            {event.speaker_bio && (
              <Card>
                <CardContent className="p-5">
                  <div className="font-bold mb-1">על המרצה</div>
                  <div className="text-muted-foreground whitespace-pre-wrap">{event.speaker_bio}</div>
                </CardContent>
              </Card>
            )}
          </div>
          <Card className="h-fit sticky top-24">
            <CardContent className="p-5 space-y-3">
              <Badge>{event.location_type === "online" ? "אונליין" : "פרונטלי"}</Badge>
              <div className="text-3xl font-bold text-primary">{formatPrice(Number(event.price))}</div>
              {registered ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-md">
                  <CheckCircle2 className="w-5 h-5" /> נרשמת לאירוע
                </div>
              ) : (
                <Button size="lg" className="w-full" onClick={() => setOpen(true)}>הרשמה לאירוע</Button>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>הרשמה לאירוע</DialogTitle>
            <DialogDescription>נשמח לראותך! מלא/י את הפרטים הבאים.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div><Label>שם מלא *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
            <div><Label>אימייל *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!userEmail} /></div>
            <div><Label>טלפון</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "שולח..." : "אישור הרשמה"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EventLanding;
