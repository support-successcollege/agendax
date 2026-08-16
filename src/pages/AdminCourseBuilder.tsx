import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "@/lib/router-compat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCourseById, useCourses, useCourseStructure, useCourseMutations, useEnrollments, type Course, type CourseLesson, type CourseModule } from "@/hooks/useCourses";
import { useVideoUpload } from "@/hooks/useVideoUpload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, Eye, Plus, Trash2, ChevronUp, ChevronDown, Loader2, Upload, Save, ExternalLink } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";
import RichTextEditor from "@/components/RichTextEditor";

const db: any = supabase;

const slugify = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[\u0590-\u05FF]+/g, (m) => encodeURIComponent(m).replace(/%/g, ""))
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const AdminCourseBuilder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "details";
  const { data: course, isLoading } = useCourseById(id);
  const { updateCourse } = useCourses();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Course | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    if (course) {
      setDraft(course);
      skipNextSaveRef.current = true;
    }
  }, [course]);

  useEffect(() => {
    if (!draft || !id) return;
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const { id: _id, created_at, updated_at, ...payload } = draft as any;
        await db.from("courses").update(payload).eq("id", id);
        setSavedAt(Date.now());
        qc.invalidateQueries({ queryKey: ["courses"] });
        qc.invalidateQueries({ queryKey: ["course-id", id] });
      } catch (e: any) {
        toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (isLoading || !draft) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }
  if (!course) {
    return (
      <div className="container mx-auto p-6 text-center">
        <p>הקורס לא נמצא.</p>
        <Button onClick={() => navigate("/admin?tab=courses")} className="mt-4">חזרה</Button>
      </div>
    );
  }

  const setField = <K extends keyof Course>(k: K, v: Course[K]) => setDraft({ ...draft, [k]: v });
  const switchTab = (t: string) => { searchParams.set("tab", t); setSearchParams(searchParams, { replace: true }); };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-5xl" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <Button variant="ghost" onClick={() => navigate("/admin?tab=courses")} className="gap-2">
          <ArrowRight className="w-4 h-4" /> חזרה לניהול
        </Button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl md:text-2xl font-bold truncate">בונה הקורס: {draft.title || "(ללא שם)"}</h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> שומר…</> : savedAt ? <><Save className="w-3 h-3" /> נשמר ✓</> : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/courses/${draft.slug}`} target="_blank" rel="noreferrer" className="gap-2"><Eye className="w-4 h-4" />תצוגה</a>
          </Button>
          <Button
            variant={draft.is_published ? "secondary" : "default"}
            onClick={() => setField("is_published", !draft.is_published)}
          >
            {draft.is_published ? "הסתר" : "פרסם"}
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={switchTab}>
        <TabsList>
          <TabsTrigger value="details">פרטים</TabsTrigger>
          <TabsTrigger value="content">תכנים</TabsTrigger>
          <TabsTrigger value="pricing">תמחור ומרצה</TabsTrigger>
          <TabsTrigger value="coupons">קופונים</TabsTrigger>
          <TabsTrigger value="enrollments">נרשמים</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4 space-y-4">
          <Card><CardContent className="p-4 space-y-3">
            <div><Label>שם הקורס</Label><Input value={draft.title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value, slug: draft.slug || slugify(e.target.value) })} /></div>
            <div><Label>Slug (URL)</Label><Input dir="ltr" value={draft.slug || ""} onChange={(e) => setField("slug", e.target.value)} /></div>
            <div><Label>תיאור קצר</Label><Input value={draft.short_description || ""} onChange={(e) => setField("short_description", e.target.value)} /></div>
            <div>
              <Label>תיאור מלא</Label>
              <RichTextEditor value={draft.description || ""} onChange={(v) => setField("description", v)} />
            </div>
            <ImageUpload value={draft.cover_image_url || ""} onChange={(url) => setField("cover_image_url", url)} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>קטגוריה</Label><Input value={draft.category || ""} onChange={(e) => setField("category", e.target.value)} /></div>
              <div>
                <Label>רמה</Label>
                <Select value={draft.level || "beginner"} onValueChange={(v) => setField("level", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">מתחיל</SelectItem>
                    <SelectItem value="intermediate">בינוני</SelectItem>
                    <SelectItem value="advanced">מתקדם</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>שעות לימוד</Label><Input type="number" step="0.5" value={Number(draft.duration_hours ?? 0)} onChange={(e) => setField("duration_hours", e.target.value ? Number(e.target.value) : null)} /></div>
              <div><Label>סדר תצוגה</Label><Input type="number" value={draft.display_order ?? 0} onChange={(e) => setField("display_order", Number(e.target.value))} /></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="content" className="mt-4">
          <ContentBuilder courseId={id!} />
        </TabsContent>

        <TabsContent value="pricing" className="mt-4 space-y-4">
          <Card><CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div><Label>מחיר ₪</Label><Input type="number" value={Number(draft.price ?? 0)} onChange={(e) => setField("price", Number(e.target.value))} /></div>
              <div><Label>מחיר מקורי (אופציונלי)</Label><Input type="number" value={Number(draft.original_price ?? 0)} onChange={(e) => setField("original_price", e.target.value ? Number(e.target.value) : null)} /></div>
              <div><Label>מטבע</Label><Input value={draft.currency || "ILS"} onChange={(e) => setField("currency", e.target.value)} /></div>
            </div>
            <div><Label>שם המרצה</Label><Input value={draft.instructor_name || ""} onChange={(e) => setField("instructor_name", e.target.value)} /></div>
            <div>
              <Label>על המרצה</Label>
              <RichTextEditor value={draft.instructor_bio || ""} onChange={(v) => setField("instructor_bio", v)} />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Switch checked={!!draft.is_published} onCheckedChange={(v) => setField("is_published", v)} />
              <Label>מפורסם</Label>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="coupons" className="mt-4">
          <CouponsManager courseId={id!} />
        </TabsContent>

        <TabsContent value="enrollments" className="mt-4">
          <EnrollmentsTable courseId={id!} slug={draft.slug} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

/* ---------- Content Builder (Modules + Lessons + Resources) ---------- */

const ContentBuilder = ({ courseId }: { courseId: string }) => {
  const { data } = useCourseStructure(courseId);
  const m = useCourseMutations(courseId);
  const [newModule, setNewModule] = useState("");

  const lessonsByModule: Record<string, CourseLesson[]> = {};
  (data?.lessons || []).forEach((l) => (lessonsByModule[l.module_id] ||= []).push(l));
  const modules = data?.modules || [];

  const moveModule = async (mod: CourseModule, dir: -1 | 1) => {
    const idx = modules.findIndex((x) => x.id === mod.id);
    const swap = modules[idx + dir];
    if (!swap) return;
    await m.updateModule.mutateAsync({ id: mod.id, display_order: swap.display_order });
    await m.updateModule.mutateAsync({ id: swap.id, display_order: mod.display_order });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="שם מודול חדש" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
        <Button onClick={async () => { if (!newModule) return; await m.addModule.mutateAsync({ title: newModule, display_order: modules.length }); setNewModule(""); }} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף מודול
        </Button>
      </div>
      {modules.map((mod) => (
        <ModuleCard
          key={mod.id}
          mod={mod}
          lessons={lessonsByModule[mod.id] || []}
          mutations={m}
          courseId={courseId}
          onMoveUp={() => moveModule(mod, -1)}
          onMoveDown={() => moveModule(mod, 1)}
        />
      ))}
      {modules.length === 0 && <p className="text-center text-muted-foreground py-8">עדיין אין מודולים. הוסף את המודול הראשון למעלה.</p>}
    </div>
  );
};

const ModuleCard = ({ mod, lessons, mutations, courseId, onMoveUp, onMoveDown }: {
  mod: CourseModule; lessons: CourseLesson[]; mutations: ReturnType<typeof useCourseMutations>; courseId: string;
  onMoveUp: () => void; onMoveDown: () => void;
}) => {
  const [title, setTitle] = useState(mod.title);
  const [description, setDescription] = useState(mod.description || "");
  const [expanded, setExpanded] = useState(true);

  const save = async () => {
    if (title !== mod.title || description !== (mod.description || "")) {
      await mutations.updateModule.mutateAsync({ id: mod.id, title, description });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onMoveUp}><ChevronUp className="w-3 h-3" /></Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onMoveDown}><ChevronDown className="w-3 h-3" /></Button>
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={save} className="font-bold text-base" />
          <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>{expanded ? "צמצם" : "הרחב"}</Button>
          <Button size="sm" variant="destructive" onClick={() => { if (confirm("למחוק מודול וכל השיעורים שבו?")) mutations.deleteModule.mutate(mod.id); }}><Trash2 className="w-3 h-3" /></Button>
        </div>
        {expanded && (
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={save} placeholder="תיאור המודול (אופציונלי)" rows={2} className="mt-2" />
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          {lessons.map((l) => (
            <LessonEditor key={l.id} lesson={l} mutations={mutations} />
          ))}
          <Button variant="outline" className="w-full gap-2" onClick={() => mutations.addLesson.mutate({ module_id: mod.id, course_id: courseId, title: "שיעור חדש", is_free: lessons.length === 0, display_order: lessons.length })}>
            <Plus className="w-4 h-4" /> שיעור חדש
          </Button>
        </CardContent>
      )}
    </Card>
  );
};

const LessonEditor = ({ lesson, mutations }: { lesson: CourseLesson; mutations: ReturnType<typeof useCourseMutations> }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CourseLesson>(lesson);
  const { uploadVideo, isUploading } = useVideoUpload();
  const { toast } = useToast();
  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setDraft(lesson), [lesson]);

  const save = async (patch: Partial<CourseLesson> = {}) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    await mutations.updateLesson.mutateAsync({ id: lesson.id, ...patch, ...(patch === draft ? {} : {}) } as any);
  };

  const saveAll = async () => {
    const { id, course_id, module_id, created_at, ...rest } = draft as any;
    await mutations.updateLesson.mutateAsync({ id: lesson.id, ...rest });
  };

  const onVideoFile = async (file: File) => {
    const url = await uploadVideo(file);
    if (url) {
      setDraft({ ...draft, video_file_url: url });
      await mutations.updateLesson.mutateAsync({ id: lesson.id, video_file_url: url });
    }
  };

  return (
    <div className="border rounded-md">
      <div className="flex items-center gap-2 p-2 bg-muted/40">
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} className="flex-1 justify-start font-medium">
          {open ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
          {draft.title || "שיעור ללא שם"}
        </Button>
        {draft.is_free && <Badge variant="secondary">חינם</Badge>}
        <Button size="sm" variant="ghost" onClick={() => { if (confirm("למחוק שיעור?")) mutations.deleteLesson.mutate(lesson.id); }}><Trash2 className="w-3 h-3" /></Button>
      </div>
      {open && (
        <div className="p-3 space-y-2">
          <div><Label>כותרת</Label><Input value={draft.title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={saveAll} /></div>
          <div>
            <Label>תיאור</Label>
            <RichTextEditor
              value={draft.description || ""}
              onChange={(v) => {
                setDraft({ ...draft, description: v });
                if (descDebounceRef.current) clearTimeout(descDebounceRef.current);
                descDebounceRef.current = setTimeout(() => {
                  mutations.updateLesson.mutate({ id: lesson.id, description: v });
                }, 700);
              }}
            />
          </div>
          <div><Label>קישור וידאו (YouTube / Vimeo)</Label><Input dir="ltr" value={draft.video_url || ""} onChange={(e) => setDraft({ ...draft, video_url: e.target.value })} onBlur={saveAll} /></div>
          <div>
            <Label>או העלאת קובץ וידאו</Label>
            <div className="flex items-center gap-2">
              <Input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) onVideoFile(f); }} disabled={isUploading} />
              {isUploading && <Loader2 className="w-4 h-4 animate-spin" />}
            </div>
            {draft.video_file_url && <p className="text-xs text-muted-foreground mt-1 truncate" dir="ltr">{draft.video_file_url}</p>}
          </div>
          <div><Label>קישור למצגת</Label><Input dir="ltr" value={draft.presentation_url || ""} onChange={(e) => setDraft({ ...draft, presentation_url: e.target.value })} onBlur={saveAll} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>משך (דקות)</Label><Input type="number" value={draft.duration_minutes ?? 0} onChange={(e) => setDraft({ ...draft, duration_minutes: Number(e.target.value) })} onBlur={saveAll} /></div>
            <div><Label>סדר</Label><Input type="number" value={draft.display_order ?? 0} onChange={(e) => setDraft({ ...draft, display_order: Number(e.target.value) })} onBlur={saveAll} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={!!draft.is_free} onCheckedChange={(v) => { setDraft({ ...draft, is_free: v }); mutations.updateLesson.mutate({ id: lesson.id, is_free: v }); }} /><Label>פתוח לצפייה חינמית</Label></div>

          <LessonResources lessonId={lesson.id} />
        </div>
      )}
    </div>
  );
};

const LessonResources = ({ lessonId }: { lessonId: string }) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: resources = [] } = useQuery({
    queryKey: ["lesson-resources", lessonId],
    queryFn: async () => {
      const { data, error } = await db.from("lesson_resources").select("*").eq("lesson_id", lessonId).order("display_order");
      if (error) throw error;
      return data || [];
    },
  });
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["lesson-resources", lessonId] });

  const add = async () => {
    if (!title || !url) return;
    const { error } = await db.from("lesson_resources").insert({ lesson_id: lessonId, title, file_url: url, file_type: "link", display_order: resources.length });
    if (error) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); return; }
    setTitle(""); setUrl(""); refresh();
  };
  const remove = async (id: string) => {
    await db.from("lesson_resources").delete().eq("id", id);
    refresh();
  };

  return (
    <div className="border-t pt-2 mt-2">
      <Label className="text-xs">חומרי עזר</Label>
      <div className="space-y-1 mt-1">
        {resources.map((r: any) => (
          <div key={r.id} className="flex items-center gap-2 text-sm bg-muted/30 rounded p-1">
            <a href={r.file_url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline" dir="ltr">{r.title}</a>
            <ExternalLink className="w-3 h-3 opacity-50" />
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(r.id)}><Trash2 className="w-3 h-3" /></Button>
          </div>
        ))}
        <div className="flex gap-1">
          <Input placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
          <Input placeholder="URL" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} className="h-8 text-xs" />
          <Button size="sm" onClick={add}>הוסף</Button>
        </div>
      </div>
    </div>
  );
};

/* ---------- Enrollments ---------- */

const EnrollmentsTable = ({ courseId, slug }: { courseId: string; slug: string }) => {
  const { data: enrollments = [] } = useEnrollments(courseId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<any | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["enrollments", courseId] });

  const saveEnrollment = async () => {
    if (!editing) return;
    const { id, full_name, email, phone, payment_status, notes } = editing;
    const { error } = await (supabase as any)
      .from("course_enrollments")
      .update({ full_name, email, phone, payment_status, notes })
      .eq("id", id);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הפרטים עודכנו" });
    setEditing(null);
    invalidate();
  };

  const deleteEnrollment = async (id: string) => {
    if (!confirm("למחוק את הנרשם? פעולה זו אינה הפיכה.")) return;
    const { error } = await (supabase as any).from("course_enrollments").delete().eq("id", id);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "הנרשם נמחק" });
    invalidate();
  };

  const exportCsv = () => {
    const headers = ["שם", "אימייל", "טלפון", "סטטוס", "תאריך"];
    const rows = enrollments.map((e) => [e.full_name, e.email, e.phone || "", e.payment_status, new Date(e.enrolled_at).toLocaleString("he-IL")]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${slug}-enrollments.csv`; a.click();
  };

  return (
    <Card><CardContent className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold">{enrollments.length} נרשמים</h3>
        <Button size="sm" variant="outline" onClick={exportCsv}>ייצוא CSV</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="border-b"><th className="text-right p-2">שם</th><th className="text-right p-2">אימייל</th><th className="text-right p-2">טלפון</th><th className="text-right p-2">סטטוס</th><th className="text-right p-2">תאריך</th><th className="text-right p-2">פעולות</th></tr></thead>
        <tbody>
          {enrollments.map((e) => (
            <tr key={e.id} className="border-b">
              <td className="p-2">{e.full_name}</td><td className="p-2">{e.email}</td><td className="p-2">{e.phone}</td>
              <td className="p-2"><Badge variant={e.payment_status === "paid" ? "default" : "secondary"}>{e.payment_status}</Badge></td>
              <td className="p-2">{new Date(e.enrolled_at).toLocaleDateString("he-IL")}</td>
              <td className="p-2">
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...e })}>עריכה</Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteEnrollment(e.id)}>מחיקה</Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>עריכת נרשם</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>שם מלא</Label>
                <Input value={editing.full_name || ""} onChange={(ev) => setEditing({ ...editing, full_name: ev.target.value })} />
              </div>
              <div>
                <Label>אימייל</Label>
                <Input type="email" value={editing.email || ""} onChange={(ev) => setEditing({ ...editing, email: ev.target.value })} />
              </div>
              <div>
                <Label>טלפון</Label>
                <Input value={editing.phone || ""} onChange={(ev) => setEditing({ ...editing, phone: ev.target.value })} />
              </div>
              <div>
                <Label>סטטוס גישה</Label>
                <Select value={editing.payment_status} onValueChange={(v) => setEditing({ ...editing, payment_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">שולם – גישה מלאה</SelectItem>
                    <SelectItem value="free">חינמי – גישה מלאה</SelectItem>
                    <SelectItem value="pending">ממתין לתשלום – ללא גישה</SelectItem>
                    <SelectItem value="cancelled">בוטל – ללא גישה</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">גישה לתכני הקורס נפתחת רק בסטטוס "שולם" או "חינמי".</p>
              </div>
              <div>
                <Label>הערות</Label>
                <Input value={editing.notes || ""} onChange={(ev) => setEditing({ ...editing, notes: ev.target.value })} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
                <Button onClick={saveEnrollment}>שמירה</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
};


/* ---------- Coupons Manager ---------- */

interface CourseCoupon {
  id: string;
  course_id: string;
  code: string;
  discount_percent: number;
  grants_free_access: boolean;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

const CouponsManager = ({ courseId }: { courseId: string }) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: coupons = [], refetch } = useQuery({
    queryKey: ["course-coupons", courseId],
    queryFn: async () => {
      const { data, error } = await db.from("course_coupons").select("*").eq("course_id", courseId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CourseCoupon[];
    },
  });

  const [form, setForm] = useState({
    code: "",
    discount_percent: 20,
    grants_free_access: false,
    max_uses: "",
    expires_at: "",
    is_active: true,
  });

  const addCoupon = async () => {
    if (!form.code.trim()) return;
    const payload: any = {
      course_id: courseId,
      code: form.code.trim(),
      discount_percent: form.grants_free_access ? 100 : Number(form.discount_percent) || 0,
      grants_free_access: form.grants_free_access,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };
    const { error } = await db.from("course_coupons").insert(payload);
    if (error) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); return; }
    setForm({ code: "", discount_percent: 20, grants_free_access: false, max_uses: "", expires_at: "", is_active: true });
    refetch();
    toast({ title: "הקופון נוסף" });
  };

  const toggleActive = async (c: CourseCoupon) => {
    await db.from("course_coupons").update({ is_active: !c.is_active }).eq("id", c.id);
    refetch();
  };

  const remove = async (id: string) => {
    if (!confirm("למחוק את הקופון?")) return;
    await db.from("course_coupons").delete().eq("id", id);
    refetch();
  };

  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle className="text-base">הוספת קוד קופון</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label>קוד הקופון</Label><Input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="SAVE20" /></div>
            <div>
              <Label>אחוז הנחה</Label>
              <Input type="number" min={0} max={100} value={form.discount_percent} disabled={form.grants_free_access}
                onChange={(e) => setForm({ ...form, discount_percent: Number(e.target.value) })} />
            </div>
            <div><Label>מגבלת מימושים</Label><Input type="number" min={1} value={form.max_uses} placeholder="ללא הגבלה" onChange={(e) => setForm({ ...form, max_uses: e.target.value })} /></div>
            <div><Label>תוקף עד (אופציונלי)</Label><Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
          </div>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={form.grants_free_access} onCheckedChange={(v) => setForm({ ...form, grants_free_access: v })} />
              <Label>גישה חינמית מלאה לקורס</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>פעיל</Label>
            </div>
            <Button onClick={addCoupon} className="gap-2 mr-auto"><Plus className="w-4 h-4" />הוסף קופון</Button>
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-4">
        <h3 className="font-bold mb-3">{coupons.length} קופונים</h3>
        {coupons.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">עדיין אין קופונים לקורס זה.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b">
                <th className="text-right p-2">קוד</th>
                <th className="text-right p-2">הנחה</th>
                <th className="text-right p-2">מימושים</th>
                <th className="text-right p-2">תוקף</th>
                <th className="text-right p-2">סטטוס</th>
                <th className="text-right p-2"></th>
              </tr></thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="p-2 font-mono" dir="ltr">{c.code}</td>
                    <td className="p-2">{c.grants_free_access ? <Badge>חינם</Badge> : `${c.discount_percent}%`}</td>
                    <td className="p-2">{c.uses_count}{c.max_uses != null ? ` / ${c.max_uses}` : ""}</td>
                    <td className="p-2">{c.expires_at ? new Date(c.expires_at).toLocaleDateString("he-IL") : "ללא"}</td>
                    <td className="p-2"><Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} /></td>
                    <td className="p-2"><Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="w-3 h-3" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </div>
  );
};

export default AdminCourseBuilder;

