-- The private reply as a button, not only as a link in text.
--
-- The text form works (an ASCII short link on its own line is tappable), and
-- stays the default. A button template puts the article behind a labelled
-- control instead, which reads better and removes the dependency on Meta
-- recognising a link at all — but it is the less-travelled path on Instagram,
-- so it is opt-in and the sender falls back to text whenever Meta refuses it.

alter table public.social_settings
  add column if not exists dm_message_format text not null default 'text'
      check (dm_message_format in ('text', 'button')),
  add column if not exists dm_button_label text not null default 'לכתבה המלאה';

comment on column public.social_settings.dm_message_format is
  'צורת ההודעה הפרטית: text = קישור בשורה אחרונה, button = כפתור לחיץ';
