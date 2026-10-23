-- Runs before every migration pass (idempotent). Recreates the few Supabase pieces the schema
-- expects, so the original migrations and a restored Lovable/Supabase dump work on plain Postgres.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

-- The app's login user acts as service_role, exactly like Lovable's server code did.
DO $$ BEGIN
  EXECUTE format('GRANT service_role TO %I', session_user);
  EXECUTE format('ALTER ROLE %I SET role = %L', session_user, 'service_role');
END $$;
GRANT USAGE, CREATE ON SCHEMA public TO service_role;

-- Single-user stand-ins for Supabase's auth helpers: the tool has no login, so "the user" is always the owner.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.single_user (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL);
INSERT INTO auth.single_user (email) SELECT 'viktoria@izdebska.com' WHERE NOT EXISTS (SELECT 1 FROM auth.single_user);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM auth.single_user LIMIT 1 $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT email FROM auth.single_user LIMIT 1 $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub', id, 'email', email, 'role', 'authenticated') FROM auth.single_user LIMIT 1 $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::text $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.single_user TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
