import { createFileRoute, Outlet } from "@tanstack/react-router";

// No login: the dashboard is open (or protected by the optional APP_PASSWORD, see src/server.ts).
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: () => <Outlet />,
});
