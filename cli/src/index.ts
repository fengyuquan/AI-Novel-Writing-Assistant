#!/usr/bin/env node
import { runCli } from "./app.js";

runCli()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`✗ ${message}\n`);
    process.exitCode = 1;
  });
