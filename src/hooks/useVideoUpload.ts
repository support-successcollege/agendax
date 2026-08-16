import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/ogg"];
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

export const useVideoUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const uploadVideo = async (file: File): Promise<string | null> => {
    if (!file) return null;

    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      toast({
        title: "שגיאה",
        description: "פורמטים נתמכים: MP4, WebM, OGG",
        variant: "destructive",
      });
      return null;
    }

    if (file.size > MAX_VIDEO_SIZE) {
      toast({
        title: "שגיאה",
        description: "גודל הסרטון המקסימלי הוא 100MB",
        variant: "destructive",
      });
      return null;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `videos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("article-videos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from("article-videos")
        .getPublicUrl(filePath);

      toast({
        title: "הסרטון הועלה בהצלחה",
      });

      return publicUrl.publicUrl;
    } catch (error) {
      console.error("Error uploading video:", error);
      toast({
        title: "שגיאה בהעלאת הסרטון",
        description: "נסה שוב מאוחר יותר",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadVideo, isUploading };
};
