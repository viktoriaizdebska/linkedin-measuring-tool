INSERT INTO public.sources(key,label) VALUES ('benchmark_drive','Benchmark snapshot from Drive') ON CONFLICT (key) DO NOTHING;
ALTER TABLE public.raw_imports ADD COLUMN IF NOT EXISTS drive_file_id text, ADD COLUMN IF NOT EXISTS drive_file_name text, ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE public.raw_imports DROP CONSTRAINT raw_imports_status_check;
ALTER TABLE public.raw_imports ADD CONSTRAINT raw_imports_status_check CHECK (status = ANY (ARRAY['received','parsed','rejected','already imported']));
CREATE INDEX IF NOT EXISTS raw_imports_drive_file_idx ON public.raw_imports(drive_file_id);

CREATE OR REPLACE FUNCTION public.commit_config_import(payload jsonb)
 RETURNS integer LANGUAGE plpgsql SET search_path TO ''
AS $function$
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
  -- Rows whose profile and observed_on already exist are skipped, not errors.
  INSERT INTO public.benchmark_observations(profile_key,observed_on,followers,posts_per_week,cadence_text,median_reactions,median_comments,reactions_per_follower_pct,
    headline_stake,banner_featured,conversion_device,one_story,topic_focus,owned_concept,substance_format,cadence,conversation_audience,authority_beyond,framework_total,method,raw_import_id)
  SELECT x.profile_key,x.observed_on,x.followers,x.posts_per_week,x.cadence_text,x.median_reactions,x.median_comments,x.reactions_per_follower_pct,
    x.headline_stake,x.banner_featured,x.conversion_device,x.one_story,x.topic_focus,x.owned_concept,x.substance_format,x.cadence,x.conversation_audience,x.authority_beyond,x.framework_total,x.method,rid
  FROM jsonb_populate_recordset(NULL::public.benchmark_observations, rows) x
  WHERE NOT EXISTS (SELECT 1 FROM public.benchmark_observations b WHERE b.profile_key = x.profile_key AND b.observed_on = x.observed_on);
 ELSE RAISE EXCEPTION 'Unknown import kind %', k; END IF;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF COALESCE((payload->>'test_rollback')::boolean,false) THEN RAISE EXCEPTION 'Rolled back (test flag): % rows', n; END IF;
 UPDATE public.raw_imports ri SET status = CASE WHEN n = 0 AND k = 'benchmark_observations' THEN 'already imported' ELSE 'parsed' END WHERE ri.id = rid AND ri.status = 'received';
 RETURN n;
END $function$;
REVOKE ALL ON FUNCTION public.commit_config_import(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_config_import(jsonb) TO service_role;