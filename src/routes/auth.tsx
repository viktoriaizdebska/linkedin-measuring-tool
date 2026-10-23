import { createFileRoute, redirect } from "@tanstack/react-router";

// The login page is gone; old links land on the dashboard.
export const Route = createFileRoute("/auth")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});
