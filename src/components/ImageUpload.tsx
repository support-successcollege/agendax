import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Link, Loader2, X } from "lucide-react";
import { useImageUpload } from "@/hooks/useImageUpload";

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
}

const ImageUpload = ({ value, onChange }: ImageUploadProps) => {
  const [activeTab, setActiveTab] = useState<string>(value ? "url" : "upload");
  const [urlInput, setUrlInput] = useState(value);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadImage, isUploading } = useImageUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = await uploadImage(file);
    if (url) {
      onChange(url);
      setUrlInput(url);
    }
  };

  const handleUrlChange = (url: string) => {
    setUrlInput(url);
    onChange(url);
  };

  const handleClear = () => {
    onChange("");
    setUrlInput("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <Label>תמונה *</Label>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="w-4 h-4" />
            העלאה
          </TabsTrigger>
          <TabsTrigger value="url" className="gap-2">
            <Link className="w-4 h-4" />
            קישור
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="space-y-3">
          <div className="flex gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="flex-1"
            />
            {isUploading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          </div>
          <p className="text-xs text-muted-foreground">
            גודל מקסימלי: 5MB. פורמטים נתמכים: JPG, PNG, GIF, WebP
          </p>
        </TabsContent>
        
        <TabsContent value="url" className="space-y-3">
          <Input
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
            dir="ltr"
            placeholder="https://example.com/image.jpg"
          />
        </TabsContent>
      </Tabs>

      {value && (
        <div className="relative">
          <img
            src={value}
            alt="תצוגה מקדימה"
            className="w-full h-40 object-cover rounded-lg border"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 left-2 h-8 w-8"
            onClick={handleClear}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
