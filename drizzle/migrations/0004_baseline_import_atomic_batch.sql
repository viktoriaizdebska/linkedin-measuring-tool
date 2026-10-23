-- The audience check categories are disjoint: strict + broad + none = sample.
ALTER TABLE public.audience_checks DROP CONSTRAINT audience_checks_check, DROP CONSTRAINT audience_checks_check1;
ALTER TABLE public.audience_checks ADD CONSTRAINT audience_checks_counts_sum CHECK (strict_count + broad_count + none_count = sample_size);
ALTER TABLE public.audience_checks ADD CONSTRAINT audience_checks_broad_nonneg CHECK (broad_count >= 0);

-- Remove the partial rows left by the failed first baseline attempt (run 9225d204), then restore immutability.
ALTER TABLE public.follower_daily DISABLE TRIGGER immutable_history;
ALTER TABLE public.snapshots DISABLE TRIGGER immutable_history;
DELETE FROM public.follower_daily WHERE snapshot_id IN (SELECT id FROM public.snapshots WHERE run_id = '9225d204-3ce3-4686-a92f-b08604e93f57');
DELETE FROM public.snapshots WHERE run_id = '9225d204-3ce3-4686-a92f-b08604e93f57';
ALTER TABLE public.follower_daily ENABLE ALWAYS TRIGGER immutable_history;
ALTER TABLE public.snapshots ENABLE ALWAYS TRIGGER immutable_history;
UPDATE public.agent_runs SET records_written = 0, changes_summary = changes_summary || ' (partial rows removed; nothing from this run remains)' WHERE id = '9225d204-3ce3-4686-a92f-b08604e93f57';

-- Commit several snapshots of one run in a single transaction: all or nothing.
CREATE OR REPLACE FUNCTION public.commit_snapshots(payloads jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE p jsonb; ids uuid[] := '{}'; n int; i int := 0;
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'Only service_role may commit snapshots' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(payloads) IS DISTINCT FROM 'array' OR jsonb_array_length(payloads) = 0 THEN RAISE EXCEPTION 'payloads must be a non-empty array'; END IF;
 n := jsonb_array_length(payloads);
 FOR p IN SELECT value FROM jsonb_array_elements(payloads) LOOP
  i := i + 1;
  IF i < n THEN p := p || '{"finalize":false}'::jsonb; END IF;
  ids := ids || public.commit_snapshot(p);
 END LOOP;
 RETURN ids;
END $function$;
REVOKE ALL ON FUNCTION public.commit_snapshots(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_snapshots(jsonb) TO service_role;