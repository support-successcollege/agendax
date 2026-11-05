import { initialsOf } from "@/hooks/useAuthors";

type Props = {
  name: string;
  avatarUrl: string | null | undefined;
  photoAlt?: string;
  size: number;
  className?: string;
};

/**
 * A writer's round mark: the photo when there is one, otherwise their initials
 * in a circle. The initials are decorative (the name sits right beside them),
 * so they are hidden from screen readers.
 */
const WriterAvatar = ({
  name,
  avatarUrl,
  photoAlt = "",
  size,
  className = "",
}: Props) => {
  const style = { width: size, height: size };
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={photoAlt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        style={style}
        className={`shrink-0 rounded-full bg-surface-1 object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.38) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-black text-primary ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
};

export default WriterAvatar;
