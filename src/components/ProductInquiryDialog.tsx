import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitProductInquiry, Product } from "@/hooks/useProducts";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  full_name: z.string().trim().min(2, "שם קצר מדי").max(100),
  email: z.string().trim().email("אימייל לא תקין").max(255),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  message: z.string().trim().max(1000).optional().or(z.literal("")),
});

const ProductInquiryDialog = ({ product, open, onOpenChange }: { product: Product | null; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", message: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!product) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      await submitProductInquiry({
        product_id: product.id,
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        message: parsed.data.message || null,
      });
      toast.success("פנייתך נשלחה, נחזור אליך בהקדם");
      setForm({ full_name: "", email: "", phone: "", message: "" });
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>השאר פרטים · {product?.title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>שם מלא *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={100} /></div>
          <div><Label>אימייל *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} /></div>
          <div><Label>טלפון</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} /></div>
          <div><Label>הודעה</Label><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} maxLength={1000} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "שולח..." : "שלח פנייה"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductInquiryDialog;
