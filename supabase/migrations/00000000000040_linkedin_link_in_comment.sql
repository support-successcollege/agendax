-- מיגרציה 40: ניסוי לינקדאין - הקישור לכתבה בתגובה הראשונה במקום בגוף הפוסט.
--
-- למה: 146 פוסטים בלינקדאין ב-30 יום הביאו 2 ביקורים. לינקדאין מדכא בפיד
-- פוסטים שנושאים קישור חיצוני בגוף. הניסוי (14 יום מיום ההפעלה): פוסט
-- תמונה + טקסט בלי URL, ומיד אחריו תגובה מהחשבון עצמו עם הקישור.
--
-- מה: דגל social_settings.linkedin_link_in_comment (ברירת מחדל true).
-- social-publish קורא אותו לפני כל פוסט לינקדאין. כיבוי הניסוי = update
-- לשורה id=1 ל-false, בלי פריסה מחדש.

alter table public.social_settings
  add column if not exists linkedin_link_in_comment boolean not null default true;

comment on column public.social_settings.linkedin_link_in_comment is
  'לינקדאין: הקישור לכתבה נשלח כתגובה ראשונה מהחשבון במקום בגוף הפוסט (ניסוי, ספטמבר 2026)';
