import { useEffect, useState } from "react";
import { Article } from "@/hooks/useArticles";
import { categories } from "@/data/articles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import ImageUpload from "@/components/ImageUpload";
import RichTextEditor from "@/components/RichTextEditor";
import { Calendar, Clock } from "lucide-react";

interface ArticleCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (article: Omit<Article, "id">) => void;
  initialArticle?: Partial<Omit<Article, "id">>;
}

const buildDefaultArticle = (initial?: Partial<Omit<Article, "id">>): Omit<Article, "id"> => ({
  title: "",
  excerpt: "",
  content: "",
  category: "",
  categorySlug: "",
  date: new Date().toISOString().split("T")[0],
  imageUrl: "",
  author: "מערכת Agendax",
  isBreaking: false,
  isFeatured: false,
  isDraft: false,
  scheduledAt: null,
  ...(initial ?? {}),
});

const ArticleCreateDialog = ({ open, onOpenChange, onSave, initialArticle }: ArticleCreateDialogProps) => {
  const [newArticle, setNewArticle] = useState<Omit<Article, "id">>(() => buildDefaultArticle(initialArticle));

  useEffect(() => {
    if (open) {
      setNewArticle(buildDefaultArticle(initialArticle));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialArticle]);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");

  const handleCategoryChange = (categorySlug: string) => {
    const category = categories.find((c) => c.slug === categorySlug);
    if (category) {
      setNewArticle({
        ...newArticle,
        category: category.name,
        categorySlug: category.slug,
      });
    }
  };

  const getScheduledAt = (): string | null => {
    if (!isScheduled || !scheduleDate) return null;
    return new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
  };

  const handleSave = () => {
    if (!newArticle.title || !newArticle.content || !newArticle.categorySlug) {
      return;
    }
    const scheduledAt = getScheduledAt();
    onSave({
      ...newArticle,
      isDraft: scheduledAt ? true : false,
      scheduledAt,
    });
    resetForm();
  };

  const handleSaveAsDraft = () => {
    if (!newArticle.title || !newArticle.categorySlug) {
      return;
    }
    const scheduledAt = getScheduledAt();
    onSave({ ...newArticle, isDraft: true, scheduledAt });
    resetForm();
  };

  const resetForm = () => {
    setNewArticle({
      title: "",
      excerpt: "",
      content: "",
      category: "",
      categorySlug: "",
      date: new Date().toISOString().split("T")[0],
      imageUrl: "",
      author: "מערכת Agendax",
      isBreaking: false,
      isFeatured: false,
      isDraft: false,
      scheduledAt: null,
    });
    setIsScheduled(false);
    setScheduleDate("");
    setScheduleTime("09:00");
    onOpenChange(false);
  };

  const isValid = newArticle.title && newArticle.content && newArticle.categorySlug && newArticle.imageUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>כתבה חדשה</DialogTitle>
          <DialogDescription>הוסף כתבה חדשה באופן ידני</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">כותרת *</Label>
            <Input
              id="title"
              value={newArticle.title}
              onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
              placeholder="הזן כותרת לכתבה"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="excerpt">תקציר</Label>
            <Textarea
              id="excerpt"
              value={newArticle.excerpt}
              onChange={(e) => setNewArticle({ ...newArticle, excerpt: e.target.value })}
              rows={3}
              placeholder="תקציר קצר של הכתבה"
            />
          </div>

          <ImageUpload
            value={newArticle.imageUrl}
            onChange={(url) => setNewArticle({ ...newArticle, imageUrl: url })}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">קטגוריה *</Label>
              <Select value={newArticle.categorySlug} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר קטגוריה" />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.slug !== "home").map((category) => (
                    <SelectItem key={category.slug} value={category.slug}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="author">כותב</Label>
              <Input
                id="author"
                value={newArticle.author}
                onChange={(e) => setNewArticle({ ...newArticle, author: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="isBreaking"
                checked={newArticle.isBreaking}
                onCheckedChange={(checked) =>
                  setNewArticle({ ...newArticle, isBreaking: checked === true })
                }
              />
              <Label htmlFor="isBreaking" className="cursor-pointer">חדשות בזק</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isFeatured"
                checked={newArticle.isFeatured}
                onCheckedChange={(checked) =>
                  setNewArticle({ ...newArticle, isFeatured: checked === true })
                }
              />
              <Label htmlFor="isFeatured" className="cursor-pointer">כתבה מובילה</Label>
            </div>
          </div>

          {/* Scheduling */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                id="isScheduled"
                checked={isScheduled}
                onCheckedChange={setIsScheduled}
              />
              <Label htmlFor="isScheduled" className="cursor-pointer flex items-center gap-2">
                <Clock className="w-4 h-4" />
                תזמון פרסום
              </Label>
            </div>
            {isScheduled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1 text-xs">
                    <Calendar className="w-3 h-3" />
                    תאריך
                  </Label>
                  <Input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1 text-xs">
                    <Clock className="w-3 h-3" />
                    שעה
                  </Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">תוכן הכתבה *</Label>
            <RichTextEditor
              value={newArticle.content}
              onChange={(content) => setNewArticle({ ...newArticle, content })}
              placeholder="הזן את תוכן הכתבה המלא..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button variant="secondary" onClick={handleSaveAsDraft} disabled={!newArticle.title || !newArticle.categorySlug}>
            שמור כטיוטה
          </Button>
          {isScheduled && scheduleDate ? (
            <Button onClick={handleSave} disabled={!isValid}>
              <Clock className="w-4 h-4 ml-2" />
              תזמן פרסום
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={!isValid}>
              פרסם כתבה
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ArticleCreateDialog;
