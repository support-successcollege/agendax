import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  usePendingComments,
  useApprovedComments,
  useApproveComment,
  useApproveAllComments,
  useUnapproveComment,
  useDeleteComment,
  type Comment,
} from "@/hooks/useComments";
import { Check, CheckCheck, Trash2, MessageCircle, Clock, User, Mail, Undo2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";

const CommentRow = ({
  comment,
  actions,
}: {
  comment: Comment;
  actions: React.ReactNode;
}) => (
  <div className="p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="mb-2">
          <Badge variant="outline" className="text-xs">
            {comment.article_title}
          </Badge>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2 flex-wrap">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {comment.author_name}
          </span>
          {comment.author_email && (
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {comment.author_email}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: he })}
          </span>
        </div>
        <p className="text-foreground whitespace-pre-wrap">{comment.content}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">{actions}</div>
    </div>
  </div>
);

const AdminCommentsTab = () => {
  const [view, setView] = useState<"pending" | "approved">("pending");
  const { comments: pending, isLoading: loadingPending } = usePendingComments();
  const { comments: approved, isLoading: loadingApproved } = useApprovedComments();
  const approveComment = useApproveComment();
  const approveAll = useApproveAllComments();
  const unapproveComment = useUnapproveComment();
  const deleteComment = useDeleteComment();

  const handleDelete = (comment: Comment) => {
    if (!window.confirm(`למחוק לצמיתות את התגובה של ${comment.author_name}?`)) return;
    deleteComment.mutate(comment.id);
  };

  const isLoading = view === "pending" ? loadingPending : loadingApproved;
  const list = view === "pending" ? pending : approved;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              ניהול תגובות
            </CardTitle>
            <CardDescription>אישור, הסרה ומחיקה של תגובות קוראים</CardDescription>
          </div>
          {view === "pending" && pending.length > 1 && (
            <Button
              size="sm"
              className="gap-1"
              disabled={approveAll.isPending}
              onClick={() => {
                if (window.confirm(`לאשר את כל ${pending.length} התגובות הממתינות?`)) {
                  approveAll.mutate();
                }
              }}
            >
              <CheckCheck className="w-4 h-4" />
              אשר הכל ({pending.length})
            </Button>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant={view === "pending" ? "default" : "outline"}
            onClick={() => setView("pending")}
          >
            ממתינות ({pending.length})
          </Button>
          <Button
            size="sm"
            variant={view === "approved" ? "default" : "outline"}
            onClick={() => setView("approved")}
          >
            מאושרות ({approved.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">טוען תגובות...</p>
        ) : list.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>{view === "pending" ? "אין תגובות ממתינות לאישור" : "אין תגובות מאושרות"}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {list.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                actions={
                  view === "pending" ? (
                    <>
                      <Button
                        size="sm"
                        className="gap-1"
                        onClick={() => approveComment.mutate(comment.id)}
                        disabled={approveComment.isPending}
                      >
                        <Check className="w-4 h-4" />
                        אשר
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        onClick={() => handleDelete(comment)}
                        disabled={deleteComment.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                        מחק
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => unapproveComment.mutate(comment.id)}
                        disabled={unapproveComment.isPending}
                        title="מוריד מהאתר ומחזיר לתור הממתינות"
                      >
                        <Undo2 className="w-4 h-4" />
                        הסר מהאתר
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        onClick={() => handleDelete(comment)}
                        disabled={deleteComment.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                        מחק
                      </Button>
                    </>
                  )
                }
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminCommentsTab;
