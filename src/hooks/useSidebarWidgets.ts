import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type WidgetType = "popup" | "banner" | "card";
export type ActionType = "link" | "form" | "image";

export interface FormField {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select";
  required: boolean;
  options?: string[]; // for select type
}

export interface SidebarWidget {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string;
  buttonText: string;
  icon: string;
  displayOrder: number;
  isActive: boolean;
  imageUrl: string | null;
  widgetTypes: WidgetType[];
  actionType: ActionType;
  formFields: FormField[];
  categories: string[];
}

interface DbWidget {
  id: string;
  title: string;
  description: string | null;
  link_url: string;
  button_text: string;
  icon: string | null;
  display_order: number | null;
  is_active: boolean | null;
  image_url: string | null;
  widget_type: string;
  action_type: string;
  form_fields: unknown;
  categories: string[] | null;
}

const parseWidgetTypes = (raw: string): WidgetType[] => {
  const types = raw.split(",").map(s => s.trim()).filter(Boolean) as WidgetType[];
  return types.length > 0 ? types : ["card"];
};

const mapDb = (db: DbWidget): SidebarWidget => ({
  id: db.id,
  title: db.title,
  description: db.description,
  linkUrl: db.link_url,
  buttonText: db.button_text,
  icon: db.icon ?? "📊",
  displayOrder: db.display_order ?? 0,
  isActive: db.is_active ?? true,
  imageUrl: db.image_url,
  widgetTypes: parseWidgetTypes(db.widget_type || "card"),
  actionType: (db.action_type as ActionType) || "link",
  formFields: Array.isArray(db.form_fields) ? (db.form_fields as FormField[]) : [],
  categories: Array.isArray(db.categories) ? db.categories : [],
});

export const useSidebarWidgets = () => {
  const [widgets, setWidgets] = useState<SidebarWidget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetch = async () => {
    try {
      const { data, error } = await supabase
        .from("sidebar_widgets")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      setWidgets((data as DbWidget[]).map(mapDb));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const addWidget = async (w: Omit<SidebarWidget, "id">) => {
    try {
      const { data, error } = await supabase
        .from("sidebar_widgets")
        .insert({
          title: w.title,
          description: w.description,
          link_url: w.linkUrl,
          button_text: w.buttonText,
          icon: w.icon,
          display_order: w.displayOrder,
          is_active: w.isActive,
          image_url: w.imageUrl,
          widget_type: w.widgetTypes.join(","),
          action_type: w.actionType,
          form_fields: JSON.parse(JSON.stringify(w.formFields)),
          categories: w.categories.length > 0 ? w.categories : null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      setWidgets(prev => [...prev, mapDb(data as DbWidget)]);
      toast({ title: "החלונית נוספה בהצלחה" });
    } catch (e) {
      console.error(e);
      toast({ title: "שגיאה", variant: "destructive" });
    }
  };

  const updateWidget = async (w: SidebarWidget) => {
    try {
      const { error } = await supabase
        .from("sidebar_widgets")
        .update({
          title: w.title,
          description: w.description,
          link_url: w.linkUrl,
          button_text: w.buttonText,
          icon: w.icon,
          display_order: w.displayOrder,
          is_active: w.isActive,
          image_url: w.imageUrl,
          widget_type: w.widgetTypes.join(","),
          action_type: w.actionType,
          form_fields: JSON.parse(JSON.stringify(w.formFields)),
          categories: w.categories.length > 0 ? w.categories : null,
        } as any)
        .eq("id", w.id);
      if (error) throw error;
      setWidgets(prev => prev.map(x => x.id === w.id ? w : x));
      toast({ title: "החלונית עודכנה" });
    } catch (e) {
      console.error(e);
      toast({ title: "שגיאה", variant: "destructive" });
    }
  };

  const deleteWidget = async (id: string) => {
    try {
      const { error } = await supabase.from("sidebar_widgets").delete().eq("id", id);
      if (error) throw error;
      setWidgets(prev => prev.filter(x => x.id !== id));
      toast({ title: "החלונית נמחקה" });
    } catch (e) {
      console.error(e);
      toast({ title: "שגיאה", variant: "destructive" });
    }
  };

  useEffect(() => { fetch(); }, []);

  return { widgets, isLoading, addWidget, updateWidget, deleteWidget, refetch: fetch };
};
