import { createFileRoute } from "@tanstack/react-router";

// GET: is the database still empty? POST: load the Lovable export bundle (refuses unless empty).
export const Route = createFileRoute("/api/restore")({
  server: {
    handlers: {
      GET: async () => {
        const { databaseIsEmpty } = await import("@/lib/restore.server");
        return Response.json({ empty: await databaseIsEmpty() });
      },
      POST: async ({ request }) => {
        const { restoreBundle } = await import("@/lib/restore.server");
        try {
          return Response.json(await restoreBundle(await request.json()));
        } catch (e) {
          return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 400 });
        }
      },
    },
  },
});
