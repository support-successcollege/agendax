import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useServerFn } from "@tanstack/react-start";
import { sendAdminNotification } from "@/lib/admin.functions";

export interface WidgetSubmission {
  id: string;
  widgetId: string;
  data: Record<string, string>;
  createdAt: string;
}

export const useWidgetSubmissions = (widgetId?: string) => {
  const [submissions, setSubmissions] = useState<WidgetSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const notifyAdmin = useServerFn(sendAdminNotification);

  const fetchSubmissions = async (wId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("widget_form_submissions")
        .select("*")
        .eq("widget_id", wId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSubmissions(
        (data || []).map((d: any) => ({
          id: d.id,
          widgetId: d.widget_id,
          data: d.data as Record<string, string>,
          createdAt: d.created_at,
        }))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const submitForm = async (wId: string, formData: Record<string, string>) => {
    try {
      const { data: newId, error } = await supabase.rpc("submit_widget_form", {
        p_widget_id: wId,
        p_data: formData as any,
      });
      if (error) throw error;
      toast({ title: "הטופס נשלח בהצלחה!" });

      if (newId) {
        notifyAdmin({ data: { type: "widget_form", recordId: newId } }).catch((e) =>
          console.error("notify failed", e)
        );
      }

      return true;
    } catch (e) {
      console.error(e);
      toast({ title: "שגיאה בשליחת הטופס", variant: "destructive" });
      return false;
    }
  };

  const deleteSubmission = async (id: string) => {
    try {
      const { error } = await supabase
        .from("widget_form_submissions")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setSubmissions(prev => prev.filter(s => s.id !== id));
      toast({ title: "הרשומה נמחקה" });
    } catch (e) {
      console.error(e);
      toast({ title: "שגיאה", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (widgetId) fetchSubmissions(widgetId);
  }, [widgetId]);

  return { submissions, isLoading, fetchSubmissions, submitForm, deleteSubmission };
};
