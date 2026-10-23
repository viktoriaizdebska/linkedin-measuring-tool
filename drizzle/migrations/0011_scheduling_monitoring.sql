ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS due_kind text, ADD COLUMN IF NOT EXISTS retryable boolean;
COMMENT ON COLUMN public.agent_runs.due_kind IS 'measure-due: waiting | scheduled | deadline | gave_up';

CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('reminder','summary','failure')),
  dedupe_key text NOT NULL UNIQUE,
  period_id uuid REFERENCES public.periods(id),
  run_id uuid REFERENCES public.agent_runs(id),
  recipient text NOT NULL CHECK (recipient = 'viktoria@izdebska.com'),
  subject text NOT NULL,
  outcome text NOT NULL
);
GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allowed users read notifications" ON public.notification_log FOR SELECT TO authenticated USING (public.is_allowed_user());

CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
  email_reminders boolean NOT NULL DEFAULT false,
  email_summaries boolean NOT NULL DEFAULT false
);
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allowed users read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.is_allowed_user());
CREATE POLICY "allowed users change settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.is_allowed_user()) WITH CHECK (public.is_allowed_user());

CREATE OR REPLACE VIEW public.v_source_capabilities_latest WITH (security_invoker = true) AS
SELECT DISTINCT ON (source_key, metric_key) id, source_key, metric_key, available, verified_on, note, created_at
FROM public.source_capabilities ORDER BY source_key, metric_key, verified_on DESC NULLS LAST, created_at DESC;
GRANT SELECT ON public.v_source_capabilities_latest TO authenticated, service_role;