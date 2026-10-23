CREATE TABLE public.benchmark_profiles (
  key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL, linkedin_url text, person_for text, named_concepts text, how_visitors_become_followers text,
  is_self boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true);
GRANT SELECT, INSERT, UPDATE ON public.benchmark_profiles TO authenticated;
GRANT ALL ON public.benchmark_profiles TO service_role;
ALTER TABLE public.benchmark_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY allowed_read ON public.benchmark_profiles FOR SELECT TO authenticated USING (public.is_allowed_user());
CREATE POLICY allowed_insert ON public.benchmark_profiles FOR INSERT TO authenticated WITH CHECK (public.is_allowed_user());
CREATE POLICY allowed_update ON public.benchmark_profiles FOR UPDATE TO authenticated USING (public.is_allowed_user()) WITH CHECK (public.is_allowed_user());

CREATE TABLE public.benchmark_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  profile_key text NOT NULL REFERENCES public.benchmark_profiles(key), observed_on date NOT NULL,
  followers integer CHECK (followers >= 0), posts_per_week numeric CHECK (posts_per_week >= 0), cadence_text text,
  median_reactions numeric CHECK (median_reactions >= 0), median_comments numeric CHECK (median_comments >= 0), reactions_per_follower_pct numeric CHECK (reactions_per_follower_pct >= 0),
  headline_stake smallint CHECK (headline_stake BETWEEN 0 AND 2), banner_featured smallint CHECK (banner_featured BETWEEN 0 AND 2),
  conversion_device smallint CHECK (conversion_device BETWEEN 0 AND 2), one_story smallint CHECK (one_story BETWEEN 0 AND 2),
  topic_focus smallint CHECK (topic_focus BETWEEN 0 AND 2), owned_concept smallint CHECK (owned_concept BETWEEN 0 AND 2),
  substance_format smallint CHECK (substance_format BETWEEN 0 AND 2), cadence smallint CHECK (cadence BETWEEN 0 AND 2),
  conversation_audience smallint CHECK (conversation_audience BETWEEN 0 AND 2), authority_beyond smallint CHECK (authority_beyond BETWEEN 0 AND 2),
  framework_total integer, method text, raw_import_id uuid REFERENCES public.raw_imports(id));
GRANT SELECT ON public.benchmark_observations TO authenticated;
GRANT ALL ON public.benchmark_observations TO service_role;
ALTER TABLE public.benchmark_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY allowed_read ON public.benchmark_observations FOR SELECT TO authenticated USING (public.is_allowed_user());
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.benchmark_observations FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
ALTER TABLE public.benchmark_observations ENABLE ALWAYS TRIGGER immutable_history;

CREATE TABLE public.framework_criteria (
  key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), label text NOT NULL, criteria text, description text,
  max_score integer NOT NULL DEFAULT 2, sort_order integer NOT NULL DEFAULT 0);
GRANT SELECT ON public.framework_criteria TO authenticated;
GRANT ALL ON public.framework_criteria TO service_role;
ALTER TABLE public.framework_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY allowed_read ON public.framework_criteria FOR SELECT TO authenticated USING (public.is_allowed_user());

CREATE TABLE public.reference_benchmarks (
  key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), value numeric, unit text, description text, source text, as_of text);
GRANT SELECT ON public.reference_benchmarks TO authenticated;
GRANT ALL ON public.reference_benchmarks TO service_role;
ALTER TABLE public.reference_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY allowed_read ON public.reference_benchmarks FOR SELECT TO authenticated USING (public.is_allowed_user());

CREATE TABLE public.plan_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  key text NOT NULL, label text NOT NULL, baseline numeric, comparator text, target numeric, unit text,
  where_target_comes_from text, source_needed text, target_by date, plan text, raw_import_id uuid REFERENCES public.raw_imports(id));
GRANT SELECT ON public.plan_targets TO authenticated;
GRANT ALL ON public.plan_targets TO service_role;
ALTER TABLE public.plan_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY allowed_read ON public.plan_targets FOR SELECT TO authenticated USING (public.is_allowed_user());
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.plan_targets FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
ALTER TABLE public.plan_targets ENABLE ALWAYS TRIGGER immutable_history;

CREATE TABLE public.meeting_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  event_id text NOT NULL UNIQUE, start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, title text,
  domains text[] NOT NULL DEFAULT '{}', guest_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','dropped')),
  suggested_type text CHECK (suggested_type IN ('investor','rollup_operator','founder','other')), suggested_reason text,
  confirmed_type text CHECK (confirmed_type IN ('investor','rollup_operator','founder','other')),
  attribution text CHECK (attribution IN ('tracked_link','named_post','said_linkedin','unknown')),
  post_urn text REFERENCES public.posts(urn), lead_id uuid, decided_at timestamptz);
GRANT SELECT ON public.meeting_candidates TO authenticated;
GRANT ALL ON public.meeting_candidates TO service_role;
ALTER TABLE public.meeting_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY allowed_read ON public.meeting_candidates FOR SELECT TO authenticated USING (public.is_allowed_user());
CREATE FUNCTION public.protect_decided_meeting() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Meeting candidates are never deleted'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'A confirmed or dropped meeting cannot be changed'; END IF;
  IF NEW.event_id <> OLD.event_id OR NEW.start_at <> OLD.start_at OR NEW.end_at <> OLD.end_at THEN RAISE EXCEPTION 'Event identity cannot change'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_meeting BEFORE UPDATE OR DELETE ON public.meeting_candidates FOR EACH ROW EXECUTE FUNCTION public.protect_decided_meeting();
ALTER TABLE public.meeting_candidates ENABLE ALWAYS TRIGGER protect_meeting;

ALTER TABLE public.leads ADD COLUMN calendar_event_id text;
ALTER TABLE public.leads DROP CONSTRAINT leads_person_type_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_person_type_check CHECK (person_type IN ('investor','operator','other','founder','rollup_operator'));

INSERT INTO public.sources(key, label) VALUES ('google_calendar','Google Calendar'), ('benchmark_csv','Benchmark CSV') ON CONFLICT DO NOTHING;

-- Atomic configuration/benchmark import from one raw import (service role only).
CREATE FUNCTION public.commit_config_import(payload jsonb) RETURNS integer LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE n integer := 0; k text := payload->>'kind'; rid uuid := (payload->>'raw_import_id')::uuid; rows jsonb := COALESCE(payload->'rows','[]');
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 IF k = 'benchmark_profiles' THEN
  INSERT INTO public.benchmark_profiles(key,name,linkedin_url,person_for,named_concepts,how_visitors_become_followers,is_self,active)
  SELECT x.key,x.name,x.linkedin_url,x.person_for,x.named_concepts,x.how_visitors_become_followers,COALESCE(x.is_self,false),COALESCE(x.active,true)
  FROM jsonb_populate_recordset(NULL::public.benchmark_profiles, rows) x ON CONFLICT (key) DO NOTHING;
 ELSIF k = 'framework_criteria' THEN
  INSERT INTO public.framework_criteria(key,label,criteria,description,max_score,sort_order)
  SELECT x.key,x.label,x.criteria,x.description,x.max_score,x.sort_order FROM jsonb_populate_recordset(NULL::public.framework_criteria, rows) x ON CONFLICT (key) DO NOTHING;
 ELSIF k = 'reference_benchmarks' THEN
  INSERT INTO public.reference_benchmarks(key,value,unit,description,source,as_of)
  SELECT x.key,x.value,x.unit,x.description,x.source,x.as_of FROM jsonb_populate_recordset(NULL::public.reference_benchmarks, rows) x ON CONFLICT (key) DO NOTHING;
 ELSIF k = 'plan_targets' THEN
  INSERT INTO public.plan_targets(key,label,baseline,comparator,target,unit,where_target_comes_from,source_needed,target_by,plan,raw_import_id)
  SELECT x.key,x.label,x.baseline,x.comparator,x.target,x.unit,x.where_target_comes_from,x.source_needed,x.target_by,x.plan,rid FROM jsonb_populate_recordset(NULL::public.plan_targets, rows) x;
 ELSIF k = 'benchmark_observations' THEN
  INSERT INTO public.benchmark_observations(profile_key,observed_on,followers,posts_per_week,cadence_text,median_reactions,median_comments,reactions_per_follower_pct,
    headline_stake,banner_featured,conversion_device,one_story,topic_focus,owned_concept,substance_format,cadence,conversation_audience,authority_beyond,framework_total,method,raw_import_id)
  SELECT x.profile_key,x.observed_on,x.followers,x.posts_per_week,x.cadence_text,x.median_reactions,x.median_comments,x.reactions_per_follower_pct,
    x.headline_stake,x.banner_featured,x.conversion_device,x.one_story,x.topic_focus,x.owned_concept,x.substance_format,x.cadence,x.conversation_audience,x.authority_beyond,x.framework_total,x.method,rid
  FROM jsonb_populate_recordset(NULL::public.benchmark_observations, rows) x;
 ELSE RAISE EXCEPTION 'Unknown import kind %', k; END IF;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF COALESCE((payload->>'test_rollback')::boolean,false) THEN RAISE EXCEPTION 'Rolled back (test flag)'; END IF;
 UPDATE public.raw_imports ri SET status = 'parsed' WHERE ri.id = rid AND ri.status = 'received';
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.commit_config_import(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_config_import(jsonb) TO service_role;

CREATE OR REPLACE VIEW public.v_spot_checks WITH (security_invoker = true) AS
 SELECT ac.id, ac.checked_on, ac.sample_size, ac.strict_count, ac.broad_count, ac.none_count, ac.method_version, cs.source_key, cs.id AS snapshot_id,
    (SELECT gp.label FROM public.periods gp WHERE gp.kind = ANY (ARRAY['biweekly','baseline','history']) AND gp.label <> 'BASE' AND ac.checked_on >= gp.start_date AND ac.checked_on <= gp.end_date LIMIT 1) AS period_label,
    sp.label AS snapshot_period_label
   FROM public.audience_checks ac JOIN public.current_snapshots cs ON cs.id = ac.snapshot_id JOIN public.periods sp ON sp.id = cs.period_id;