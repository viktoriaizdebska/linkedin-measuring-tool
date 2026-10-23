CREATE OR REPLACE FUNCTION public.commit_run(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r public.agent_runs; snap jsonb; ids uuid[] := '{}'; n_kpi int := 0; n_sum int := 0; st timestamptz := now(); raw_ids uuid[];
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'Only service_role may commit runs' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.agent_runs WHERE id = (payload->>'run_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent_runs row not found'; END IF;
 IF r.status <> 'running' THEN RAISE EXCEPTION 'Run is already finalized'; END IF;
 IF payload->>'final_status' NOT IN ('succeeded','partial') THEN RAISE EXCEPTION 'Invalid final_status'; END IF;
 SELECT COALESCE(array_agg((v #>> '{}')::uuid), '{}') INTO raw_ids FROM jsonb_array_elements(COALESCE(payload->'raw_import_ids','[]')) v;
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
 UPDATE public.raw_imports ri SET status = 'parsed' WHERE ri.id = ANY(raw_ids) AND ri.status = 'received';
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