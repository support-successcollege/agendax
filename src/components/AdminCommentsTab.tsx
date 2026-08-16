import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePendingComments, useApproveComment, useDeleteComment } from "@/hooks/useComments";
import { Check, Trash2, MessageCircle, Clock, User, Mail } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";

const AdminCommentsTab = () => {
  const { comments, isLoading } = usePendingComments();
  const approveComment = useApproveComment();
  const deleteComment = useDeleteComment();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          טוען תגובות...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              תגובות ממתינות לאישור
            </CardTitle>
            <CardDescription>
              אשר או מחק תגובות שנשלחו על ידי קוראים
            </CardDescription>
          </div>
          {comments.length > 0 && (
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {comments.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {comments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>אין תגובות ממתינות לאישור</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="p-4 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Article reference */}
                    <div className="mb-2">
                      <Badge variant="outline" className="text-xs">
                        {comment.article_title}
                      </Badge>
                    </div>
                    
                    {/* Author and time */}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-2">
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
                        {formatDistanceToNow(new Date(comment.created_at), {
                          addSuffix: true,
                          locale: he,
                        })}
                      </span>
                    </div>
                    
                    {/* Content */}
                    <p className="text-foreground whitespace-pre-wrap">{comment.content}</p>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="default"
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
                      onClick={() => deleteComment.mutate(comment.id)}
                      disabled={deleteComment.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                      מחק
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdminCommentsTab;
