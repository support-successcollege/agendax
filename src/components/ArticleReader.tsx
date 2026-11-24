import { useState, useEffect, useCallback, useRef } from "react";
import { Volume2, VolumeX, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ArticleReaderProps {
  title: string;
  excerpt: string;
  content: string;
}

const stripHtml = (html: string): string => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
};

const ArticleReader = ({ title, excerpt, content }: ArticleReaderProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  // Assumed supported until the browser says otherwise, so the prerendered
  // page already holds the button. Starting from "unsupported" rendered
  // nothing on the server; the button then appeared after hydration, wrapped
  // the byline row on a phone and pushed the article down by a line.
  const [isSupported, setIsSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setIsSupported("speechSynthesis" in window);
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handlePlay = useCallback(() => {
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    window.speechSynthesis.cancel();

    const plainContent = stripHtml(content);
    const fullText = `${title}. ${excerpt}. ${plainContent}`;

    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = "he-IL";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  }, [title, excerpt, content, isPaused]);

  const handlePause = useCallback(() => {
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  // Without speech synthesis the button is hidden but keeps its box, so
  // nothing moves once the check has run.
  return (
    <div
      className={`flex items-center gap-2${isSupported ? "" : " invisible"}`}
      aria-hidden={isSupported ? undefined : true}
    >
      {isPlaying ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handlePause}
          className="flex items-center gap-2 text-sm"
        >
          <Pause className="w-4 h-4" />
          השהה הקראה
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handlePlay}
          className="flex items-center gap-2 text-sm"
        >
          <Volume2 className="w-4 h-4" />
          {isPaused ? "המשך הקראה" : "הקראת הכתבה"}
        </Button>
      )}
      {(isPlaying || isPaused) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleStop}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <VolumeX className="w-4 h-4" />
          עצור
        </Button>
      )}
    </div>
  );
};

export default ArticleReader;
