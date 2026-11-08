import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

import { resetStuckJobs } from "./db";
import { closeBrowserSession } from "./browser";
import { runWorker } from "./core/worker-runner";

// Global Process Exception Handlers
process.on("uncaughtException", async (err) => {
  console.error("Worker fatal uncaughtException:", err);
  try {
    const { createNotification } = await import("../lib/notifications");
    await createNotification({
      type: "system_alert",
      title: "Scanner Interrupted",
      message: "Background scanner encountered an issue and will restart.",
      severity: "error",
    });
  } catch {}
  await resetStuckJobs().catch(() => {});
  await closeBrowserSession().catch(() => {});
  process.exit(1);
});

process.on("unhandledRejection", async (reason: any) => {
  console.error("Worker unhandledRejection:", reason);
  try {
    const { createNotification } = await import("../lib/notifications");
    await createNotification({
      type: "system_alert",
      title: "Scan Warning",
      message: "Encountered a temporary issue while processing ads.",
      severity: "warning",
    });
  } catch {}
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down worker...");
  await resetStuckJobs().catch(() => {});
  await closeBrowserSession().catch(() => {});
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down worker...");
  await resetStuckJobs().catch(() => {});
  await closeBrowserSession().catch(() => {});
  process.exit(0);
});

runWorker();
