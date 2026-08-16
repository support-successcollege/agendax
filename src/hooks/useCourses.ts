import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const db: any = supabase;

export interface Course {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  cover_image_url: string | null;
  instructor_name: string | null;
  instructor_bio: string | null;
  price: number;
  original_price: number | null;
  currency: string;
  duration_hours: number | null;
  level: string | null;
  category: string | null;
  is_published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  display_order: number;
  created_at: string;
}

export interface CourseLesson {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  video_file_url: string | null;
  presentation_url: string | null;
  duration_minutes: number | null;
  is_free: boolean;
  display_order: number;
  created_at: string;
}

export interface CourseEnrollment {
  id: string;
  course_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  payment_status: string;
  notes: string | null;
  enrolled_at: string;
}

export const useCourses = (opts?: { onlyPublished?: boolean }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const onlyPublished = opts?.onlyPublished ?? false;

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses", { onlyPublished }],
    queryFn: async () => {
      let q = db.from("courses").select("*").order("display_order", { ascending: true }).order("created_at", { ascending: false });
      if (onlyPublished) q = q.eq("is_published", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Course[];
    },
  });

  const addCourse = useMutation({
    mutationFn: async (c: Partial<Course>) => {
      const { data, error } = await db.from("courses").insert(c).select().single();
      if (error) throw error;
      return data as Course;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["courses"] }); toast({ title: "הקורס נוסף" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const updateCourse = useMutation({
    mutationFn: async ({ id, ...u }: Partial<Course> & { id: string }) => {
      const { error } = await db.from("courses").update(u).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["courses"] }); toast({ title: "הקורס עודכן" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const deleteCourse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["courses"] }); toast({ title: "הקורס נמחק" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  return { courses, isLoading, addCourse, updateCourse, deleteCourse };
};

export const useCourse = (slug?: string) =>
  useQuery({
    queryKey: ["course", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await db.from("courses").select("*").eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return data as Course | null;
    },
  });

export const useCourseById = (id?: string) =>
  useQuery({
    queryKey: ["course-id", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db.from("courses").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Course | null;
    },
  });

export const useCourseStructure = (courseId?: string) =>
  useQuery({
    queryKey: ["course-structure", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const [{ data: modules }, { data: outline }, { data: fullLessons }] = await Promise.all([
        db.from("course_modules").select("*").eq("course_id", courseId).order("display_order"),
        db.rpc("get_course_outline", { p_course_id: courseId as string }),
        db.from("course_lessons").select("*").eq("course_id", courseId).order("display_order"),
      ]);
      // Merge: use full row data if RLS allowed it (admin or enrolled), else outline (no media URLs)
      const fullById = new Map((fullLessons || []).map((l: any) => [l.id, l]));
      const lessons = (outline || []).map((o: any) => fullById.get(o.id) || o);
      return {
        modules: (modules || []) as CourseModule[],
        lessons: lessons as CourseLesson[],
      };
    },
  });

export const useCourseMutations = (courseId?: string) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["course-structure", courseId] });

  return {
    addModule: useMutation({
      mutationFn: async (m: Partial<CourseModule>) => {
        const { error } = await db.from("course_modules").insert({ ...m, course_id: courseId });
        if (error) throw error;
      },
      onSuccess: () => { invalidate(); toast({ title: "המודול נוסף" }); },
      onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
    }),
    updateModule: useMutation({
      mutationFn: async ({ id, ...u }: Partial<CourseModule> & { id: string }) => {
        const { error } = await db.from("course_modules").update(u).eq("id", id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    deleteModule: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await db.from("course_modules").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    addLesson: useMutation({
      mutationFn: async (l: Partial<CourseLesson>) => {
        const { error } = await db.from("course_lessons").insert({ ...l, course_id: courseId });
        if (error) throw error;
      },
      onSuccess: () => { invalidate(); toast({ title: "השיעור נוסף" }); },
      onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
    }),
    updateLesson: useMutation({
      mutationFn: async ({ id, ...u }: Partial<CourseLesson> & { id: string }) => {
        const { error } = await db.from("course_lessons").update(u).eq("id", id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    deleteLesson: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await db.from("course_lessons").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
  };
};

export const useEnrollments = (courseId?: string) =>
  useQuery({
    queryKey: ["enrollments", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data, error } = await db.from("course_enrollments").select("*").eq("course_id", courseId).order("enrolled_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CourseEnrollment[];
    },
  });

export const useAllEnrollments = () =>
  useQuery({
    queryKey: ["enrollments-all"],
    queryFn: async () => {
      const { data, error } = await db.from("course_enrollments").select("*").order("enrolled_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CourseEnrollment[];
    },
  });

export const useMyEnrollment = (courseId?: string, userId?: string | null) =>
  useQuery({
    queryKey: ["my-enrollment", courseId, userId],
    enabled: !!courseId && !!userId,
    queryFn: async () => {
      const { data, error } = await db.from("course_enrollments").select("*").eq("course_id", courseId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data as CourseEnrollment | null;
    },
  });

export const enrollInCourse = async (payload: Partial<CourseEnrollment>) => {
  const { data, error } = await db.from("course_enrollments").insert(payload).select().single();
  if (error) throw error;
  return data as CourseEnrollment;
};
