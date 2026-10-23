CREATE FUNCTION public.save_strategy_version(payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE base public.strategy_versions; new_id uuid; pos public.positioning; item jsonb; note text; changed boolean := false;
BEGIN
 IF NOT public.is_allowed_user() THEN RAISE EXCEPTION 'This tool is private.' USING ERRCODE='42501'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(8341026);
 SELECT * INTO base FROM public.strategy_versions ORDER BY version_no DESC LIMIT 1;
 IF base.id IS DISTINCT FROM (payload->>'base_id')::uuid THEN RAISE EXCEPTION 'A newer strategy version exists. Reload before editing.'; END IF;
 note := trim(payload->>'change_note');
 IF note IS NULL OR length(note) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'A short change note is required (maximum 200 characters).'; END IF;
 IF jsonb_typeof(payload->'positioning') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'pillars') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'ctas') IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'targets') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid strategy draft'; END IF;
 IF jsonb_array_length(payload->'pillars') <> 3 OR jsonb_array_length(payload->'ctas') <> 3 OR jsonb_array_length(payload->'targets') <> (SELECT count(*) FROM public.kpi_targets WHERE version_id=base.id) THEN RAISE EXCEPTION 'Draft must contain all pillars, CTAs and targets'; END IF;
 IF (SELECT count(DISTINCT x->>'key') FROM jsonb_array_elements(payload->'pillars') x)<>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'pillars') x WHERE NOT EXISTS(SELECT 1 FROM public.content_pillars WHERE version_id=base.id AND key=x->>'key')) THEN RAISE EXCEPTION 'Invalid pillar keys'; END IF;
 IF (SELECT count(DISTINCT x->>'rank') FROM jsonb_array_elements(payload->'ctas') x)<>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'ctas') x WHERE NOT EXISTS(SELECT 1 FROM public.ctas WHERE version_id=base.id AND rank=(x->>'rank')::int)) THEN RAISE EXCEPTION 'Invalid CTA ranks'; END IF;
 IF (SELECT count(DISTINCT x->>'kpi_key') FROM jsonb_array_elements(payload->'targets') x)<>jsonb_array_length(payload->'targets') OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'targets') x WHERE NOT EXISTS(SELECT 1 FROM public.kpi_targets WHERE version_id=base.id AND kpi_key=x->>'kpi_key')) THEN RAISE EXCEPTION 'Invalid target keys'; END IF;
 SELECT * INTO pos FROM public.positioning WHERE version_id=base.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Positioning is missing'; END IF;
 FOR item IN SELECT to_jsonb(k) FROM unnest(ARRAY['position_line','thesis','concept_name','concept_description','audience','differentiation','known_for','objective']) k LOOP
  IF jsonb_typeof(payload->'positioning'->(item#>>'{}')) IS DISTINCT FROM 'string' OR length(payload->'positioning'->>(item#>>'{}')) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Every positioning field is required (maximum 10000 characters).'; END IF;
  changed := changed OR (to_jsonb(pos)->>(item#>>'{}')) IS DISTINCT FROM (payload->'positioning'->>(item#>>'{}'));
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'pillars') LOOP
  IF length(trim(item->>'name')) NOT BETWEEN 1 AND 500 OR length(trim(item->>'description')) NOT BETWEEN 1 AND 10000 OR item->>'name' IS NULL OR item->>'description' IS NULL THEN RAISE EXCEPTION 'Pillar name and description are required'; END IF;
  changed := changed OR EXISTS(SELECT 1 FROM public.content_pillars WHERE version_id=base.id AND key=item->>'key' AND (name IS DISTINCT FROM item->>'name' OR description IS DISTINCT FROM item->>'description'));
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'ctas') LOOP
  IF item->>'label' IS NULL OR length(trim(item->>'label')) NOT BETWEEN 1 AND 1000 OR item->>'destination' IS NULL OR length(item->>'destination')>2000 OR item->>'destination' ~* '^\s*(javascript|data|vbscript):' THEN RAISE EXCEPTION 'Invalid CTA label or destination'; END IF;
  changed := changed OR EXISTS(SELECT 1 FROM public.ctas WHERE version_id=base.id AND rank=(item->>'rank')::int AND (label IS DISTINCT FROM item->>'label' OR COALESCE(destination,'') IS DISTINCT FROM item->>'destination'));
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(payload->'targets') LOOP
  changed := changed OR EXISTS(SELECT 1 FROM public.kpi_targets WHERE version_id=base.id AND kpi_key=item->>'kpi_key' AND (target_value IS DISTINCT FROM (item->>'target_value')::numeric OR target_by IS DISTINCT FROM (item->>'target_by')::date));
 END LOOP;
 IF NOT changed THEN RAISE EXCEPTION 'Nothing changed'; END IF;
 INSERT INTO public.strategy_versions(version_no,valid_from,change_note,created_by) VALUES(base.version_no+1,now(),note,auth.uid()) RETURNING id INTO new_id;
 INSERT INTO public.positioning(version_id,position_line,thesis,concept_name,concept_description,audience,differentiation,known_for,objective) SELECT new_id,x.position_line,x.thesis,x.concept_name,x.concept_description,x.audience,x.differentiation,x.known_for,x.objective FROM jsonb_populate_record(NULL::public.positioning,payload->'positioning') x;
 INSERT INTO public.content_pillars(version_id,key,name,description,target_share,sort_order) SELECT new_id,p.key,x->>'name',x->>'description',p.target_share,p.sort_order FROM public.content_pillars p JOIN jsonb_array_elements(payload->'pillars') x ON p.key=x->>'key' WHERE p.version_id=base.id;
 INSERT INTO public.ctas(version_id,rank,label,destination,measured_how) SELECT new_id,c.rank,x->>'label',x->>'destination',c.measured_how FROM public.ctas c JOIN jsonb_array_elements(payload->'ctas') x ON c.rank=(x->>'rank')::int WHERE c.version_id=base.id;
 INSERT INTO public.kpi_targets(version_id,kpi_key,baseline_value,baseline_label,target_value,target_by) SELECT new_id,t.kpi_key,t.baseline_value,t.baseline_label,(x->>'target_value')::numeric,(x->>'target_by')::date FROM public.kpi_targets t JOIN jsonb_array_elements(payload->'targets') x ON t.kpi_key=x->>'kpi_key' WHERE t.version_id=base.id;
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.save_strategy_version(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_strategy_version(jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_strategy_version(jsonb) IS 'Atomic allowed-user save; copies immutable baselines and metadata, serializes version numbering and rejects stale or unchanged drafts.';