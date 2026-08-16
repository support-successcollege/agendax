import { useState } from "react";
import { useJobs, Job } from "@/hooks/useJobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Briefcase } from "lucide-react";
import ImageUpload from "./ImageUpload";

const JOB_TYPES = ["משרה מלאה", "משרה חלקית", "פרילנס", "מתמחה", "שכיר/עצמאי"];

const AdminJobsTab = () => {
  const { jobs, isLoading, addJob, updateJob, deleteJob } = useJobs();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);

  const [form, setForm] = useState({
    title: "",
    company_name: "",
    location: "",
    job_type: JOB_TYPES[0],
    salary_range: "",
    description: "",
    image_url: "",
    application_type: "form" as "form" | "external_link",
    application_url: "",
  });

  const openDialog = (job?: Job) => {
    if (job) {
      setEditing(job);
      setForm({
        title: job.title,
        company_name: job.company_name,
        location: job.location,
        job_type: job.job_type,
        salary_range: job.salary_range || "",
        description: job.description,
        image_url: job.image_url || "",
        application_type: job.application_type,
        application_url: job.application_url || "",
      });
    } else {
      setEditing(null);
      setForm({
        title: "",
        company_name: "",
        location: "",
        job_type: JOB_TYPES[0],
        salary_range: "",
        description: "",
        image_url: "",
        application_type: "form",
        application_url: "",
      });
    }
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.company_name || !form.location || !form.description) return;
    if (form.application_type === "external_link" && !form.application_url) return;

    const payload = {
      title: form.title,
      company_name: form.company_name,
      location: form.location,
      job_type: form.job_type,
      salary_range: form.salary_range || null,
      description: form.description,
      image_url: form.image_url || null,
      application_type: form.application_type,
      application_url: form.application_type === "external_link" ? form.application_url : null,
    };

    if (editing) {
      await updateJob.mutateAsync({ id: editing.id, ...payload });
    } else {
      await addJob.mutateAsync({ ...payload, display_order: jobs.length });
    }
    setOpen(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>ניהול משרות</CardTitle>
            <CardDescription>פרסום, עריכה ומחיקה של משרות באיזור התעסוקה</CardDescription>
          </div>
          <Button className="gap-2" onClick={() => openDialog()}>
            <Plus className="w-4 h-4" />
            משרה חדשה
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-10 text-muted-foreground">טוען...</p>
          ) : jobs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Briefcase className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>אין משרות עדיין. לחץ על "משרה חדשה" כדי להתחיל.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30">
                  {job.image_url ? (
                    <img src={job.image_url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Briefcase className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate">{job.title}</h4>
                    <p className="text-sm text-muted-foreground truncate">
                      {job.company_name} · {job.location} · {job.job_type}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch checked={job.is_active} onCheckedChange={(v) => updateJob.mutate({ id: job.id, is_active: v })} />
                    <Button variant="outline" size="icon" onClick={() => openDialog(job)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteJob.mutate(job.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת משרה" : "משרה חדשה"}</DialogTitle>
            <DialogDescription>פרטי המשרה לאיזור התעסוקה</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>כותרת המשרה *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>שם החברה *</Label>
                <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>מיקום *</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="תל אביב / היברידי / מרחוק" />
              </div>
              <div className="space-y-2">
                <Label>סוג משרה *</Label>
                <Select value={form.job_type} onValueChange={(v) => setForm({ ...form, job_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {JOB_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>טווח שכר (אופציונלי)</Label>
                <Input value={form.salary_range} onChange={(e) => setForm({ ...form, salary_range: e.target.value })} placeholder="לדוגמה: 25,000-35,000 ש״ח" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>תיאור המשרה *</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={8} placeholder="תיאור התפקיד, דרישות, יתרונות..." />
            </div>

            <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />

            <div className="space-y-2">
              <Label>סוג הגשת מועמדות *</Label>
              <Select value={form.application_type} onValueChange={(v: any) => setForm({ ...form, application_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="form">טופס מובנה (מועמדויות נשמרות באתר)</SelectItem>
                  <SelectItem value="external_link">קישור חיצוני</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.application_type === "external_link" && (
              <div className="space-y-2">
                <Label>קישור חיצוני להגשת מועמדות *</Label>
                <Input value={form.application_url} onChange={(e) => setForm({ ...form, application_url: e.target.value })} dir="ltr" placeholder="https://..." />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={handleSave}>{editing ? "שמור שינויים" : "פרסם משרה"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminJobsTab;
