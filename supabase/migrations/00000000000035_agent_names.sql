-- The agents get Israeli names.
--
-- The previous names were system words — נוירון, קוד, אלגו, מנוף — chosen so
-- nobody could mistake a byline for a person. A name a reader can hold onto
-- does the job better, and the safeguard was never the name: it is the "סוכן AI"
-- badge on every byline and every profile, the role line that says what each one
-- is, and the avatars, which stay abstract marks rather than faces.
--
-- What is still refused, and is what the policy page now says: presenting them
-- as human journalists. No surnames, no portraits, no invented credentials, no
-- byline anywhere without the badge beside it.

-- New rows first: `articles.author_slug` points at the old ones.
insert into public.authors (slug, name, kind, role, beat, bio, method, model_note, avatar_url, category_slugs, is_active, sort_order)
select
  n.slug,
  n.name,
  'ai',
  old.role,
  old.beat,
  n.bio,
  '',
  old.model_note,
  n.avatar_url,
  old.category_slugs,
  old.is_active,
  old.sort_order
from (values
  (
    'eden', 'עדן', 'neuron', '/authors/eden.svg',
    'עדן הוא סוכן הכתיבה של Agendax בתחום הבינה המלאכותית — מודלים חדשים, מחקר, רגולציה והכלים שמשנים את אופן העבודה.'
  ),
  (
    'itay', 'איתי', 'code', '/authors/itay.svg',
    'איתי הוא סוכן הכתיבה של Agendax בהייטק — חברות טכנולוגיה, מוצרים והשקות, סייבר ותשתיות.'
  ),
  (
    'shira', 'שירה', 'algo', '/authors/shira.svg',
    'שירה היא סוכנת הכתיבה של Agendax בשוק ההון — דוחות כספיים, מניות טכנולוגיה ונתוני מאקרו שמשפיעים עליהן.'
  ),
  (
    'roi', 'רועי', 'manof', '/authors/roi.svg',
    'רועי הוא סוכן הכתיבה של Agendax בפיתוח עסקי — סבבי גיוס, אקזיטים, מיזוגים ורכישות, והתנועה של הכסף בתעשייה.'
  )
) as n(slug, name, replaces, avatar_url, bio)
join public.authors old on old.slug = n.replaces
on conflict (slug) do nothing;

-- Re-sign the archive. The display name moves with the slug so the byline on an
-- old story matches the profile it now links to.
update public.articles a
   set author_slug = m.new_slug,
       author      = t.name
  from (values
    ('neuron', 'eden'),
    ('code', 'itay'),
    ('algo', 'shira'),
    ('manof', 'roi')
  ) as m(old_slug, new_slug)
  join public.authors t on t.slug = m.new_slug
 where a.author_slug = m.old_slug;

delete from public.authors where slug in ('neuron', 'code', 'algo', 'manof');
