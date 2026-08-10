export function printTitle(text: string): void {
  process.stdout.write(`\n══ ${text} ══\n`);
}

export function printInfo(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function printSuccess(text: string): void {
  process.stdout.write(`✓ ${text}\n`);
}

export function printWarn(text: string): void {
  process.stdout.write(`! ${text}\n`);
}

export function printError(text: string): void {
  process.stderr.write(`✗ ${text}\n`);
}

export function printProgress(text: string): void {
  const line = text.replace(/\s+/g, " ").trim();
  process.stdout.write(`… ${line}\n`);
}

export function printBlank(): void {
  process.stdout.write("\n");
}

export function printKeyValues(rows: Array<[string, string]>): void {
  const width = Math.max(...rows.map(([key]) => key.length), 4);
  for (const [key, value] of rows) {
    process.stdout.write(`  ${key.padEnd(width, " ")}  ${value}\n`);
  }
}
