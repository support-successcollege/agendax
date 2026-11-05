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
 * A staff writer is a Person. The newsroom byline is an Organization.
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
    "@id": `${url}#organization`,
    name: author.name,
    url,
    logo: image,
  };
};
