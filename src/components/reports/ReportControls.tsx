"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TYPES = [
  { v: "monthly", label: "Monthly" },
  { v: "event", label: "Event / Project" },
  { v: "grant", label: "Grant" },
  { v: "term", label: "Term" },
  { v: "yearend", label: "Year-End" },
];

/** Report type + parameter controls (§5.15). URL-param driven via Generate. */
export function ReportControls({ projects, fundingSources }: { projects: string[]; fundingSources: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [type, setType] = useState(sp.get("type") || "monthly");
  const [month, setMonth] = useState(sp.get("month") || "");
  const [project, setProject] = useState(sp.get("project") || projects[0] || "");
  const [grant, setGrant] = useState(sp.get("grant") || fundingSources[0] || "");
  const [start, setStart] = useState(sp.get("start") || "");
  const [end, setEnd] = useState(sp.get("end") || "");
  const [fy, setFy] = useState(sp.get("fy") || "");

  function generate() {
    const p = new URLSearchParams({ type });
    if (type === "monthly" && month) p.set("month", month);
    if (type === "event" && project) p.set("project", project);
    if (type === "grant" && grant) p.set("grant", grant);
    if (type === "term") { if (start) p.set("start", start); if (end) p.set("end", end); }
    if (type === "yearend" && fy) p.set("fy", fy);
    router.push(`/reports?${p.toString()}`);
  }

  return (
    <div className="surge-card no-print mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm">
          <span className="section-title mb-1">Report type</span>
          <select className="input w-48" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </label>

        {type === "monthly" && (
          <label className="flex flex-col text-sm"><span className="section-title mb-1">Month</span>
            <input type="month" className="input w-44" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        )}
        {type === "event" && (
          <label className="flex flex-col text-sm"><span className="section-title mb-1">Project</span>
            <select className="input w-56" value={project} onChange={(e) => setProject(e.target.value)}>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></label>
        )}
        {type === "grant" && (
          <label className="flex flex-col text-sm"><span className="section-title mb-1">Grant / Funding source</span>
            <select className="input w-56" value={grant} onChange={(e) => setGrant(e.target.value)}>
              {fundingSources.map((g) => <option key={g} value={g}>{g}</option>)}
            </select></label>
        )}
        {type === "term" && (
          <>
            <label className="flex flex-col text-sm"><span className="section-title mb-1">Start</span>
              <input type="date" className="input w-40" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="flex flex-col text-sm"><span className="section-title mb-1">End</span>
              <input type="date" className="input w-40" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </>
        )}
        {type === "yearend" && (
          <label className="flex flex-col text-sm"><span className="section-title mb-1">Fiscal year (blank = current)</span>
            <input className="input w-44" placeholder="e.g. 2526" value={fy} onChange={(e) => setFy(e.target.value)} /></label>
        )}

        <button className="btn btn-primary" onClick={generate}>Generate</button>
      </div>
    </div>
  );
}
