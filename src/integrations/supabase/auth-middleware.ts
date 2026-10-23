// The tool has no login: every server function gets the same database client.
// (Name kept from the Lovable version so the server functions did not need to change.)
// An optional browser password (APP_PASSWORD) protects the whole site, see src/server.ts.
import { createMiddleware } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { db } = await import("@/integrations/db/client.server");
    // The Postgres client implements the subset of Supabase's query API these functions use.
    return next({ context: { supabase: db as unknown as SupabaseClient<Database> } });
  },
);
