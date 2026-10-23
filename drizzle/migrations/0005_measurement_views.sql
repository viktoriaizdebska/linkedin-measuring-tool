CREATE VIEW public.v_period_followers WITH (security_invoker = true) AS
SELECT p.id AS period_id, p.label, p.kind, p.start_date, p.end_date, cs.source_key,
  sum(f.new_followers)::int AS new_followers,
  count(DISTINCT f.date)::int AS days_covered,
  (p.end_date - p.start_date + 1) AS days_in_period,
  (cs.completeness = 'complete' AND count(DISTINCT f.date) = (p.end_date - p.start_date + 1)) AS is_complete
FROM public.current_snapshots cs
JOIN public.periods p ON p.id = cs.period_id
JOIN public.follower_daily f ON f.snapshot_id = cs.id AND f.date BETWEEN p.start_date AND p.end_date
GROUP BY p.id, p.label, p.kind, p.start_date, p.end_date, cs.source_key, cs.completeness;

CREATE VIEW public.v_monthly_account WITH (security_invoker = true) AS
SELECT cs.source_key, a.window_start, a.window_end,
  (a.window_end - a.window_start + 1) AS days,
  max(a.value) FILTER (WHERE a.metric_key = 'impressions') AS impressions,
  max(a.value) FILTER (WHERE a.metric_key = 'members_reached') AS members_reached,
  max(a.value) FILTER (WHERE a.metric_key = 'reactions') AS reactions,
  max(a.value) FILTER (WHERE a.metric_key = 'comments') AS comments,
  max(a.value) FILTER (WHERE a.metric_key = 'reposts') AS reposts,
  max(a.value) FILTER (WHERE a.metric_key = 'saves') AS saves,
  max(a.value) FILTER (WHERE a.metric_key = 'sends') AS sends,
  max(a.value) FILTER (WHERE a.metric_key = 'link_clicks') AS link_clicks,
  max(a.value) FILTER (WHERE a.metric_key = 'new_followers') AS new_followers
FROM public.current_snapshots cs
JOIN public.periods p ON p.id = cs.period_id AND p.label = 'BASE'
JOIN public.account_metrics a ON a.snapshot_id = cs.id
WHERE a.metric_key <> 'total_followers'
GROUP BY cs.source_key, a.window_start, a.window_end;

CREATE VIEW public.v_post_metrics WITH (security_invoker = true) AS
SELECT DISTINCT ON (po.urn)
  po.urn, po.published_at, po.url, po.format, po.topic, po.pillar_key, po.hook,
  o.observed_at, o.age_days, o.obs_window, cs.source_key,
  o.impressions, o.followers_gained, o.profile_views, o.saves, o.reposts,
  CASE WHEN o.impressions > 0 AND o.followers_gained IS NOT NULL THEN o.followers_gained * 1000.0 / o.impressions END AS followers_per_1000,
  CASE WHEN o.impressions > 0 AND o.saves IS NOT NULL AND o.reposts IS NOT NULL THEN (o.saves + o.reposts) * 1000.0 / o.impressions END AS saves_reposts_per_1000
FROM public.posts po
JOIN public.post_observations o ON o.post_urn = po.urn
JOIN public.current_snapshots cs ON cs.id = o.snapshot_id
ORDER BY po.urn, o.observed_at DESC, o.created_at DESC;

CREATE VIEW public.v_audience_latest WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT ao.*, cs.source_key, cs.captured_at,
    rank() OVER (PARTITION BY ao.scope, ao.dimension ORDER BY cs.captured_at DESC, cs.created_at DESC) AS rk
  FROM public.audience_observations ao JOIN public.current_snapshots cs ON cs.id = ao.snapshot_id)
SELECT scope, dimension, label, share_pct, source_key, captured_at FROM ranked WHERE rk = 1;

CREATE VIEW public.v_leads_by_period WITH (security_invoker = true) AS
WITH lead_snaps AS (
  SELECT cs.id, cs.source_key, bp.start_date, bp.end_date
  FROM public.current_snapshots cs JOIN public.periods bp ON bp.id = cs.period_id
  WHERE EXISTS (SELECT 1 FROM public.leads l WHERE l.snapshot_id = cs.id))
SELECT p.id AS period_id, p.label, p.kind, p.start_date, p.end_date, ls.source_key,
  count(l.id)::int AS leads,
  count(l.id) FILTER (WHERE l.kind = 'meeting')::int AS meetings,
  count(l.id) FILTER (WHERE l.kind = 'inquiry')::int AS inquiries,
  count(l.id) FILTER (WHERE l.kind = 'intro')::int AS intros,
  (p.start_date >= ls.start_date AND p.end_date <= ls.end_date) AS fully_covered
FROM public.periods p
JOIN lead_snaps ls ON p.start_date <= ls.end_date AND p.end_date >= ls.start_date
LEFT JOIN public.leads l ON l.snapshot_id = ls.id AND l.date BETWEEN p.start_date AND p.end_date
GROUP BY p.id, p.label, p.kind, p.start_date, p.end_date, ls.source_key, ls.start_date, ls.end_date;

GRANT SELECT ON public.v_period_followers, public.v_monthly_account, public.v_post_metrics, public.v_audience_latest, public.v_leads_by_period TO authenticated, service_role;