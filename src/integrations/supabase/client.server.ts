// Server-side database client (Postgres on Railway). Replaces the Supabase service-role client;
// the export name and type are kept so existing imports keep working.
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/integrations/db/client.server";
import type { Database } from "./types";

export const supabaseAdmin = db as unknown as SupabaseClient<Database>;
