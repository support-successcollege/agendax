import { useState } from "react";
import { SidebarWidget, FormField } from "@/hooks/useSidebarWidgets";
import { useWidgetSubmissions } from "@/hooks/useWidgetSubmissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Loader2 } from "lucide-react";

interface WidgetFormDisplayProps {
  widget: SidebarWidget;
  onClose?: () => void;
}

const WidgetFormDisplay = ({ widget, onClose }: WidgetFormDisplayProps) => {
  const { submitForm } = useWidgetSubmissions();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const success = await submitForm(widget.id, formData);
    setIsSubmitting(false);
    if (success) {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-6">
        <CheckCircle className="w-12 h-12 text-primary mx-auto mb-3" />
        <h4 className="font-bold text-foreground mb-1">תודה!</h4>
        <p className="text-sm text-muted-foreground">הטופס נשלח בהצלחה</p>
        {onClose && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onClose}>
            סגור
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {widget.formFields.map((field) => (
        <div key={field.id} className="space-y-1">
          <Label className="text-sm">
            {field.label}
            {field.required && <span className="text-destructive mr-1">*</span>}
          </Label>
          {field.type === "textarea" ? (
            <Textarea
              value={formData[field.id] || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
              required={field.required}
              rows={3}
            />
          ) : field.type === "select" ? (
            <Select
              value={formData[field.id] || ""}
              onValueChange={(v) => setFormData(prev => ({ ...prev, [field.id]: v }))}
              required={field.required}
            >
              <SelectTrigger>
                <SelectValue placeholder="בחרו..." />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
              value={formData[field.id] || ""}
              onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
              required={field.required}
            />
          )}
        </div>
      ))}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
        {widget.buttonText}
      </Button>
    </form>
  );
};

export default WidgetFormDisplay;
