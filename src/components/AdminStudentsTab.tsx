import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, GraduationCap, Trash2, Search, UserPlus } from "lucide-react";
import { useCourses } from "@/hooks/useCourses";
import { useServerFn } from "@tanstack/react-start";
import { adminCreateStudent } from "@/lib/admin.functions";

type StudentRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  enrollmentCount: number;
};

const AdminStudentsTab = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [manageUser, setManageUser] = useState<StudentRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { courses } = useCourses();

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const [profilesRes, rolesRes, enrollRes] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("course_enrollments").select("user_id"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (enrollRes.error) throw enrollRes.error;

      const adminIds = new Set((rolesRes.data || []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id));
      const counts = new Map<string, number>();
      (enrollRes.data || []).forEach((e: any) => counts.set(e.user_id, (counts.get(e.user_id) || 0) + 1));

      return (profilesRes.data || [])
        .filter((p: any) => !adminIds.has(p.id))
        .map((p: any) => ({ ...p, enrollmentCount: counts.get(p.id) || 0 })) as StudentRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      (s.email || "").toLowerCase().includes(q) || (s.full_name || "").toLowerCase().includes(q)
    );
  }, [students, search]);

  const sendReset = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    },
    onSuccess: () => toast({ title: "נשלח מייל לאיפוס סיסמה" }),
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const deleteStudent = useMutation({
    mutationFn: async (userId: string) => {
      const del1 = await supabase.from("course_enrollments").delete().eq("user_id", userId);
      if (del1.error) throw del1.error;
      const del2 = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (del2.error) throw del2.error;
      const del3 = await supabase.from("profiles").delete().eq("id", userId);
      if (del3.error) throw del3.error;
    },
    onSuccess: () => {
      toast({ title: "המשתמש הוסר", description: "הרישומים והפרופיל נמחקו. חשבון האימות עצמו נשמר במערכת." });
      qc.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: (e: any) => toast({ title: "שגיאת מחיקה", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5" />
          ניהול תלמידים
        </CardTitle>
        <CardDescription>
          משתמשי הקורסים וההרצאות בלבד (ללא מנהלי המערכת). ניתן לאפס סיסמה, לנהל גישה לקורסים ולהסיר תלמיד.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם או אימייל"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <UserPlus className="w-4 h-4" />
            צור תלמיד חדש
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">לא נמצאו תלמידים.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <div key={s.id} className="p-4 border rounded-lg flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{s.full_name || "ללא שם"}</span>
                    <Badge variant="secondary">{s.enrollmentCount} קורסים</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground truncate" dir="ltr">{s.email}</div>
                  <div className="text-xs text-muted-foreground">
                    נרשם: {new Date(s.created_at).toLocaleDateString("he-IL")}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={!s.email || sendReset.isPending}
                    onClick={() => s.email && sendReset.mutate(s.email)}
                  >
                    <KeyRound className="w-4 h-4" />
                    איפוס סיסמה
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setManageUser(s)}>
                    <GraduationCap className="w-4 h-4" />
                    נהל קורסים
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>להסיר את התלמיד?</AlertDialogTitle>
                        <AlertDialogDescription>
                          פעולה זו תמחק את הפרופיל ואת כל רישומיו לקורסים. חשבון האימות עצמו נשמר עד לניקוי ידני.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>ביטול</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteStudent.mutate(s.id)}>מחק</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ManageEnrollmentsDialog
        student={manageUser}
        courses={courses}
        onClose={() => setManageUser(null)}
      />

      <CreateStudentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        courses={courses}
        onCreated={() => qc.invalidateQueries({ queryKey: ["admin-students"] })}
      />
    </Card>
  );
};

const CreateStudentDialog = ({
  open, onClose, courses, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  courses: any[];
  onCreated: () => void;
}) => {
  const { toast } = useToast();
  const createStudent = useServerFn(adminCreateStudent);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [courseIds, setCourseIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setFullName(""); setEmail(""); setPassword(""); setCourseIds(new Set());
  };

  const toggleCourse = (id: string) => {
    setCourseIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const submit = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      toast({ title: "חסרים פרטים", description: "יש להזין שם, אימייל וסיסמה של 6 תווים לפחות", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const data = await createStudent({
        data: {
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          course_ids: Array.from(courseIds),
        },
      });
      toast({
        title: "התלמיד נוצר",
        description: (data as any)?.warning || "המשתמש נוסף וניתן להשתמש בפרטים להתחברות.",
      });
      onCreated();
      reset();
      onClose();
    } catch (e: any) {
      toast({ title: "שגיאה ביצירה", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>צור תלמיד חדש</DialogTitle>
          <DialogDescription>
            תיווצר סיסמה קבועה. שתפו עם התלמיד – הוא יוכל להתחבר ב-/courses/account.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">שם מלא</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">אימייל</label>
            <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">סיסמה זמנית (לפחות 6 תווים)</label>
            <Input type="text" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">גישה לקורסים (אופציונלי)</label>
            <div className="mt-1 max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
              {courses.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין קורסים.</p>
              ) : courses.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={courseIds.has(c.id)}
                    onChange={() => toggleCourse(c.id)}
                  />
                  <span>{c.title}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={submitting}>ביטול</Button>
          <Button onClick={submit} disabled={submitting} className="gap-1.5">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            צור תלמיד
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ManageEnrollmentsDialog = ({
  student, courses, onClose,
}: {
  student: StudentRow | null;
  courses: any[];
  onClose: () => void;
}) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addCourseId, setAddCourseId] = useState<string>("");

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["student-enrollments", student?.id],
    enabled: !!student,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_enrollments")
        .select("id, course_id, enrolled_at")
        .eq("user_id", student!.id);
      if (error) throw error;
      return data || [];
    },
  });

  const enrolledIds = new Set(enrollments.map((e: any) => e.course_id));
  const availableCourses = courses.filter((c) => !enrolledIds.has(c.id));

  const addEnrollment = useMutation({
    mutationFn: async () => {
      if (!student || !addCourseId) return;
      const { error } = await supabase
        .from("course_enrollments")
        .insert({ user_id: student.id, course_id: addCourseId, email: student.email ?? "", full_name: student.full_name ?? "" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "הקורס נוסף" });
      setAddCourseId("");
      qc.invalidateQueries({ queryKey: ["student-enrollments", student?.id] });
      qc.invalidateQueries({ queryKey: ["admin-students"] });
    },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const removeEnrollment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_enrollments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "הגישה הוסרה" });
      qc.invalidateQueries({ queryKey: ["student-enrollments", student?.id] });
      qc.invalidateQueries({ queryKey: ["admin-students"] });
    },
  });

  const courseName = (id: string) => courses.find((c) => c.id === id)?.title || id;

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>ניהול קורסים – {student?.full_name || student?.email}</DialogTitle>
          <DialogDescription>הוספה או הסרה של גישות לקורסים עבור תלמיד זה.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">קורסים רשומים</h4>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין רישומים.</p>
            ) : (
              <ul className="space-y-2">
                {enrollments.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between border rounded-md p-2">
                    <span className="text-sm">{courseName(e.course_id)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeEnrollment.mutate(e.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">הוסף גישה לקורס</h4>
            <div className="flex gap-2">
              <Select value={addCourseId} onValueChange={setAddCourseId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="בחר קורס" />
                </SelectTrigger>
                <SelectContent>
                  {availableCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => addEnrollment.mutate()}
                disabled={!addCourseId || addEnrollment.isPending}
                className="gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                הוסף
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminStudentsTab;
