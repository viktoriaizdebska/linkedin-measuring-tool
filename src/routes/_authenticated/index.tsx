import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  LockKeyhole,
  Moon,
  Sun,
  Target,
  LogOut,
  Stethoscope,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StrategyPanel } from "@/components/strategy-panel";
import { DiagnosisPanel } from "@/components/diagnosis-panel";
import { MeasurementPanel, age, latestRun } from "@/components/measurement-panel";
import { WaitingBanner, useRunAge } from "@/components/schedule-panels";
import { useQuery } from "@tanstack/react-query";
import { measurementQuery, strategyQuery } from "@/lib/strategy-query";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "LinkedIn Measuring Tool · Viktoria Izdebska" },
      {
        name: "description",
        content:
          "Viktoria Izdebska’s private workspace for LinkedIn positioning, distribution strategy and measurement.",
      },
      { property: "og:title", content: "LinkedIn Measuring Tool · Viktoria Izdebska" },
      {
        property: "og:description",
        content: "LinkedIn positioning, goals and measurement for Viktoria Izdebska.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: async ({ context }) => {
    void context.queryClient.prefetchQuery(measurementQuery());
    await context.queryClient.ensureQueryData(strategyQuery());
  },
  errorComponent: StrategyLoadError,
  notFoundComponent: () => <p role="alert">Strategy not found.</p>,
  pendingComponent: () => <p className="page-width py-10">Loading strategy…</p>,
  component: Index,
});

const tabs = [
  {
    id: "strategy",
    title: "Positioning & CTA",
    question: "What are we trying to achieve?",
    icon: Target,
  },
  {
    id: "measurement",
    title: "LinkedIn Measurement",
    question: "What is happening, and how is it changing?",
    icon: BarChart3,
  },
  {
    id: "diagnosis",
    title: "Diagnosis",
    question: "Where am I strong, where am I lacking, and why?",
    icon: Stethoscope,
  },
  {
    id: "scheduled",
    title: "Scheduled Posts",
    question: "What are we planning and publishing?",
    icon: CalendarDays,
  },
] as const;
function Index() {
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();
  const [active, setActive] = useState<(typeof tabs)[number]["id"]>("strategy");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];
  return (
    <>
      <header className="topbar">
        <div className="page-width topbar-inner flex min-h-20 items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="brand-icon">
              <BarChart3 size={18} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <span className="brand-title font-editorial text-xl font-bold">
              LinkedIn Measuring Tool
            </span>
          </div>
          <div className="header-right flex items-center gap-4">
            <RunPill />
            <span className="h-5 w-px bg-border max-sm:hidden" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </header>
      <main className="page-width">
        <nav className="tab-nav" role="tablist" aria-label="Dashboard views">
          {tabs.map((tab, i) => (
            <Button
              variant="ghost"
              className="tab-button"
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={active === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => {
                if (
                  event.key === "ArrowRight" ||
                  event.key === "ArrowLeft" ||
                  event.key === "Home" ||
                  event.key === "End"
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? tabs[0]
                      : event.key === "End"
                        ? tabs[tabs.length - 1]
                        : tabs[(i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                  if (next) {
                    setActive(next.id);
                    document.getElementById(`tab-${next.id}`)?.focus();
                  }
                }
              }}
            >
              <tab.icon size={15} strokeWidth={1.6} aria-hidden="true" />
              {tab.title}
            </Button>
          ))}
        </nav>
        <div
          role="tabpanel"
          id={`panel-${active}`}
          aria-labelledby={`tab-${active}`}
          tabIndex={0}
          className="outline-none"
        >
          <WaitingBanner />
          <div className="page-heading">
            <h1>{current.title}</h1>
            <p>{current.question}</p>
          </div>
          {active === "strategy" && <StrategyPanel />}
          {active === "measurement" && <MeasurementPanel />}
          {active === "diagnosis" && <DiagnosisPanel />}
          {active === "scheduled" && (
            <div className="strategy-card scheduled-empty">
              <CalendarDays
                size={32}
                strokeWidth={1.2}
                className="text-muted-foreground"
                aria-hidden="true"
              />
              <p>Coming later: planned posts, a content calendar and publishing status.</p>
            </div>
          )}
        </div>
        <footer className="page-footer">
          <span>
            Viktoria Izdebska <span className="mx-2">/</span> LinkedIn Measuring Tool
          </span>
          <span className="flex items-center gap-1.5">
            <LockKeyhole size={10} aria-hidden="true" />
            Personal workspace
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await queryClient.cancelQueries();
                queryClient.clear();
                await supabase.auth.signOut();
                await navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut />
            </Button>
          </span>
        </footer>
      </main>
    </>
  );
}

function StrategyLoadError() {
  const router = useRouter();
  const { reset } = useQueryErrorResetBoundary();
  return (
    <div className="page-width py-10">
      <p role="alert">Strategy could not be loaded. Please try again.</p>
      <Button
        variant="outline"
        className="mt-4"
        onClick={() => {
          reset();
          void router.invalidate();
        }}
      >
        Retry
      </Button>
    </div>
  );
}

function RunPill() {
  const q = useQuery(measurementQuery());
  const last = q.data ? latestRun(q.data) : undefined;
  const ageInfo = useRunAge();
  return (
    <span className="status-pill" role="status" title={ageInfo.text}>
      <span className={`status-dot run-dot ${ageInfo.level}`} />
      {q.isPending ? "Loading runs…" : last ? `Last run ${last.status} · ${age(last.finished_at ?? last.created_at)}` : "No measurement runs yet"}
    </span>
  );
}
