export type ViewMode = "basic" | "advanced";

export const brand = {
  name: "Harbor",
  tagline: "Complex errands, handled carefully.",
  shortDescription:
    "A calm operator for high-friction digital errands, with approvals, evidence, and trace-backed confidence.",
  headline: "Hand off the errand. Review the important step. Keep the proof.",
  supportingCopy:
    "Harbor turns difficult online errands into a guided run with one clear next step, approval before irreversible actions, and proof you can keep.",
  exampleCopy:
    "Appointment Hunter is the current workflow: find a doctor or dentist slot, review the booking summary, and approve only the final handoff.",
  basicLabel: "Basic",
  advancedLabel: "Advanced",
  trustPillars: [
    {
      label: "Approval before submit",
      value: "You review the irreversible step",
    },
    {
      label: "Proof bundle",
      value: "Screenshots and notes stay attached",
    },
    {
      label: "Current workflow",
      value: "Doctor and dentist appointment search",
    },
  ],
  demo: {
    eyebrow: "Harbor demo workflow",
    title: "Controlled provider search for walkthroughs and approvals.",
    description:
      "This controlled page mirrors an appointment marketplace while keeping the browser path stable for demos, screenshots, and approval checkpoints.",
  },
} as const;

export function executionTargetLabel(target: "demo" | "live", viewMode: ViewMode) {
  if (target === "demo") {
    return viewMode === "basic" ? "Controlled appointment workflow" : "Controlled appointment demo";
  }

  return viewMode === "basic" ? "Human-supervised live handoff" : "Compatibility live stub";
}
