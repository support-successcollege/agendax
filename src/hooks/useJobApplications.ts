import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface JobApplication {
  id: string;
  job_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  cover_letter: string | null;
  cv_url: string | null;
  created_at: string;
}

export const useJobApplications = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["job-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as JobApplication[];
    },
  });

  const deleteApplication = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("job_applications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-applications"] });
      toast({ title: "המועמדות נמחקה" });
    },
  });

  return { applications, isLoading, deleteApplication };
};

export const submitJobApplication = async (payload: {
  job_id: string;
  full_name: string;
  email: string;
  phone?: string;
  cover_letter?: string;
  cv_file?: File | null;
}) => {
  let cv_url: string | null = null;
  if (payload.cv_file) {
    const ext = payload.cv_file.name.split(".").pop() || "pdf";
    const path = `${payload.job_id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("job-cvs")
      .upload(path, payload.cv_file, { upsert: false, contentType: payload.cv_file.type });
    if (upErr) throw upErr;
    cv_url = path;
  }

  const { error } = await supabase.from("job_applications").insert({
    job_id: payload.job_id,
    full_name: payload.full_name,
    email: payload.email,
    phone: payload.phone || null,
    cover_letter: payload.cover_letter || null,
    cv_url,
  });
  if (error) throw error;
};

export const getCvSignedUrl = async (path: string) => {
  const { data, error } = await supabase.storage.from("job-cvs").createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
};
