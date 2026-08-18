-- Lead image carried by the feed item (rss.app and most modern feeds attach
-- one as media:content / enclosure). The worker mirrors it into the
-- article-images bucket and prefers it over AI generation, which is both
-- quota-limited and generic next to the actual editorial photo.
alter table public.ingest_items
  add column if not exists source_image_url text;
