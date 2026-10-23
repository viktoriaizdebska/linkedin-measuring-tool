import { ArrowRight, Check, Circle, Star, Target } from "lucide-react";
import { Fragment, useState } from "react";
import { useSuspenseQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { strategyQuery } from "@/lib/strategy-query";
import { saveStrategy, addStrategyEvent } from "@/lib/strategy.functions";
import {
  draftSchema,
  saveSchema,
  eventSchema,
  hasChanges,
  destinationHref,
  type Draft,
} from "@/lib/strategy-schema";
import type { StrategyData } from "@/data/strategy";

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Vienna",
  }).format(new Date(date.length === 10 ? date + "T12:00:00Z" : date));
export function makeDraft(data: StrategyData, id: string): Draft {
  const p = data.positioning.find((p) => p.version_id === id);
  if (!p) throw new Error("Positioning is missing for this version.");
  return {
    base_id: id,
    positioning: {
      position_line: p.position_line ?? "",
      thesis: p.thesis ?? "",
      concept_name: p.concept_name ?? "",
      concept_description: p.concept_description ?? "",
      audience: p.audience ?? "",
      differentiation: p.differentiation ?? "",
      known_for: p.known_for ?? "",
      objective: p.objective ?? "",
    },
    pillars: data.pillars
      .filter((p) => p.version_id === id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ key: p.key, name: p.name, description: p.description ?? "" })),
    ctas: data.ctas
      .filter((c) => c.version_id === id)
      .sort((a, b) => a.rank - b.rank)
      .map((c) => ({ rank: c.rank, label: c.label, destination: c.destination ?? "" })),
    targets: data.targets
      .filter((t) => t.version_id === id)
      .map((t) => ({ kpi_key: t.kpi_key, target_value: t.target_value, target_by: t.target_by })),
  };
}
export function latestKpi(data: StrategyData, key: string) {
  return data.values
    .filter((v) => v.kpi_key === key && data.periods.some((p) => p.id === v.period_id))
    .sort((a, b) => {
      const pa = data.periods.find((p) => p.id === a.period_id),
        pb = data.periods.find((p) => p.id === b.period_id);
      return (
        (pb?.end_date ?? "").localeCompare(pa?.end_date ?? "") ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id)
      );
    })[0];
}
function Inline({
  label,
  value,
  onChange,
  short = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  short?: boolean;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="field-label">{label}</span>
      {short ? (
        <Input
          aria-label={label}
          required
          maxLength={2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Textarea
          aria-label={label}
          required
          maxLength={10000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
function Automation({ name, description }: { name: string; description: string }) {
  const match = description.match(/^0–30% (.+); 30–70% (.+); 70–100% (.+)\. At 90%: (.+)$/);
  return (
    <>
      <h3 className="automation-title">{name}</h3>
      {match ? (
        <div role="img" aria-label={`${name}: ${description}`}>
          <div className="band-scale">
            <span>0% automatable</span>
            <span>100%</span>
          </div>
          <div className="automation-band">
            {[match[1], match[2], match[3]].map((label, i) => (
              <div key={i} className={`band-segment ${i === 1 ? "active" : ""}`}>
                {label}
              </div>
            ))}
          </div>
          <div className="band-boundaries">
            <span>30%</span>
            <span>70%</span>
            <span />
          </div>
          <div className="exception-marker">90% · {match[4]}</div>
        </div>
      ) : (
        <p className="strategy-copy">{description}</p>
      )}
    </>
  );
}

export function StrategyPanel() {
  const { data } = useSuspenseQuery(strategyQuery());
  const queryClient = useQueryClient();
  const newest = data.versions[0];
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [event, setEvent] = useState<{
    date: string;
    label: string;
    kind: "strategy change" | "campaign" | "travel" | "podcast" | "other";
  }>({ date: "", label: "", kind: "other" });
  const [error, setError] = useState("");
  const saveFn = useServerFn(saveStrategy),
    eventFn = useServerFn(addStrategyEvent);
  const save = useMutation({
    mutationFn: saveFn,
    onSuccess: async (id) => {
      setDraft(null);
      setConfirm(false);
      setNote("");
      setSelected(id);
      await queryClient.invalidateQueries({ queryKey: ["strategy"] });
    },
    onError: (e) => setError(e.message),
  });
  const add = useMutation({
    mutationFn: eventFn,
    onSuccess: async () => {
      setEventOpen(false);
      setEvent({ date: "", label: "", kind: "other" });
      await queryClient.invalidateQueries({ queryKey: ["strategy"] });
    },
    onError: (e) => setError(e.message),
  });
  if (!newest) return <p role="alert">No strategy version is available.</p>;
  const version = data.versions.find((v) => v.id === selected) ?? newest;
  const position = data.positioning.find((p) => p.version_id === version.id);
  const pillars = data.pillars.filter((p) => p.version_id === version.id),
    ctas = data.ctas.filter((c) => c.version_id === version.id),
    targets = data.targets.filter((t) => t.version_id === version.id);
  if (
    !position ||
    pillars.length !== 3 ||
    ctas.length !== 3 ||
    targets.length !== data.definitions.length ||
    !data.definitions.length
  )
    return (
      <p role="alert">
        This strategy version is incomplete. Please reload or choose another version.
      </p>
    );
  const original = makeDraft(data, version.id),
    s = draft ?? original;
  const dirty = draft !== null && hasChanges(original, draft),
    busy = save.isPending || add.isPending;
  const setPosition = (key: keyof Draft["positioning"], value: string) =>
    setDraft((d) => (d ? { ...d, positioning: { ...d.positioning, [key]: value } } : d));
  const copyCard = (label: string, key: keyof Draft["positioning"]) => (
    <article className="strategy-card">
      <h2 className="card-label">{label}</h2>
      {draft ? (
        <Inline label={label} value={s.positioning[key]} onChange={(v) => setPosition(key, v)} />
      ) : (
        <p className="strategy-copy">{s.positioning[key]}</p>
      )}
    </article>
  );
  const timeline = [
    ...data.annotations.map((a) => ({ id: "a" + a.id, date: a.date, text: a.label, kind: a.kind })),
    ...data.versions.map((v) => ({
      id: "v" + v.id,
      date: v.valid_from,
      text: v.change_note ?? "",
      kind: `Version ${v.version_no}`,
    })),
  ].sort(
    (a, b) =>
      b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)) ||
      b.date.localeCompare(a.date) ||
      a.id.localeCompare(b.id),
  );
  return (
    <>
      <div className="strategy-toolbar flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Version {version.version_no} · saved {formatDate(version.created_at)} ·{" "}
            {version.change_note}
          </p>
          <label className="text-sm">
            <span className="sr-only">Strategy version</span>
            <select
              aria-label="Strategy version"
              className="version-select"
              disabled={!!draft || busy}
              value={version.id}
              onChange={(e) => {
                setSelected(e.target.value);
                setError("");
              }}
            >
              {data.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version_no}
                  {v.id === newest.id ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
          {version.id !== newest.id && (
            <span className="text-sm text-muted-foreground">Read-only</span>
          )}
        </div>
        {draft ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setConfirm(false);
                setError("");
                setNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!dirty || busy}
              onClick={() => {
                const result = draftSchema.safeParse(draft);
                if (!result.success) {
                  setError(result.error.issues[0]?.message ?? "Check your edits.");
                  return;
                }
                setError("");
                setConfirm(true);
              }}
            >
              Save as new version
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            disabled={version.id !== newest.id || busy}
            onClick={() => {
              setDraft(original);
              setError("");
            }}
          >
            Edit
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-5 text-destructive">
          {error}
        </p>
      )}
      {confirm && draft && (
        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const result = saveSchema.safeParse({ ...draft, change_note: note });
            if (!result.success) {
              setError(result.error.issues[0]?.message ?? "Check your edits.");
              return;
            }
            setError("");
            save.mutate({ data: result.data });
          }}
        >
          <label className="grid gap-2 text-sm">
            Change note (required)
            <Input
              aria-label="Change note"
              required
              maxLength={200}
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy || !note.trim() || !dirty}>
            {save.isPending ? "Saving…" : "Confirm save"}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>
            Back to editing
          </Button>
        </form>
      )}
      <fieldset disabled={busy} className="min-w-0 border-0 p-0 m-0">
        <article className="strategy-card position-card">
          <h2 className="card-label">
            <Target size={13} aria-hidden="true" />
            Position
          </h2>
          {draft ? (
            <Inline
              label="Position line"
              value={s.positioning.position_line}
              onChange={(v) => setPosition("position_line", v)}
            />
          ) : (
            <p className="position-copy">{s.positioning.position_line}</p>
          )}
        </article>
        <div className="strategy-grid">
          {copyCard("Thesis underneath", "thesis")}
          <article className="strategy-card">
            <h2 className="card-label">Signature concept</h2>
            {draft ? (
              <div className="grid gap-3">
                <Inline
                  short
                  label="Concept name"
                  value={s.positioning.concept_name}
                  onChange={(v) => setPosition("concept_name", v)}
                />
                <Inline
                  label="Concept description"
                  value={s.positioning.concept_description}
                  onChange={(v) => setPosition("concept_description", v)}
                />
              </div>
            ) : (
              <Automation
                name={s.positioning.concept_name}
                description={s.positioning.concept_description}
              />
            )}
          </article>
          {copyCard("Audience", "audience")}
          <article className="strategy-card">
            <h2 className="card-label">Content pillars</h2>
            <div className={draft ? "grid gap-4" : "pillars"}>
              {s.pillars.map((p, i) =>
                draft ? (
                  <div className="grid gap-2" key={p.key}>
                    <Inline
                      short
                      label={`Pillar ${i + 1} name`}
                      value={p.name}
                      onChange={(v) =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                pillars: d.pillars.map((x, j) => (j === i ? { ...x, name: v } : x)),
                              }
                            : d,
                        )
                      }
                    />
                    <Inline
                      label={`Pillar ${i + 1} description`}
                      value={p.description}
                      onChange={(v) =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                pillars: d.pillars.map((x, j) =>
                                  j === i ? { ...x, description: v } : x,
                                ),
                              }
                            : d,
                        )
                      }
                    />
                  </div>
                ) : (
                  <span className="pillar-chip" key={p.key}>
                    {p.description.startsWith(p.name + ":")
                      ? p.description
                      : `${p.name}: ${p.description}`}
                  </span>
                ),
              )}
            </div>
          </article>
          {copyCard("Differentiation", "differentiation")}
          {copyCard("Known for", "known_for")}
          <div className="col-span-full">{copyCard("Strategic objective", "objective")}</div>
        </div>
        <article className="strategy-card cta-card">
          <h2 className="card-label">CTA path</h2>
          <div className="cta-steps">
            {s.ctas.map((c, i) => (
              <Fragment key={c.rank}>
                {i > 0 && (
                  <ArrowRight
                    className="cta-arrow text-muted-foreground"
                    size={17}
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0">
                  {draft ? (
                    <div className="grid gap-2">
                      <Inline
                        short
                        label={`CTA ${c.rank} label`}
                        value={c.label}
                        onChange={(v) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  ctas: d.ctas.map((x, j) => (j === i ? { ...x, label: v } : x)),
                                }
                              : d,
                          )
                        }
                      />
                      <Inline
                        short
                        label={`CTA ${c.rank} destination`}
                        value={c.destination}
                        onChange={(v) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  ctas: d.ctas.map((x, j) =>
                                    j === i ? { ...x, destination: v } : x,
                                  ),
                                }
                              : d,
                          )
                        }
                      />
                    </div>
                  ) : (
                    <p className="cta-text">
                      {destinationHref(c.destination) ? (
                        <a
                          className="cta-link"
                          href={destinationHref(c.destination)}
                          target={
                            destinationHref(c.destination)?.startsWith("https")
                              ? "_blank"
                              : undefined
                          }
                          rel="noopener noreferrer"
                        >
                          {c.label}
                        </a>
                      ) : (
                        c.label
                      )}
                    </p>
                  )}
                  <p className="cta-kind">{ctas.find((x) => x.rank === c.rank)?.measured_how}</p>
                </div>
              </Fragment>
            ))}
          </div>
        </article>
        <section aria-labelledby="goals-heading">
          <h2 className="section-heading" id="goals-heading">
            Goals
          </h2>
          <div className="goal-grid">
            {data.definitions.map((goal, index) => {
              const target = s.targets.find((t) => t.kpi_key === goal.key),
                baseline = targets.find((t) => t.kpi_key === goal.key),
                latest = latestKpi(data, goal.key),
                period = data.periods.find((p) => p.id === latest?.period_id);
              return (
                <article
                  key={goal.key}
                  className={`strategy-card goal-card ${goal.is_north_star ? "north-star" : ""}`}
                >
                  <h3 className="card-label">
                    {goal.is_north_star && <Star size={12} aria-hidden="true" />}
                    {goal.goal_category}
                    <span className="ml-auto font-editorial font-normal text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </h3>
                  <p className="goal-name">{goal.name}</p>
                  <span className={`kind-badge ${goal.kind === "measured" ? "measured" : ""}`}>
                    {goal.kind === "measured" ? <Check size={10} /> : <Circle size={8} />}
                    {goal.kind}
                  </span>
                  <dl className="goal-baseline">
                    <dt className="field-label">Baseline</dt>
                    <dd className="baseline-value">{baseline?.baseline_label}</dd>
                  </dl>
                  <dl className="goal-current">
                    <div>
                      <dt className="field-label">Latest</dt>
                      <dd className="latest-value">
                        {latest
                          ? new Intl.NumberFormat("en-GB", { maximumFractionDigits: 4 }).format(
                              latest.value,
                            )
                          : "—"}
                        {period && (
                          <span className="block text-xs text-muted-foreground mt-1">
                            {period.label}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="field-label">Target</dt>
                      <dd className="target-value">
                        {draft ? (
                          <div className="grid gap-2">
                            <Input
                              aria-label={`${goal.name} target value`}
                              type="number"
                              step="any"
                              value={target?.target_value ?? ""}
                              onChange={(e) => {
                                const value = e.target.value === "" ? null : Number(e.target.value);
                                setDraft((d) =>
                                  d
                                    ? {
                                        ...d,
                                        targets: d.targets.map((t) =>
                                          t.kpi_key === goal.key
                                            ? { ...t, target_value: value }
                                            : t,
                                        ),
                                      }
                                    : d,
                                );
                              }}
                            />
                            <Input
                              aria-label={`${goal.name} target date`}
                              type="date"
                              value={target?.target_by ?? ""}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d
                                    ? {
                                        ...d,
                                        targets: d.targets.map((t) =>
                                          t.kpi_key === goal.key
                                            ? { ...t, target_by: e.target.value || null }
                                            : t,
                                        ),
                                      }
                                    : d,
                                )
                              }
                            />
                          </div>
                        ) : (
                          <>
                            {target?.target_value ?? "not set"}
                            {target?.target_by && (
                              <span className="block text-xs text-muted-foreground mt-1">
                                by {formatDate(target.target_by)}
                              </span>
                            )}
                          </>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p className="goal-source">Source: {goal.sources_needed.join("; ")}</p>
                </article>
              );
            })}
          </div>
          <p className="footnote">
            Baselines: analysis of 8 April–8 October 2026. Targets are set after period P2 (8
            November).
          </p>
        </section>
      </fieldset>
      <section aria-labelledby="timeline-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-heading" id="timeline-heading">
            Strategy timeline
          </h2>
          <Button
            variant="outline"
            disabled={busy || !!draft}
            onClick={() => {
              setEventOpen(!eventOpen);
              setError("");
            }}
          >
            Add event
          </Button>
        </div>
        {eventOpen && (
          <form
            className="grid gap-3 mb-5 max-w-lg"
            onSubmit={(e) => {
              e.preventDefault();
              const result = eventSchema.safeParse(event);
              if (!result.success) {
                setError(result.error.issues[0]?.message ?? "Check the event.");
                return;
              }
              setError("");
              add.mutate({ data: result.data });
            }}
          >
            <label className="grid gap-2 text-sm">
              Date
              <Input
                aria-label="Event date"
                type="date"
                required
                value={event.date}
                disabled={busy}
                onChange={(e) => setEvent({ ...event, date: e.target.value })}
              />
            </label>
            <Inline
              short
              label="Event label"
              value={event.label}
              onChange={(v) => setEvent({ ...event, label: v })}
            />
            <label className="grid gap-2 text-sm">
              Kind
              <select
                aria-label="Event kind"
                className="version-select"
                value={event.kind}
                disabled={busy}
                onChange={(e) => {
                  const parsed = eventSchema.shape.kind.safeParse(e.target.value);
                  if (parsed.success) setEvent({ ...event, kind: parsed.data });
                }}
              >
                {eventSchema.shape.kind.options.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button disabled={busy} type="submit">
                {add.isPending ? "Saving…" : "Save event"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setEventOpen(false);
                  setError("");
                }}
              >
                Cancel event
              </Button>
            </div>
          </form>
        )}
        {timeline.map((t) => (
          <p className="timeline-entry" key={t.id}>
            {formatDate(t.date)}: {t.text}
            <span className="ml-2 text-xs text-muted-foreground">{t.kind}</span>
          </p>
        ))}
      </section>
    </>
  );
}
