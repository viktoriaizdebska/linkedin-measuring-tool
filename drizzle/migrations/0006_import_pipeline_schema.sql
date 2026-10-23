-- Additive schema for the LinkedIn export pipeline.
ALTER TABLE public.periods DROP CONSTRAINT periods_kind_check;
ALTER TABLE public.periods ADD CONSTRAINT periods_kind_check CHECK (kind = ANY (ARRAY['biweekly','baseline','history','window']));
ALTER TABLE public.periods DROP CONSTRAINT periods_two_week;
ALTER TABLE public.periods ADD CONSTRAINT periods_two_week CHECK (label = 'BASE' OR kind = 'window' OR end_date = start_date + 13);
ALTER TABLE public.periods DROP CONSTRAINT periods_monday_sunday;
ALTER TABLE public.periods ADD CONSTRAINT periods_monday_sunday CHECK (label = 'BASE' OR kind = 'window' OR (EXTRACT(isodow FROM start_date) = 1 AND EXTRACT(isodow FROM end_date) = 7));
ALTER TABLE public.periods ADD CONSTRAINT periods_window_order CHECK (kind <> 'window' OR end_date >= start_date);

ALTER TABLE public.post_observations DROP CONSTRAINT post_observations_obs_window_check;
ALTER TABLE public.post_observations ADD CONSTRAINT post_observations_obs_window_check CHECK (obs_window = ANY (ARRAY['lifetime','days_0_28','export_range']));
ALTER TABLE public.post_observations ADD COLUMN engagements integer;

ALTER TABLE public.audience_observations ADD COLUMN label_raw text;
ALTER TABLE public.audience_observations ADD COLUMN below_one_pct boolean;
ALTER TABLE public.audience_observations ALTER COLUMN share_pct DROP NOT NULL;
ALTER TABLE public.audience_observations ADD CONSTRAINT audience_share_or_below_one CHECK (share_pct IS NOT NULL OR below_one_pct IS TRUE);
ALTER TABLE public.audience_observations DROP CONSTRAINT audience_observations_dimension_check;
ALTER TABLE public.audience_observations ADD CONSTRAINT audience_observations_dimension_check CHECK (dimension = ANY (ARRAY['job_title','seniority','industry','location','company_size','company']));

-- Insert-only alias table: export share/ugcPost/groupPost URNs -> canonical posts.
CREATE TABLE public.post_aliases (
  alias_urn text PRIMARY KEY,
  post_urn text NOT NULL REFERENCES public.posts(urn),
  method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.post_aliases TO authenticated;
GRANT ALL ON public.post_aliases TO service_role;
ALTER TABLE public.post_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY allowed_read ON public.post_aliases FOR SELECT TO authenticated USING (public.is_allowed_user());
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON public.post_aliases FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
ALTER TABLE public.post_aliases ENABLE ALWAYS TRIGGER immutable_history;

-- Source precedence: complete before partial, then api, export, manual, baseline, then newest.
CREATE VIEW public.v_ranked_snapshots WITH (security_invoker = true) AS
SELECT cs.*,
  CASE WHEN cs.completeness = 'complete' THEN 0 ELSE 1 END AS complete_rank,
  CASE cs.source_key WHEN 'linkedin_api' THEN 1 WHEN 'linkedin_export' THEN 2 WHEN 'manual' THEN 3 WHEN 'baseline_2026_10_08' THEN 4 ELSE 5 END AS source_rank
FROM public.current_snapshots cs;

CREATE OR REPLACE VIEW public.v_period_followers WITH (security_invoker = true) AS
WITH win AS (
  SELECT DISTINCT ON (rs.period_id) rs.* FROM public.v_ranked_snapshots rs
  WHERE EXISTS (SELECT 1 FROM public.follower_daily f WHERE f.snapshot_id = rs.id)
  ORDER BY rs.period_id, rs.complete_rank, rs.source_rank, rs.captured_at DESC, rs.created_at DESC)
SELECT p.id AS period_id, p.label, p.kind, p.start_date, p.end_date, w.source_key,
  sum(f.new_followers)::int AS new_followers,
  count(DISTINCT f.date)::int AS days_covered,
  (p.end_date - p.start_date + 1) AS days_in_period,
  (w.completeness = 'complete' AND count(DISTINCT f.date) = (p.end_date - p.start_date + 1)) AS is_complete
FROM win w JOIN public.periods p ON p.id = w.period_id
JOIN public.follower_daily f ON f.snapshot_id = w.id AND f.date BETWEEN p.start_date AND p.end_date
GROUP BY p.id, p.label, p.kind, p.start_date, p.end_date, w.source_key, w.completeness;

CREATE OR REPLACE VIEW public.v_post_metrics WITH (security_invoker = true) AS
SELECT DISTINCT ON (po.urn)
  po.urn, po.published_at, po.url, po.format, po.topic, po.pillar_key, po.hook,
  o.observed_at, o.age_days, o.obs_window, cs.source_key,
  o.impressions, o.followers_gained, o.profile_views, o.saves, o.reposts,
  CASE WHEN o.impressions > 0 AND o.followers_gained IS NOT NULL THEN o.followers_gained * 1000.0 / o.impressions END AS followers_per_1000,
  CASE WHEN o.impressions > 0 AND o.saves IS NOT NULL AND o.reposts IS NOT NULL THEN (o.saves + o.reposts) * 1000.0 / o.impressions END AS saves_reposts_per_1000
FROM public.posts po
JOIN public.post_observations o ON o.post_urn = po.urn AND o.obs_window IN ('lifetime','days_0_28')
JOIN public.current_snapshots cs ON cs.id = o.snapshot_id
ORDER BY po.urn, o.observed_at DESC, o.created_at DESC;

CREATE OR REPLACE VIEW public.v_audience_latest WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT ao.*, rs.source_key, rs.captured_at,
    rank() OVER (PARTITION BY ao.scope, ao.dimension ORDER BY rs.captured_at DESC, rs.source_rank, rs.created_at DESC, rs.id) AS rk
  FROM public.audience_observations ao JOIN public.v_ranked_snapshots rs ON rs.id = ao.snapshot_id)
SELECT scope, dimension, label, share_pct, source_key, captured_at FROM ranked WHERE rk = 1;

CREATE OR REPLACE VIEW public.v_leads_by_period WITH (security_invoker = true) AS
WITH lead_snaps AS (
  SELECT cs.id, cs.source_key, bp.start_date, bp.end_date
  FROM public.current_snapshots cs JOIN public.periods bp ON bp.id = cs.period_id
  WHERE EXISTS (SELECT 1 FROM public.leads l WHERE l.snapshot_id = cs.id)
     OR EXISTS (SELECT 1 FROM public.raw_imports ri WHERE ri.id = cs.raw_import_id AND ri.payload->>'entry_type' IN ('lead','lead_removal')))
SELECT p.id AS period_id, p.label, p.kind, p.start_date, p.end_date,
  string_agg(DISTINCT ls.source_key, ',') AS source_key,
  count(l.id)::int AS leads,
  count(l.id) FILTER (WHERE l.kind = 'meeting')::int AS meetings,
  count(l.id) FILTER (WHERE l.kind = 'inquiry')::int AS inquiries,
  count(l.id) FILTER (WHERE l.kind = 'intro')::int AS intros,
  bool_or(p.start_date >= ls.start_date AND p.end_date <= ls.end_date) AS fully_covered
FROM public.periods p
JOIN lead_snaps ls ON p.start_date <= ls.end_date AND p.end_date >= ls.start_date
LEFT JOIN public.leads l ON l.snapshot_id = ls.id AND l.date BETWEEN p.start_date AND p.end_date
GROUP BY p.id, p.label, p.kind, p.start_date, p.end_date;

CREATE VIEW public.v_period_impressions WITH (security_invoker = true) AS
WITH daily_win AS (
  SELECT DISTINCT ON (rs.period_id) rs.* FROM public.v_ranked_snapshots rs
  JOIN public.periods p ON p.id = rs.period_id
  WHERE EXISTS (SELECT 1 FROM public.account_metrics a WHERE a.snapshot_id = rs.id AND a.metric_key IN ('impressions','engagements') AND a.window_start = a.window_end)
  ORDER BY rs.period_id, rs.complete_rank, rs.source_rank, rs.captured_at DESC, rs.created_at DESC),
daily AS (
  SELECT w.period_id, w.source_key,
    sum(a.value) FILTER (WHERE a.metric_key = 'impressions') AS impressions,
    sum(a.value) FILTER (WHERE a.metric_key = 'engagements') AS engagements,
    count(DISTINCT a.window_start) FILTER (WHERE a.metric_key = 'impressions')::int AS days_covered
  FROM daily_win w JOIN public.periods p ON p.id = w.period_id
  JOIN public.account_metrics a ON a.snapshot_id = w.id AND a.window_start = a.window_end AND a.window_start BETWEEN p.start_date AND p.end_date AND a.metric_key IN ('impressions','engagements')
  GROUP BY w.period_id, w.source_key),
range_win AS (
  SELECT DISTINCT ON (rs.period_id) rs.* FROM public.v_ranked_snapshots rs
  JOIN public.periods p ON p.id = rs.period_id
  WHERE EXISTS (SELECT 1 FROM public.account_metrics a WHERE a.snapshot_id = rs.id AND a.metric_key IN ('impressions','members_reached') AND a.window_start = p.start_date AND a.window_end = p.end_date AND p.start_date <> p.end_date)
  ORDER BY rs.period_id, rs.complete_rank, rs.source_rank, rs.captured_at DESC, rs.created_at DESC),
rng AS (
  SELECT w.period_id, w.source_key, w.completeness,
    max(a.value) FILTER (WHERE a.metric_key = 'impressions') AS impressions,
    max(a.value) FILTER (WHERE a.metric_key = 'members_reached') AS members_reached
  FROM range_win w JOIN public.periods p ON p.id = w.period_id
  JOIN public.account_metrics a ON a.snapshot_id = w.id AND a.window_start = p.start_date AND a.window_end = p.end_date AND a.metric_key IN ('impressions','members_reached')
  GROUP BY w.period_id, w.source_key, w.completeness)
SELECT p.id AS period_id, p.label, p.kind, p.start_date, p.end_date,
  d.source_key AS daily_source, d.impressions AS daily_impressions, d.engagements AS daily_engagements, d.days_covered,
  (d.days_covered = (p.end_date - p.start_date + 1)) AS daily_complete,
  r.source_key AS range_source, r.impressions AS range_impressions, r.members_reached AS range_members_reached,
  (r.completeness = 'complete') AS range_complete
FROM public.periods p
LEFT JOIN daily d ON d.period_id = p.id
LEFT JOIN rng r ON r.period_id = p.id
WHERE d.period_id IS NOT NULL OR r.period_id IS NOT NULL;

CREATE VIEW public.v_period_audience WITH (security_invoker = true) AS
WITH win AS (
  SELECT DISTINCT ON (rs.period_id, sc.scope) rs.*, sc.scope FROM public.v_ranked_snapshots rs
  CROSS JOIN (VALUES ('followers'), ('content_viewers')) sc(scope)
  WHERE EXISTS (SELECT 1 FROM public.audience_observations ao WHERE ao.snapshot_id = rs.id AND ao.scope = sc.scope)
  ORDER BY rs.period_id, sc.scope, rs.complete_rank, rs.source_rank, rs.captured_at DESC, rs.created_at DESC)
SELECT p.id AS period_id, p.label AS period_label, p.kind AS period_kind, w.scope, ao.dimension, ao.label, ao.label_raw,
  ao.share_pct, ao.below_one_pct, w.source_key, w.completeness, w.captured_at
FROM win w JOIN public.periods p ON p.id = w.period_id
JOIN public.audience_observations ao ON ao.snapshot_id = w.id AND ao.scope = w.scope;

CREATE VIEW public.v_period_posts WITH (security_invoker = true) AS
WITH win AS (
  SELECT DISTINCT ON (rs.period_id) rs.* FROM public.v_ranked_snapshots rs
  WHERE EXISTS (SELECT 1 FROM public.post_observations o WHERE o.snapshot_id = rs.id AND o.obs_window = 'export_range')
  ORDER BY rs.period_id, rs.complete_rank, rs.source_rank, rs.captured_at DESC, rs.created_at DESC)
SELECT p.id AS period_id, p.label AS period_label, po.urn, po.published_at, po.url, po.hook, po.format, po.topic,
  o.impressions, o.engagements, o.observed_at, o.age_days, w.source_key
FROM win w JOIN public.periods p ON p.id = w.period_id
JOIN public.post_observations o ON o.snapshot_id = w.id AND o.obs_window = 'export_range'
JOIN public.posts po ON po.urn = o.post_urn;

CREATE VIEW public.v_spot_checks WITH (security_invoker = true) AS
SELECT ac.id, ac.checked_on, ac.sample_size, ac.strict_count, ac.broad_count, ac.none_count, ac.method_version, cs.source_key, cs.id AS snapshot_id,
  (SELECT gp.label FROM public.periods gp WHERE gp.kind IN ('biweekly','baseline','history') AND gp.label <> 'BASE' AND ac.checked_on BETWEEN gp.start_date AND gp.end_date LIMIT 1) AS period_label
FROM public.audience_checks ac JOIN public.current_snapshots cs ON cs.id = ac.snapshot_id;

CREATE VIEW public.v_manual_leads WITH (security_invoker = true) AS
SELECT l.id, l.date, l.kind, l.person_type, l.attribution, l.post_urn, l.note, cs.id AS snapshot_id, cs.period_id, p.label AS period_label
FROM public.leads l JOIN public.current_snapshots cs ON cs.id = l.snapshot_id AND cs.source_key = 'manual'
JOIN public.periods p ON p.id = cs.period_id;

GRANT SELECT ON public.v_ranked_snapshots, public.v_period_impressions, public.v_period_audience, public.v_period_posts, public.v_spot_checks, public.v_manual_leads TO authenticated, service_role;

-- Run bookkeeping (service role only). Runs are committed before any parsing.
CREATE FUNCTION public.run_start(p_trigger text, p_period uuid, p_workflow text) RETURNS uuid LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE rid uuid := gen_random_uuid();
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.agent_runs(id, trigger, period_id, input_key, status, workflow_version, started_at)
 VALUES (rid, p_trigger, p_period, 'pending:' || rid, 'running', p_workflow, now());
 RETURN rid;
END $$;

CREATE FUNCTION public.run_lock(p_run uuid) RETURNS boolean LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE n int;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 UPDATE public.schedule_state SET lock_run_id = p_run, lock_expires_at = now() + interval '30 minutes'
 WHERE lock_run_id IS NULL OR lock_expires_at < now() OR lock_run_id = p_run;
 GET DIAGNOSTICS n = ROW_COUNT; RETURN n > 0;
END $$;

CREATE FUNCTION public.run_claim_key(p_run uuid, p_key text, p_claim boolean) RETURNS uuid LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE existing uuid;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 SELECT id INTO existing FROM public.agent_runs WHERE input_key = p_key AND status = 'succeeded' LIMIT 1;
 IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF p_claim THEN
  UPDATE public.agent_runs SET input_key = p_key,
   attempt = (SELECT COALESCE(max(attempt), 0) + 1 FROM public.agent_runs WHERE input_key = p_key)
  WHERE id = p_run;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION public.run_step(p_run uuid, p_step text, p_status text, p_started timestamptz, p_message text, p_details jsonb) RETURNS void LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.run_steps(run_id, step, status, started_at, finished_at, message, details) VALUES (p_run, p_step, p_status, p_started, now(), p_message, p_details);
END $$;

CREATE FUNCTION public.run_finish(p_run uuid, p_status text, p_summary text, p_issues jsonb, p_raw_ids uuid[], p_raw_status text, p_records_read int) RETURNS void LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 UPDATE public.agent_runs SET status = p_status, finished_at = now(),
   duration_ms = CASE WHEN started_at IS NULL THEN NULL ELSE (extract(epoch FROM (now() - started_at)) * 1000)::bigint END,
   error_count = (SELECT count(*) FROM jsonb_array_elements(COALESCE(p_issues, '[]')) x WHERE x->>'severity' = 'blocker') + CASE WHEN p_status IN ('failed','needs_attention') THEN 1 ELSE 0 END,
   records_read = COALESCE(p_records_read, records_read), records_written = COALESCE(records_written, 0), changes_summary = p_summary
 WHERE id = p_run AND status IN ('running','waiting_for_data');
 INSERT INTO public.data_quality_issues(run_id, severity, rule, subject, message)
 SELECT p_run, x->>'severity', x->>'rule', x->>'subject', x->>'message' FROM jsonb_array_elements(COALESCE(p_issues, '[]')) x;
 IF p_raw_status IS NOT NULL THEN UPDATE public.raw_imports SET status = p_raw_status WHERE id = ANY(p_raw_ids) AND status = 'received'; END IF;
 UPDATE public.schedule_state SET lock_run_id = NULL, lock_expires_at = NULL WHERE lock_run_id = p_run;
END $$;

CREATE FUNCTION public.register_raw_import(p_source text, p_path text, p_sha text, p_from text, p_hint text, p_payload jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE rid uuid;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.raw_imports(source_key, storage_path, sha256, received_from, status, period_hint, payload)
 VALUES (p_source, p_path, p_sha, p_from, 'received', p_hint, p_payload) ON CONFLICT (sha256) DO NOTHING RETURNING id INTO rid;
 RETURN rid;
END $$;

-- One transaction for everything a run writes: new periods, posts, aliases, snapshots, KPI values, summary, issues.
CREATE FUNCTION public.commit_run(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r public.agent_runs; snap jsonb; ids uuid[] := '{}'; n_kpi int := 0; n_sum int := 0; st timestamptz := now();
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'Only service_role may commit runs' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.agent_runs WHERE id = (payload->>'run_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent_runs row not found'; END IF;
 IF r.status <> 'running' THEN RAISE EXCEPTION 'Run is already finalized'; END IF;
 IF payload->>'final_status' NOT IN ('succeeded','partial') THEN RAISE EXCEPTION 'Invalid final_status'; END IF;
 INSERT INTO public.periods(id, label, kind, start_date, end_date)
 SELECT x.id, x.label, x.kind, x.start_date, x.end_date FROM jsonb_populate_recordset(NULL::public.periods, COALESCE(payload->'periods','[]')) x
 ON CONFLICT DO NOTHING;
 INSERT INTO public.posts(urn, published_at, url, format, hook, length_chars, visual, link_position, pillar_key, topic, named_person, concept, content_item_id)
 SELECT x.urn, x.published_at, x.url, x.format, x.hook, x.length_chars, x.visual, x.link_position, x.pillar_key, x.topic, x.named_person, x.concept, x.content_item_id
 FROM jsonb_populate_recordset(NULL::public.posts, COALESCE(payload->'posts','[]')) x ON CONFLICT (urn) DO NOTHING;
 INSERT INTO public.post_aliases(alias_urn, post_urn, method)
 SELECT x.alias_urn, x.post_urn, x.method FROM jsonb_populate_recordset(NULL::public.post_aliases, COALESCE(payload->'aliases','[]')) x ON CONFLICT DO NOTHING;
 FOR snap IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'snapshots','[]')) LOOP
  ids := ids || public.commit_snapshot(snap || '{"finalize":false}'::jsonb);
 END LOOP;
 INSERT INTO public.kpi_values(run_id, period_id, kpi_key, formula_version, kind, value, vs_previous, vs_28_days, vs_12_weeks, vs_baseline)
 SELECT r.id, x.period_id, x.kpi_key, x.formula_version, x.kind, x.value, x.vs_previous, x.vs_28_days, x.vs_12_weeks, x.vs_baseline
 FROM jsonb_populate_recordset(NULL::public.kpi_values, COALESCE(payload->'kpi_values','[]')) x;
 GET DIAGNOSTICS n_kpi = ROW_COUNT;
 INSERT INTO public.period_summaries(run_id, period_id, summary, model, prompt_version, tokens_used)
 SELECT r.id, x.period_id, x.summary, x.model, x.prompt_version, x.tokens_used
 FROM jsonb_populate_recordset(NULL::public.period_summaries, COALESCE(payload->'period_summaries','[]')) x;
 GET DIAGNOSTICS n_sum = ROW_COUNT;
 INSERT INTO public.data_quality_issues(run_id, severity, rule, subject, message)
 SELECT r.id, x->>'severity', x->>'rule', x->>'subject', x->>'message' FROM jsonb_array_elements(COALESCE(payload->'issues','[]')) x;
 UPDATE public.raw_imports SET status = 'parsed' WHERE id IN (SELECT (v #>> '{}')::uuid FROM jsonb_array_elements(COALESCE(payload->'raw_import_ids','[]')) v) AND status = 'received';
 IF COALESCE((payload->>'test_crash')::boolean, false) THEN RAISE EXCEPTION 'Forced crash in commit step (test flag)'; END IF;
 UPDATE public.agent_runs SET status = payload->>'final_status', finished_at = now(),
   duration_ms = CASE WHEN started_at IS NULL THEN NULL ELSE (extract(epoch FROM (now() - started_at)) * 1000)::bigint END,
   records_read = COALESCE((payload->>'records_read')::int, records_read),
   records_written = COALESCE(records_written, 0) + n_kpi + n_sum,
   error_count = 0, changes_summary = payload->>'changes_summary'
 WHERE id = r.id;
 INSERT INTO public.run_steps(run_id, step, status, started_at, finished_at, message, details)
 VALUES (r.id, 'commit', 'succeeded', st, now(), payload->>'changes_summary', jsonb_build_object('snapshots', cardinality(ids), 'kpi_values', n_kpi, 'summaries', n_sum));
 UPDATE public.schedule_state SET lock_run_id = NULL, lock_expires_at = NULL WHERE lock_run_id = r.id;
 RETURN jsonb_build_object('snapshot_ids', to_jsonb(ids), 'kpi_values', n_kpi, 'summaries', n_sum);
END $$;

REVOKE ALL ON FUNCTION public.run_start(text, uuid, text), public.run_lock(uuid), public.run_claim_key(uuid, text, boolean), public.run_step(uuid, text, text, timestamptz, text, jsonb),
  public.run_finish(uuid, text, text, jsonb, uuid[], text, int), public.register_raw_import(text, text, text, text, text, jsonb), public.commit_run(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_start(text, uuid, text), public.run_lock(uuid), public.run_claim_key(uuid, text, boolean), public.run_step(uuid, text, text, timestamptz, text, jsonb),
  public.run_finish(uuid, text, text, jsonb, uuid[], text, int), public.register_raw_import(text, text, text, text, text, jsonb), public.commit_run(jsonb) TO service_role;

-- Rolled-back test: a manual lead and its removal through commit_run. Leaves no rows behind.
CREATE FUNCTION public.test_manual_lead_cycle() RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE p public.periods; r1 uuid; r2 uuid; ri1 uuid; ri2 uuid; s1 uuid; res jsonb := '{}'; n int; lead_id uuid;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 BEGIN
  SELECT * INTO p FROM public.periods WHERE label = 'P1';
  INSERT INTO public.raw_imports(source_key, sha256, received_from, status, payload) VALUES ('manual', '__test__' || gen_random_uuid(), 'test', 'received', '{"entry_type":"lead"}') RETURNING id INTO ri1;
  r1 := public.run_start('manual', p.id, 'test');
  PERFORM public.commit_run(jsonb_build_object('run_id', r1, 'final_status', 'succeeded', 'raw_import_ids', jsonb_build_array(ri1),
    'snapshots', jsonb_build_array(jsonb_build_object('snapshot', jsonb_build_object('period_id', p.id, 'source_key', 'manual', 'run_id', r1, 'raw_import_id', ri1, 'parser_version', 'manual-entry-1', 'transform_version', '1', 'captured_at', now(), 'completeness', 'complete'),
      'leads', jsonb_build_array(jsonb_build_object('date', p.start_date, 'kind', 'meeting', 'person_type', 'investor', 'attribution', 'said_linkedin'))))));
  SELECT leads INTO n FROM public.v_leads_by_period WHERE label = 'P1';
  IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Lead not counted (got %)', n; END IF;
  SELECT id, snapshot_id INTO lead_id, s1 FROM public.v_manual_leads WHERE period_label = 'P1';
  res := res || '{"lead_counted":true}';
  INSERT INTO public.raw_imports(source_key, sha256, received_from, status, payload) VALUES ('manual', '__test__' || gen_random_uuid(), 'test', 'received', jsonb_build_object('entry_type', 'lead_removal', 'lead_id', lead_id)) RETURNING id INTO ri2;
  r2 := public.run_start('manual', p.id, 'test');
  PERFORM public.commit_run(jsonb_build_object('run_id', r2, 'final_status', 'succeeded', 'raw_import_ids', jsonb_build_array(ri2),
    'snapshots', jsonb_build_array(jsonb_build_object('snapshot', jsonb_build_object('period_id', p.id, 'source_key', 'manual', 'run_id', r2, 'raw_import_id', ri2, 'parser_version', 'manual-entry-1', 'transform_version', '1', 'captured_at', now() + interval '1 second', 'completeness', 'complete', 'supersedes_id', s1), 'leads', '[]'::jsonb))));
  SELECT leads INTO n FROM public.v_leads_by_period WHERE label = 'P1';
  IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Removed lead still counted (got %)', n; END IF;
  IF (SELECT count(*) FROM public.leads WHERE snapshot_id = s1) <> 1 THEN RAISE EXCEPTION 'Old snapshot was changed'; END IF;
  res := res || '{"lead_removed_by_new_snapshot":true,"old_snapshot_unchanged":true}';
  RAISE EXCEPTION 'test rollback' USING ERRCODE = 'Z0001';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 RETURN res || '{"rolled_back":true}';
END $$;
REVOKE ALL ON FUNCTION public.test_manual_lead_cycle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_manual_lead_cycle() TO service_role;