import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Clock, Calendar, Link2, ExternalLink } from "lucide-react";

type SourceLink = { title: string; url: string };
type ArticleSources = {
  source_name: string | null;
  source_url: string | null;
  source_links: SourceLink[] | null;
  review_score: number | null;
  review_note: string | null;
};

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

  // Editorial sources — admin-eyes-only, fetched lazily; they are not part of
  // the Article list shape because the public site never touches them.
  const { data: sources } = useQuery({
    queryKey: ["article-sources", article?.id],
    enabled: open && !!article?.id,
    queryFn: async (): Promise<ArticleSources | null> => {
      const { data } = await supabase
        .from("articles")
        .select("source_name, source_url, source_links, review_score, review_note")
        .eq("id", article!.id)
        .maybeSingle();
      return (data as ArticleSources | null) ?? null;
    },
  });
  const sourceLinks: SourceLink[] = Array.isArray(sources?.source_links) ? sources!.source_links! : [];
  const hasSources = !!sources?.source_url || sourceLinks.length > 0;

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

          {/* The sub-editor's verdict on an AI draft — admin eyes only */}
          {sources?.review_score != null && (
            <div
              className={`p-3 rounded-lg text-sm space-y-1 border ${
                sources.review_score <= 6
                  ? "bg-destructive/10 border-destructive/30"
                  : "bg-emerald-500/10 border-emerald-500/30"
              }`}
            >
              <p className="font-medium">
                ביקורת עורך AI: {sources.review_score}/10
                {sources.review_score <= 6 && " — הכתבה לא תוזמנה, דורשת אישור אנושי"}
              </p>
              {sources.review_note && (
                <p className="text-muted-foreground whitespace-pre-wrap">{sources.review_note}</p>
              )}
            </div>
          )}

          {/* Editorial sources — visible only here, never rendered on the site */}
          {hasSources && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="w-4 h-4" />
                מקורות (לעיני המערכת בלבד — לא מוצג בכתבה)
              </div>
              <ul className="space-y-1">
                {sources?.source_url && (
                  <li>
                    <a
                      href={sources.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      {sources.source_name ? `${sources.source_name} — מקור ראשי` : "מקור ראשי"}
                    </a>
                  </li>
                )}
                {sourceLinks
                  .filter((l) => l.url !== sources?.source_url)
                  .map((l) => (
                    <li key={l.url}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[560px]">{l.title || l.url}</span>
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          )}

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
