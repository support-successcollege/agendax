import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, MailOpen } from "lucide-react";
import { useProducts, useProductInquiries, Product } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const empty: Partial<Product> = {
  title: "", description: "", image_url: "", price: 0, currency: "ILS",
  external_checkout_url: "", enable_inquiry: true, is_active: true, sort_order: 0,
};

const AdminProductsTab = () => {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const { inquiries, deleteInquiry } = useProductInquiries();
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [showInquiries, setShowInquiries] = useState(false);
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    if (!editing || !editing.title) { toast.error("חסר שם מוצר"); return; }
    if (editing.id) await updateProduct.mutateAsync(editing as any);
    else await addProduct.mutateAsync(editing);
    setEditing(null);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const path = `products/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await supabase.storage.from("article-images").upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from("article-images").getPublicUrl(path);
      setEditing((p) => ({ ...(p || {}), image_url: data.publicUrl }));
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-xl font-bold">פריטים למכירה</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowInquiries(true)} className="gap-2">
            <MailOpen className="w-4 h-4" />פניות ({inquiries.length})
          </Button>
          <Button onClick={() => setEditing({ ...empty })} className="gap-2">
            <Plus className="w-4 h-4" />פריט חדש
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 flex gap-3">
              {p.image_url && <img src={p.image_url} alt="" className="w-24 h-24 object-cover rounded" />}
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold">{p.title}</h3>
                  {p.is_active ? <Badge>פעיל</Badge> : <Badge variant="secondary">מוסתר</Badge>}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                <div className="text-sm mt-1">{p.price ? `₪${p.price}` : "ללא מחיר"}</div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}><Edit className="w-3 h-3 ml-1" />עריכה</Button>
                  <Button size="sm" variant="destructive" onClick={() => { if (confirm("למחוק?")) deleteProduct.mutate(p.id); }}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {products.length === 0 && <p className="text-muted-foreground">אין עדיין פריטים. הוסיפו פריט חדש.</p>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "עריכת פריט" : "פריט חדש"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>שם המוצר *</Label><Input value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={200} /></div>
              <div><Label>תיאור</Label><Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={4} maxLength={2000} /></div>
              <div>
                <Label>תמונה</Label>
                {editing.image_url && <img src={editing.image_url} alt="" className="w-full max-h-48 object-cover rounded mb-2" />}
                <Input type="file" accept="image/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
                <Input className="mt-2" placeholder="או הדבק URL ידנית" value={editing.image_url || ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>מחיר (₪)</Label><Input type="number" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                <div><Label>סדר תצוגה</Label><Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              </div>
              <div>
                <Label>קישור לרכישה חיצונית (PayPal / Bit / אתר אחר)</Label>
                <Input placeholder="https://..." value={editing.external_checkout_url || ""} onChange={(e) => setEditing({ ...editing, external_checkout_url: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">אם מולא — יוצג כפתור "רכישה מהירה" שמעביר ללינק.</p>
              </div>
              <div className="flex items-center justify-between"><Label>אפשר טופס "השאר פרטים"</Label><Switch checked={!!editing.enable_inquiry} onCheckedChange={(v) => setEditing({ ...editing, enable_inquiry: v })} /></div>
              <div className="flex items-center justify-between"><Label>פעיל (מוצג באתר)</Label><Switch checked={!!editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button><Button onClick={save}>שמור</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInquiries} onOpenChange={setShowInquiries}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>פניות לרכישה</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {inquiries.length === 0 && <p className="text-muted-foreground">אין פניות עדיין.</p>}
            {inquiries.map((i) => {
              const product = products.find((p) => p.id === i.product_id);
              return (
                <Card key={i.id}>
                  <CardContent className="p-3 text-sm">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-bold">{i.full_name} <span className="text-muted-foreground">· {product?.title || "מוצר נמחק"}</span></div>
                        <div className="text-muted-foreground">{i.email} {i.phone && `· ${i.phone}`}</div>
                        {i.message && <p className="mt-1">{i.message}</p>}
                        <div className="text-xs text-muted-foreground mt-1">{new Date(i.created_at).toLocaleString("he-IL")}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => deleteInquiry.mutate(i.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProductsTab;
