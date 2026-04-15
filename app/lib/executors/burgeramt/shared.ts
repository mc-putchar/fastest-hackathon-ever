import { createId, nowIso, type TaskArtifact } from "@/app/lib/domain";
import type { TaskRequirement } from "@/app/lib/executors/types";

export const BURGERAMT_LIVE_URL = "https://service.berlin.de/terminvereinbarung/";

export const burgeramtRequirements: TaskRequirement[] = [
  {
    field: "serviceType",
    label: "service type",
    reason: "Burgeramt flows branch early based on the selected service.",
  },
  {
    field: "applicantName",
    label: "full legal name",
    reason: "The booking summary and confirmation need the applicant identity.",
  },
  {
    field: "applicantEmail",
    label: "confirmation email",
    reason: "Booking confirmations and follow-up instructions are sent here.",
  },
];

export function buildSvgArtifact(title: string, lines: string[], accent: string) {
  const rows = lines
    .map(
      (line, index) =>
        `<text x="40" y="${110 + index * 34}" fill="#fdf7f0" font-family="Helvetica, Arial, sans-serif" font-size="22">${line}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700" viewBox="0 0 1200 700"><rect width="1200" height="700" fill="#1d2d44" /><rect x="26" y="26" width="1148" height="648" rx="32" fill="${accent}" opacity="0.24" /><text x="40" y="72" fill="#fdf7f0" font-family="Helvetica, Arial, sans-serif" font-size="36">${title}</text>${rows}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function createArtifact(
  kind: TaskArtifact["kind"],
  title: string,
  summary: string,
  content?: string,
  href?: string,
) {
  return {
    id: createId("artifact"),
    kind,
    title,
    summary,
    content,
    href,
    createdAt: nowIso(),
  } satisfies TaskArtifact;
}

export function hasSimulation(taskNotes: string | undefined, key: string) {
  return (taskNotes ?? "").toLowerCase().includes(`simulate:${key}`);
}
