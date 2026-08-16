import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Job {
  id: string;
  title: string;
  company_name: string;
  location: string;
  job_type: string;
  salary_range: string | null;
  description: string;
  image_url: string | null;
  application_type: "form" | "external_link";
  application_url: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useJobs = (opts?: { onlyActive?: boolean }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const onlyActive = opts?.onlyActive ?? false;

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs", { onlyActive }],
    queryFn: async () => {
      let query = supabase.from("jobs").select("*").order("display_order", { ascending: true }).order("created_at", { ascending: false });
      if (onlyActive) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Job[];
    },
  });

  const addJob = useMutation({
    mutationFn: async (job: Partial<Job>) => {
      const { error } = await supabase.from("jobs").insert(job as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "המשרה נוספה בהצלחה" });
    },
    onError: (e: any) => {
      toast({ title: "שגיאה בהוספת המשרה", description: e.message, variant: "destructive" });
    },
  });

  const updateJob = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Job> & { id: string }) => {
      const { error } = await supabase.from("jobs").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "המשרה עודכנה" });
    },
    onError: (e: any) => {
      toast({ title: "שגיאה בעדכון המשרה", description: e.message, variant: "destructive" });
    },
  });

  const deleteJob = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "המשרה נמחקה" });
    },
    onError: (e: any) => {
      toast({ title: "שגיאה במחיקה", description: e.message, variant: "destructive" });
    },
  });

  return { jobs, isLoading, addJob, updateJob, deleteJob };
};

export const useJob = (id?: string) => {
  return useQuery({
    queryKey: ["job", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Job | null;
    },
  });
};
