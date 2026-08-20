import { useState } from "react";
import { useSidebarWidgets, SidebarWidget, FormField, WidgetType, ActionType } from "@/hooks/useSidebarWidgets";
import { useCategories } from "@/hooks/useCategories";
import { useWidgetSubmissions } from "@/hooks/useWidgetSubmissions";
import { useWidgetViewCounts, useWidgetClickCounts } from "@/hooks/useWidgetImpressions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, ExternalLink, Loader2, Eye, ArrowUp, X, FileText, Link as LinkIcon, BarChart3, MousePointerClick } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ImageUpload from "@/components/ImageUpload";
import { Badge } from "@/components/ui/badge";

const widgetTypeLabels: Record<WidgetType, string> = {
  card: "כרטיסייה",
  banner: "באנר",
  popup: "פופ-אפ",
};

const actionTypeLabels: Record<ActionType, string> = {
  link: "קישור חיצוני",
  form: "טופס",
  image: "תמונה פרסומית",
};

const fieldTypeLabels: Record<string, string> = {
  text: "טקסט",
  email: "אימייל",
  phone: "טלפון",
  textarea: "טקסט ארוך",
  select: "בחירה מרשימה",
};

const emptyWidget: Omit<SidebarWidget, "id"> = {
  title: "",
  description: "",
  linkUrl: "",
  buttonText: "לחצו כאן",
  icon: "📊",
  displayOrder: 0,
  isActive: true,
  imageUrl: null,
  widgetTypes: ["card"],
  actionType: "link",
  formFields: [],
  categories: [],
};

const AdminWidgetsTab = () => {
  const { widgets, isLoading, addWidget, updateWidget, deleteWidget } = useSidebarWidgets();
  const { data: viewCounts } = useWidgetViewCounts();
  const { data: clickCounts } = useWidgetClickCounts();
  const { categories } = useCategories();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SidebarWidget | null>(null);
  const [form, setForm] = useState<Omit<SidebarWidget, "id">>(emptyWidget);
  const [submissionsDialog, setSubmissionsDialog] = useState<SidebarWidget | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyWidget, displayOrder: widgets.length });
    setDialogOpen(true);
  };

  // Position swap — the list order is the order widgets rotate on the site.
  const moveWidget = async (index: number, dir: -1 | 1) => {
    const a = widgets[index];
    const b = widgets[index + dir];
    if (!a || !b) return;
    await updateWidget({ ...a, displayOrder: index + dir });
    await updateWidget({ ...b, displayOrder: index });
  };

  const openEdit = (w: SidebarWidget) => {
    setEditing(w);
    setForm({
      title: w.title,
      description: w.description ?? "",
      linkUrl: w.linkUrl,
      buttonText: w.buttonText,
      icon: w.icon,
      displayOrder: w.displayOrder,
      isActive: w.isActive,
      imageUrl: w.imageUrl,
      widgetTypes: w.widgetTypes,
      actionType: w.actionType,
      formFields: w.formFields,
      categories: w.categories,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title) return;
    if (form.actionType === "link" && !form.linkUrl) return;
    if (form.actionType === "image" && (!form.imageUrl || !form.linkUrl)) return;
    if (editing) {
      await updateWidget({ ...editing, ...form });
    } else {
      await addWidget(form);
    }
    setDialogOpen(false);
  };

  // Form field management
  const addFormField = () => {
    const newField: FormField = {
      id: crypto.randomUUID(),
      label: "",
      type: "text",
      required: false,
    };
    setForm(f => ({ ...f, formFields: [...f.formFields, newField] }));
  };

  const updateFormField = (id: string, updates: Partial<FormField>) => {
    setForm(f => ({
      ...f,
      formFields: f.formFields.map(field =>
        field.id === id ? { ...field, ...updates } : field
      ),
    }));
  };

  const removeFormField = (id: string) => {
    setForm(f => ({ ...f, formFields: f.formFields.filter(field => field.id !== id) }));
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>ניהול חלוניות</CardTitle>
            <CardDescription>צור וערוך חלוניות CTA - פופ-אפ, באנר או כרטיסייה</CardDescription>
          </div>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            חלונית חדשה
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {widgets.map((w, index) => (
              <div key={w.id} className={`flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/30 transition-colors ${!w.isActive ? 'opacity-60' : ''}`}>
                <div className="flex flex-col shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => moveWidget(index, -1)}
                    aria-label="העלה בסדר"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rotate-180"
                    disabled={index === widgets.length - 1}
                    onClick={() => moveWidget(index, 1)}
                    aria-label="הורד בסדר"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {w.actionType === "image" && w.imageUrl ? (
                  <img src={w.imageUrl} alt="" className="w-12 h-12 object-cover rounded" />
                ) : (
                  <span className="text-3xl">{w.icon}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium">{w.title}</h4>
                    {w.widgetTypes.map(t => (
                      <Badge key={t} variant="secondary">{widgetTypeLabels[t]}</Badge>
                    ))}
                    <Badge variant="outline" className="gap-1">
                      {w.actionType === "form" ? <FileText className="w-3 h-3" /> : <LinkIcon className="w-3 h-3" />}
                      {actionTypeLabels[w.actionType]}
                    </Badge>
                    {!w.isActive && <Badge variant="destructive">מוסתר</Badge>}
                    <Badge variant="outline" className="gap-1">
                      <BarChart3 className="w-3 h-3" />
                      {viewCounts?.[w.id] || 0} צפיות
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <MousePointerClick className="w-3 h-3" />
                      {clickCounts?.[w.id] || 0} קליקים
                    </Badge>
                    {(viewCounts?.[w.id] || 0) > 0 && (
                      <Badge variant="secondary" className="gap-1">
                        CTR {(((clickCounts?.[w.id] || 0) / (viewCounts?.[w.id] || 1)) * 100).toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  {w.description && <p className="text-sm text-muted-foreground truncate">{w.description}</p>}
                  {w.actionType === "link" && w.linkUrl && (
                    <a href={w.linkUrl} target="_blank" rel="noopener" className="text-xs text-primary flex items-center gap-1 mt-1">
                      <ExternalLink className="w-3 h-3" />
                      {w.linkUrl}
                    </a>
                  )}
                  {w.actionType === "form" && (
                    <p className="text-xs text-muted-foreground mt-1">{w.formFields.length} שדות בטופס</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5" title={w.isActive ? "מוצג - לחץ להסתרה" : "מוסתר - לחץ להצגה"}>
                    <Switch
                      checked={w.isActive}
                      onCheckedChange={(checked) => updateWidget({ ...w, isActive: checked })}
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{w.isActive ? "מוצג" : "מוסתר"}</span>
                  </div>
                  {w.actionType === "form" && (
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => setSubmissionsDialog(w)}>
                      <Eye className="w-4 h-4" />
                      נרשמים
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(w)}>
                    <Edit className="w-4 h-4" />
                    ערוך
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      if (window.confirm(`למחוק את החלונית "${w.title}" לצמיתות?`)) deleteWidget(w.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            {widgets.length === 0 && (
              <p className="text-center text-muted-foreground py-8">אין חלוניות. לחצו על "חלונית חדשה" כדי ליצור.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת חלונית" : "חלונית חדשה"}</DialogTitle>
            <DialogDescription>הגדרת סוג חלונית, פעולה ותוכן</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Widget Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>סוג חלונית (ניתן לבחור מספר)</Label>
                <div className="flex flex-col gap-2 pt-1">
                  {(Object.entries(widgetTypeLabels) as [WidgetType, string][]).map(([type, label]) => {
                    const checked = form.widgetTypes.includes(type);
                    return (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setForm(f => {
                              const next = v
                                ? [...f.widgetTypes, type]
                                : f.widgetTypes.filter(t => t !== type);
                              return { ...f, widgetTypes: next.length > 0 ? next : [type] };
                            });
                          }}
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <Label>סוג פעולה</Label>
                <Select value={form.actionType} onValueChange={(v: ActionType) => setForm(f => ({ ...f, actionType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">קישור חיצוני</SelectItem>
                    <SelectItem value="form">טופס</SelectItem>
                    <SelectItem value="image">תמונה פרסומית בלבד</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Title & Icon */}
            <div className="grid grid-cols-[1fr_60px] gap-3">
              <div className="space-y-1">
                <Label>כותרת {form.actionType === "image" && <span className="text-xs text-muted-foreground">(לזיהוי פנימי בלבד)</span>}</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="מנתח דוחות רבעוניים" />
              </div>
              {form.actionType !== "image" && (
                <div className="space-y-1">
                  <Label>אייקון</Label>
                  <Input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} className="text-center text-lg" />
                </div>
              )}
            </div>

            {form.actionType !== "image" && (
              <div className="space-y-1">
                <Label>תיאור</Label>
                <Textarea value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="תיאור קצר..." rows={2} />
              </div>
            )}

            {/* Link URL - for link or image action */}
            {(form.actionType === "link" || form.actionType === "image") && (
              <div className="space-y-1">
                <Label>קישור (URL) {form.actionType === "image" && <span className="text-xs text-destructive">*</span>}</Label>
                <Input value={form.linkUrl} onChange={e => setForm(f => ({ ...f, linkUrl: e.target.value }))} dir="ltr" placeholder="https://..." />
              </div>
            )}

            {/* Form Fields Builder - only for form action */}
            {form.actionType === "form" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">שדות הטופס</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addFormField} className="gap-1">
                    <Plus className="w-3 h-3" />
                    שדה חדש
                  </Button>
                </div>
                {form.formFields.map((field, idx) => (
                  <div key={field.id} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">שדה {idx + 1}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeFormField(field.id)}>
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">תווית</Label>
                        <Input
                          value={field.label}
                          onChange={e => updateFormField(field.id, { label: e.target.value })}
                          placeholder="שם מלא"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">סוג</Label>
                        <Select value={field.type} onValueChange={v => updateFormField(field.id, { type: v as FormField["type"] })}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(fieldTypeLabels).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {field.type === "select" && (
                      <div className="space-y-1">
                        <Label className="text-xs">אפשרויות (מופרד בפסיקים)</Label>
                        <Input
                          value={(field.options || []).join(", ")}
                          onChange={e => updateFormField(field.id, { options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                          placeholder="אפשרות 1, אפשרות 2, אפשרות 3"
                          className="h-8 text-sm"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={field.required}
                        onCheckedChange={v => updateFormField(field.id, { required: v })}
                      />
                      <Label className="text-xs">שדה חובה</Label>
                    </div>
                  </div>
                ))}
                {form.formFields.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">לחצו "שדה חדש" כדי להוסיף שדות לטופס</p>
                )}
              </div>
            )}

            {form.actionType !== "image" && (
              <div className="space-y-1">
                <Label>טקסט כפתור</Label>
                <Input value={form.buttonText} onChange={e => setForm(f => ({ ...f, buttonText: e.target.value }))} placeholder="לחצו כאן" />
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
              <Label>פעיל</Label>
            </div>

            {/* Categories Filter */}
            <div className="space-y-2">
              <Label>הצגה בקטגוריות (ריק = כל הקטגוריות)</Label>
              <div className="flex flex-col gap-2 max-h-32 overflow-y-auto border rounded-lg p-2">
                {categories.map(cat => {
                  const checked = form.categories.includes(cat.name);
                  return (
                    <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setForm(f => ({
                            ...f,
                            categories: v
                              ? [...f.categories, cat.name]
                              : f.categories.filter(c => c !== cat.name),
                          }));
                        }}
                      />
                      <span className="text-sm">{cat.name}</span>
                    </label>
                  );
                })}
              </div>
              {form.categories.length === 0 && (
                <p className="text-xs text-muted-foreground">לא נבחרו קטגוריות — החלונית תוצג בכל הקטגוריות</p>
              )}
            </div>

            {form.actionType === "image" && (
              <p className="text-xs text-muted-foreground">העלה תמונה פרסומית מעוצבת — היא תוצג כמו שהיא, ולחיצה תוביל לקישור.</p>
            )}
            <ImageUpload
              value={form.imageUrl ?? ""}
              onChange={url => setForm(f => ({ ...f, imageUrl: url || null }))}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleSave} disabled={!form.title || (form.actionType === "link" && !form.linkUrl) || (form.actionType === "image" && (!form.imageUrl || !form.linkUrl))}>
              {editing ? "שמור" : "צור חלונית"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submissions Dialog */}
      {submissionsDialog && (
        <SubmissionsDialog
          widget={submissionsDialog}
          onClose={() => setSubmissionsDialog(null)}
        />
      )}
    </>
  );
};

// Submissions viewer component
const SubmissionsDialog = ({ widget, onClose }: { widget: SidebarWidget; onClose: () => void }) => {
  const { submissions, isLoading, deleteSubmission } = useWidgetSubmissions(widget.id);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>נרשמים - {widget.title}</DialogTitle>
          <DialogDescription>{submissions.length} רשומות</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : submissions.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין רשומות עדיין</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>תאריך</TableHead>
                  {widget.formFields.map(f => (
                    <TableHead key={f.id}>{f.label}</TableHead>
                  ))}
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map(sub => (
                  <TableRow key={sub.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(sub.createdAt).toLocaleDateString("he-IL")}
                      {" "}
                      {new Date(sub.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    {widget.formFields.map(f => (
                      <TableCell key={f.id} className="text-sm">
                        {sub.data[f.id] || "-"}
                      </TableCell>
                    ))}
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => deleteSubmission(sub.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AdminWidgetsTab;
