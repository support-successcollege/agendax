import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Product = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  currency: string;
  external_checkout_url: string | null;
  enable_inquiry: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProductInquiry = {
  id: string;
  product_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  message: string | null;
  created_at: string;
};

export const useProducts = (opts: { onlyActive?: boolean } = {}) => {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", opts.onlyActive ?? false],
    queryFn: async () => {
      let q = supabase.from("products").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
      if (opts.onlyActive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as Product[];
    },
  });

  const addProduct = useMutation({
    mutationFn: async (p: Partial<Product>) => {
      const { data, error } = await supabase.from("products").insert(p as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("המוצר נוסף"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateProduct = useMutation({
    mutationFn: async (p: Partial<Product> & { id: string }) => {
      const { id, ...rest } = p;
      const { error } = await supabase.from("products").update(rest as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("עודכן"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); toast.success("נמחק"); },
    onError: (e: any) => toast.error(e.message),
  });

  return { products, isLoading, addProduct, updateProduct, deleteProduct };
};

export const useProductInquiries = () => {
  const qc = useQueryClient();
  const { data: inquiries = [], isLoading } = useQuery({
    queryKey: ["product_inquiries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_inquiries").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProductInquiry[];
    },
  });

  const deleteInquiry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_inquiries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product_inquiries"] }); toast.success("נמחק"); },
  });

  return { inquiries, isLoading, deleteInquiry };
};

export const submitProductInquiry = async (payload: Omit<ProductInquiry, "id" | "created_at">) => {
  const { error } = await supabase.from("product_inquiries").insert(payload as any);
  if (error) throw error;
};
