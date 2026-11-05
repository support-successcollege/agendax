import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SYSTEM_AUTHOR_SLUG, useAllAuthors } from "@/hooks/useAuthors";

type Props = {
  id?: string;
  value: string | null | undefined;
  /** Called with the writer's slug and display name, which the byline prints. */
  onChange: (slug: string, name: string) => void;
};

/**
 * Picks an article's writer from the roster. The byline text is the writer's
 * name, never typed by hand, so a rename in the panel reaches every story.
 * No choice means the newsroom byline.
 */
const WriterSelect = ({ id, value, onChange }: Props) => {
  const { data: authors } = useAllAuthors();
  return (
    <Select
      value={value || SYSTEM_AUTHOR_SLUG}
      onValueChange={(slug) =>
        onChange(slug, authors?.find((a) => a.slug === slug)?.name ?? "")
      }
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="מערכת AGENDAX" />
      </SelectTrigger>
      <SelectContent>
        {(authors ?? []).map((author) => (
          <SelectItem key={author.slug} value={author.slug}>
            {author.name}
            {!author.isActive ? " (לא פעיל)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default WriterSelect;
