import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Youtube from '@tiptap/extension-youtube';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { WidgetEmbed } from '@/components/WidgetEmbedExtension';
import { VideoNode } from '@/components/VideoExtension';
import { useEffect, useCallback, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useImageUpload } from '@/hooks/useImageUpload';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo,
  Redo,
  Upload,
  Loader2,
  Video,
  Table2,
  Plus,
  Minus,
  Trash2,
  LayoutGrid,
} from 'lucide-react';
import { useSidebarWidgets } from '@/hooks/useSidebarWidgets';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const RichTextEditor = ({ value, onChange, placeholder }: RichTextEditorProps) => {
  const [imageUrl, setImageUrl] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { uploadImage, isUploading } = useImageUpload();
  const { uploadVideo, isUploading: isUploadingVideo } = useVideoUpload();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      WidgetEmbed,
      VideoNode,
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'article-table',
        },
      }),
      TableRow,
      TableCell,
      TableHeader,
      Youtube.configure({
        inline: false,
        width: 640,
        height: 360,
        HTMLAttributes: {
          class: 'youtube-embed',
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-hidden text-right',
        dir: 'rtl',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const addImage = useCallback((url: string) => {
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
      setImageUrl('');
      setImagePopoverOpen(false);
    }
  }, [editor]);

  const handleImageUrlAdd = useCallback(() => {
    addImage(imageUrl);
  }, [addImage, imageUrl]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadImage(file);
    if (url) {
      addImage(url);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [uploadImage, addImage]);

  const addYoutubeVideo = useCallback(() => {
    if (youtubeUrl && editor) {
      editor.commands.setYoutubeVideo({ src: youtubeUrl });
      setYoutubeUrl('');
      setVideoPopoverOpen(false);
    }
  }, [editor, youtubeUrl]);

  const addUploadedVideo = useCallback((url: string) => {
    if (url && editor) {
      editor.chain().focus().insertContent(
        `<div class="video-wrapper"><video controls src="${url}" class="uploaded-video"></video></div>`
      ).run();
      setVideoPopoverOpen(false);
    }
  }, [editor]);

  const handleVideoFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadVideo(file);
    if (url) {
      addUploadedVideo(url);
    }
    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  }, [uploadVideo, addUploadedVideo]);

  const addLink = useCallback(() => {
    if (linkUrl && editor) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
      setLinkUrl('');
    }
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
    }
  }, [editor]);

  if (!editor) {
    return null;
  }

  const ToolbarButton = ({ 
    onClick, 
    isActive = false, 
    children,
    title 
  }: { 
    onClick: () => void; 
    isActive?: boolean; 
    children: React.ReactNode;
    title: string;
  }) => (
    <Button
      type="button"
      variant={isActive ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      className="h-8 w-8 p-0"
      title={title}
    >
      {children}
    </Button>
  );

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
        {/* Text Formatting */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="מודגש"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="נטוי"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            title="קו תחתון"
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            title="קו חוצה"
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Headings */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="כותרת 1"
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="כותרת 2"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="כותרת 3"
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Lists */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="רשימה"
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="רשימה ממוספרת"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="ציטוט"
          >
            <Quote className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Alignment */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            isActive={editor.isActive({ textAlign: 'right' })}
            title="יישור לימין"
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            isActive={editor.isActive({ textAlign: 'center' })}
            title="יישור למרכז"
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            isActive={editor.isActive({ textAlign: 'left' })}
            title="יישור לשמאל"
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarButton>
        </div>

        {/* Link */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={editor.isActive('link') ? "default" : "ghost"}
                size="sm"
                className="h-8 w-8 p-0"
                title="קישור"
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" dir="rtl">
              <div className="space-y-2">
                <Input
                  placeholder="הזן כתובת URL"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  dir="ltr"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addLink}>הוסף קישור</Button>
                  <Button size="sm" variant="outline" onClick={removeLink}>הסר קישור</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Image */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="תמונה"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" dir="rtl">
              <Tabs defaultValue="upload" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="upload" className="gap-2 text-xs">
                    <Upload className="w-3 h-3" />
                    העלאה
                  </TabsTrigger>
                  <TabsTrigger value="url" className="gap-2 text-xs">
                    <LinkIcon className="w-3 h-3" />
                    קישור
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="upload" className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      disabled={isUploading}
                      className="flex-1 text-xs"
                    />
                    {isUploading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    גודל מקסימלי: 5MB
                  </p>
                </TabsContent>
                
                <TabsContent value="url" className="space-y-2">
                  <Input
                    placeholder="https://example.com/image.jpg"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    dir="ltr"
                    className="text-xs"
                  />
                  <Button size="sm" onClick={handleImageUrlAdd} className="w-full">
                    הוסף תמונה
                  </Button>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
        </div>

        {/* Video */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <Popover open={videoPopoverOpen} onOpenChange={setVideoPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="סרטון"
              >
                <Video className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" dir="rtl">
              <Tabs defaultValue="youtube" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="youtube" className="gap-2 text-xs">
                    YouTube
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="gap-2 text-xs">
                    <Upload className="w-3 h-3" />
                    העלאה
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="youtube" className="space-y-2">
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    dir="ltr"
                    className="text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    הדבק קישור ליוטיוב או YouTube Music
                  </p>
                  <Button size="sm" onClick={addYoutubeVideo} className="w-full" disabled={!youtubeUrl}>
                    הטמע סרטון
                  </Button>
                </TabsContent>
                
                <TabsContent value="upload" className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      ref={videoInputRef}
                      type="file"
                      accept="video/mp4,video/webm,video/ogg"
                      onChange={handleVideoFileSelect}
                      disabled={isUploadingVideo}
                      className="flex-1 text-xs"
                    />
                    {isUploadingVideo && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    גודל מקסימלי: 100MB. פורמטים: MP4, WebM, OGG
                  </p>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
        </div>

        {/* Table */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="טבלה"
              >
                <Table2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48" dir="rtl">
              <div className="space-y-2">
                <Button size="sm" className="w-full text-xs" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                  <Plus className="w-3 h-3 ml-1" />
                  הוסף טבלה 3×3
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().addColumnAfter()}>
                  הוסף עמודה
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().addRowAfter()}>
                  הוסף שורה
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().deleteColumn()}>
                  <Minus className="w-3 h-3 ml-1" />
                  מחק עמודה
                </Button>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().deleteRow()}>
                  <Minus className="w-3 h-3 ml-1" />
                  מחק שורה
                </Button>
                <Button size="sm" variant="destructive" className="w-full text-xs" onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.can().deleteTable()}>
                  <Trash2 className="w-3 h-3 ml-1" />
                  מחק טבלה
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Widget Embed */}
        <div className="flex gap-0.5 border-l pl-2 ml-2">
          <WidgetEmbedButton editor={editor} />
        </div>

        {/* Undo/Redo */}
        <div className="flex gap-0.5">
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            title="בטל"
          >
            <Undo className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            title="בצע שוב"
          >
            <Redo className="h-4 w-4" />
          </ToolbarButton>
        </div>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />

      {/* Styles for the editor */}
      <style>{`
        .ProseMirror {
          min-height: 300px;
          padding: 1rem;
          direction: rtl;
          text-align: right;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror h1 {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        .ProseMirror p {
          margin-bottom: 0.75rem;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-right: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror blockquote {
          border-right: 3px solid hsl(var(--primary));
          padding-right: 1rem;
          margin: 1rem 0;
          color: hsl(var(--muted-foreground));
          font-style: italic;
        }
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .ProseMirror a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: right;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          height: 0;
        }
        .ProseMirror .youtube-embed,
        .ProseMirror div[data-youtube-video] {
          margin: 1rem 0;
        }
        .ProseMirror div[data-youtube-video] iframe {
          width: 100%;
          max-width: 640px;
          aspect-ratio: 16 / 9;
          height: auto;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
        }
        .ProseMirror .video-wrapper {
          margin: 1rem 0;
        }
        .ProseMirror .uploaded-video,
        .ProseMirror video {
          width: 100%;
          max-width: 640px;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
        }
        .ProseMirror table.article-table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
          overflow: hidden;
          border: 1px solid hsl(var(--border));
        }
        .ProseMirror table.article-table td,
        .ProseMirror table.article-table th {
          border: 1px solid hsl(var(--border));
          padding: 0.5rem 0.75rem;
          min-width: 80px;
          text-align: right;
          vertical-align: top;
        }
        .ProseMirror table.article-table th {
          background-color: hsl(var(--muted));
          font-weight: 600;
        }
        .ProseMirror table.article-table td.selectedCell,
        .ProseMirror table.article-table th.selectedCell {
          background-color: hsl(var(--primary) / 0.1);
        }
      `}</style>
    </div>
  );
};

const WidgetEmbedButton = ({ editor }: { editor: any }) => {
  const { widgets } = useSidebarWidgets();
  const [open, setOpen] = useState(false);
  const activeWidgets = widgets.filter(w => w.isActive);

  const insertWidget = (widget: any) => {
    editor.chain().focus().insertContent({
      type: 'widgetEmbed',
      attrs: { widgetId: widget.id, widgetLabel: `${widget.icon} ${widget.title}` },
    }).run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="הטמע חלונית">
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" dir="rtl">
        <p className="text-xs font-semibold mb-2">בחר חלונית להטמעה:</p>
        {activeWidgets.length === 0 ? (
          <p className="text-xs text-muted-foreground">אין חלוניות פעילות</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {activeWidgets.map(w => (
              <button
                key={w.id}
                type="button"
                onClick={() => insertWidget(w)}
                className="w-full text-right px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors flex items-center gap-2"
              >
                <span>{w.icon}</span>
                <span className="truncate">{w.title}</span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default RichTextEditor;
