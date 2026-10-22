#!/usr/bin/env node
/**
 * Starts the production Next.js server on Render's PORT.
 * Kept in Node so the same command works in PowerShell, cmd and Linux/macOS.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT?.trim() || "3000";

const child = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "0.0.0.0", "--port", port],
  { cwd: projectRoot, stdio: "inherit", env: process.env },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Could not start Foodie: ${error.message}`);
  process.exit(1);
});
