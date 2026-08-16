import { useState } from "react";
import { useParams, Link, Navigate } from "@/lib/router-compat";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useJob } from "@/hooks/useJobs";
import { submitJobApplication } from "@/hooks/useJobApplications";
import { Loader2, Briefcase, MapPin, Building2, Banknote, ArrowRight, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const JobDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: job, isLoading } = useJob(id);
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!job || !job.is_active) return <Navigate to="/jobs" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast({ title: "יש למלא שם ואימייל", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await submitJobApplication({
        job_id: job.id,
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        cover_letter: coverLetter.trim(),
        cv_file: cvFile,
      });
      setSubmitted(true);
      toast({ title: "המועמדות הוגשה בהצלחה!" });
    } catch (err: any) {
      toast({ title: "שגיאה בהגשה", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">

      <Header />

      <main id="main-content" className="container py-8 max-w-4xl">
        <Button asChild variant="ghost" className="mb-4 gap-2">
          <Link to="/jobs">
            <ArrowRight className="w-4 h-4" />
            חזרה לרשימת המשרות
          </Link>
        </Button>

        <Card className="overflow-hidden mb-6">
          {job.image_url && (
            <div className="aspect-[21/9] overflow-hidden bg-muted">
              <img src={job.image_url} alt={job.title} className="w-full h-full object-cover" />
            </div>
          )}
          <CardContent className="p-6 md:p-8">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-foreground mb-2">{job.title}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground text-sm">
                  <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{job.company_name}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{job.location}</span>
                  {job.salary_range && <span className="flex items-center gap-1.5"><Banknote className="w-4 h-4" />{job.salary_range}</span>}
                </div>
              </div>
              <Badge variant="secondary" className="text-sm gap-1.5"><Briefcase className="w-3.5 h-3.5" />{job.job_type}</Badge>
            </div>

            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
              {job.description}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 md:p-8">
            <h2 className="text-xl font-bold mb-4">הגשת מועמדות</h2>

            {job.application_type === "external_link" && job.application_url ? (
              <div>
                <p className="text-muted-foreground mb-4">להגשת מועמדות, לחצו על הכפתור הבא ותועברו לאתר המגייסים:</p>
                <Button asChild size="lg" className="gap-2">
                  <a href={job.application_url} target="_blank" rel="noopener noreferrer">
                    הגשת מועמדות
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            ) : submitted ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-16 h-16 mx-auto text-green-600 mb-3" />
                <h3 className="text-lg font-bold mb-1">המועמדות נשלחה בהצלחה!</h3>
                <p className="text-muted-foreground">צוות הגיוס יחזור אליכם בהקדם.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">שם מלא *</Label>
                    <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">אימייל *</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" maxLength={255} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">טלפון</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" maxLength={30} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cover_letter">מכתב מקדים</Label>
                  <Textarea id="cover_letter" value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} rows={5} maxLength={2000} placeholder="ספרו על עצמכם ולמה אתם מתאימים לתפקיד" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cv">קובץ קורות חיים (PDF / DOC)</Label>
                  <Input
                    id="cv"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 10 * 1024 * 1024) {
                        toast({ title: "הקובץ גדול מ-10MB", variant: "destructive" });
                        e.target.value = "";
                        return;
                      }
                      setCvFile(f || null);
                    }}
                  />
                </div>
                <Button type="submit" size="lg" disabled={submitting} className="gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  שליחת מועמדות
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default JobDetail;
