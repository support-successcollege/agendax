import { useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ExternalLink,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import WriterAvatar from "@/components/article/WriterAvatar";
import {
  BIO_MAX,
  ROLE_MAX,
  SYSTEM_AUTHOR_SLUG,
  createAuthor,
  deleteAuthor,
  draftFromAuthor,
  emptyDraft,
  reassignAndDeleteAuthor,
  saveAuthor,
  setAuthorActive,
  slugPreview,
  uploadAuthorPhoto,
  useAllAuthors,
  useRefreshAuthors,
  validateDraft,
  type AdminAuthor,
  type AuthorDraft,
  type AuthorKind,
} from "@/hooks/useAuthors";

const KIND_LABEL: Record<AuthorKind, string> = {
  human: "כתב",
  system: "מערכת",
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * The writers roster: list, create, edit, and delete without orphaning a story.
 *
 * Everything here is public text on a page a reader may use to decide whether
 * the site is trustworthy, so it is worth writing carefully.
 *
 * The slug is made once from the name and never changes: it is the profile's
 * URL and the key every article row points at.
 */
const AdminWritersTab = () => {
  const { toast } = useToast();
  const { data: authors, isLoading } = useAllAuthors();
  const refresh = useRefreshAuthors();
  const [editing, setEditing] = useState<{
    slug: string | null;
    draft: AuthorDraft;
  } | null>(null);
  const [deleting, setDeleting] = useState<AdminAuthor | null>(null);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  const handleToggle = async (author: AdminAuthor, isActive: boolean) => {
    setTogglingSlug(author.slug);
    try {
      await setAuthorActive(author.slug, isActive);
      refresh();
    } catch (error) {
      toast({
        title: "העדכון נכשל",
        description: errorText(error),
        variant: "destructive",
      });
    } finally {
      setTogglingSlug(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              כתבים
            </CardTitle>
            <CardDescription className="mt-1.5 max-w-[70ch]">
              כל כתבה משויכת לכתב ומקושרת לעמוד הפרופיל שלו. כתבות שנכנסות
              אוטומטית, וכל כתבה בלי כתב, נחתמות "חדשות AgendaX". שם של כתב
              נכנס לכתבה רק כשבוחרים אותו ידנית בעריכת הכתבה.
            </CardDescription>
          </div>
          <Button
            onClick={() => setEditing({ slug: null, draft: emptyDraft() })}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            כתב חדש
          </Button>
        </CardHeader>

        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">טוען…</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pe-3 text-start font-medium">כתב</th>
                  <th className="py-2 pe-3 text-start font-medium">תפקיד</th>
                  <th className="py-2 pe-3 text-start font-medium">כתבות</th>
                  <th className="py-2 pe-3 text-start font-medium">פעיל</th>
                  <th className="py-2 text-end font-medium">
                    <span className="sr-only">פעולות</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(authors ?? []).map((author) => (
                  <tr
                    key={author.slug}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 pe-3">
                      <div className="flex items-center gap-3">
                        <WriterAvatar
                          name={author.name}
                          avatarUrl={author.avatarUrl}
                          photoAlt={author.photoAlt}
                          size={40}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold">{author.name}</span>
                            <span className="rounded-sm border border-border px-1.5 py-[1px] text-[10.5px] text-muted-foreground">
                              {KIND_LABEL[author.kind]}
                            </span>
                          </div>
                          <a
                            href={`/author/${author.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            dir="ltr"
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                          >
                            /author/{decodeURIComponent(author.slug)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pe-3 text-muted-foreground">
                      {author.role}
                    </td>
                    <td className="py-3 pe-3 tabular-nums">
                      {author.publishedCount}
                      {author.totalCount > author.publishedCount && (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          (+{author.totalCount - author.publishedCount} טיוטות)
                        </span>
                      )}
                    </td>
                    <td className="py-3 pe-3">
                      <Switch
                        checked={author.isActive}
                        disabled={
                          togglingSlug === author.slug ||
                          author.slug === SYSTEM_AUTHOR_SLUG
                        }
                        onCheckedChange={(isActive) =>
                          handleToggle(author, isActive)
                        }
                        aria-label={`${author.name} פעיל`}
                      />
                    </td>
                    <td className="py-3 text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setEditing({
                              slug: author.slug,
                              draft: draftFromAuthor(author),
                            })
                          }
                          aria-label={`עריכת ${author.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {author.slug !== SYSTEM_AUTHOR_SLUG && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(author)}
                            aria-label={`מחיקת ${author.name}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <WriterDialog
          slug={editing.slug}
          initial={editing.draft}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <DeleteWriterDialog
          author={deleting}
          others={(authors ?? []).filter((a) => a.slug !== deleting.slug)}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
};

// --- Create / edit ------------------------------------------------------------

const Counter = ({ value, max }: { value: string; max: number }) => {
  const length = value.trim().length;
  return (
    <span
      className={`text-xs tabular-nums ${length > max ? "font-bold text-destructive" : "text-muted-foreground"}`}
      aria-live="polite"
    >
      {length}/{max}
    </span>
  );
};

const WriterDialog = ({
  slug,
  initial,
  onClose,
  onSaved,
}: {
  slug: string | null;
  initial: AuthorDraft;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState<AuthorDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const isNew = slug === null;
  const isSystem = slug === SYSTEM_AUTHOR_SLUG;
  const set = (patch: Partial<AuthorDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));
  const problem = validateDraft(draft);

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAuthorPhoto(file);
      set({ avatarUrl: url, photoAlt: draft.photoAlt || draft.name.trim() });
    } catch (error) {
      toast({
        title: "העלאת התמונה נכשלה",
        description: errorText(error),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleSave = async () => {
    if (problem) {
      toast({ title: problem, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await createAuthor(draft);
        toast({
          title: "הכתב נוצר",
          description: `/author/${decodeURIComponent(created)}`,
        });
      } else {
        await saveAuthor(slug, draft);
        toast({ title: "הפרופיל נשמר" });
      }
      onSaved();
    } catch (error) {
      toast({
        title: "השמירה נכשלה",
        description: errorText(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>
            {isNew ? "כתב חדש" : `עריכת ${initial.name}`}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "כתובת הפרופיל נוצרת מהשם ולא משתנה אחר כך."
              : `/author/${decodeURIComponent(slug)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo */}
          <div className="flex flex-wrap items-center gap-4">
            <WriterAvatar
              name={draft.name || "?"}
              avatarUrl={draft.avatarUrl}
              photoAlt={draft.photoAlt}
              size={72}
            />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handlePhoto(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                className="gap-2"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {draft.avatarUrl ? "החלפת תמונה" : "העלאת תמונה"}
              </Button>
              {draft.avatarUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set({ avatarUrl: null, photoAlt: "" })}
                  className="gap-1 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  הסרה
                </Button>
              )}
            </div>
            <p className="w-full text-xs text-muted-foreground">
              JPG, PNG או WEBP, עד 3MB. בלי תמונה יוצגו ראשי התיבות בעיגול.
            </p>
          </div>

          {draft.avatarUrl && (
            <Field label="טקסט חלופי לתמונה (נגישות)" required>
              <Input
                value={draft.photoAlt}
                onChange={(e) => set({ photoAlt: e.target.value })}
                placeholder="לדוגמה: דנה לוי, כתבת הייטק"
              />
            </Field>
          )}

          <div>
            <Field label="שם" required>
              <Input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
              />
              {isNew && draft.name.trim() && (
                <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                  /author/{slugPreview(draft.name)}
                </p>
              )}
            </Field>
          </div>

          <Field
            label="תפקיד"
            required
            extra={<Counter value={draft.role} max={ROLE_MAX} />}
          >
            <Input
              value={draft.role}
              onChange={(e) => set({ role: e.target.value })}
              placeholder="כתבת הייטק"
            />
          </Field>

          <Field
            label="ביוגרפיה"
            extra={<Counter value={draft.bio} max={BIO_MAX} />}
          >
            <Textarea
              rows={4}
              value={draft.bio}
              onChange={(e) => set({ bio: e.target.value })}
            />
          </Field>

          <Field label="תחום סיקור">
            <Input
              value={draft.beat ?? ""}
              onChange={(e) => set({ beat: e.target.value })}
            />
          </Field>

          {!isSystem && (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.isActive}
                onCheckedChange={(isActive) => set({ isActive })}
              />
              פעיל (מוצג באתר)
            </label>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={handleSave}
            disabled={saving || uploading || !!problem}
          >
            {saving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            {isNew ? "יצירה" : "שמירה"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          {problem && <p className="text-xs text-destructive">{problem}</p>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({
  label,
  required,
  extra,
  children,
}: {
  label: string;
  required?: boolean;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div>
    <div className="mb-1 flex items-center justify-between">
      <span className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {extra}
    </div>
    {children}
  </div>
);

// --- Safe delete --------------------------------------------------------------

/**
 * A writer with no stories is deleted outright. One with stories cannot be:
 * the admin picks who takes them over, and the move and the delete happen in
 * one database call so nothing is ever left without a byline.
 */
const DeleteWriterDialog = ({
  author,
  others,
  onClose,
  onDeleted,
}: {
  author: AdminAuthor;
  others: AdminAuthor[];
  onClose: () => void;
  onDeleted: () => void;
}) => {
  const { toast } = useToast();
  const [target, setTarget] = useState<string>(SYSTEM_AUTHOR_SLUG);
  const [busy, setBusy] = useState(false);
  const hasArticles = author.totalCount > 0;

  const handleDelete = async () => {
    setBusy(true);
    try {
      if (hasArticles) {
        const moved = await reassignAndDeleteAuthor(author.slug, target);
        const to = others.find((o) => o.slug === target)?.name ?? target;
        toast({
          title: `${author.name} נמחק`,
          description: `${moved} כתבות הועברו ל${to}`,
        });
      } else {
        await deleteAuthor(author.slug);
        toast({ title: `${author.name} נמחק` });
      }
      onDeleted();
    } catch (error) {
      toast({
        title: "המחיקה נכשלה",
        description: errorText(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>מחיקת {author.name}</DialogTitle>
          <DialogDescription>
            {hasArticles
              ? `ל${author.name} יש ${author.totalCount} כתבות. לפני המחיקה הן יועברו לכתב אחר.`
              : "לכתב אין כתבות. המחיקה סופית."}
          </DialogDescription>
        </DialogHeader>

        {hasArticles && (
          <div>
            <span className="mb-1 block text-xs text-muted-foreground">
              להעביר את הכתבות אל
            </span>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {others.map((other) => (
                  <SelectItem key={other.slug} value={other.slug}>
                    {other.name}
                    {!other.isActive ? " (לא פעיל)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-start">
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>
            {busy && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            {hasArticles ? "העברה ומחיקה" : "מחיקה"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminWritersTab;
