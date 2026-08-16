import { useState } from "react";
import { Article } from "@/hooks/useArticles";
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
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import ImageUpload from "@/components/ImageUpload";
import RichTextEditor from "@/components/RichTextEditor";
import { Clock, Calendar } from "lucide-react";

interface ArticleEditDialogProps {
  article: Article | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (article: Article) => void;
}

const ArticleEditDialog = ({ article, open, onOpenChange, onSave }: ArticleEditDialogProps) => {
  const [editedArticle, setEditedArticle] = useState<Article | null>(article);
  const [isScheduled, setIsScheduled] = useState(!!article?.scheduledAt);
  const [scheduleDate, setScheduleDate] = useState(
    article?.scheduledAt ? new Date(article.scheduledAt).toISOString().split("T")[0] : ""
  );
  const [scheduleTime, setScheduleTime] = useState(
    article?.scheduledAt ? new Date(article.scheduledAt).toTimeString().slice(0, 5) : "09:00"
  );
  const { toast } = useToast();

  // Update local state when article prop changes
  if (article && editedArticle?.id !== article.id) {
    setEditedArticle(article);
    setIsScheduled(!!article.scheduledAt);
    setScheduleDate(article.scheduledAt ? new Date(article.scheduledAt).toISOString().split("T")[0] : "");
    setScheduleTime(article.scheduledAt ? new Date(article.scheduledAt).toTimeString().slice(0, 5) : "09:00");
  }

  const getScheduledAt = (): string | null => {
    if (!isScheduled || !scheduleDate) return null;
    return new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
  };

  const handleSave = () => {
    if (!editedArticle) return;
    
    const scheduledAt = getScheduledAt();
    onSave({ ...editedArticle, scheduledAt });
    toast({
      title: "הכתבה נשמרה",
      description: scheduledAt ? `הכתבה תפורסם ב-${new Date(scheduledAt).toLocaleString("he-IL")}` : "השינויים נשמרו בהצלחה",
    });
    onOpenChange(false);
  };

  if (!editedArticle) return null;

  const isScheduledInFuture = editedArticle.scheduledAt && new Date(editedArticle.scheduledAt) > new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>עריכת כתבה</DialogTitle>
            {editedArticle.isDraft && (
              <Badge variant="secondary">טיוטה</Badge>
            )}
            {isScheduledInFuture && (
              <Badge variant="outline" className="gap-1">
                <Clock className="w-3 h-3" />
                מתוזמנת
              </Badge>
            )}
          </div>
          <DialogDescription>ערוך את פרטי הכתבה</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">כותרת</Label>
            <Input
              id="title"
              value={editedArticle.title}
              onChange={(e) => setEditedArticle({ ...editedArticle, title: e.target.value })}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="excerpt">תקציר</Label>
            <Textarea
              id="excerpt"
              value={editedArticle.excerpt}
              onChange={(e) => setEditedArticle({ ...editedArticle, excerpt: e.target.value })}
              rows={3}
            />
          </div>
          
          <ImageUpload
            value={editedArticle.imageUrl}
            onChange={(url) => setEditedArticle({ ...editedArticle, imageUrl: url })}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">קטגוריה</Label>
              <Input
                id="category"
                value={editedArticle.category}
                onChange={(e) => setEditedArticle({ ...editedArticle, category: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="author">כותב</Label>
              <Input
                id="author"
                value={editedArticle.author}
                onChange={(e) => setEditedArticle({ ...editedArticle, author: e.target.value })}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="content">תוכן הכתבה</Label>
            <RichTextEditor
              value={editedArticle.content}
              onChange={(content) => setEditedArticle({ ...editedArticle, content })}
            />
          </div>

          {/* Scheduling */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                id="editScheduled"
                checked={isScheduled}
                onCheckedChange={(checked) => {
                  setIsScheduled(checked);
                  if (!checked) {
                    setEditedArticle({ ...editedArticle, scheduledAt: null });
                  }
                }}
              />
              <Label htmlFor="editScheduled" className="cursor-pointer flex items-center gap-2">
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

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Switch
                id="isDraft"
                checked={editedArticle.isDraft}
                onCheckedChange={(checked) =>
                  setEditedArticle({ ...editedArticle, isDraft: checked })
                }
              />
              <Label htmlFor="isDraft" className="cursor-pointer">
                {editedArticle.isDraft ? "טיוטה (לא מפורסם)" : "מפורסם"}
              </Label>
            </div>
            {editedArticle.isDraft && !isScheduled && (
              <Button 
                type="button"
                variant="default"
                onClick={() => {
                  setEditedArticle({ ...editedArticle, isDraft: false });
                }}
              >
                פרסם עכשיו
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={handleSave}>
            {isScheduled && scheduleDate ? (
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                שמור עם תזמון
              </span>
            ) : (
              "שמור שינויים"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ArticleEditDialog;
