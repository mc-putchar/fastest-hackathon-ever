import { createId, nowIso, type Task, type TaskArtifact } from "@/app/lib/domain";
import type { TaskRequirement } from "@/app/lib/executors/types";

export const APPOINTMENT_HUNTER_LIVE_URL = "https://www.doctolib.de/";

export const appointmentHunterRequirements: TaskRequirement[] = [
  {
    field: "appointmentKind",
    label: "appointment type",
    reason: "The search flow needs to know whether it should look for a doctor or a dentist.",
  },
  {
    field: "specialty",
    label: "specialty",
    reason: "Doctor searches require a specialty so the results stay relevant.",
  },
  {
    field: "insuranceType",
    label: "insurance type",
    reason: "Provider availability changes based on insurance acceptance.",
  },
  {
    field: "patientName",
    label: "full name",
    reason: "The review step and final confirmation need the patient identity.",
  },
  {
    field: "patientEmail",
    label: "email address",
    reason: "Booking confirmations and instructions are sent here.",
  },
];

export function missingAppointmentRequirements(task: Task) {
  return appointmentHunterRequirements.filter((requirement) => {
    if (requirement.field === "specialty") {
      return task.input.appointmentKind === "doctor" && !task.input.specialty;
    }

    return !task.input[requirement.field];
  });
}

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
