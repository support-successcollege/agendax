import { useJobApplications, getCvSignedUrl } from "@/hooks/useJobApplications";
import { useJobs } from "@/hooks/useJobs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, FileDown, Mail, Phone, Briefcase, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AdminApplicationsTab = () => {
  const { applications, isLoading, deleteApplication } = useJobApplications();
  const { jobs } = useJobs();
  const { toast } = useToast();

  const jobById = (id: string) => jobs.find((j) => j.id === id);

  const handleDownloadCV = async (path: string) => {
    try {
      const url = await getCvSignedUrl(path);
      window.open(url, "_blank");
    } catch (e: any) {
      toast({ title: "שגיאה בהורדה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>מועמדויות שהוגשו</CardTitle>
        <CardDescription>צפייה במועמדויות שהוגשו דרך טפסי המשרות באתר</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : applications.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">לא הוגשו מועמדויות עדיין.</p>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => {
              const job = jobById(app.job_id);
              return (
                <div key={app.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h4 className="font-bold">{app.full_name}</h4>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <Briefcase className="w-3.5 h-3.5" />
                        {job ? `${job.title} · ${job.company_name}` : "משרה נמחקה"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {app.cv_url && (
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleDownloadCV(app.cv_url!)}>
                          <FileDown className="w-4 h-4" />
                          קו״ח
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteApplication.mutate(app.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground flex gap-4 flex-wrap">
                    <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{app.email}</span>
                    {app.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{app.phone}</span>}
                    <span>{new Date(app.created_at).toLocaleString("he-IL")}</span>
                  </div>
                  {app.cover_letter && (
                    <div className="text-sm bg-muted/40 p-3 rounded whitespace-pre-wrap">{app.cover_letter}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminApplicationsTab;
