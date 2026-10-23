-- Additive: what the app needs on plain Postgres instead of Supabase.
-- Files that lived in Supabase Storage (bucket raw-imports) are kept here; stored files never change.
CREATE TABLE IF NOT EXISTS public.stored_files (
  bucket text NOT NULL,
  path text NOT NULL,
  content_type text NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, path)
);
DROP TRIGGER IF EXISTS stored_files_immutable ON public.stored_files;
CREATE TRIGGER stored_files_immutable BEFORE UPDATE OR DELETE ON public.stored_files
  FOR EACH ROW EXECUTE FUNCTION public.reject_history_mutation();
GRANT SELECT, INSERT ON public.stored_files TO service_role;
-- Saving a strategy version used to run as the signed-in user; now the app's service_role saves it.
GRANT EXECUTE ON FUNCTION public.save_strategy_version(jsonb) TO service_role;
-- Same as the other history triggers: fires even in replication/maintenance sessions.
ALTER TABLE public.stored_files ENABLE ALWAYS TRIGGER stored_files_immutable;
