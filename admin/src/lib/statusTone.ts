export type StatusTone = "failed" | "running" | "succeeded" | "queued";

export function statusTone(status: string | null | undefined): StatusTone {
  const value = String(status || "").toLowerCase();
  if (
    value.includes("fail") ||
    value.includes("error") ||
    value.includes("waiting_recovery") ||
    value.includes("blocked")
  ) {
    return "failed";
  }
  if (value.includes("run") || value.includes("progress") || value.includes("generating")) {
    return "running";
  }
  if (
    value.includes("succeed") ||
    value.includes("success") ||
    value.includes("done") ||
    value.includes("completed") ||
    value.includes("final")
  ) {
    return "succeeded";
  }
  return "queued";
}
