ALTER TABLE public.periods DROP CONSTRAINT periods_check, DROP CONSTRAINT periods_check1;
ALTER TABLE public.periods ADD CONSTRAINT periods_two_week CHECK (label = 'BASE' OR end_date = start_date + 13);
ALTER TABLE public.periods ADD CONSTRAINT periods_monday_sunday CHECK (label = 'BASE' OR (EXTRACT(isodow FROM start_date) = 1 AND EXTRACT(isodow FROM end_date) = 7));
ALTER TABLE public.periods ADD CONSTRAINT periods_base_window CHECK (label <> 'BASE' OR (kind = 'baseline' AND end_date > start_date));

CREATE OR REPLACE FUNCTION public.commit_snapshot(payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE s public.snapshots; r public.agent_runs; row_data jsonb; table_name text; insert_cols text; select_cols text; final_status text; written int := 1; affected int; do_finalize boolean;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'Only service_role may commit snapshots' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'snapshot') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'payload.snapshot must be an object'; END IF;
 s := jsonb_populate_record(NULL::public.snapshots,payload->'snapshot');
 s.id := COALESCE(s.id,gen_random_uuid()); s.created_at := COALESCE(s.created_at,now());
 do_finalize := COALESCE((payload->>'finalize')::boolean, true);
 final_status := payload->>'final_status';
 IF do_finalize AND (final_status IS NULL OR final_status NOT IN ('succeeded','partial','failed','needs_attention')) THEN RAISE EXCEPTION 'Invalid final_status'; END IF;
 SELECT * INTO r FROM public.agent_runs WHERE id=s.run_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'agent_runs row not found'; END IF;
 IF r.status NOT IN ('running','waiting_for_data') THEN RAISE EXCEPTION 'Run is already finalized'; END IF;
 IF r.period_id IS NOT NULL AND r.period_id IS DISTINCT FROM s.period_id THEN RAISE EXCEPTION 'Snapshot period must match the run period'; END IF;
 IF s.supersedes_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.snapshots old WHERE old.id=s.supersedes_id AND old.period_id=s.period_id AND old.source_key=s.source_key) THEN RAISE EXCEPTION 'Superseded snapshot must match period and source'; END IF;
 FOR row_data IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'posts','[]'::jsonb)) LOOP
  INSERT INTO public.posts(urn,published_at,url,format,hook,length_chars,visual,link_position,pillar_key,topic,named_person,concept,content_item_id)
  SELECT urn,published_at,url,format,hook,length_chars,visual,link_position,pillar_key,topic,named_person,concept,content_item_id FROM jsonb_populate_record(NULL::public.posts,row_data)
  ON CONFLICT(urn) DO UPDATE SET pillar_key=EXCLUDED.pillar_key,topic=EXCLUDED.topic,named_person=EXCLUDED.named_person,concept=EXCLUDED.concept,format=EXCLUDED.format,visual=EXCLUDED.visual,link_position=EXCLUDED.link_position;
  written := written+1;
 END LOOP;
 INSERT INTO public.snapshots SELECT s.*;
 FOREACH table_name IN ARRAY ARRAY['account_metrics','follower_daily','post_observations','audience_observations','audience_checks','leads','kpi_values','period_summaries'] LOOP
  IF payload ? table_name AND jsonb_typeof(payload->table_name) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION '% must be an array',table_name; END IF;
  SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum), string_agg(CASE a.attname WHEN 'id' THEN 'COALESCE(x.id,gen_random_uuid())' WHEN 'created_at' THEN 'COALESCE(x.created_at,now())' WHEN 'snapshot_id' THEN '$2' WHEN 'run_id' THEN '$3' WHEN 'period_id' THEN '$4' ELSE 'x.'||quote_ident(a.attname) END,',' ORDER BY a.attnum)
  INTO insert_cols,select_cols FROM pg_catalog.pg_attribute a WHERE a.attrelid=format('public.%I',table_name)::regclass AND a.attnum>0 AND NOT a.attisdropped;
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I,$1) x',table_name,insert_cols,select_cols,table_name) USING COALESCE(payload->table_name,'[]'::jsonb),s.id,s.run_id,s.period_id;
  GET DIAGNOSTICS affected=ROW_COUNT; written := written+affected;
 END LOOP;
 IF do_finalize THEN
  UPDATE public.agent_runs SET status=final_status,finished_at=now(),duration_ms=CASE WHEN started_at IS NULL THEN NULL ELSE (extract(epoch FROM (now()-started_at))*1000)::bigint END,records_read=COALESCE((payload->>'records_read')::int,r.records_read),records_written=COALESCE(r.records_written,0)+written,error_count=COALESCE((payload->>'error_count')::int,0),changes_summary=payload->>'changes_summary' WHERE id=s.run_id;
 ELSE
  UPDATE public.agent_runs SET records_written=COALESCE(r.records_written,0)+written WHERE id=s.run_id;
 END IF;
 RETURN s.id;
END $function$;
REVOKE ALL ON FUNCTION public.commit_snapshot(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_snapshot(jsonb) TO service_role;