set search_path = public;

-- SQL-language functions are body-checked at CREATE time, and the dump is
-- alphabetical - has_course_access calls has_role, which sorts after it.
-- Deferring body validation (exactly what pg_dump emits) makes order moot.
set check_function_bodies = off;

-- ======================================================================
-- FUNCTIONS
-- ======================================================================

CREATE OR REPLACE FUNCTION public.articles_set_slug()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = ''
     OR (TG_OP = 'UPDATE' AND NEW.title IS DISTINCT FROM OLD.title AND NEW.slug IS NOT DISTINCT FROM OLD.slug) THEN
    NEW.slug := public.unique_article_slug(NEW.title, NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_approved_comments(p_article_id uuid)
 RETURNS TABLE(id uuid, article_id uuid, author_name text, content text, is_approved boolean, created_at timestamp with time zone, approved_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    ac.id,
    ac.article_id,
    ac.author_name,
    ac.content,
    ac.is_approved,
    ac.created_at,
    ac.approved_at
  FROM public.article_comments ac
  WHERE ac.article_id = p_article_id
    AND ac.is_approved = true
  ORDER BY ac.created_at DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_article_daily_views(p_article_id uuid)
 RETURNS TABLE(view_date date, view_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    DATE(pv.viewed_at) as view_date,
    COUNT(*) as view_count
  FROM public.page_views pv
  WHERE pv.article_id = p_article_id
  GROUP BY DATE(pv.viewed_at)
  ORDER BY view_date DESC
  LIMIT 30;
$function$
;

CREATE OR REPLACE FUNCTION public.get_article_reaction_counts(p_article_id uuid)
 RETURNS TABLE(likes bigint, dislikes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*) FILTER (WHERE reaction_type = 'like')    AS likes,
    COUNT(*) FILTER (WHERE reaction_type = 'dislike') AS dislikes
  FROM public.article_reactions
  WHERE article_id = p_article_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_article_stats(p_article_id uuid)
 RETURNS TABLE(referrer text, view_count bigint, latest_view timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    COALESCE(pv.referrer, 'ישיר / לא ידוע') as referrer,
    COUNT(*) as view_count,
    MAX(pv.viewed_at) as latest_view
  FROM public.page_views pv
  WHERE pv.article_id = p_article_id
  GROUP BY pv.referrer
  ORDER BY view_count DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_article_view_counts()
 RETURNS TABLE(article_id uuid, view_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pv.article_id, COUNT(*) as view_count
  FROM public.page_views pv
  WHERE pv.article_id IS NOT NULL
  GROUP BY pv.article_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_course_outline(p_course_id uuid)
 RETURNS TABLE(id uuid, module_id uuid, course_id uuid, title text, description text, duration_minutes integer, is_free boolean, display_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, module_id, course_id, title, description, duration_minutes, is_free, display_order
  FROM public.course_lessons
  WHERE course_id = p_course_id
  ORDER BY display_order NULLS LAST;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_article_reaction(p_article_id uuid, p_session_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT reaction_type
  FROM public.article_reactions
  WHERE article_id = p_article_id
    AND session_id = p_session_id
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_widget_click_counts()
 RETURNS TABLE(widget_id uuid, click_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT wc.widget_id, count(*)::bigint AS click_count
  FROM public.widget_clicks wc
  GROUP BY wc.widget_id
$function$
;

CREATE OR REPLACE FUNCTION public.get_widget_view_counts()
 RETURNS TABLE(widget_id uuid, view_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT wi.widget_id, COUNT(*) as view_count
  FROM public.widget_impressions wi
  GROUP BY wi.widget_id;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_course_access(_user_id uuid, _course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.course_enrollments WHERE user_id = _user_id AND course_id = _course_id)
      OR public.has_role(_user_id,'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.redeem_course_coupon(p_course_id uuid, p_code text)
 RETURNS TABLE(valid boolean, discount_percent integer, grants_free_access boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.course_coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.course_coupons
    WHERE course_id = p_course_id AND lower(code) = lower(trim(p_code))
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, false, 'קוד קופון לא נמצא'::TEXT; RETURN;
  END IF;
  IF NOT c.is_active THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון אינו פעיל'::TEXT; RETURN;
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון פג תוקף'::TEXT; RETURN;
  END IF;
  IF c.max_uses IS NOT NULL AND c.uses_count >= c.max_uses THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון מוצה'::TEXT; RETURN;
  END IF;

  UPDATE public.course_coupons SET uses_count = uses_count + 1 WHERE id = c.id;

  RETURN QUERY SELECT true, c.discount_percent, c.grants_free_access, 'קופון מומש'::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.slugify_title(_title text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  s text;
BEGIN
  s := coalesce(_title, '');
  s := regexp_replace(s, '[^\w\u0590-\u05FF]+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := trim(both '-' from s);
  s := left(s, 80);
  s := trim(both '-' from s);
  IF s = '' THEN
    s := 'article';
  END IF;
  RETURN s;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_pending_comment(p_article_id uuid, p_author_name text, p_author_email text, p_content text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF p_article_id IS NULL OR coalesce(trim(p_author_name),'') = '' OR coalesce(trim(p_content),'') = '' THEN
    RAISE EXCEPTION 'invalid input';
  END IF;
  INSERT INTO public.article_comments(article_id, author_name, author_email, content)
  VALUES (p_article_id, left(p_author_name, 200), nullif(left(p_author_email, 200),''), left(p_content, 5000))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.submit_widget_form(p_widget_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF p_widget_id IS NULL OR p_data IS NULL THEN RAISE EXCEPTION 'invalid input'; END IF;
  INSERT INTO public.widget_form_submissions(widget_id, data)
  VALUES (p_widget_id, p_data) RETURNING id INTO new_id;
  RETURN new_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.subscribe_newsletter(p_email text, p_full_name text, p_phone text, p_interest_category text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF coalesce(trim(p_email),'') = '' THEN RAISE EXCEPTION 'invalid email'; END IF;
  INSERT INTO public.newsletter_subscribers(email, full_name, phone, interest_category)
  VALUES (lower(trim(p_email)), left(coalesce(p_full_name,''),200), nullif(left(coalesce(p_phone,''),50),''), left(coalesce(p_interest_category,'כללי'),100))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.toggle_article_reaction(p_article_id uuid, p_session_id text, p_reaction_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing text;
BEGIN
  IF p_reaction_type NOT IN ('like','dislike') THEN
    RAISE EXCEPTION 'invalid reaction_type';
  END IF;

  SELECT reaction_type INTO existing
  FROM public.article_reactions
  WHERE article_id = p_article_id AND session_id = p_session_id
  LIMIT 1;

  IF existing IS NULL THEN
    INSERT INTO public.article_reactions(article_id, session_id, reaction_type)
    VALUES (p_article_id, p_session_id, p_reaction_type);
    RETURN p_reaction_type;
  ELSIF existing = p_reaction_type THEN
    DELETE FROM public.article_reactions
    WHERE article_id = p_article_id AND session_id = p_session_id;
    RETURN NULL;
  ELSE
    DELETE FROM public.article_reactions
    WHERE article_id = p_article_id AND session_id = p_session_id;
    INSERT INTO public.article_reactions(article_id, session_id, reaction_type)
    VALUES (p_article_id, p_session_id, p_reaction_type);
    RETURN p_reaction_type;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unique_article_slug(_title text, _id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  base text := public.slugify_title(_title);
  candidate text := base;
  n int := 1;
BEGIN
  WHILE EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.slug = candidate AND (_id IS NULL OR a.id <> _id)
  ) LOOP
    n := n + 1;
    candidate := base || '-' || n::text;
  END LOOP;
  RETURN candidate;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_articles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_courses_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.validate_course_coupon(p_course_id uuid, p_code text)
 RETURNS TABLE(valid boolean, discount_percent integer, grants_free_access boolean, message text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c public.course_coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.course_coupons
    WHERE course_id = p_course_id AND lower(code) = lower(trim(p_code))
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, false, 'קוד קופון לא נמצא'::TEXT; RETURN;
  END IF;
  IF NOT c.is_active THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון אינו פעיל'::TEXT; RETURN;
  END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון פג תוקף'::TEXT; RETURN;
  END IF;
  IF c.max_uses IS NOT NULL AND c.uses_count >= c.max_uses THEN
    RETURN QUERY SELECT false, 0, false, 'הקופון מוצה'::TEXT; RETURN;
  END IF;

  RETURN QUERY SELECT true, c.discount_percent, c.grants_free_access, 'קופון תקף'::TEXT;
END;
$function$
;



-- ======================================================================
-- TRIGGERS
-- ======================================================================

drop trigger if exists update_articles_updated_at on public.articles;
CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON public.articles FOR EACH ROW EXECUTE FUNCTION update_articles_updated_at();

drop trigger if exists articles_set_slug_trg on public.articles;
CREATE TRIGGER articles_set_slug_trg BEFORE INSERT OR UPDATE OF title, slug ON public.articles FOR EACH ROW EXECUTE FUNCTION articles_set_slug();

drop trigger if exists update_categories_updated_at on public.categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_articles_updated_at();

drop trigger if exists update_course_coupons_updated_at on public.course_coupons;
CREATE TRIGGER update_course_coupons_updated_at BEFORE UPDATE ON public.course_coupons FOR EACH ROW EXECUTE FUNCTION update_courses_updated_at();

drop trigger if exists trg_courses_updated on public.courses;
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION update_courses_updated_at();

drop trigger if exists trg_events_updated on public.events;
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION update_courses_updated_at();

drop trigger if exists update_jobs_updated_at on public.jobs;
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION update_articles_updated_at();

drop trigger if exists update_products_updated_at on public.products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_courses_updated_at();




-- The dump was filtered to the public schema, so the trigger that actually
-- fires handle_new_user — it lives on auth.users — was never captured.
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();