export interface CliConfig {
  apiBaseUrl: string;
  pollIntervalMs: number;
}

export function loadConfig(argv = process.argv.slice(2)): CliConfig {
  const fromArg = readFlag(argv, "--api");
  const fromEnv = process.env.AI_NOVEL_API_BASE_URL?.trim();
  const apiBaseUrl = normalizeApiBaseUrl(fromArg || fromEnv || "http://localhost:3000/api");
  const pollIntervalMs = Number(process.env.AI_NOVEL_CLI_POLL_MS || 3000);
  return {
    apiBaseUrl,
    pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs >= 1000 ? pollIntervalMs : 3000,
  };
}

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return argv[index + 1]?.trim() || undefined;
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, "");
  if (trimmed.endsWith("/api")) {
    return trimmed;
  }
  return `${trimmed}/api`;
}
