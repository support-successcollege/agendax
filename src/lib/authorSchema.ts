import { absoluteAvatarUrl, type AuthorKind } from "@/hooks/useAuthors";

const SITE_URL = "https://agendax.co.il";

type SchemaAuthor = {
  slug: string;
  name: string;
  kind: AuthorKind;
  avatarUrl?: string | null;
};

export const authorUrl = (slug: string) => `${SITE_URL}/author/${slug}`;

/**
 * The schema.org entity behind a byline, shared by NewsArticle.author and the
 * ProfilePage mainEntity so both point at the same @id.
 *
 * A human writer is a Person. An AI agent and the newsroom byline are
 * Organizations: there is no schema.org type for "software that writes", and
 * of the two that `author` accepts, Person would be a false claim on every one
 * of those stories.
 */
export const authorEntity = (author: SchemaAuthor) => {
  const url = authorUrl(author.slug);
  const image = absoluteAvatarUrl(author.avatarUrl ?? null);
  if (author.kind === "human") {
    return {
      "@type": "Person",
      "@id": `${url}#person`,
      name: author.name,
      url,
      image,
    };
  }
  return {
    "@type": "Organization",
    "@id": `${url}#${author.kind === "system" ? "organization" : "agent"}`,
    name: author.name,
    url,
    logo: image,
  };
};
