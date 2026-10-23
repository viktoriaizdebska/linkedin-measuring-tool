CREATE VIEW public.v_current_leads WITH (security_invoker = true) AS
 SELECT l.id, l.date, l.kind, l.person_type, l.attribution, l.post_urn, l.note, l.calendar_event_id, cs.source_key, cs.id AS snapshot_id, cs.period_id, p.label AS period_label
   FROM public.leads l JOIN public.current_snapshots cs ON cs.id = l.snapshot_id JOIN public.periods p ON p.id = cs.period_id;
GRANT SELECT ON public.v_current_leads TO authenticated, service_role;