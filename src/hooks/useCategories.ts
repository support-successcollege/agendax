import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { categoriesQueryOptions } from "@/lib/queries";

export interface Category {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  isActive: boolean;
}

export const useCategories = () => {
  const { toast } = useToast();
  const {
    data: categories = [],
    isLoading,
    refetch,
  } = useQuery(categoriesQueryOptions());

  const fetchCategories = async () => {
    await refetch();
  };

  const addCategory = async (category: Omit<Category, "id" | "isActive">) => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .insert({
          name: category.name,
          slug: category.slug,
          display_order: category.displayOrder,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "הקטגוריה נוספה",
        description: `הקטגוריה "${category.name}" נוספה בהצלחה`,
      });

      await fetchCategories();
      return data;
    } catch (error) {
      console.error("Error adding category:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן להוסיף את הקטגוריה",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateCategory = async (id: string, updates: Partial<Category>) => {
    try {
      const { error } = await supabase
        .from("categories")
        .update({
          name: updates.name,
          slug: updates.slug,
          display_order: updates.displayOrder,
          is_active: updates.isActive,
        })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "הקטגוריה עודכנה",
        description: "השינויים נשמרו בהצלחה",
      });

      await fetchCategories();
    } catch (error) {
      console.error("Error updating category:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן לעדכן את הקטגוריה",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const category = categories.find((c) => c.id === id);
      
      // Don't allow deleting "home" category
      if (category?.slug === "home") {
        toast({
          title: "לא ניתן למחוק",
          description: "קטגוריית 'ראשי' היא קטגוריה קבועה ולא ניתן למחוק אותה",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "הקטגוריה נמחקה",
        description: `הקטגוריה "${category?.name}" נמחקה בהצלחה`,
      });

      await fetchCategories();
    } catch (error) {
      console.error("Error deleting category:", error);
      toast({
        title: "שגיאה",
        description: "לא ניתן למחוק את הקטגוריה",
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    categories,
    isLoading,
    addCategory,
    updateCategory,
    deleteCategory,
    refetch: fetchCategories,
  };
};
