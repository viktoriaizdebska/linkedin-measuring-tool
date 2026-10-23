CREATE FUNCTION public.test_foundation_invariants() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p uuid; r uuid; s uuid; outcome jsonb; rejected boolean; failure text; t text; row_id text; before_count int; payload jsonb; test_urn text; result jsonb := '{}'::jsonb;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_role required' USING ERRCODE='42501'; END IF;
 BEGIN
  SELECT id INTO p FROM public.periods WHERE label='P1';
  INSERT INTO public.agent_runs(trigger,period_id,input_key,status,started_at) VALUES ('manual',p,'__test__'||gen_random_uuid(),'running',now()) RETURNING id INTO r;
  test_urn := '__test__'||gen_random_uuid();
  payload := jsonb_build_object('snapshot',jsonb_build_object('period_id',p,'source_key','manual','run_id',r,'parser_version','test','transform_version','test','captured_at',now(),'completeness','complete'),'final_status','succeeded','posts',jsonb_build_array(jsonb_build_object('urn',test_urn,'published_at',now(),'topic','initial')),'account_metrics',jsonb_build_array(jsonb_build_object('metric_key','impressions','value',123)),'follower_daily',jsonb_build_array(jsonb_build_object('date','2026-10-12','new_followers',2)),'post_observations',jsonb_build_array(jsonb_build_object('post_urn',test_urn,'observed_at',now(),'age_days',0,'obs_window','lifetime')),'audience_observations',jsonb_build_array(jsonb_build_object('scope','content_viewers','dimension','industry','label','test','share_pct',16)),'audience_checks',jsonb_build_array(jsonb_build_object('checked_on','2026-10-12','sample_size',30,'strict_count',5,'broad_count',20,'none_count',10,'method_version','test')),'leads',jsonb_build_array(jsonb_build_object('date','2026-10-12','kind','meeting','person_type','operator','attribution','unknown')),'kpi_values',jsonb_build_array(jsonb_build_object('kpi_key','impressions_14d','formula_version',1,'kind','measured','value',123)),'period_summaries',jsonb_build_array(jsonb_build_object('summary','{}'::jsonb)));
  s := public.commit_snapshot(payload);
  IF (SELECT status FROM public.agent_runs WHERE id=r) <> 'succeeded' THEN RAISE EXCEPTION 'Run finalization failed'; END IF;
  FOREACH t IN ARRAY ARRAY['account_metrics','follower_daily','post_observations','audience_observations','audience_checks','leads'] LOOP
   EXECUTE format('SELECT count(*) FROM public.%I WHERE snapshot_id=$1',t) INTO before_count USING s;
   IF before_count<>1 THEN RAISE EXCEPTION 'Commit missing %',t; END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.kpi_values WHERE run_id=r)<>1 OR (SELECT count(*) FROM public.period_summaries WHERE run_id=r)<>1 THEN RAISE EXCEPTION 'Commit missing derived rows'; END IF;
  IF (SELECT impressions FROM public.post_observations WHERE snapshot_id=s) IS NOT NULL THEN RAISE EXCEPTION 'Absent metrics must stay NULL'; END IF;
  result := result || '{"atomic_commit":true,"null_not_zero":true}'::jsonb;
  rejected:=false; BEGIN UPDATE public.account_metrics SET value=456 WHERE snapshot_id=s; EXCEPTION WHEN SQLSTATE '55000' THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'account_metrics UPDATE was not rejected'; END IF;
  result:=result || '{"account_metrics_update_rejected":true}'::jsonb;
  FOREACH t IN ARRAY ARRAY['sources','source_capabilities','periods','metric_catalog','snapshots','account_metrics','follower_daily','post_observations','audience_observations','audience_checks','leads','kpi_values','period_summaries'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=format('public.%I',t)::regclass AND tgname='immutable_history' AND tgenabled='A') THEN RAISE EXCEPTION 'Missing ALWAYS immutability trigger on %',t; END IF;
  END LOOP;
  UPDATE public.posts SET topic='changed' WHERE urn=test_urn;
  rejected:=false; BEGIN UPDATE public.posts SET hook='forbidden' WHERE urn=test_urn; EXCEPTION WHEN SQLSTATE '55000' THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Non-tag post update allowed'; END IF;
  rejected:=false; BEGIN DELETE FROM public.posts WHERE urn=test_urn; EXCEPTION WHEN SQLSTATE '55000' THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Post delete allowed'; END IF;
  result:=result || '{"post_tag_update_allowed":true,"post_non_tag_update_rejected":true,"post_delete_rejected":true}'::jsonb;
  INSERT INTO public.agent_runs(trigger,period_id,input_key,status) VALUES('manual',p,'__test__'||gen_random_uuid(),'running') RETURNING id INTO r;
  payload:=jsonb_set(payload,'{snapshot,run_id}',to_jsonb(r)); payload:=jsonb_set(payload,'{snapshot,captured_at}',to_jsonb(now()+interval '1 day')); payload:=jsonb_set(payload,'{snapshot,completeness}','"partial"');
  PERFORM public.commit_snapshot(payload);
  IF (SELECT id FROM public.current_snapshots WHERE period_id=p AND source_key='manual')<>s THEN RAISE EXCEPTION 'Complete snapshot not preferred'; END IF;
  result:=result || '{"complete_snapshot_preferred":true}'::jsonb;
  INSERT INTO public.agent_runs(trigger,period_id,input_key,status) VALUES('manual',p,'__test__'||gen_random_uuid(),'running') RETURNING id INTO r;
  payload:=jsonb_set(payload,'{snapshot,run_id}',to_jsonb(r)); payload:=jsonb_set(payload,'{account_metrics,0,metric_key}','"__missing_metric__"');
  SELECT count(*) INTO before_count FROM public.snapshots;
  rejected:=false; BEGIN PERFORM public.commit_snapshot(payload); EXCEPTION WHEN foreign_key_violation THEN rejected:=true; END;
  IF NOT rejected OR (SELECT count(*) FROM public.snapshots)<>before_count OR (SELECT status FROM public.agent_runs WHERE id=r)<>'running' THEN RAISE EXCEPTION 'Failed commit did not roll back'; END IF;
  result:=result || '{"failed_commit_rolls_back":true}'::jsonb;
  rejected:=false; BEGIN UPDATE public.strategy_versions SET change_note='forbidden' WHERE version_no=1; EXCEPTION WHEN SQLSTATE '55000' THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Strategy mutation allowed'; END IF;
  result:=result || '{"strategy_update_rejected":true}'::jsonb;
  RAISE EXCEPTION 'test rollback' USING ERRCODE='Z0001';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
 RETURN result || '{"test_rows_rolled_back":true}'::jsonb;
END $$;
REVOKE ALL ON FUNCTION public.test_foundation_invariants() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.test_foundation_invariants() TO service_role;