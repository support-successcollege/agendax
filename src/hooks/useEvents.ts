import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const db: any = supabase;

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  event_date: string;
  event_time: string | null;
  duration_minutes: number | null;
  location_type: string;
  location: string | null;
  speaker_name: string | null;
  speaker_bio: string | null;
  price: number;
  max_attendees: number | null;
  registration_deadline: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  attendance_status: string;
  registered_at: string;
}

export const useEvents = (opts?: { onlyPublished?: boolean; upcoming?: boolean }) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events", opts],
    queryFn: async () => {
      let q = db.from("events").select("*").order("event_date", { ascending: true });
      if (opts?.onlyPublished) q = q.eq("is_published", true);
      if (opts?.upcoming) q = q.gte("event_date", new Date().toISOString().slice(0, 10));
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as EventItem[];
    },
  });

  const addEvent = useMutation({
    mutationFn: async (e: Partial<EventItem>) => {
      const { error } = await db.from("events").insert(e);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); toast({ title: "האירוע נוסף" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });
  const updateEvent = useMutation({
    mutationFn: async ({ id, ...u }: Partial<EventItem> & { id: string }) => {
      const { error } = await db.from("events").update(u).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); toast({ title: "האירוע עודכן" }); },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });
  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["events"] }); toast({ title: "האירוע נמחק" }); },
  });

  return { events, isLoading, addEvent, updateEvent, deleteEvent };
};

export const useEvent = (slug?: string) =>
  useQuery({
    queryKey: ["event", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await db.from("events").select("*").eq("slug", slug!).maybeSingle();
      if (error) throw error;
      return data as EventItem | null;
    },
  });

export const useEventRegistrations = (eventId?: string) =>
  useQuery({
    queryKey: ["event-regs", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await db.from("event_registrations").select("*").eq("event_id", eventId).order("registered_at", { ascending: false });
      if (error) throw error;
      return (data || []) as EventRegistration[];
    },
  });

export const registerForEvent = async (payload: Partial<EventRegistration>) => {
  const { data, error } = await db.from("event_registrations").insert(payload).select().single();
  if (error) throw error;
  return data as EventRegistration;
};
