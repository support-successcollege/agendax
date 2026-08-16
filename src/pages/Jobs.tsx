import { Link } from "@/lib/router-compat";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useJobs } from "@/hooks/useJobs";
import { Loader2, Briefcase, MapPin, Building2, Banknote, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const Jobs = () => {
  const { jobs, isLoading } = useJobs({ onlyActive: true });

  return (
    <div className="min-h-screen bg-background" dir="rtl">

      <Header />

      <main id="main-content" className="container py-8">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <Briefcase className="w-10 h-10 text-primary" />
            <h1 className="text-3xl md:text-4xl font-black text-foreground">
              איזור התעסוקה
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            המשרות החמות בענפי הטכנולוגיה, הכלכלה והפיננסים - מחכות לכם
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Briefcase className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-xl">בקרוב יתפרסמו משרות חדשות!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((job) => (
              <Card key={job.id} className="overflow-hidden hover:shadow-elegant transition-shadow flex flex-col">
                {job.image_url && (
                  <div className="aspect-video overflow-hidden bg-muted">
                    <img
                      src={job.image_url}
                      alt={job.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <CardContent className="p-5 flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h2 className="text-xl font-bold text-foreground line-clamp-2">{job.title}</h2>
                    <Badge variant="secondary" className="shrink-0">{job.job_type}</Badge>
                  </div>
                  <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 shrink-0" />
                      <span className="truncate">{job.company_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span className="truncate">{job.location}</span>
                    </div>
                    {job.salary_range && (
                      <div className="flex items-center gap-2">
                        <Banknote className="w-4 h-4 shrink-0" />
                        <span className="truncate">{job.salary_range}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-auto">
                    <Button asChild className="w-full gap-2">
                      <Link to={`/jobs/${job.id}`}>
                        פרטים והגשת מועמדות
                        <ArrowLeft className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Jobs;
