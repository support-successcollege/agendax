import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Users, GraduationCap, Layers, Eye, ShoppingBag } from "lucide-react";
import { useCourses, useCourseStructure, useCourseMutations, useEnrollments, Course, CourseLesson, CourseModule } from "@/hooks/useCourses";
import { useEvents, useEventRegistrations, EventItem } from "@/hooks/useEvents";
import AdminProductsTab from "@/components/AdminProductsTab";

const emptyCourse: Partial<Course> = {
  title: "", slug: "", short_description: "", description: "", cover_image_url: "",
  instructor_name: "", instructor_bio: "", price: 0, original_price: null, currency: "ILS",
  duration_hours: null, level: "beginner", category: "", is_published: false, display_order: 0,
};
const emptyEvent: Partial<EventItem> = {
  title: "", slug: "", description: "", cover_image_url: "", event_date: new Date().toISOString().slice(0,10),
  event_time: "19:00", duration_minutes: 60, location_type: "online", location: "",
  speaker_name: "", speaker_bio: "", price: 0, max_attendees: null, is_published: false,
};

const slugify = (s: string) =>
  s.trim().toLowerCase()
    .replace(/[\u0590-\u05FF]+/g, (m) => encodeURIComponent(m).replace(/%/g, ""))
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

const AdminCoursesTab = () => {
  return (
    <Tabs defaultValue="courses" className="w-full">
      <TabsList>
        <TabsTrigger value="courses"><GraduationCap className="w-4 h-4 ml-1" />קורסים</TabsTrigger>
        <TabsTrigger value="events"><Layers className="w-4 h-4 ml-1" />אירועים</TabsTrigger>
        <TabsTrigger value="products"><ShoppingBag className="w-4 h-4 ml-1" />פריטים</TabsTrigger>
      </TabsList>
      <TabsContent value="courses"><CoursesPanel /></TabsContent>
      <TabsContent value="events"><EventsPanel /></TabsContent>
      <TabsContent value="products"><AdminProductsTab /></TabsContent>
    </Tabs>
  );
};

const CoursesPanel = () => {
  const { courses, addCourse, deleteCourse } = useCourses();
  const navigate = useNavigate();

  const createNew = async () => {
    const created = await addCourse.mutateAsync({ ...emptyCourse, title: "קורס חדש", slug: `course-${Date.now()}` });
    if (created?.id) navigate(`/admin/courses/${created.id}/builder`);
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">קורסים</h2>
        <Button onClick={createNew} className="gap-2"><Plus className="w-4 h-4" />קורס חדש</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 flex gap-3">
              {c.cover_image_url && <img src={c.cover_image_url} alt="" className="w-24 h-24 object-cover rounded" />}
              <div className="flex-1">
                <div className="flex items-center gap-2"><h3 className="font-bold">{c.title}</h3>{c.is_published ? <Badge>פורסם</Badge> : <Badge variant="secondary">טיוטה</Badge>}</div>
                <p className="text-sm text-muted-foreground line-clamp-2">{c.short_description}</p>
                <div className="text-sm mt-1">{Number(c.price) === 0 ? "חינם" : `₪${c.price}`} · /{c.slug}</div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/admin/courses/${c.id}/builder`)}><Edit className="w-3 h-3 ml-1" />עריכה</Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/admin/courses/${c.id}/builder?tab=content`)}><Layers className="w-3 h-3 ml-1" />תכנים</Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/admin/courses/${c.id}/builder?tab=enrollments`)}><Users className="w-3 h-3 ml-1" />נרשמים</Button>
                  <Button size="sm" variant="outline" asChild><a href={`/courses/${c.slug}`} target="_blank" rel="noreferrer"><Eye className="w-3 h-3 ml-1" />תצוגה</a></Button>
                  <Button size="sm" variant="destructive" onClick={() => { if (confirm("למחוק את הקורס?")) deleteCourse.mutate(c.id); }}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

const StructureDialog = ({ course, onClose }: { course: Course; onClose: () => void }) => {
  const { data } = useCourseStructure(course.id);
  const m = useCourseMutations(course.id);
  const [newModule, setNewModule] = useState("");
  const [editingLesson, setEditingLesson] = useState<Partial<CourseLesson> | null>(null);
  const [editingModule, setEditingModule] = useState<Partial<CourseModule> | null>(null);

  const lessonsByModule: Record<string, CourseLesson[]> = {};
  (data?.lessons || []).forEach((l) => (lessonsByModule[l.module_id] ||= []).push(l));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>תכנים: {course.title}</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Input placeholder="מודול חדש" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
          <Button onClick={async () => { if (!newModule) return; await m.addModule.mutateAsync({ title: newModule, display_order: (data?.modules.length || 0) }); setNewModule(""); }}>הוסף מודול</Button>
        </div>
        <div className="space-y-3 mt-3">
          {(data?.modules || []).map((mod) => (
            <Card key={mod.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">{mod.title}</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingModule(mod)}><Edit className="w-3 h-3" /></Button>
                  <Button size="sm" variant="destructive" onClick={() => { if (confirm("למחוק מודול?")) m.deleteModule.mutate(mod.id); }}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {(lessonsByModule[mod.id] || []).map((l) => (
                  <div key={l.id} className="flex items-center justify-between p-2 rounded bg-muted">
                    <div><span className="font-medium">{l.title}</span>{l.is_free && <Badge variant="secondary" className="mr-2">חינם</Badge>}</div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditingLesson(l)}><Edit className="w-3 h-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm("למחוק?")) m.deleteLesson.mutate(l.id); }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full" onClick={() => setEditingLesson({ module_id: mod.id, course_id: course.id, title: "", is_free: (lessonsByModule[mod.id]?.length || 0) === 0, display_order: (lessonsByModule[mod.id]?.length || 0) })}>
                  <Plus className="w-3 h-3 ml-1" />שיעור חדש
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {editingModule && (
          <Dialog open onOpenChange={() => setEditingModule(null)}>
            <DialogContent>
              <DialogHeader><DialogTitle>עריכת מודול</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <Input value={editingModule.title || ""} onChange={(e) => setEditingModule({ ...editingModule, title: e.target.value })} />
                <Textarea value={editingModule.description || ""} onChange={(e) => setEditingModule({ ...editingModule, description: e.target.value })} placeholder="תיאור" />
              </div>
              <DialogFooter>
                <Button onClick={async () => { await m.updateModule.mutateAsync({ id: (editingModule as any).id, title: editingModule.title, description: editingModule.description }); setEditingModule(null); }}>שמור</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {editingLesson && (
          <Dialog open onOpenChange={() => setEditingLesson(null)}>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>{(editingLesson as any).id ? "עריכת שיעור" : "שיעור חדש"}</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <div><Label>כותרת</Label><Input value={editingLesson.title || ""} onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })} /></div>
                <div><Label>תיאור</Label><Textarea value={editingLesson.description || ""} onChange={(e) => setEditingLesson({ ...editingLesson, description: e.target.value })} /></div>
                <div><Label>קישור וידאו (YouTube / Vimeo)</Label><Input value={editingLesson.video_url || ""} onChange={(e) => setEditingLesson({ ...editingLesson, video_url: e.target.value })} /></div>
                <div><Label>קישור לקובץ וידאו ישיר (אופציונלי)</Label><Input value={editingLesson.video_file_url || ""} onChange={(e) => setEditingLesson({ ...editingLesson, video_file_url: e.target.value })} /></div>
                <div><Label>קישור למצגת (אופציונלי)</Label><Input value={editingLesson.presentation_url || ""} onChange={(e) => setEditingLesson({ ...editingLesson, presentation_url: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>משך (דקות)</Label><Input type="number" value={editingLesson.duration_minutes ?? 0} onChange={(e) => setEditingLesson({ ...editingLesson, duration_minutes: Number(e.target.value) })} /></div>
                  <div><Label>סדר</Label><Input type="number" value={editingLesson.display_order ?? 0} onChange={(e) => setEditingLesson({ ...editingLesson, display_order: Number(e.target.value) })} /></div>
                </div>
                <div className="flex items-center gap-2"><Switch checked={!!editingLesson.is_free} onCheckedChange={(v) => setEditingLesson({ ...editingLesson, is_free: v })} /><Label>פתוח לצפייה חינמית</Label></div>
              </div>
              <DialogFooter>
                <Button onClick={async () => {
                  if ((editingLesson as any).id) await m.updateLesson.mutateAsync(editingLesson as any);
                  else await m.addLesson.mutateAsync(editingLesson);
                  setEditingLesson(null);
                }}>שמור</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
};

const EnrollmentsDialog = ({ course, onClose }: { course: Course; onClose: () => void }) => {
  const { data: enrollments = [] } = useEnrollments(course.id);
  const exportCsv = () => {
    const headers = ["שם", "אימייל", "טלפון", "סטטוס", "תאריך"];
    const rows = enrollments.map((e) => [e.full_name, e.email, e.phone || "", e.payment_status, new Date(e.enrolled_at).toLocaleString("he-IL")]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${course.slug}-enrollments.csv`; a.click();
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>נרשמים ל{course.title} ({enrollments.length})</DialogTitle></DialogHeader>
        <div className="flex justify-end mb-2"><Button size="sm" variant="outline" onClick={exportCsv}>ייצוא CSV</Button></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-right p-2">שם</th><th className="text-right p-2">אימייל</th><th className="text-right p-2">טלפון</th><th className="text-right p-2">סטטוס</th><th className="text-right p-2">תאריך</th></tr></thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="p-2">{e.full_name}</td><td className="p-2">{e.email}</td><td className="p-2">{e.phone}</td>
                <td className="p-2"><Badge variant={e.payment_status === "paid" ? "default" : "secondary"}>{e.payment_status}</Badge></td>
                <td className="p-2">{new Date(e.enrolled_at).toLocaleDateString("he-IL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
};

const EventsPanel = () => {
  const { events, addEvent, updateEvent, deleteEvent } = useEvents();
  const [editing, setEditing] = useState<Partial<EventItem> | null>(null);
  const [regsFor, setRegsFor] = useState<EventItem | null>(null);

  const save = async () => {
    if (!editing) return;
    const payload = { ...editing, slug: editing.slug || slugify(editing.title || "") };
    if (editing.id) await updateEvent.mutateAsync({ ...payload, id: editing.id } as any);
    else await addEvent.mutateAsync(payload);
    setEditing(null);
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">אירועים והרצאות</h2>
        <Button onClick={() => setEditing({ ...emptyEvent })} className="gap-2"><Plus className="w-4 h-4" />אירוע חדש</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {events.map((e) => (
          <Card key={e.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><h3 className="font-bold">{e.title}</h3>{e.is_published ? <Badge>פורסם</Badge> : <Badge variant="secondary">טיוטה</Badge>}</div>
              <div className="text-sm text-muted-foreground">{new Date(e.event_date).toLocaleDateString("he-IL")} {e.event_time?.slice(0,5)}</div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => setEditing(e)}><Edit className="w-3 h-3 ml-1" />עריכה</Button>
                <Button size="sm" variant="outline" onClick={() => setRegsFor(e)}><Users className="w-3 h-3 ml-1" />רשומים</Button>
                <Button size="sm" variant="outline" asChild><a href={`/events/${e.slug}`} target="_blank" rel="noreferrer"><Eye className="w-3 h-3 ml-1" />תצוגה</a></Button>
                <Button size="sm" variant="destructive" onClick={() => { if (confirm("למחוק?")) deleteEvent.mutate(e.id); }}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "עריכת אירוע" : "אירוע חדש"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>כותרת</Label><Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value, slug: editing.slug || slugify(e.target.value) })} /></div>
              <div><Label>Slug</Label><Input value={editing.slug || ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
              <div><Label>תיאור</Label><Textarea rows={4} value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div><Label>תמונת קאבר (URL)</Label><Input value={editing.cover_image_url || ""} onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>תאריך</Label><Input type="date" value={editing.event_date || ""} onChange={(e) => setEditing({ ...editing, event_date: e.target.value })} /></div>
                <div><Label>שעה</Label><Input type="time" value={editing.event_time || ""} onChange={(e) => setEditing({ ...editing, event_time: e.target.value })} /></div>
                <div><Label>משך (דקות)</Label><Input type="number" value={editing.duration_minutes ?? 0} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} /></div>
                <div><Label>סוג מיקום</Label>
                  <select className="w-full border rounded p-2 bg-background" value={editing.location_type || "online"} onChange={(e) => setEditing({ ...editing, location_type: e.target.value })}>
                    <option value="online">אונליין</option><option value="in_person">פרונטלי</option>
                  </select>
                </div>
                <div><Label>מיקום / קישור</Label><Input value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} /></div>
                <div><Label>מחיר ₪</Label><Input type="number" value={Number(editing.price ?? 0)} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></div>
                <div><Label>מקסימום משתתפים</Label><Input type="number" value={editing.max_attendees ?? 0} onChange={(e) => setEditing({ ...editing, max_attendees: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><Label>שם המרצה</Label><Input value={editing.speaker_name || ""} onChange={(e) => setEditing({ ...editing, speaker_name: e.target.value })} /></div>
              </div>
              <div><Label>על המרצה</Label><Textarea value={editing.speaker_bio || ""} onChange={(e) => setEditing({ ...editing, speaker_bio: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Switch checked={!!editing.is_published} onCheckedChange={(v) => setEditing({ ...editing, is_published: v })} /><Label>מפורסם</Label></div>
            </div>
          )}
          <DialogFooter><Button onClick={save}>שמירה</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {regsFor && <EventRegsDialog event={regsFor} onClose={() => setRegsFor(null)} />}
    </div>
  );
};

const EventRegsDialog = ({ event, onClose }: { event: EventItem; onClose: () => void }) => {
  const { data: regs = [] } = useEventRegistrations(event.id);
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>נרשמים: {event.title} ({regs.length})</DialogTitle></DialogHeader>
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="text-right p-2">שם</th><th className="text-right p-2">אימייל</th><th className="text-right p-2">טלפון</th><th className="text-right p-2">תאריך</th></tr></thead>
          <tbody>
            {regs.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2">{r.full_name}</td><td className="p-2">{r.email}</td><td className="p-2">{r.phone}</td>
                <td className="p-2">{new Date(r.registered_at).toLocaleDateString("he-IL")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
};

export default AdminCoursesTab;
