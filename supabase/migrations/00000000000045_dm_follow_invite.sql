-- The invitation to follow, alongside the article rather than instead of it.
--
-- Asking whether a commenter already follows the account is possible — Meta
-- exposes is_user_follow_business — but reading it needs Advanced Access to
-- instagram_manage_messages, which this app does not have, and Facebook has no
-- equivalent at all. Withholding the article until someone follows would also
-- be the one moment they are most likely to leave: they commented, so they
-- already want it.
--
-- So the reply carries both: what was asked for, and a line (or a second
-- button) inviting the reader to stay. Empty = no invitation.

alter table public.social_settings
  add column if not exists dm_follow_invite text not null default 'עקבו אחרינו כדי לא לפספס את הבאות 👇',
  add column if not exists dm_follow_button_label text not null default 'עקבו אחרינו';

comment on column public.social_settings.dm_follow_invite is
  'שורת ההזמנה לעקוב בהודעה הפרטית. ריק = בלי הזמנה';
