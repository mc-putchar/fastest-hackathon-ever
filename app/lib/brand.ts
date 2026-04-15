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
    "Burgeramt booking is the first workflow. The product language stays broader: intake, clarification, execution, review, and evidence.",
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
      value: "Berlin Burgeramt booking",
    },
  ],
  demo: {
    eyebrow: "Harbor demo workflow",
    title: "Reliable booking flow for walkthroughs and approvals.",
    description:
      "This controlled page mirrors a public-service booking flow while keeping the browser path stable for demos, screenshots, and approval checkpoints.",
  },
} as const;

export function executionTargetLabel(target: "demo" | "live", viewMode: ViewMode) {
  if (target === "demo") {
    return viewMode === "basic" ? "Guided demo workflow" : "Controlled demo flow";
  }

  return viewMode === "basic" ? "Live Berlin service check" : "Live Berlin service probe";
}
