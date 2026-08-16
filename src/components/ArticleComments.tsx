import { useState } from "react";
import { MessageCircle, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useArticleComments, useSubmitComment } from "@/hooks/useComments";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";

interface ArticleCommentsProps {
  articleId: string;
}

const ArticleComments = ({ articleId }: ArticleCommentsProps) => {
  const { comments, isLoading } = useArticleComments(articleId);
  const submitComment = useSubmitComment();
  
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [content, setContent] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authorName.trim() || !content.trim()) return;

    submitComment.mutate(
      { articleId, authorName: authorName.trim(), authorEmail: authorEmail.trim() || undefined, content: content.trim() },
      {
        onSuccess: () => {
          setAuthorName("");
          setAuthorEmail("");
          setContent("");
          setIsFormOpen(false);
        },
      }
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          תגובות ({comments.length})
        </h3>
        {!isFormOpen && (
          <Button onClick={() => setIsFormOpen(true)} variant="outline" size="sm">
            הוסף תגובה
          </Button>
        )}
      </div>

      {/* Comment Form */}
      {isFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">הוסף תגובה</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  placeholder="השם שלך"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  required
                  maxLength={50}
                />
              </div>
              <div>
                <Input
                  type="email"
                  placeholder="כתובת מייל (לא יוצג באתר)"
                  value={authorEmail}
                  onChange={(e) => setAuthorEmail(e.target.value)}
                  maxLength={100}
                />
              </div>
              <div>
                <Textarea
                  placeholder="כתוב את התגובה שלך..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={4}
                  maxLength={1000}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitComment.isPending} className="gap-2">
                  <Send className="w-4 h-4" />
                  {submitComment.isPending ? "שולח..." : "שלח תגובה"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsFormOpen(false)}
                >
                  ביטול
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                * התגובה תפורסם לאחר אישור המערכת
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Comments List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">טוען תגובות...</div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          אין תגובות עדיין. היה הראשון להגיב!
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <Card key={comment.id}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{comment.author_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), {
                          addSuffix: true,
                          locale: he,
                        })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArticleComments;
